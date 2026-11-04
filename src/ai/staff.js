// 👷 الفنيين والموظفين: الحضور والانصراف، الزيارات المنزلية، قوالب الأعطال، والإشعارات الداخلية (محلي)
import { normalizeArabic } from './ticketAssist';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const asDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

// (41) الحضور: تأخير ووقت شغل
export const DEFAULT_SHIFT = { start: '09:00', end: '17:00', grace: 15 };
export function attendanceInfo(rec, shift = DEFAULT_SHIFT) {
  const inAt = asDate(rec.checkIn); const outAt = asDate(rec.checkOut);
  const start = toMin(shift.start) ?? 540; const end = toMin(shift.end) ?? 1020; const grace = Number(shift.grace) || 0;
  const inMin = inAt ? inAt.getHours() * 60 + inAt.getMinutes() : null;
  const outMin = outAt ? outAt.getHours() * 60 + outAt.getMinutes() : null;
  const late = inMin !== null ? Math.max(0, inMin - start - grace > 0 ? inMin - start : 0) : 0;
  const early = outMin !== null ? Math.max(0, end - outMin) : 0;
  const workedMin = inAt && outAt ? Math.max(0, Math.round((outAt - inAt) / 60000)) : null;
  return { late, early, workedMin, open: !!inAt && !outAt };
}

export function attendanceSummary(records = [], shift = DEFAULT_SHIFT) {
  const by = new Map();
  records.forEach((r) => {
    const k = r.userId || r.name;
    const g = by.get(k) || { userId: r.userId, name: r.name, days: 0, lateDays: 0, lateMin: 0, workedMin: 0, missingOut: 0 };
    const i = attendanceInfo(r, shift);
    g.days += 1;
    if (i.late > 0) { g.lateDays += 1; g.lateMin += i.late; }
    if (i.workedMin !== null) g.workedMin += i.workedMin; else g.missingOut += 1;
    by.set(k, g);
  });
  return [...by.values()].sort((a, b) => b.lateMin - a.lateMin || a.name.localeCompare(b.name));
}

// (33) الزيارات المنزلية
export const VISIT_STATUS = { scheduled: 'محجوزة', confirmed: 'اتأكدت مع العميل', done: 'اتعملت', no_show: 'العميل مكانش موجود', cancelled: 'اتلغت' };
export const VISIT_SLOTS = ['9-12 الصبح', '12-3 الضهر', '3-6 العصر', '6-9 بالليل'];
export function groupVisitsByDay(visits = [], { days = 7, from = new Date() } = {}) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const key = ymd(d);
    const list = visits.filter((v) => v.date === key && v.status !== 'cancelled')
      .sort((a, b) => VISIT_SLOTS.indexOf(a.slot) - VISIT_SLOTS.indexOf(b.slot) || String(a.technician).localeCompare(String(b.technician)));
    out.push({ key, date: d, visits: list });
  }
  return out;
}
export const mapsLink = (v) => {
  const parts = [v.address, v.city, v.governorate].filter((x) => String(x || '').trim());
  return parts.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([...parts, 'مصر'].join('، '))}` : null;
};
export function visitConfirmMessage(v, company = '') {
  const name = String(v.customerName || '').trim().split(/\s+/)[0];
  return `أهلاً${name ? ` أستاذ/ة ${name}` : ''}، بنأكد ميعاد زيارة الفني${v.technician ? ` (${v.technician})` : ''} يوم ${v.date} ${v.slot ? `في فترة ${v.slot}` : ''} لـ ${v.device || 'الجهاز'}. لو الميعاد مش مناسب ردّ علينا.${company ? `\n${company}` : ''}`;
}
// تعارض: نفس الفني ونفس اليوم والفترة
export const visitConflicts = (visits, v) => visits.filter((x) => x.id !== v.id && x.status !== 'cancelled' && x.technician && x.technician === v.technician && x.date === v.date && x.slot === v.slot);

// (39) قوالب الأعطال
export function matchTemplate(templates = [], draft = {}) {
  const model = normalizeArabic(draft.deviceModel || '').trim();
  const code = normalizeArabic(draft.subFaultCode || draft.mainFaultCode || '').trim();
  const main = normalizeArabic(draft.mainFaultCode || '').trim();
  const dev = normalizeArabic(String(draft.device || '').split(/\s+/)[0]);
  const score = (t) => {
    const tm = normalizeArabic(t.model || '').trim(); const tc = normalizeArabic(t.faultCode || '').trim();
    if (!tc || (tc !== code && tc !== main)) return 0;
    if (tm && model && tm === model) return 3;
    if (!tm) return 2;
    if (tm && dev && tm === dev) return 1.5;
    return 0;
  };
  return templates.map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0]?.t || null;
}

// (37) الإشعارات الداخلية
export function buildNotification({ toUserId = null, toName = null, toRole = null, toCenter = null, title, body = '', view = null, intent = null, from = '' }) {
  if (!title || !(toUserId || toName || toRole || toCenter)) return null;
  return { toUserId, toName, toRole, toCenter, title: String(title).slice(0, 120), body: String(body).slice(0, 300), link: view ? { view, intent } : null, from, readBy: [] };
}
export const isUnread = (n, userId) => !(n.readBy || []).includes(userId);
