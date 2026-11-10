// 🪞 مرايا محلية للـ collections الكبيرة — أهم أداة لتوفير القراءات.
//
// المشكلة: لوحة التحكم والتقارير والكول سنتر كانت بتقرا آلاف المستندات من السيرفر في كل مرة تتفتح.
// الحل: أول مرة بنقرا الفترة المطلوبة من السيرفر (وFirestore بيحفظها في الكاش اللي على الجهاز)،
// وبعد كده كل مرة بنجيب من السيرفر **الجديد والمتعدّل بس**، والباقي من الكاش ببلاش.
//
//  - الجديد: field > آخر قيمة شفناها (تاريخ الإنشاء أو تاريخ البيع)
//  - المتعدّل: updatedAt > آخر updatedAt شفناه (الغلاف firestoreMetered بيحط updatedAt لوحده على أي تعديل)
//  - فحص العدد كل نص ساعة (getCountFromServer = قراءة واحدة لكل 1000 مستند): لو العدد على السيرفر
//    مختلف عن الكاش (اتمسح حاجة أو الكاش اتنضّف) بنعيد تحميل الفترة كلها.
//  - تحميل كامل كل 7 أيام احتياطي.
// لو الكاش الدائم مش شغال (تصفح خفي مثلاً) أو الحصة خلصت، بنرجع للطريقة العادية أو للكاش.
import { collection, documentId, getCountFromServer, getDocs, getDocsFromCache, limit, onSnapshot, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore';
import { db, persistentCacheOn } from '../firebase/config';
import { toDate } from '../utils/liveStats';
import { economyMode, quotaBlocked } from '../utils/quotaGuard';

const KEY = 'erp_mirror_v1';
const PAGE = 1000;
const HARD_MAX = 60000;
const FULL_MS = 7 * 86400000;
const COUNT_MS = 30 * 60000;
const delta = () => (economyMode() ? 10 * 60000 : 60000);

// الحقل اللي بيتغير مع أي تعديل لكل collection
export const CHANGE_FIELD = {
  tickets: 'updatedAt', transactions: 'updatedAt', inventory: 'updatedAt', transfers: 'updatedAt',
  returns: 'updatedAt', customers: 'updatedAt', expenses: 'updatedAt', returnsWarehouse: 'updatedAt',
  knowledgeBase: 'updatedAt', deviceRegistry: 'updatedAt', faultTemplates: 'updatedAt',
};

let S = null;
let disabled = false; // لو اكتشفنا إن الكاش مش بيحتفظ بالبيانات، بنقفل المرايا للجلسة دي
const inflight = new Map();
const load = () => { if (S) return S; try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { S = {}; } return S; };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* */ } };
const ms = (v) => { const d = toDate(v); return d ? d.getTime() : null; };
const ts = (m) => Timestamp.fromMillis(m);
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export const mirrorAvailable = () => persistentCacheOn && !disabled && typeof getDocsFromCache === 'function';
export function resetMirrors() { S = {}; save(); }

class NotFromServer extends Error { constructor() { super('not from server'); this.code = 'not-from-server'; } }

