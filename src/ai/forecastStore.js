// 📈 بيانات توقع حجم التذاكر — تاريخ الإنشاء والفرع بس لكل تذكرة في آخر 16 أسبوع.
// قبل كده كل فتح للتبويب كان بيقرا آلاف التذاكر من Firestore (وبيقع لو حصة القراءات قربت تخلص).
// دلوقتي النسخة بتتحفظ على الجهاز، وكل مرة بنجيب بس التذاكر اللي اتعملت بعد آخر واحدة عندنا.
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { toDate } from '../utils/liveStats';

const KEY = 'nouval_forecast_v1';
const DAY = 86400000;
const WINDOW_DAYS = 113; // 16 أسبوع + يوم
const FRESH_MS = 30 * 60000; // خلال نص ساعة من آخر تحديث مفيش أي قراءة
const PAGE = 2000;
const MAX_PAGES = 8;

let mem = null;

const readLocal = () => {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const writeLocal = (v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* المساحة مليانة: نكمل من الذاكرة */ }
};

const compact = (d) => {
  const t = d.data();
  const c = toDate(t.createdAt);
  if (!c || t.isDeleted) return null;
  return { id: d.id, c: c.getTime(), w: t.warehouseId || '', ac: t.assignedCenter || '', at: t.assignedTechnician || '' };
};

// الشكل اللي forecastTicketVolume مستنيه
export const asTickets = (list) => list.map((x) => ({ createdAt: new Date(x.c), warehouseId: x.w || undefined, assignedCenter: x.ac || undefined, assignedTechnician: x.at || undefined }));

/**
 * بترجع { list, stale, error }:
 * - list: تذاكر آخر 16 أسبوع (مضغوطة)
 * - stale: true لو معرفناش نحدّث ورجعنا النسخة المحفوظة
 * - error: الخطأ لو حصل (للرسالة)
 */
export async function loadForecastTickets({ force = false } = {}) {
  const now = Date.now();
  const from = now - WINDOW_DAYS * DAY;
  const saved = mem || readLocal();
  let list = (saved?.list || []).filter((x) => x.c >= from);
  if (!force && saved && now - saved.at < FRESH_MS) return { list, stale: false, error: null };

  // نجيب بس الجديد بعد آخر تذكرة عندنا (أو آخر 16 أسبوع كاملة أول مرة)
  let after = list.length ? Math.max(...list.map((x) => x.c)) : from - 1;
  const seen = new Set(list.map((x) => x.id));
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const snap = await getDocs(query(collection(db, 'tickets'), where('createdAt', '>', Timestamp.fromMillis(after)), orderBy('createdAt', 'asc'), limit(PAGE)));
      for (const d of snap.docs) {
        const x = compact(d);
        if (x && !seen.has(x.id)) { list.push(x); seen.add(x.id); }
      }
      if (snap.docs.length < PAGE) break;
      const last = toDate(snap.docs[snap.docs.length - 1].data().createdAt);
      if (!last || last.getTime() <= after) break;
      after = last.getTime();
    }
    mem = { at: now, list };
    writeLocal(mem);
    return { list, stale: false, error: null };
  } catch (error) {
    // لو عندنا نسخة قديمة نعرضها بدل ما الشاشة تفضى
    if (list.length) mem = { at: saved?.at || 0, list };
    return { list, stale: true, error };
  }
}

export function clearForecastCache() {
  mem = null;
  try { localStorage.removeItem(KEY); } catch { /* */ }
}

// رسالة مفهومة حسب سبب الخطأ
export function loadErrorMessage(e, what = 'التذاكر') {
  const code = e?.code || '';
  if (code === 'resource-exhausted') return `حصة القراءات بتاعة النهارده خلصت، فمعرفتش أحمّل ${what}. الحصة بتتجدد الساعة 10 الصبح تقريبًا.`;
  if (code === 'permission-denied') return `حسابك مالوش صلاحية يقرا ${what}. كلّم المدير.`;
  if (code === 'failed-precondition') return 'محتاج Index في Firestore: شغّل firebase deploy --only firestore:indexes';
  if (code === 'unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return `مفيش اتصال بالإنترنت، فمعرفتش أحمّل ${what}.`;
  return `معرفتش أحمّل ${what}${code ? ` (${code})` : ''}.`;
}
