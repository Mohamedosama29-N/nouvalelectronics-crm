// 🏢 شبكة مراكز الصيانة: توزيع التذاكر، الوقت عند كل مركز، المستحقات،
// طلبات القطع، القطع التالفة، مطالبات المصنع، فحص الضمان، والعقود. (محلي)
import { normalizeArabic } from './ticketAssist';
import { analyzeTicket } from './repairTime';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate } from '../utils/liveStats';

const DAY = 86400000;
const norm = (s) => normalizeArabic(String(s || '')).trim();
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[،,]/)).map((x) => String(x).trim()).filter(Boolean);

// إعدادات المراكز من systemSettings.maintenanceCenters (نصوص أو كائنات)
export const centersFromSettings = (settings) => (settings?.maintenanceCenters || [])
  .map((c) => (typeof c === 'string' ? { name: c } : c)).filter((c) => c?.name)
  .map((c) => ({ ...c, governorates: list(c.governorates), devices: list(c.devices), capacity: Number(c.capacity) || 0, rate: Number(c.rate) || 0 }));

// (22) أنسب مركز للتذكرة: المحافظة + التخصص + الحمل الحالي
export function suggestCenters(draft, centers = [], openTickets = []) {
  if (!centers.length) return [];
  const gov = norm(draft.governorate);
  const dev = norm(String(draft.device || '').split(/\s+/)[0]);
  const load = new Map();
  openTickets.filter((t) => !TICKET_TERMINAL_STATUSES.includes(t.status)).forEach((t) => {
    if (t.assignedMaintenanceCenter) load.set(t.assignedMaintenanceCenter, (load.get(t.assignedMaintenanceCenter) || 0) + 1);
  });
  return centers.map((c) => {
    const l = load.get(c.name) || 0;
    const govOk = gov && c.governorates.some((g) => norm(g).replace(/^ال/, '') === gov.replace(/^ال/, ''));
    const devOk = dev && c.devices.some((d) => norm(d).includes(dev) || dev.includes(norm(d)));
    const full = c.capacity ? l / c.capacity : null;
    let score = 0.2;
    if (govOk) score += 0.45;
    if (!c.governorates.length) score += 0.1; // بيغطي كل المحافظات
    if (devOk) score += 0.25;
    if (!c.devices.length) score += 0.08;
    score -= full !== null ? Math.min(0.4, full * 0.3) : Math.min(0.3, l / 50);
    const reasons = [];
    if (govOk) reasons.push(`بيغطي ${draft.governorate}`);
    if (devOk) reasons.push(`متخصص في ${String(draft.device).split(/\s+/)[0]}`);
    reasons.push(c.capacity ? `الحمل ${l}/${c.capacity}` : `عليه ${l} تذكرة مفتوحة`);
    if (full !== null && full >= 1) reasons.push('⚠️ وصل لطاقته');
    return { name: c.name, score, reasons, load: l, full };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
}

// (21) الوقت عند كل مركز من سجل التحويلات
export function timeByCenter(t, now = new Date()) {
  const created = toDate(t.createdAt);
  if (!created) return [];
  const moves = (t.centerHistory || []).map((h) => ({ from: h.from || '', to: h.to || '', at: toDate(h.at) })).filter((h) => h.at).sort((a, b) => a.at - b.at);
  const a = analyzeTicket(t);
  const end = a?.completedAt || now;
  const segs = [];
  let cur = moves.length ? (moves[0].from || 'غير محدد') : (t.assignedMaintenanceCenter || 'غير محدد');
  let start = created;
  moves.forEach((m) => { segs.push({ center: cur, ms: Math.max(0, m.at - start) }); cur = m.to || 'غير محدد'; start = m.at; });
  segs.push({ center: cur, ms: Math.max(0, end - start) });
  const agg = new Map();
  segs.forEach((s) => agg.set(s.center, (agg.get(s.center) || 0) + s.ms));
  return [...agg.entries()].map(([center, ms]) => ({ center, ms }));
}

// (23) مستحقات المراكز عن إصلاحات الضمان في فترة
export function centerDues(tickets = [], centers = [], { from, to } = {}) {
  const rate = new Map(centers.map((c) => [c.name, c]));
  const m = new Map();
  tickets.forEach((t) => {
    if (t.warrantyStatus !== 'in_warranty' || !t.assignedMaintenanceCenter) return;
    const a = analyzeTicket(t);
    if (!a || a.outcome !== 'repaired' || a.completedAt < from || a.completedAt >= to) return;
    const c = rate.get(t.assignedMaintenanceCenter) || {};
    const devRate = (c.deviceRates || {})[String(t.device || '').split(/\s+/)[0]];
    const fee = Number(devRate) || Number(c.rate) || 0;
    const row = m.get(t.assignedMaintenanceCenter) || { center: t.assignedMaintenanceCenter, count: 0, amount: 0, missingRate: !fee, tickets: [] };
    row.count += 1; row.amount += fee; row.tickets.push({ id: t.id, ticketNumber: t.ticketNumber, device: t.device, fee });
    m.set(t.assignedMaintenanceCenter, row);
  });
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

// (42) طلبات قطع الغيار
export const PART_REQUEST_FLOW = {
  pending: { label: 'مستني موافقة', next: ['approved', 'rejected'] },
  approved: { label: 'اتوافق عليه', next: ['shipped', 'rejected'] },
  shipped: { label: 'اتشحن للمركز', next: ['received'] },
  received: { label: 'المركز استلم', next: [] },
  rejected: { label: 'مرفوض', next: [] },
};
export const canMovePart = (from, to) => (PART_REQUEST_FLOW[from]?.next || []).includes(to);

// (43) القطع التالفة المرتجعة للمصنع
export const DEFECTIVE_FLOW = {
  removed: { label: 'اتشالت من الجهاز', next: ['at_center'] },
  at_center: { label: 'في المركز', next: ['shipped_factory'] },
  shipped_factory: { label: 'اتبعتت للمصنع', next: ['factory_received'] },
  factory_received: { label: 'المصنع استلمها', next: [] },
};

// (46) مطالبات الضمان مع المصنع
export const CLAIM_FLOW = {
  draft: { label: 'مسودة', next: ['submitted'] },
  submitted: { label: 'اتقدّمت', next: ['approved', 'rejected'] },
  approved: { label: 'اتوافق عليها', next: ['paid'] },
  rejected: { label: 'مرفوضة', next: ['submitted'] },
  paid: { label: 'اتصرفت', next: [] },
};
export function claimFromTicket(t, centers = []) {
  const c = centers.find((x) => x.name === t.assignedMaintenanceCenter) || {};
  const parts = (t.spareParts || []).map((p) => ({ name: p.name, serial: p.serialNumber || '', qty: Number(p.quantity) || 1, cost: Number(p.price) || 0 }));
  return {
    ticketId: t.id, ticketNumber: t.ticketNumber || '', model: t.deviceModel || t.device || '', device: t.device || '', serial: t.deviceSerial || '',
    fault: [t.mainFaultCode, t.mainFaultDescription].filter(Boolean).join(' - '), center: t.assignedMaintenanceCenter || '',
    parts, partsCost: parts.reduce((s, p) => s + p.cost * p.qty, 0), laborCost: Number(c.rate) || 0, status: 'draft',
  };
}
export function claimTotals(claims = []) {
  const by = (st) => claims.filter((c) => c.status === st);
  const sum = (arr, k = 'total') => arr.reduce((s, c) => s + (Number(c[k]) || (Number(c.partsCost) || 0) + (Number(c.laborCost) || 0)), 0);
  return {
    pending: by('submitted').length, pendingAmount: sum(by('submitted')),
    approvedAmount: by('approved').reduce((s, c) => s + (Number(c.approvedAmount) || 0), 0),
    paidAmount: by('paid').reduce((s, c) => s + (Number(c.approvedAmount) || 0), 0),
    rejected: by('rejected').length,
  };
}

// (45) فحص الضمان
export function warrantyStatus({ purchaseDate, months, endDate } = {}, now = new Date()) {
  let end = endDate ? new Date(`${String(endDate).slice(0, 10)}T00:00:00`) : null;
  if (!end && purchaseDate && Number(months) > 0) { end = new Date(`${String(purchaseDate).slice(0, 10)}T00:00:00`); end.setMonth(end.getMonth() + Number(months)); }
  if (!end || Number.isNaN(end.getTime())) return { known: false };
  const days = Math.ceil((end - now) / DAY);
  return { known: true, end, active: days >= 0, daysLeft: days };
}

// (47) عقود الضمان الممتد والصيانة
export function contractInfo(c, now = new Date()) {
  const start = c.startDate ? new Date(`${c.startDate}T00:00:00`) : null;
  const end = c.endDate ? new Date(`${c.endDate}T00:00:00`) : null;
  const visits = (c.visits || []).map((v) => new Date(`${String(v.date).slice(0, 10)}T00:00:00`)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
  const perYear = Number(c.visitsPerYear) || 0;
  let nextVisit = null;
  if (perYear > 0 && start) {
    const intervalMonths = 12 / perYear;
    const base = visits.length ? visits[visits.length - 1] : start;
    nextVisit = new Date(base); nextVisit.setMonth(nextVisit.getMonth() + Math.round(intervalMonths));
    if (!visits.length && c.firstVisitAtStart) nextVisit = start;
    if (end && nextVisit > end) nextVisit = null;
  }
  const daysToEnd = end ? Math.ceil((end - now) / DAY) : null;
  const status = c.cancelled ? 'cancelled' : !end ? 'active' : daysToEnd < 0 ? 'expired' : daysToEnd <= 30 ? 'expiring' : 'active';
  return { status, daysToEnd, nextVisit, visitsDone: visits.length, visitDue: nextVisit ? (nextVisit - now) / DAY <= 7 : false };
}
export const CONTRACT_STATUS = { active: 'ساري', expiring: 'قرب ينتهي', expired: 'منتهي', cancelled: 'ملغي' };
