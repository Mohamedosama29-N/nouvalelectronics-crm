// ☎️ أدوات الكول سنتر (محلي): أسئلة الفحص، أجهزة العميل، قائمة المتابعة بعد التسليم،
// والصيانة الدورية — كله من بيانات التذاكر والمبيعات من غير أي خدمة خارجية.
import { normalizeArabic } from './ticketAssist';
import { analyzeTicket } from './repairTime';
import { deviceKey } from './quality';
import { toDate } from '../utils/liveStats';

const DAY = 86400000;

export const CONTACT_TYPES = [
  { value: 'call_in', label: 'مكالمة واردة' }, { value: 'call_out', label: 'مكالمة صادرة' },
  { value: 'whatsapp', label: 'واتساب' }, { value: 'visit', label: 'زيارة' },
];
export const CONTACT_OUTCOMES = [
  { value: 'info', label: 'استفسار واتجاوب' }, { value: 'resolved', label: 'اتحل' },
  { value: 'callback', label: 'هنتصل بيه تاني' }, { value: 'no_answer', label: 'مارديش' },
  { value: 'complaint', label: 'شكوى' }, { value: 'new_ticket', label: 'اتفتحت تذكرة' },
  { value: 'followup_done', label: 'متابعة بعد التسليم' },
];
export const labelOf = (list, v) => list.find((x) => x.value === v)?.label || v || '';

// (14) أسئلة الفحص المبدئي حسب نوع الجهاز
const COMMON = ['الجهاز تحت الضمان؟ معاك الفاتورة وتاريخ الشراء؟', 'المشكلة بدأت إمتى؟ حصلت فجأة ولا بالتدريج؟', 'حصل قبلها انقطاع كهربا أو وقعة أو مية؟'];
export const TRIAGE = {
  'شاشه': ['فيه صوت من غير صورة؟', 'لمبة الاستاندباي بتنور؟ بتنور بلون إيه؟', 'فيه خطوط أو بقع أو كسر في الشاشة؟', 'بتفصل لوحدها بعد وقت؟ قد إيه؟', 'جرّبت ريموت تاني أو زرار الجهاز نفسه؟'],
  'غساله': ['بتشتغل خالص ولا بتنور بس؟', 'فيه كود خطأ ظاهر على الشاشة؟ إيه هو؟', 'المشكلة في الغسيل ولا العصر ولا التصريف؟', 'فيه صوت عالي أو اهتزاز زيادة؟', 'فيه تسريب مية؟ من فين؟'],
  'ثلاجه': ['الفريزر بيبرد والثلاجة لأ، ولا الاتنين؟', 'الموتور بيشتغل؟ فيه صوت؟', 'فيه تلج متجمع ورا أو مية تحت الدرج؟', 'الجهاز اتنقل أو اتقلب قريب؟', 'الكهربا عندك مستقرة؟ عندك مثبت؟'],
  'تكييف': ['بيطلع هوا من غير تبريد؟', 'الوحدة الخارجية بتشتغل؟', 'فيه مية بتنقط من الداخلية؟', 'آخر مرة اتغسل الفلتر/اتعملّه صيانة إمتى؟', 'فيه كود خطأ على الشاشة؟'],
  'ديب': ['بيفصل ويشتغل كتير؟', 'البرودة ضعيفة ولا مفيش خالص؟', 'فيه تلج كتير على الجدران؟'],
  'بوتاجاز': ['فيه ريحة غاز؟ (لو أيوه: اقفل المحبس وافتح الشبابيك فورًا)', 'العيون مش بتولع ولا الفرن؟', 'الولاعة بتدي شرارة؟'],
  'ميكروويف': ['بيلف ومبيسخنش؟', 'فيه شرار جوه؟ (وقّف استخدامه فورًا)', 'الشاشة والزراير شغالة؟'],
  'سخان': ['المية مش بتسخن خالص ولا بتسخن شوية؟', 'فيه تسريب؟', 'لمبة السخان بتنور؟'],
  'موبايل': ['الجهاز بيشحن؟', 'فيه كسر أو وقعة أو مية؟', 'المشكلة في الشبكة ولا الشاشة ولا البطارية؟'],
  'لابتوب': ['بيفتح؟ لمبة الشحن بتنور؟', 'بيسخن جدًا أو المروحة صوتها عالي؟', 'محتاج الداتا اللي عليه؟'],
};
export function triageQuestions(device) {
  const t = normalizeArabic(device || '').replace(/^ال/, '');
  const key = Object.keys(TRIAGE).find((k) => t.includes(normalizeArabic(k)));
  return { device: key || null, questions: [...(key ? TRIAGE[key] : []), ...COMMON] };
}

