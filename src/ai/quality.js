// 🏅 الجودة ومتابعة المراكز — حسابات محلية من التذاكر:
//   أعمار التذاكر المفتوحة، الأجهزة اللي رجعت تاني، أعطال الموديلات وإنذار الزيادة،
//   رضا العملاء (CSAT / شبه NPS)، كارت أداء المراكز والفنيين، والملخص الصباحي.
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate, ticketWarehouseOf } from '../utils/liveStats';
import { analyzeTicket, quantile } from './repairTime';
import { normalizeArabic } from './ticketAssist';

const DAY = 86400000;
const norm = (s) => normalizeArabic(String(s || '')).trim();
const isOpen = (t) => !TICKET_TERMINAL_STATUSES.includes(t.status);

// ---------------------------------------------------------------- (24) أعمار التذاكر
export const AGING_BUCKETS = [
  { key: 'b0', label: 'أقل من 3 أيام', max: 3 },
  { key: 'b1', label: '3 – 7 أيام', max: 7 },
  { key: 'b2', label: '7 – 15 يوم', max: 15 },
  { key: 'b3', label: 'أكتر من 15 يوم', max: Infinity },
];
export function agingReport(openTickets = [], { now = new Date(), warehouseName = (x) => x } = {}) {
  const rows = new Map();
  const oldest = [];
  openTickets.filter(isOpen).forEach((t) => {
    const c = toDate(t.createdAt); if (!c) return;
    const days = (now - c) / DAY;
    const b = AGING_BUCKETS.find((x) => days < x.max);
    const k = ticketWarehouseOf(t);
    const r = rows.get(k) || { key: k, name: warehouseName(k), b0: 0, b1: 0, b2: 0, b3: 0, total: 0, sumDays: 0 };
    r[b.key] += 1; r.total += 1; r.sumDays += days;
    rows.set(k, r);
    oldest.push({ id: t.id, ticketNumber: t.ticketNumber, days, center: k, status: t.status, device: [t.device, t.deviceModel].filter(Boolean).join(' ') });
  });
  const list = [...rows.values()].map((r) => ({ ...r, avgDays: r.total ? r.sumDays / r.total : 0 })).sort((a, b) => b.b3 - a.b3 || b.total - a.total);
  const totals = AGING_BUCKETS.reduce((o, b) => ({ ...o, [b.key]: list.reduce((s, r) => s + r[b.key], 0) }), {});
  return { rows: list, totals, total: list.reduce((s, r) => s + r.total, 0), oldest: oldest.sort((a, b) => b.days - a.days).slice(0, 15) };
}

// ---------------------------------------------------------------- (26) الأجهزة اللي رجعت تاني
export const deviceKey = (t) => {
  const serial = String(t.deviceSerial || '').trim().toLowerCase();
  if (serial.length >= 4 && !/^0+$/.test(serial)) return `s:${serial}`;
  const phone = String(t.customerPhone || '').replace(/\D/g, '');
  const model = norm(t.deviceModel || t.device);
  return phone && model ? `p:${phone}|${model}` : null;
};

export function repeatRepairs(tickets = [], { windowDays = 90, from = null, to = null } = {}) {
  const byKey = new Map();
  tickets.forEach((t) => { const k = deviceKey(t); if (!k) return; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(t); });
  const out = [];
  byKey.forEach((list, key) => {
    if (list.length < 2) return;
    const sorted = list.map((t) => ({ t, created: toDate(t.createdAt), done: analyzeTicket(t)?.completedAt || null })).filter((x) => x.created).sort((a, b) => a.created - b.created);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted.slice(0, i).reverse().find((p) => p.done && p.done <= sorted[i].created);
      if (!prev) continue;
      const gap = (sorted[i].created - prev.done) / DAY;
      if (gap > windowDays) continue;
      if (from && sorted[i].created < from) continue;
      if (to && sorted[i].created >= to) continue;
      out.push({
        key, gapDays: gap, byserial: key.startsWith('s:'),
        current: { id: sorted[i].t.id, ticketNumber: sorted[i].t.ticketNumber, issue: sorted[i].t.issue, fault: sorted[i].t.mainFaultDescription, center: ticketWarehouseOf(sorted[i].t), technician: sorted[i].t.assignedTechnician || '' },
        previous: { id: prev.t.id, ticketNumber: prev.t.ticketNumber, fault: prev.t.mainFaultDescription, center: ticketWarehouseOf(prev.t), mcenter: prev.t.assignedMaintenanceCenter || '', technician: prev.t.assignedTechnician || 'غير محدد' },
        device: [sorted[i].t.device, sorted[i].t.deviceModel].filter(Boolean).join(' '),
        sameFault: !!(prev.t.mainFaultCode && prev.t.mainFaultCode === sorted[i].t.mainFaultCode),
      });
    }
  });
  return out.sort((a, b) => a.gapDays - b.gapDays);
}

