// 🗺️ (25) خريطة المحافظات: خريطة "مربعات" مبسّطة لمصر (كل محافظة مربع في مكانها التقريبي) —
// خفيفة ومجانية ومن غير مكتبات خرايط. لكل محافظة: المفتوح، المتأخر، حجم الشغل، متوسط وقت الصيانة، والمراكز اللي بتغطيها.
import { normalizeArabic } from './ticketAssist';
import { analyzeTicket } from './repairTime';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate } from '../utils/liveStats';

// [عمود (غرب→شرق), صف (شمال→جنوب)]
export const GOV_TILES = {
  'الإسكندرية': [2, 0], 'كفر الشيخ': [3, 0], 'دمياط': [4, 0], 'بورسعيد': [5, 0],
  'مطروح': [0, 1], 'البحيرة': [2, 1], 'الغربية': [3, 1], 'الدقهلية': [4, 1], 'الإسماعيلية': [5, 1], 'شمال سيناء': [6, 1],
  'المنوفية': [2, 2], 'القليوبية': [3, 2], 'الشرقية': [4, 2], 'السويس': [5, 2], 'جنوب سيناء': [6, 2],
  'الجيزة': [2, 3], 'القاهرة': [3, 3],
  'الفيوم': [1, 4], 'بني سويف': [2, 4],
  'الوادي الجديد': [0, 5], 'المنيا': [2, 5], 'البحر الأحمر': [4, 5],
  'أسيوط': [2, 6], 'سوهاج': [2, 7], 'قنا': [3, 7], 'الأقصر': [3, 8], 'أسوان': [3, 9],
};
const key = (s) => normalizeArabic(String(s || '')).replace(/\s+/g, ' ').replace(/^ال/, '').trim();
const INDEX = new Map(Object.keys(GOV_TILES).map((g) => [key(g), g]));
// أسماء شائعة تانية
[['اسكندريه', 'الإسكندرية'], ['مصر', 'القاهرة'], ['6 اكتوبر', 'الجيزة'], ['اكتوبر', 'الجيزة'], ['بورسعيد', 'بورسعيد'], ['بور سعيد', 'بورسعيد'], ['اقصر', 'الأقصر'], ['الوادى الجديد', 'الوادي الجديد'], ['بنى سويف', 'بني سويف']]
  .forEach(([a, b]) => INDEX.set(key(a), b));
export const canonicalGov = (s) => INDEX.get(key(s)) || null;

export const GEO_METRICS = {
  open: { label: 'تذاكر مفتوحة', fmt: (v) => String(v) },
  overdue: { label: 'متأخرة عن الـ SLA', fmt: (v) => String(v) },
  volume: { label: 'تذاكر آخر 90 يوم', fmt: (v) => String(v) },
  avgDays: { label: 'متوسط أيام الصيانة', fmt: (v) => (v === null ? '—' : v.toFixed(1)) },
};

export function governorateStats(tickets = [], { centers = [], slaHours = { high: 4, medium: 24, low: 72 }, now = new Date() } = {}) {
  const rows = Object.fromEntries(Object.keys(GOV_TILES).map((g) => [g, { gov: g, open: 0, overdue: 0, volume: 0, durations: [], centers: [] }]));
  let unknown = 0;
  centers.forEach((c) => (c.governorates || []).forEach((g) => { const k = canonicalGov(g); if (k) rows[k].centers.push(c.name); }));
  tickets.forEach((t) => {
    const g = canonicalGov(t.governorate);
    if (!g) { unknown += 1; return; }
    const r = rows[g];
    const created = toDate(t.createdAt);
    if (created && now - created <= 90 * 86400000) r.volume += 1;
    if (!TICKET_TERMINAL_STATUSES.includes(t.status)) {
      r.open += 1;
      const sla = (slaHours?.[t.priority || 'medium'] ?? 24) * 3600000;
      if (created && now - created > sla) r.overdue += 1;
    } else {
      const a = analyzeTicket(t);
      if (a?.total > 0) r.durations.push(a.total / 86400000);
    }
  });
  const list = Object.values(rows).map((r) => ({ ...r, avgDays: r.durations.length ? r.durations.reduce((s, x) => s + x, 0) / r.durations.length : null, uncovered: r.centers.length === 0 && (r.open > 0 || r.volume > 0) }));
  return { list, unknown };
}

// لون من 0 (فاتح) لـ 1 (غامق)
export const intensity = (v, max) => (v === null || !max ? 0 : Math.min(1, v / max));