// (31) أجهزة العميل من تذاكره ومشترياته
export function customerDevices(tickets = [], sales = []) {
  const m = new Map();
  tickets.forEach((t) => {
    const k = deviceKey(t) || `t:${t.id}`;
    const created = toDate(t.createdAt);
    const cur = m.get(k) || { key: k, device: [t.device, t.deviceModel].filter(Boolean).join(' '), serial: t.deviceSerial || '', tickets: [], warrantyEnd: null, purchased: null };
    cur.tickets.push({ id: t.id, ticketNumber: t.ticketNumber, status: t.status, created });
    m.set(k, cur);
  });
  sales.forEach((tx) => (tx.items || []).forEach((i) => {
    if (i.isService) return;
    const k = i.serialNumber ? `s:${String(i.serialNumber).toLowerCase()}` : `i:${tx.invoiceNumber}:${i.name}`;
    const cur = m.get(k) || { key: k, device: i.name || i.serialNumber, serial: i.serialNumber || '', tickets: [], warrantyEnd: null, purchased: null };
    cur.purchased = toDate(tx.timestamp);
    cur.invoiceNumber = tx.invoiceNumber;
    if (i.warrantyEndDate) cur.warrantyEnd = new Date(`${i.warrantyEndDate}T00:00:00`);
    m.set(k, cur);
  }));
  return [...m.values()].map((d) => ({ ...d, tickets: d.tickets.sort((a, b) => (b.created || 0) - (a.created || 0)) }))
    .sort((a, b) => (b.tickets[0]?.created || b.purchased || 0) - (a.tickets[0]?.created || a.purchased || 0));
}

// (27) قائمة المتابعة بعد التسليم: اتسلّمت من minDays لـ maxDays ومحدش تابعها
const hasFollowUp = (t) => !!t.followUpDate || ['accessibility', 'maintenanceTime', 'centerDealing', 'deliveryProcedures'].some((k) => Number(t.followUp?.[k]) > 0);
export function followUpQueue(tickets = [], { minDays = 2, maxDays = 10, now = new Date(), skipIds = new Set() } = {}) {
  return tickets.map((t) => ({ t, a: analyzeTicket(t) }))
    .filter(({ t, a }) => a && a.outcome === 'repaired' && !hasFollowUp(t) && !skipIds.has(t.id)
      && (now - a.completedAt) >= minDays * DAY && (now - a.completedAt) <= maxDays * DAY)
    .map(({ t, a }) => ({ ticket: t, daysSince: Math.floor((now - a.completedAt) / DAY), completedAt: a.completedAt }))
    .sort((x, y) => y.daysSince - x.daysSince);
}

// (36) الصيانة الدورية: أجهزة اتصلحت/اتعملها صيانة من فترة وقرب ميعاد الصيانة الجاية
export const DEFAULT_PERIODIC = [
  { match: 'تكييف', months: 6, label: 'صيانة وتنظيف التكييف' },
  { match: 'فلتر', months: 3, label: 'تغيير شمع فلتر المياه' },
  { match: 'سخان', months: 12, label: 'صيانة السخان السنوية' },
  { match: 'غساله', months: 12, label: 'تنظيف وصيانة الغسالة' },
];
export function periodicDue(tickets = [], { rules = DEFAULT_PERIODIC, now = new Date(), beforeDays = 14, afterDays = 30 } = {}) {
  const latest = new Map();
  tickets.forEach((t) => {
    const k = deviceKey(t); if (!k) return;
    const a = analyzeTicket(t);
    const when = a?.completedAt || toDate(t.createdAt);
    const prev = latest.get(k);
    if (!prev || when > prev.when) latest.set(k, { t, when, open: !a });
  });
  const out = [];
  latest.forEach(({ t, when, open }) => {
    if (open || !when) return;
    const dev = normalizeArabic(`${t.device || ''} ${t.deviceModel || ''}`);
    const rule = rules.find((r) => dev.includes(normalizeArabic(r.match)));
    if (!rule) return;
    const due = new Date(when); due.setMonth(due.getMonth() + rule.months);
    const diff = (due - now) / DAY;
    if (diff <= beforeDays && diff >= -afterDays) out.push({ ticket: t, rule, due, daysToDue: Math.round(diff) });
  });
  return out.sort((a, b) => a.daysToDue - b.daysToDue);
}

export function periodicMessage(item, company = '') {
  const name = String(item.ticket.customerName || '').trim().split(/\s+/)[0];
  const dev = [item.ticket.device, item.ticket.deviceModel].filter(Boolean).join(' ');
  return `أهلاً${name ? ` أستاذ/ة ${name}` : ''}، ميعاد ${item.rule.label} لـ ${dev} قرّب (${item.due.toLocaleDateString('ar-EG')}). تحب نحجزلك ميعاد؟${company ? `\n${company}` : ''}`;
}

export function followUpMessage(ticket, company = '') {
  const name = String(ticket.customerName || '').trim().split(/\s+/)[0];
  const dev = [ticket.device, ticket.deviceModel].filter(Boolean).join(' ') || 'الجهاز';
  return `أهلاً${name ? ` أستاذ/ة ${name}` : ''}، حابين نطمّن إن ${dev} شغال كويس بعد الصيانة 🙏 لو فيه أي ملاحظة كلّمنا على طول.${company ? `\n${company}` : ''}`;
}
