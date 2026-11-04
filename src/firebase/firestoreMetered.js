// 📊 غلاف حوالين Firestore بيعدّ القراءات والكتابات (كل الكود بيستورد 'firebase/firestore' زي ما هو،
// وvite بيحوّله للملف ده — شوف vite.config.js). مفيش أي تغيير في السلوك.
export * from '@firebase/firestore';
import * as F from '@firebase/firestore';
import { countReads, countWrites } from '../utils/readMeter';

const src = (q) => { try { return q?._query?.path?.segments?.[0] || q?.path?.split('/')?.[0] || q?._path?.segments?.[0] || ''; } catch { return ''; } };
const snapCount = (r) => Math.max(1, r?.size ?? (r?.docs?.length || 0));

export async function getDocs(q) { const r = await F.getDocs(q); countReads(snapCount(r), { fromCache: !!r.metadata?.fromCache, source: src(q) }); return r; }
export async function getDocsFromServer(q) { const r = await F.getDocsFromServer(q); countReads(snapCount(r), { source: src(q) }); return r; }
export async function getDoc(ref) { const r = await F.getDoc(ref); countReads(1, { fromCache: !!r.metadata?.fromCache, source: src(ref) }); return r; }
export async function getDocFromServer(ref) { const r = await F.getDocFromServer(ref); countReads(1, { source: src(ref) }); return r; }
export async function getCountFromServer(q) { const r = await F.getCountFromServer(q); countReads(1, { source: src(q) }); return r; }
export async function getAggregateFromServer(q, spec) { const r = await F.getAggregateFromServer(q, spec); countReads(1, { source: src(q) }); return r; }

export async function addDoc(c, data) { const r = await F.addDoc(c, data); countWrites(1); return r; }
export async function setDoc(...a) { const r = await F.setDoc(...a); countWrites(1); return r; }
export async function updateDoc(...a) { const r = await F.updateDoc(...a); countWrites(1); return r; }
export async function deleteDoc(ref) { const r = await F.deleteDoc(ref); countWrites(1); return r; }

export function writeBatch(db) {
  const b = F.writeBatch(db);
  let ops = 0;
  const w = {
    set: (...a) => { ops += 1; b.set(...a); return w; },
    update: (...a) => { ops += 1; b.update(...a); return w; },
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
      set: (...a) => { writes += 1; tx.set(...a); return wrapped; },
      update: (...a) => { writes += 1; tx.update(...a); return wrapped; },
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
  if (typeof a[i] === 'function') { const fn = a[i]; a[i] = (s) => { count(s); fn(s); }; }
  else { const o = a[i]; a[i] = { ...o, next: (s) => { count(s); o.next?.(s); } }; }
  return F.onSnapshot(ref, ...a);
}
