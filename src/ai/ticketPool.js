// 🗂️ كاش مشترك للتذاكر الحديثة (للتوقعات والتشابه والتحليلات) والتذاكر المفتوحة (لحمل الفنيين).
// 📊 (5) توفير القراءات: الكاش بيتحفظ على الجهاز (IndexedDB)، وكل تحديث بعد كده بيجيب **التذاكر اللي
// اتغيرت بس** من آخر مرة (بدل 800 + كل المفتوح كل مرة). تحميل كامل كل 6 ساعات عشان أي حاجة اتمسحت.
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';

const TTL = 10 * 60 * 1000;
const FULL_EVERY = 6 * 3600 * 1000;
const DELTA_MAX = 400;
const RECENT_MAX = 800;
const IDB_KEY = 'ticketPools_v1';

let state = { loaded: false, recent: null, open: null, lastUpdated: 0, fullAt: 0, checkedAt: 0 };
let inflight = null;

const ms = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : 0);
const toPlain = (v) => {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v.toMillis === 'function' && typeof v.toDate === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === 'object' && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
};
const fromPlain = (v) => {
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map(fromPlain);
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromPlain(x)]));
  }
  return v;
};

async function idb() {
  if (typeof indexedDB === 'undefined') return null;
  try { const m = await import('../utils/offlineDb'); return await m.dbPromise; } catch { return null; }
}
async function loadLocal() {
  try {
    const d = await idb(); if (!d) return null;
    const row = await d.get('reports_cache', IDB_KEY);
    if (!row) return null;
    return { recent: row.recent ? fromPlain(row.recent) : null, open: row.open ? fromPlain(row.open) : null, lastUpdated: row.lastUpdated || 0, fullAt: row.fullAt || 0 };
  } catch { return null; }
}
let saveT = null;
function saveLocal() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { const d = await idb(); if (d) await d.put('reports_cache', { id: IDB_KEY, recent: state.recent && toPlain(state.recent), open: state.open && toPlain(state.open), lastUpdated: state.lastUpdated, fullAt: state.fullAt }); } catch { /* الكاش اختياري */ }
  }, 800);
}

const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const bump = (list) => list.forEach((t) => { state.lastUpdated = Math.max(state.lastUpdated, ms(t.updatedAt)); });
const isOpen = (t) => !TICKET_TERMINAL_STATUSES.includes(t.status) && !t.isDeleted;

async function fullRecent() {
  state.recent = docsOf(await getDocs(query(collection(db, 'tickets'), orderBy('updatedAt', 'desc'), limit(RECENT_MAX))));
  bump(state.recent);
}
async function fullOpen() {
  state.open = docsOf(await getDocs(query(collection(db, 'tickets'), where('status', 'not-in', TICKET_TERMINAL_STATUSES), limit(3000))));
  bump(state.open);
}

// التذاكر اللي اتعدّلت من آخر مرة بس
async function delta() {
  if (!state.lastUpdated) return false;
  const changed = docsOf(await getDocs(query(collection(db, 'tickets'), where('updatedAt', '>', Timestamp.fromMillis(state.lastUpdated)), orderBy('updatedAt', 'desc'), limit(DELTA_MAX))));
  if (changed.length >= DELTA_MAX) return false; // تغييرات كتير — أسهل نحمّل كامل
  if (!changed.length) return true;
  const ids = new Set(changed.map((t) => t.id));
  if (state.recent) state.recent = [...changed, ...state.recent.filter((t) => !ids.has(t.id))].slice(0, RECENT_MAX);
  if (state.open) state.open = [...changed.filter(isOpen), ...state.open.filter((t) => !ids.has(t.id))];
  bump(changed);
  return true;
}

async function refresh(need) {
  if (!state.loaded) {
    const local = await loadLocal();
    if (local && Date.now() - local.fullAt < FULL_EVERY) Object.assign(state, local);
    state.loaded = true;
  }
  const stale = Date.now() - state.fullAt >= FULL_EVERY;
  const missing = (need === 'recent' && !state.recent) || (need === 'open' && !state.open);
  if (stale) {
    const hadOpen = !!state.open || need === 'open'; const hadRecent = !!state.recent || need === 'recent';
    state.recent = null; state.open = null; state.lastUpdated = 0;
    if (hadRecent) await fullRecent();
    if (hadOpen) await fullOpen();
    state.fullAt = Date.now();
  } else {
    const ok = await delta().catch(() => false);
    if (!ok) { const r = !!state.recent || need === 'recent'; const o = !!state.open || need === 'open'; state.recent = null; state.open = null; state.lastUpdated = 0; if (r) await fullRecent(); if (o) await fullOpen(); state.fullAt = Date.now(); }
    else if (missing) { if (need === 'recent') await fullRecent(); else await fullOpen(); }
  }
  state.checkedAt = Date.now();
  saveLocal();
}

function ensure(need) {
  const fresh = Date.now() - state.checkedAt < TTL && state[need];
  if (fresh) return Promise.resolve(state[need]);
  if (!inflight) inflight = refresh(need).finally(() => { inflight = null; });
  return inflight.then(() => (state[need] ? state[need] : ensure(need)));
}

export function loadRecentTickets(max = RECENT_MAX) { return ensure('recent').then((l) => (max < l.length ? l.slice(0, max) : l)); }
export function loadOpenTickets() { return ensure('open'); }
// بعد أي تعديل محلي مهم: التحديث الجاي يجيب الفرق فورًا (من غير تحميل كامل)
export function invalidateTicketPools() { state.checkedAt = 0; }
export function resetTicketPools() { state = { loaded: true, recent: null, open: null, lastUpdated: 0, fullAt: 0, checkedAt: 0 }; saveLocal(); }
