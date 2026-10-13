import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

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
              truncated: { ...prev.truncated, [s.key]: !!s.max && docs.length >= s.max },
              ready: { ...prev.ready, [s.key]: true },
              updatedAt: new Date()
            }));
          },
          (err) => {
            console.warn(`Live source "${s.key}" failed:`, err);
            setState((prev) => ({
              ...prev,
              data: { ...prev.data, [s.key]: prev.data[s.key] || [] },
              errors: { ...prev.errors, [s.key]: err.code === 'permission-denied' ? 'لا توجد صلاحية لقراءة هذا القسم' : err.message },
              ready: { ...prev.ready, [s.key]: true }
            }));
          }
        );
      } catch (e) {
        console.warn(`Live source "${s.key}" setup failed:`, e);
        setState((prev) => ({ ...prev, errors: { ...prev.errors, [s.key]: e.message }, ready: { ...prev.ready, [s.key]: true } }));
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
  return { data: state.data, errors: state.errors, truncated: state.truncated, loading, updatedAt: state.updatedAt };
}
