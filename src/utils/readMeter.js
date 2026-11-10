// 📊 (5) عدّاد تقريبي للقراءات والكتابات — عشان متعدّيش حدود خطة Spark المجانية
// (50,000 قراءة و20,000 كتابة في اليوم، واليوم بيتجدد 12 بالليل بتوقيت كاليفورنيا ≈ 10 الصبح بتوقيت مصر).
export const FREE_LIMITS = { reads: 50000, writes: 20000 };
const KEY = 'erp_usage_meter';

// تاريخ اليوم بتوقيت المحيط الهادي (ده اللي جوجل بيحسب عليه الحصة)
export function quotaDay(now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

let mem = null;
const load = () => {
  if (mem && mem.day === quotaDay()) return mem;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); mem = s && s.day === quotaDay() ? s : null; } catch { mem = null; }
  if (!mem) mem = { day: quotaDay(), reads: 0, writes: 0, cacheHits: 0, flushedReads: 0, flushedWrites: 0, top: {} };
  return mem;
};
let saveTimer = null;
const persist = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* مش مهم */ } }, 1500);
};
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(mem); } catch { /* */ } });

export function countReads(n, { fromCache = false, source = '' } = {}) {
  const m = load();
  if (fromCache) m.cacheHits += n; else { m.reads += n; if (source) m.top[source] = (m.top[source] || 0) + n; }
  persist(); emit();
}
export function countWrites(n = 1) { const m = load(); m.writes += n; persist(); emit(); }
export const deviceUsage = () => ({ ...load() });
export const onUsage = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// الجزء اللي لسه ماتبعتش لمستند الاستهلاك المشترك
export function takeUnflushed() {
  const m = load();
  const ft = m.flushedTop || {};
  const top = {};
  Object.entries(m.top || {}).forEach(([k, v]) => { const x = v - (ft[k] || 0); if (x > 0) top[k] = x; });
  const d = { day: m.day, reads: m.reads - m.flushedReads, writes: m.writes - m.flushedWrites, top };
  return d;
}
export function markFlushed(d) {
  const m = load(); if (m.day !== d.day) return;
  m.flushedReads += d.reads; m.flushedWrites += d.writes;
  m.flushedTop = m.flushedTop || {};
  Object.entries(d.top || {}).forEach(([k, v]) => { m.flushedTop[k] = (m.flushedTop[k] || 0) + v; });
  persist();
}

export function usageLevel(used, limit) {
  const p = limit ? used / limit : 0;
  return { pct: p, level: p >= 0.9 ? 'danger' : p >= 0.7 ? 'warn' : 'ok' };
}

// بيضيف استهلاك الجهاز ده لمستند اليوم المشترك usageDaily/{day} (كتابة واحدة كل ربع ساعة بالكتير)
let lastFlush = 0;
export async function flushUsage(user, { force = false } = {}) {
  const d = takeUnflushed();
  if (d.reads <= 0 && d.writes <= 0) return false;
  if (!force && Date.now() - lastFlush < 5 * 60000) return false;
  lastFlush = Date.now();
  const { doc, increment, serverTimestamp, setDoc } = await import('firebase/firestore');
  const { db } = await import('../firebase/config');
  const safe = (k) => String(k || 'x').replace(/[.~*/[\]]/g, '_');
  // setDoc مع merge بيدمج الـ maps المتداخلة (النقطة في اسم الحقل مش بتتفهم كمسار هنا)
  const src = Object.fromEntries(Object.entries(d.top || {}).map(([k, v]) => [safe(k), increment(v)]));
  await setDoc(doc(db, 'usageDaily', d.day), { reads: increment(d.reads), writes: increment(d.writes), updatedAt: serverTimestamp(), by: { [safe(user?.id)]: increment(d.reads) }, src }, { merge: true });
  markFlushed(d);
  return true;
}

export async function readUsageToday() {
  const { doc, getDoc } = await import('firebase/firestore');
  const { db } = await import('../firebase/config');
  const s = await getDoc(doc(db, 'usageDaily', quotaDay()));
  return s.exists() ? s.data() : { reads: 0, writes: 0 };
}
