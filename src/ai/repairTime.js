// ⏱️ متوسط وقت الصيانة — من سجل حالات التذكرة (statusHistory).
// لكل تذكرة اتسلّمت/اتقفلت جوه الفترة:
//   الإجمالي   = من فتح التذكرة لحد التسليم/الإغلاق
//   حتى الجاهزية = من فتح التذكرة لحد ما الجهاز بقى جاهز (اتصلنا بالعميل) أو اتسلّم
//   انتظار العميل = وقت في "انتظار موافقة العميل" + "جاهز ومستني العميل يستلم"
//   انتظار القطع = وقت في "انتظار/عدم توفر قطع الغيار"
//   المصنع      = وقت في حالات المصنع
//   الصافي     = الإجمالي − انتظار العميل − انتظار القطع  (وقت الشغل الفعلي علينا)
import { toDate, ticketWarehouseOf } from '../utils/liveStats';

export const DONE_STATUSES = ['delivered_to_customer', 'delivered_asc', 'closed'];
export const NOT_REPAIRED = ['rejected_by_customer', 'rejected_and_delivered', 'damaged_disposed'];
const READY_STATUSES = ['contacted_customer', ...DONE_STATUSES];
const WAIT_CUSTOMER = ['waiting_customer_approval_cost', 'contacted_customer'];
const WAIT_PARTS = ['waiting_spare_parts', 'spare_parts_unavailable'];
const FACTORY = ['sent_to_factory', 'factory_maintenance_done', 'sent_from_factory', 'shipped_asc'];

const HOUR = 3600000;
const DAY = 24 * HOUR;

