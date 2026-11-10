import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { friendlyMessage } from '../utils/alerts';
import { CHANGE_FIELD, mirrorDocs } from '../data/mirror';
import { loadOpenTickets } from '../ai/ticketPool';
import { toDate } from '../utils/liveStats';

const msOf = (v) => { const d = toDate(v); return d ? d.getTime() : 0; };
// شرط محلي بيطابق المواصفات (عشان التحديثات اللحظية تدخل أو تخرج من القايمة صح)
const keeper = (s) => (d) => {
  if (s.timeField && s.sinceMs && msOf(d[s.timeField]) < s.sinceMs) return false;
  return (s.wheres || []).every(([f, op, v]) => (op === '==' ? d[f] === v : op === '!=' ? d[f] !== v : op === 'in' ? v.includes(d[f]) : op === 'not-in' ? !v.includes(d[f]) : true));
};
// 📉 المواصفات اللي ينفع تتقري من المرايا المحلية (الجديد والمتعدّل بس من السيرفر)
const APPEND_ONLY = new Set(['activity_logs', 'login_history']);
const mirrorable = (s) => !s.soft && (CHANGE_FIELD[s.collection] || (APPEND_ONLY.has(s.collection) && s.timeField && s.sinceMs)) && !(s.wheres || []).some(([, op]) => op === 'not-in' || op === 'in');

// مصدر من المرايا أو من مجمّع التذاكر المفتوحة + اشتراك لحظي على التعديلات الجديدة بس
function subscribeMirrored(s, setState) {
  let alive = true;
  const current = new Map();
  const fromTail = new Set();
  const keep = keeper(s);
  const publish = (extra = {}) => {
    if (!alive) return;
    let docs = [...current.values()];
    if (s.timeField) docs.sort((a, b) => msOf(b[s.timeField]) - msOf(a[s.timeField]));
    const trunc = !!s.max && docs.length > s.max;
    if (s.max) docs = docs.slice(0, s.max);
    setState((prev) => ({
      data: { ...prev.data, [s.key]: docs },
      errors: { ...prev.errors, [s.key]: undefined },
      truncated: { ...prev.truncated, [s.key]: !s.soft && trunc },
      ready: { ...prev.ready, [s.key]: true },
      stale: { ...(prev.stale || {}), [s.key]: extra.stale ?? prev.stale?.[s.key] ?? false },
      updatedAt: new Date(),
    }));
  };
  const loader = s.openPool
    ? loadOpenTickets().then((l) => l.filter(keep))
    : mirrorDocs(s.collection, s.timeField || null, { from: s.sinceMs || 0, wheres: s.wheres || [], max: (s.max || 20000) + 1 });
  loader.then((list) => {
    list.forEach((d) => { if (!fromTail.has(d.id)) current.set(d.id, d); });
    publish({ stale: !!list.stale });
  }).catch((err) => {
    console.warn(`Source "${s.key}" failed:`, err);
    if (!alive) return;
    setState((prev) => ({ ...prev, data: { ...prev.data, [s.key]: prev.data[s.key] || [] }, errors: { ...prev.errors, [s.key]: err?.code === 'permission-denied' ? 'لا توجد صلاحية لقراءة هذا القسم' : friendlyMessage(err?.message) }, ready: { ...prev.ready, [s.key]: true } }));
  });
  // التعديلات اللي هتحصل من دلوقتي (بفرق دقيقتين احتياطي لفرق الساعة) — بتتحسب بعددها بس
  const tailField = CHANGE_FIELD[s.collection] || s.timeField;
  let unsub = () => {};
  if (tailField) {
    unsub = onSnapshot(query(collection(db, s.collection), where(tailField, '>', Timestamp.fromMillis(Date.now() - 120000))), (snap) => {
      let changed = false;
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') return;
        const d = { id: ch.doc.id, ...ch.doc.data() };
        fromTail.add(d.id); changed = true;
        if (keep(d) && !d.__deleted) current.set(d.id, d); else current.delete(d.id);
      });
      if (changed) publish();
    }, (err) => console.warn(`Live tail "${s.key}"`, err?.code || err));
  }
  return () => { alive = false; unsub(); };
}

// اشتراك لحظي (onSnapshot) في أكتر من collection مرة واحدة.
// spec = { key, collection, timeField?, sinceMs?, max?, wheres? }
//  - timeField + sinceMs: استعلام نطاق على حقل واحد فقط (مش محتاج Composite Index)
//  - max: حد أقصى لعدد المستندات (الأحدث الأول لو فيه timeField)
//  - wheres: شروط تساوي فقط [[field, '==', value]] - للـ collections اللي من غير نطاق زمني
// بيرجع { data: {key: docs[]}, loading, errors: {key: msg}, updatedAt, truncated: {key: bool} }
// الاشتراكات بتتقفل أوتوماتيك لما الصفحة تتقفل أو المواصفات تتغير.
export function useLiveSources(specs, enabled = true) {
  const specKey = JSON.stringify(specs.map((s) => [s.key, s.collection, s.timeField || '', s.sinceMs || 0, s.max || 0, s.wheres || []]));
  const specsRef = useRef(specs);
  specsRef.current = specs;

  const [state, setState] = useState({ data: {}, errors: {}, truncated: {}, ready: {}, updatedAt: null });

  useEffect(() => {
    setState({ data: {}, errors: {}, truncated: {}, ready: {}, updatedAt: null });
    if (!enabled) return undefined;
    const unsubs = specsRef.current.map((s) => {
      if (s.openPool || mirrorable(s)) return subscribeMirrored(s, setState);
      try {
        const cons = [];
        (s.wheres || []).forEach(([f, op, v]) => cons.push(where(f, op, v)));
        if (s.timeField) {
          if (s.sinceMs) cons.push(where(s.timeField, '>=', new Date(s.sinceMs)));
          if (s.max) cons.push(orderBy(s.timeField, 'desc'));
        }
        if (s.max) cons.push(limit(s.max));
        return onSnapshot(
          query(collection(db, s.collection), ...cons),
          (snap) => {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setState((prev) => ({
              data: { ...prev.data, [s.key]: docs },
              errors: { ...prev.errors, [s.key]: undefined },
              truncated: { ...prev.truncated, [s.key]: !s.soft && !!s.max && docs.length >= s.max },
              ready: { ...prev.ready, [s.key]: true },
              updatedAt: new Date()
            }));
          },
          (err) => {
            console.warn(`Live source "${s.key}" failed:`, err);
            setState((prev) => ({
              ...prev,
              data: { ...prev.data, [s.key]: prev.data[s.key] || [] },
              errors: { ...prev.errors, [s.key]: err.code === 'permission-denied' ? 'لا توجد صلاحية لقراءة هذا القسم' : friendlyMessage(err.message) },
              ready: { ...prev.ready, [s.key]: true }
            }));
          }
        );
      } catch (e) {
        console.warn(`Live source "${s.key}" setup failed:`, e);
        setState((prev) => ({ ...prev, errors: { ...prev.errors, [s.key]: friendlyMessage(e.message) }, ready: { ...prev.ready, [s.key]: true } }));
        return () => {};
      }
    });
    return () => unsubs.forEach((u) => u());
  }, [specKey, enabled]);

  const loading = useMemo(
    () => enabled && specs.some((s) => !state.ready[s.key]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.ready, specKey, enabled]
  );
  return { data: state.data, errors: state.errors, truncated: state.truncated, loading, updatedAt: state.updatedAt, stale: state.stale || {} };
}