// ---------------------------------------------------------------- (30 + 10) أعطال الموديلات وإنذار الزيادة
export function faultsByModel(tickets = [], { from, to } = {}) {
  const m = new Map();
  tickets.forEach((t) => {
    const c = toDate(t.createdAt); if (!c || (from && c < from) || (to && c >= to)) return;
    const model = (t.deviceModel || t.device || 'غير محدد').trim();
    const fault = (t.mainFaultDescription || '').trim() || 'من غير كود';
    const k = `${model}|${fault}`;
    const r = m.get(k) || { model, fault, count: 0 };
    r.count += 1; m.set(k, r);
  });
  const perModel = new Map();
  m.forEach((r) => perModel.set(r.model, (perModel.get(r.model) || 0) + r.count));
  return [...m.values()].map((r) => ({ ...r, modelTotal: perModel.get(r.model), share: r.count / perModel.get(r.model) }))
    .sort((a, b) => b.count - a.count);
}

export function faultSpikes(tickets = [], { now = new Date(), days = 30, minCount = 3, ratio = 2 } = {}) {
  const cur = faultsByModel(tickets, { from: new Date(now - days * DAY), to: now });
  const prev = new Map(faultsByModel(tickets, { from: new Date(now - 2 * days * DAY), to: new Date(now - days * DAY) }).map((r) => [`${r.model}|${r.fault}`, r.count]));
  return cur.filter((r) => r.fault !== 'من غير كود' && r.count >= minCount)
    .map((r) => ({ ...r, previous: prev.get(`${r.model}|${r.fault}`) || 0 }))
    .filter((r) => r.count >= Math.max(minCount, (r.previous || 0.5) * ratio))
    .map((r) => ({ ...r, factor: r.previous ? r.count / r.previous : null }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- (28) رضا العملاء
const RATING_KEYS = ['accessibility', 'maintenanceTime', 'centerDealing', 'deliveryProcedures'];
// درجة من 10: تقييم العميل من صفحة التقييم (1-5) أو متابعة الكول سنتر (1-10)
export function satisfactionOf(t) {
  const cr = t.customerRating;
  if (cr && RATING_KEYS.some((k) => Number(cr[k]) > 0)) {
    const v = RATING_KEYS.map((k) => Number(cr[k])).filter((x) => x > 0);
    return { score: (v.reduce((s, x) => s + x, 0) / v.length) * 2, repurchase: cr.repurchase || '', source: 'customer' };
  }
  const f = t.followUp;
  if (f && RATING_KEYS.some((k) => Number(f[k]) > 0)) {
    const v = RATING_KEYS.map((k) => Number(f[k])).filter((x) => x > 0);
    return { score: v.reduce((s, x) => s + x, 0) / v.length, repurchase: f.repurchase || '', source: 'followup' };
  }
  return null;
}

export function satisfactionSummary(tickets = []) {
  const rated = tickets.map(satisfactionOf).filter(Boolean);
  if (!rated.length) return { count: 0, avg: null, csat: null, nps: null, repurchase: null };
  const promoters = rated.filter((r) => r.score >= 9).length;
  const detractors = rated.filter((r) => r.score <= 6).length;
  const rp = rated.filter((r) => r.repurchase === 'yes' || r.repurchase === 'no');
  return {
    count: rated.length,
    avg: rated.reduce((s, r) => s + r.score, 0) / rated.length,
    csat: rated.filter((r) => r.score >= 8).length / rated.length,
    nps: Math.round(((promoters - detractors) / rated.length) * 100),
    repurchase: rp.length ? rp.filter((r) => r.repurchase === 'yes').length / rp.length : null,
    lowest: tickets.map((t) => ({ t, s: satisfactionOf(t) })).filter((x) => x.s && x.s.score <= 6).slice(0, 10)
      .map(({ t, s }) => ({ id: t.id, ticketNumber: t.ticketNumber, score: s.score, comment: t.customerRating?.comment || t.followUpNotes || '' })),
  };
}

// ---------------------------------------------------------------- (19 + 40) كروت الأداء
function scorecard(tickets, keyOf, { from, to, slaHours = { high: 4, medium: 24, low: 72 }, repeats = [], openTickets = [], labelOf = (k) => k } = {}) {
  const groups = new Map();
  const get = (k) => {
    if (!groups.has(k)) groups.set(k, { key: k, name: labelOf(k), completed: [], created: 0, open: 0, overdueOpen: 0, repeats: 0, rated: [], revenue: 0 });
    return groups.get(k);
  };
  tickets.forEach((t) => {
    const k = keyOf(t); if (!k) return;
    const c = toDate(t.createdAt);
    if (c && c >= from && c < to) get(k).created += 1;
    const a = analyzeTicket(t);
    if (a && a.outcome === 'repaired' && a.completedAt >= from && a.completedAt < to) {
      const g = get(k);
      g.completed.push(a);
      g.revenue += Number(t.totalCost) || 0;
      const s = satisfactionOf(t); if (s) g.rated.push(t);
    }
  });
  openTickets.filter(isOpen).forEach((t) => {
    const k = keyOf(t); if (!k) return;
    const g = get(k); g.open += 1;
    const c = toDate(t.createdAt);
    if (c && (Date.now() - c) > (slaHours?.[t.priority || 'medium'] ?? 24) * 3600000) g.overdueOpen += 1;
  });
  repeats.forEach((r) => { const k = keyOf({ assignedCenter: r.previous.center, assignedTechnician: r.previous.technician, warehouseId: r.previous.center, assignedMaintenanceCenter: r.previous.mcenter }); if (k && groups.has(k)) groups.get(k).repeats += 1; });

  const rows = [...groups.values()].map((g) => {
    const tot = g.completed.map((a) => a.total).sort((a, b) => a - b);
    const net = g.completed.map((a) => a.net).sort((a, b) => a - b);
    const within = g.completed.filter((a) => a.total <= (slaHours?.[a.priority] ?? 24) * 3600000).length;
    const sat = satisfactionSummary(g.rated);
    return {
      key: g.key, name: g.name, created: g.created, completed: g.completed.length, open: g.open, overdueOpen: g.overdueOpen,
      avgTotal: tot.length ? tot.reduce((s, x) => s + x, 0) / tot.length : null,
      medianNet: net.length ? quantile(net, 0.5) : null,
      slaRate: g.completed.length ? within / g.completed.length : null,
      repeatRate: g.completed.length ? g.repeats / g.completed.length : null,
      repeats: g.repeats,
      satisfaction: sat.avg, rated: sat.count, revenue: g.revenue,
    };
  });
  // درجة إجمالية من 100 للترتيب: SLA 35 + سرعة 25 + جودة (عدم الرجوع) 20 + رضا 20
  const avgs = rows.filter((r) => r.medianNet).map((r) => r.medianNet);
  const ref = avgs.length ? quantile([...avgs].sort((a, b) => a - b), 0.5) : null;
  return rows.map((r) => {
    if (!r.completed) return { ...r, score: null };
    const sla = (r.slaRate ?? 0.5) * 35;
    // زي الوسيط = 12.5، أسرع منه بالضعف = 25 (الحد الأقصى)
    const speed = ref && r.medianNet ? Math.max(0, Math.min(25, (ref / r.medianNet) * 12.5)) : 12.5;
    const quality = (1 - Math.min(1, (r.repeatRate ?? 0) * 5)) * 20;
    const sat = r.satisfaction !== null && r.satisfaction !== undefined ? (r.satisfaction / 10) * 20 : 10;
    return { ...r, score: Math.round(sla + speed + quality + sat) };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.completed - a.completed);
}

export const centerScorecard = (tickets, opts = {}) => scorecard(tickets, (t) => ticketWarehouseOf(t), { ...opts, labelOf: opts.warehouseName || ((k) => k) });
export const technicianScorecard = (tickets, opts = {}) => scorecard(tickets, (t) => t.assignedTechnician || null, opts);
export const maintenanceCenterScorecard = (tickets, opts = {}) => scorecard(tickets, (t) => t.assignedMaintenanceCenter || null, opts);

// ---------------------------------------------------------------- (12) الملخص الصباحي
export function morningBrief({ tickets = [], transactions = [], atRiskCount = 0, overdueCount = 0, now = new Date() } = {}) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const y0 = new Date(today.getTime() - DAY);
  const inY = (d) => d && d >= y0 && d < today;
  const created = tickets.filter((t) => inY(toDate(t.createdAt))).length;
  const delivered = tickets.filter((t) => { const a = analyzeTicket(t); return a && inY(a.completedAt); }).length;
  const sales = transactions.filter((t) => (!t.type || t.type === 'sell') && inY(toDate(t.timestamp)));
  const salesTotal = sales.reduce((s, t) => s + (Number(t.finalTotal) || 0), 0);
  const open = tickets.filter(isOpen).length;
  const spikes = faultSpikes(tickets, { now, days: 7, minCount: 3 });
  const repeats = repeatRepairs(tickets, { windowDays: 30, from: y0, to: today });
  const lines = [
    { k: 'y', text: `امبارح: ${created} تذكرة جديدة، ${delivered} اتسلّمت${sales.length ? `، و${sales.length} فاتورة بـ ${Math.round(salesTotal).toLocaleString()} ج` : ''}.` },
    { k: 'o', text: `مفتوح دلوقتي ${open} تذكرة${overdueCount ? ` — منهم ${overdueCount} متأخرة عن الـ SLA` : ''}${atRiskCount ? ` و${atRiskCount} غالبًا هتتأخر` : ''}.`, level: overdueCount ? 'warn' : 'ok' },
  ];
  if (repeats.length) lines.push({ k: 'r', text: `${repeats.length} جهاز رجع تاني امبارح بعد إصلاح قريب (أول واحد: ${repeats[0].current.ticketNumber || ''}).`, level: 'warn' });
  spikes.slice(0, 2).forEach((s, i) => lines.push({ k: `s${i}`, text: `زيادة في عطل «${s.fault}» على ${s.model}: ${s.count} تذكرة آخر 7 أيام${s.previous ? ` (كانت ${s.previous})` : ''}.`, level: 'warn' }));
  return { lines, stats: { created, delivered, sales: sales.length, salesTotal, open, overdueCount, atRiskCount, repeats: repeats.length, spikes: spikes.length } };
}