const parseDateTime = (date, time) => {
  if (!date) return null;
  const d = new Date(`${date}T${time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '12:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// تحليل تذكرة واحدة. بيرجّع null لو التذكرة لسه مخلصتش
export function analyzeTicket(t) {
  const created = toDate(t.createdAt);
  if (!created) return null;
  const hist = (Array.isArray(t.statusHistory) ? t.statusHistory : [])
    .map((h) => ({ status: h.status, at: toDate(h.timestamp) }))
    .filter((h) => h.at && h.status)
    .sort((a, b) => a.at - b.at);

  const doneEntry = hist.find((h) => DONE_STATUSES.includes(h.status));
  const rejectedEntry = hist.find((h) => NOT_REPAIRED.includes(h.status));
  let completedAt = doneEntry?.at || null;
  let estimated = false;
  let outcome = 'repaired';

  if (!completedAt) {
    if (rejectedEntry) { completedAt = rejectedEntry.at; outcome = 'not_repaired'; }
    else if (DONE_STATUSES.includes(t.status) || NOT_REPAIRED.includes(t.status)) {
      // تذاكر قديمة من غير سجل حالات: نستخدم تاريخ التسليم/انتهاء الصيانة/آخر تعديل
      completedAt = parseDateTime(t.deliveryDate, t.deliveryTime) || parseDateTime(t.maintenanceEndDate, t.maintenanceEndTime) || toDate(t.updatedAt);
      estimated = true;
      outcome = NOT_REPAIRED.includes(t.status) ? 'not_repaired' : 'repaired';
    }
  }
  if (!completedAt || completedAt < created) return null;

  // توزيع الوقت على الحالات (كل فترة بتتحسب على الحالة اللي كانت قبلها)
  const seg = { waitCustomer: 0, waitParts: 0, factory: 0 };
  if (!estimated) {
    const points = [{ status: 'created', at: created }, ...hist.filter((h) => h.at >= created && h.at <= completedAt)];
    for (let i = 0; i < points.length - 1; i++) {
      const dur = points[i + 1].at - points[i].at;
      const st = points[i].status;
      if (WAIT_CUSTOMER.includes(st)) seg.waitCustomer += dur;
      else if (WAIT_PARTS.includes(st)) seg.waitParts += dur;
      else if (FACTORY.includes(st)) seg.factory += dur;
    }
  }
  const total = completedAt - created;
  const readyEntry = hist.find((h) => READY_STATUSES.includes(h.status) && h.at >= created);
  const toReady = readyEntry ? Math.min(readyEntry.at, completedAt) - created : total;
  return {
    id: t.id,
    ticketNumber: t.ticketNumber || '',
    device: [t.device, t.deviceModel].filter(Boolean).join(' '),
    deviceType: String(t.device || '').trim().split(/\s+/)[0] || 'غير محدد',
    technician: t.assignedTechnician || 'غير محدد',
    center: ticketWarehouseOf(t),
    priority: t.priority || 'medium',
    createdAt: created,
    completedAt,
    total,
    toReady,
    net: Math.max(0, total - seg.waitCustomer - seg.waitParts),
    ...seg,
    estimated,
    outcome,
  };
}

export const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { count: 0, avg: 0, median: 0, p90: 0, min: 0, max: 0 };
  return { count: v.length, avg: v.reduce((s, x) => s + x, 0) / v.length, median: quantile(v, 0.5), p90: quantile(v, 0.9), min: v[0], max: v[v.length - 1] };
}

const groupStats = (rows, keyFn, metric, labelFn = (k) => k) => {
  const m = new Map();
  rows.forEach((r) => { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return [...m.entries()].map(([k, list]) => ({
    key: k, name: labelFn(k), count: list.length,
    avg: list.reduce((s, r) => s + r[metric], 0) / list.length,
    median: quantile(list.map((r) => r[metric]).sort((a, b) => a - b), 0.5),
  })).sort((a, b) => b.count - a.count);
};

// التقرير الكامل للفترة [from, to)
export function buildRepairTimeReport(tickets, { from, to, slaHours = { high: 4, medium: 24, low: 72 }, warehouseName = (x) => x, scope = () => true } = {}) {
  const analyzed = (tickets || []).map(analyzeTicket).filter(Boolean)
    .filter((r) => r.completedAt >= from && r.completedAt < to && scope(r.center));
  const repaired = analyzed.filter((r) => r.outcome === 'repaired');
  const sla = (r) => (slaHours?.[r.priority] ?? 24) * HOUR;
  const withinSla = repaired.filter((r) => r.total <= sla(r)).length;

  const sumOf = (k) => repaired.reduce((s, r) => s + r[k], 0);
  const totalTime = sumOf('total') || 1;
  const waitCustomer = sumOf('waitCustomer');
  const waitParts = sumOf('waitParts');
  const factory = sumOf('factory');

  // الاتجاه أسبوعيًا (حسب تاريخ التسليم)
  const weeks = new Map();
  repaired.forEach((r) => {
    const d = new Date(r.completedAt); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    const k = d.toISOString().slice(0, 10);
    const w = weeks.get(k) || { name: k, sum: 0, net: 0, n: 0 };
    w.sum += r.total; w.net += r.net; w.n += 1; weeks.set(k, w);
  });

  return {
    count: repaired.length,
    notRepaired: analyzed.length - repaired.length,
    estimatedCount: repaired.filter((r) => r.estimated).length,
    total: summarize(repaired.map((r) => r.total)),
    net: summarize(repaired.map((r) => r.net)),
    toReady: summarize(repaired.map((r) => r.toReady)),
    slaRate: repaired.length ? withinSla / repaired.length : null,
    breakdown: [
      { key: 'work', name: 'شغل فعلي عندنا', value: Math.max(0, totalTime - waitCustomer - waitParts - factory) },
      { key: 'customer', name: 'انتظار العميل', value: waitCustomer },
      { key: 'parts', name: 'انتظار قطع الغيار', value: waitParts },
      { key: 'factory', name: 'عند المصنع / الشحن', value: factory },
    ].map((b) => ({ ...b, share: repaired.length ? b.value / totalTime : 0 })),
    byTechnician: groupStats(repaired, (r) => r.technician, 'net'),
    byCenter: groupStats(repaired, (r) => r.center, 'total', warehouseName),
    byDevice: groupStats(repaired, (r) => r.deviceType, 'total'),
    byPriority: groupStats(repaired, (r) => r.priority, 'total', (p) => ({ high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }[p] || p)),
    weekly: [...weeks.values()].sort((a, b) => a.name.localeCompare(b.name)).map((w) => ({ name: w.name.slice(5), avgDays: +(w.sum / w.n / DAY).toFixed(1), netDays: +(w.net / w.n / DAY).toFixed(1), count: w.n })),
    slowest: [...repaired].sort((a, b) => b.total - a.total).slice(0, 10),
    rows: repaired,
  };
}

// "3 يوم و 4 ساعات"
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0 ساعة';
  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms - days * DAY) / HOUR);
  if (days === 0) return hours <= 0 ? 'أقل من ساعة' : `${hours} ساعة`;
  if (hours === 0 || days >= 10) return `${days + (hours >= 12 && days >= 10 ? 1 : 0)} يوم`;
  return `${days} يوم و ${hours} ساعة`;
}

// ملاحظات تلقائية (من غير ذكاء اصطناعي) عن مكان التأخير
export function repairInsights(report, { minCount = 3 } = {}) {
  const out = [];
  if (!report.count) return out;
  const top = [...report.breakdown].filter((b) => b.key !== 'work').sort((a, b) => b.share - a.share)[0];
  if (top && top.share >= 0.25) out.push({ level: 'warn', text: `${Math.round(top.share * 100)}% من وقت الصيانة بيضيع في «${top.name}».` });
  if (report.slaRate !== null && report.slaRate < 0.7) out.push({ level: 'warn', text: `بس ${Math.round(report.slaRate * 100)}% من التذاكر خلصت جوه مهلة الـ SLA.` });
  if (report.total.p90 > report.total.median * 3 && report.count >= 5) out.push({ level: 'info', text: `فيه تذاكر شاذة طويلة جدًا: أبطأ 10% أخدت ${formatDuration(report.total.p90)} أو أكتر، والوسيط ${formatDuration(report.total.median)}.` });
  const techs = report.byTechnician.filter((t) => t.count >= minCount && t.key !== 'غير محدد');
  if (techs.length >= 2) {
    const avg = techs.reduce((s, t) => s + t.avg * t.count, 0) / techs.reduce((s, t) => s + t.count, 0);
    const slow = [...techs].sort((a, b) => b.avg - a.avg)[0];
    const fast = [...techs].sort((a, b) => a.avg - b.avg)[0];
    if (slow.avg > avg * 1.3) out.push({ level: 'info', text: `الفني «${slow.name}» صافي وقته ${formatDuration(slow.avg)} — أبطأ من المتوسط بـ ${Math.round((slow.avg / avg - 1) * 100)}%.` });
    if (fast.avg < avg * 0.75) out.push({ level: 'good', text: `الفني «${fast.name}» الأسرع: ${formatDuration(fast.avg)} في المتوسط (${fast.count} تذكرة).` });
  }
  if (report.estimatedCount > report.count * 0.3) out.push({ level: 'info', text: `${report.estimatedCount} تذكرة قديمة مفيهاش سجل حالات كامل، فوقتها تقديري.` });
  return out;
}