// قراءة من السيرفر بالصفحات، وبترجع أكبر قيمة للحقل وللـ updatedAt
async function fetchPaged(coll, cons, orderField, change) {
  let cursor = null; let n = 0; let max = null; let maxChg = null;
  for (;;) {
    const c = [...cons, orderBy(orderField === '__name__' ? documentId() : orderField, 'asc'), limit(PAGE)];
    if (cursor) c.push(startAfter(cursor));
    const snap = await getDocs(query(collection(db, coll), ...c));
    if (snap.metadata?.fromCache) throw new NotFromServer();
    n += snap.size;
    for (const d of snap.docs) {
      if (orderField !== '__name__') { const v = ms(d.get(orderField)); if (v !== null && (max === null || v > max)) max = v; }
      if (change) { const v = ms(d.get(change)); if (v !== null && (maxChg === null || v > maxChg)) maxChg = v; }
    }
    if (snap.size < PAGE || n >= HARD_MAX) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return { n, max, maxChg };
}

const rangeCons = (field, fromMs, toMs) => {
  if (!field) return [];
  const c = [where(field, '>=', ts(fromMs))];
  if (toMs) c.push(where(field, '<=', ts(toMs)));
  return c;
};

async function cacheCount(coll, field, fromMs) {
  const s = await getDocsFromCache(query(collection(db, coll), ...rangeCons(field, fromMs)));
  return s.size;
}

async function full(coll, field, fromMs, change, now) {
  const r = await fetchPaged(coll, rangeCons(field, fromMs), field || '__name__', change);
  // تأكد إن الكاش احتفظ باللي اتقرا، وإلا المرايا مش هتنفع على الجهاز ده
  if (r.n && r.n < HARD_MAX) {
    const local = await cacheCount(coll, field, fromMs);
    if (local < r.n) { disabled = true; throw new NotFromServer(); }
  }
  return { from: fromMs, max: r.max ?? now - 120000, chg: r.maxChg ?? now - 120000, fullAt: now, checkedAt: now, countAt: now };
}

async function sync(coll, field, fromMs, change) {
  const k = `${coll}|${field || '*'}`;
  const st = load()[k];
  const now = Date.now();
  if (!st || now - st.fullAt > FULL_MS || (field && !Number.isFinite(st.from))) {
    S[k] = await full(coll, field, fromMs, change, now); save(); return;
  }
  // الفترة المطلوبة أقدم من اللي عندنا: نجيب الجزء الناقص بس
  if (field && fromMs < st.from) {
    await fetchPaged(coll, [where(field, '>=', ts(fromMs)), where(field, '<', ts(st.from))], field, null);
    st.from = fromMs; save();
  }
  if (now - st.checkedAt > delta()) {
    if (field) { const r = await fetchPaged(coll, [where(field, '>', ts(st.max))], field, null); if (r.max !== null) st.max = Math.max(st.max, r.max); }
    if (change && change !== field) { const r = await fetchPaged(coll, [where(change, '>', ts(st.chg))], change, change); if (r.maxChg !== null) st.chg = Math.max(st.chg, r.maxChg); }
    else if (change && field === change) st.chg = st.max;
    st.checkedAt = now; save();
  }
  if (!economyMode() && now - st.countAt > COUNT_MS) {
    const server = (await getCountFromServer(query(collection(db, coll), ...rangeCons(field, st.from)))).data().count;
    const local = await cacheCount(coll, field, st.from);
    const lastServer = st.serverCount;
    st.countAt = now; st.serverCount = server; save();
    // نعيد التحميل لو فيه فرق، بس مش تاني لو نفس الفرق اتكرر بعد إعادة تحميل (عشان منلفّش في دايرة)
    if (server !== local && server !== lastServer) { S[k] = { ...(await full(coll, field, st.from, change, now)), serverCount: server }; save(); }
  }
}

function ensure(coll, field, fromMs, change) {
  const k = `${coll}|${field || '*'}|${fromMs}`;
  if (inflight.has(k)) return inflight.get(k);
  const p = sync(coll, field, fromMs, change).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/**
 * مستندات collection في فترة (field بين from و to)، من الكاش بعد ما يتحدث بالجديد بس.
 * field = null يعني الـ collection كلها (زي المخزون). wheres = شروط إضافية بتتطبق على الكاش.
 * بيرجع مصفوفة { id, ...data }، وخاصية stale = true لو معرفناش نحدّث من السيرفر.
 */
export async function mirrorDocs(coll, field, { from = 0, to = null, wheres = [], change = CHANGE_FIELD[coll], max = 10000 } = {}) {
  const fromMs = field ? (ms(from) ?? 0) : 0;
  const toMs = to ? ms(to) : null;
  const extra = wheres.map(([f, op, v]) => where(f, op, v));
  if (!mirrorAvailable()) {
    // من غير كاش دائم: نفس الاستعلام القديم
    const c = [...extra, ...rangeCons(field, fromMs, toMs)];
    if (field) c.push(orderBy(field, 'desc'));
    c.push(limit(max));
    return rows(await getDocs(query(collection(db, coll), ...c)));
  }
  let stale = false;
  if (quotaBlocked()) stale = true;
  else {
    try { await ensure(coll, field, fromMs, change); } catch (e) {
      stale = true;
      if (e?.code !== 'not-from-server' && e?.code !== 'resource-exhausted' && e?.code !== 'unavailable') console.warn('mirror sync', coll, e?.code || e);
      if (!mirrorAvailable()) return mirrorDocs(coll, field, { from, to, wheres, change, max });
    }
  }
  const snap = await getDocsFromCache(query(collection(db, coll), ...extra, ...rangeCons(field, fromMs, toMs)));
  let out = rows(snap);
  if (field) out.sort((a, b) => (ms(b[field]) || 0) - (ms(a[field]) || 0));
  out = out.slice(0, max);
  out.stale = stale;
  return out;
}

// اختصارات للاستخدامات الأكتر
export const ticketsUpdatedSince = (from, opts = {}) => mirrorDocs('tickets', 'updatedAt', { from, ...opts });
export const ticketsCreatedBetween = (from, to, opts = {}) => mirrorDocs('tickets', 'createdAt', { from, to, ...opts });
export const transactionsBetween = (from, to, opts = {}) => mirrorDocs('transactions', 'timestamp', { from, to, ...opts });
export const wholeCollection = (coll, opts = {}) => mirrorDocs(coll, null, opts);

/**
 * زي onSnapshot بس رخيص: أول تحميل من المرايا، وبعده اشتراك لحظي على التعديلات الجديدة بس.
 * onData بيتنده بالقايمة كاملة كل مرة تتغير. بيرجّع دالة إلغاء الاشتراك.
 */
export function watchMirror(coll, { field = null, from = 0, wheres = [], max = 20000 } = {}, onData, onError) {
  let alive = true;
  const cur = new Map();
  const tailIds = new Set();
  const match = (d) => wheres.every(([f, op, v]) => (op === '==' ? d[f] === v : op === '!=' ? d[f] !== v : true))
    && (!field || (ms(d[field]) || 0) >= (ms(from) || 0));
  const emit = () => { if (alive) onData([...cur.values()]); };
  mirrorDocs(coll, field, { from, wheres, max }).then((l) => { l.forEach((d) => { if (!tailIds.has(d.id)) cur.set(d.id, d); }); emit(); }).catch((e) => onError?.(e));
  const ch = CHANGE_FIELD[coll] || field;
  let unsub = () => {};
  if (ch) {
    unsub = onSnapshot(query(collection(db, coll), where(ch, '>', Timestamp.fromMillis(Date.now() - 120000))), (snap) => {
      let changed = false;
      snap.docChanges().forEach((c) => { if (c.type === 'removed') return; const d = { id: c.doc.id, ...c.doc.data() }; tailIds.add(d.id); changed = true; if (match(d)) cur.set(d.id, d); else cur.delete(d.id); });
      if (changed) emit();
    }, (e) => console.warn('watchMirror tail', coll, e?.code || e));
  }
  return () => { alive = false; unsub(); };
}
