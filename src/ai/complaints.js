// 📣 (29) الشكاوى والتصعيد: تصنيف، درجة خطورة بمهلة، وتصعيد تلقائي للمستوى الأعلى لو المهلة عدّت
import { sentimentOf } from './insights';
import { toDate } from '../utils/liveStats';

const H = 3600000;
export const COMPLAINT_CATEGORIES = [
  { value: 'delay', label: 'تأخير في الصيانة' }, { value: 'quality', label: 'العطل رجع / جودة الإصلاح' },
  { value: 'staff', label: 'تعامل الموظفين' }, { value: 'price', label: 'السعر / الفاتورة' },
  { value: 'parts', label: 'قطع الغيار' }, { value: 'warranty', label: 'رفض الضمان' },
  { value: 'damage', label: 'تلف في الجهاز عندنا' }, { value: 'other', label: 'أخرى' },
];
export const SEVERITY = {
  critical: { label: 'حرجة', hours: 4, cls: 'bg-rose-600 text-white' },
  high: { label: 'عالية', hours: 24, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  medium: { label: 'متوسطة', hours: 48, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  low: { label: 'بسيطة', hours: 72, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};
export const LEVELS = { 1: 'الموظف المسؤول', 2: 'مشرف الشكاوى', 3: 'مدير النظام' };
export const C_STATUS = { open: 'مفتوحة', investigating: 'جاري المتابعة', resolved: 'اتحلت', closed: 'اتقفلت' };
const OPEN = ['open', 'investigating'];

// اقتراح الخطورة والتصنيف من كلام العميل
export function suggestComplaint(text = '') {
  const s = sentimentOf(text);
  const t = String(text);
  let category = 'other';
  if (/اتاخر|اتأخر|تأخير|تاخير|مستني|بقالي|لسه/.test(t)) category = 'delay';
  else if (/رجع|تاني|نفس العطل|باظ تاني|اتصلح.*باظ/.test(t)) category = 'quality';
  else if (/موظف|اتعامل|اسلوب|أسلوب|قلة ذوق|زعق|بيزعق/.test(t)) category = 'staff';
  else if (/سعر|غالي|فلوس|فاتوره|فاتورة|حساب/.test(t)) category = 'price';
  else if (/قطعه|قطعة|قطع غيار/.test(t)) category = 'parts';
  else if (/ضمان/.test(t)) category = 'warranty';
  else if (/كسر|اتكسر|خدش|اتخدش|تلف/.test(t)) category = 'damage';
  const severity = s.escalate ? 'critical' : s.label === 'angry' ? 'high' : s.label === 'unhappy' ? 'medium' : 'low';
  return { category, severity, escalate: !!s.escalate };
}

export const dueFrom = (from, severity) => new Date((from instanceof Date ? from : new Date(from)).getTime() + (SEVERITY[severity]?.hours || 48) * H);

export function complaintState(c, now = new Date()) {
  const due = toDate(c.dueAt) || dueFrom(toDate(c.createdAt) || now, c.severity);
  const open = OPEN.includes(c.status);
  const hoursLeft = (due - now) / H;
  const overdue = open && hoursLeft < 0;
  return { due, open, hoursLeft, overdue, shouldEscalate: overdue && (Number(c.level) || 1) < 3 };
}

// التصعيد: مستوى أعلى + مهلة جديدة (نص مهلة الخطورة) + سطر في السجل
export function escalationPatch(c, now = new Date(), by = 'السيستم', reason = 'عدّت المهلة من غير حل') {
  const level = Math.min(3, (Number(c.level) || 1) + 1);
  const hours = Math.max(2, (SEVERITY[c.severity]?.hours || 48) / 2);
  return { level, dueAt: new Date(now.getTime() + hours * H), escalations: (Number(c.escalations) || 0) + 1, logEntry: { at: now.toISOString(), by, action: `تصعيد لـ ${LEVELS[level]}`, note: reason } };
}

export function complaintStats(list = [], now = new Date()) {
  const open = list.filter((c) => OPEN.includes(c.status));
  const resolved = list.filter((c) => c.resolvedAt && c.createdAt);
  const hrs = resolved.map((c) => (toDate(c.resolvedAt) - toDate(c.createdAt)) / H).filter((x) => x >= 0);
  const byCat = {};
  list.forEach((c) => { byCat[c.category] = (byCat[c.category] || 0) + 1; });
  return {
    total: list.length, open: open.length, overdue: open.filter((c) => complaintState(c, now).overdue).length,
    critical: open.filter((c) => c.severity === 'critical').length,
    avgResolveHours: hrs.length ? hrs.reduce((s, x) => s + x, 0) / hrs.length : null,
    byCategory: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
  };
}
