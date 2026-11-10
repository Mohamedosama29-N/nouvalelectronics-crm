// 📊 غلاف حوالين Firestore بيعدّ القراءات والكتابات (كل الكود بيستورد 'firebase/firestore' زي ما هو،
// وvite بيحوّله للملف ده — شوف vite.config.js). مفيش أي تغيير في السلوك.
export * from '@firebase/firestore';
import * as F from '@firebase/firestore';
import { countReads, countWrites } from '../utils/readMeter';
import { clearExhausted, isQuotaError, markExhausted, quotaBlocked, quotaStatus } from '../utils/quotaGuard';

// 🕒 أي تعديل على الـ collections دي بياخد updatedAt لوحده، عشان المرايا المحلية (src/data/mirror.js)
// تقدر تجيب «اللي اتغير بس» من غير ما تفوّت تعديل.
const STAMPED = new Set(['tickets', 'transactions', 'inventory', 'transfers', 'returns', 'customers', 'expenses', 'returnsWarehouse', 'knowledgeBase', 'deviceRegistry', 'faultTemplates']);
const collOf = (ref) => { try { const segs = ref?._key?.path?.segments || ref?._path?.segments || String(ref?.path || '').split('/'); return segs.length >= 2 ? segs[segs.length - 2] : segs[0]; } catch { return ''; } };
const plain = (d) => d && typeof d === 'object' && !Array.isArray(d) && Object.getPrototypeOf(d) === Object.prototype;
const stamp = (ref, data) => (STAMPED.has(collOf(ref)) && plain(data) && !('updatedAt' in data) ? { ...data, updatedAt: F.serverTimestamp() } : data);
const stampArgs = (a) => (a.length >= 2 && plain(a[1]) ? [a[0], stamp(a[0], a[1]), ...a.slice(2)] : a);

// 🛡️ لو حصة القراءات خلصت: نقرا من النسخة المحفوظة على الجهاز بدل ما الشاشة تقع
async function serverOrCache(serverFn, cacheFn, arg) {
  if (quotaBlocked()) { try { const r = await cacheFn(arg); r.__quotaFallback = true; return r; } catch { /* نجرب السيرفر */ } }
  try { const r = await serverFn(arg); if (!r?.metadata?.fromCache && quotaStatus().exhausted) clearExhausted(); return r; } catch (e) {
    if (!isQuotaError(e)) throw e;
    markExhausted();
    try { const r = await cacheFn(arg); r.__quotaFallback = true; return r; } catch { throw e; }
  }
}

const src = (q) => { try { return q?._query?.path?.segments?.[0] || q?.path?.split('/')?.[0] || q?._path?.segments?.[0] || ''; } catch { return ''; } };
const snapCount = (r) => Math.max(1, r?.size ?? (r?.docs?.length || 0));

export async function getDocs(q) { const r = await serverOrCache(F.getDocs, F.getDocsFromCache, q); if (r.__quotaFallback) return r; countReads(snapCount(r), { fromCache: !!r.metadata?.fromCache, source: src(q) }); return r; }
export async function getDocsFromServer(q) { const r = await F.getDocsFromServer(q); countReads(snapCount(r), { source: src(q) }); return r; }
export async function getDoc(ref) { const r = await serverOrCache(F.getDoc, F.getDocFromCache, ref); if (r.__quotaFallback) return r; countReads(1, { fromCache: !!r.metadata?.fromCache, source: src(ref) }); return r; }
export async function getDocFromServer(ref) { const r = await F.getDocFromServer(ref); countReads(1, { source: src(ref) }); return r; }
export async function getCountFromServer(q) { const r = await F.getCountFromServer(q); countReads(1, { source: src(q) }); return r; }
export async function getAggregateFromServer(q, spec) { const r = await F.getAggregateFromServer(q, spec); countReads(1, { source: src(q) }); return r; }

export async function addDoc(c, data) { const r = await F.addDoc(c, STAMPED.has(c?.id) && plain(data) && !('updatedAt' in data) ? { ...data, updatedAt: F.serverTimestamp() } : data); countWrites(1); return r; }
export async function setDoc(...a) { const r = await F.setDoc(...stampArgs(a)); countWrites(1); return r; }
export async function updateDoc(...a) { const r = await F.updateDoc(...stampArgs(a)); countWrites(1); return r; }
export async function deleteDoc(ref) { const r = await F.deleteDoc(ref); countWrites(1); return r; }

export function writeBatch(db) {
  const b = F.writeBatch(db);
  let ops = 0;
  const w = {
    set: (...a) => { ops += 1; b.set(...stampArgs(a)); return w; },
    update: (...a) => { ops += 1; b.update(...stampArgs(a)); return w; },
    delete: (...a) => { ops += 1; b.delete(...a); return w; },
    commit: async () => { const r = await b.commit(); countWrites(ops); return r; },
  };
  return w;
}

export function runTransaction(db, fn, opts) {
  return F.runTransaction(db, async (tx) => {
    let reads = 0; let writes = 0;
    const wrapped = {
      get: async (ref) => { reads += 1; return tx.get(ref); },
      set: (...a) => { writes += 1; tx.set(...stampArgs(a)); return wrapped; },
      update: (...a) => { writes += 1; tx.update(...stampArgs(a)); return wrapped; },
      delete: (...a) => { writes += 1; tx.delete(...a); return wrapped; },
    };
    const out = await fn(wrapped);
    countReads(reads); countWrites(writes);
    return out;
  }, opts);
}

// onSnapshot: أول لقطة = كل المستندات، وبعدها التغييرات بس (زي ما جوجل بيحسب)
export function onSnapshot(ref, ...args) {
  const i = args.findIndex((a) => typeof a === 'function' || (a && typeof a.next === 'function'));
  if (i < 0) return F.onSnapshot(ref, ...args);
  let first = true;
  const count = (s) => {
    if (s?.metadata?.fromCache) return;
    if (typeof s?.docChanges === 'function') { const n = first ? snapCount(s) : s.docChanges().length; if (n) countReads(n, { source: src(ref) }); }
    else countReads(1, { source: src(ref) });
    first = false;
  };
  const a = [...args];
  const isDoc = ref?.type === 'document';
  const fallback = (next, onErr) => (e) => {
    if (!isQuotaError(e)) { onErr?.(e); return; }
    markExhausted();
    (isDoc ? F.getDocFromCache(ref) : F.getDocsFromCache(ref)).then((s) => next(s)).catch(() => onErr?.(e));
  };
  if (typeof a[i] === 'function') {
    const fn = a[i]; a[i] = (s) => { count(s); fn(s); };
    const errFn = typeof a[i + 1] === 'function' ? a[i + 1] : null;
    a[i + 1] = fallback(fn, errFn);
  } else { const o = a[i]; a[i] = { ...o, next: (s) => { count(s); o.next?.(s); }, error: fallback((s) => o.next?.(s), o.error) }; }
  return F.onSnapshot(ref, ...a);
}
