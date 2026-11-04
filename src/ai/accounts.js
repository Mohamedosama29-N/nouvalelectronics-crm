// 💰 المشتريات والمخزون والحسابات (محلي): أوامر الشراء والاستلام، متوسط التكلفة،
// أرصدة الموردين، الجرد، الخزنة والورديات، كشف حساب العميل، والأرباح الحقيقية.
import { toDate, isSale } from '../utils/liveStats';

const n = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- (48) أوامر الشراء
export const PO_STATUS = { draft: 'مسودة', sent: 'اتبعت للمورد', partial: 'استلام جزئي', received: 'اتستلم بالكامل', cancelled: 'ملغي' };
export const poTotal = (po) => round2((po.items || []).reduce((s, i) => s + n(i.qty) * n(i.cost), 0));
export const poReceivedValue = (po) => round2((po.items || []).reduce((s, i) => s + n(i.receivedQty) * n(i.cost), 0));
export const poPaid = (po) => round2((po.payments || []).reduce((s, p) => s + n(p.amount), 0));

// بيرجّع الأصناف بعد الاستلام + الحالة الجديدة (من غير ما يستلم أكتر من المطلوب)
export function applyReceipt(po, receive = {}) {
  const items = (po.items || []).map((i, idx) => {
    const want = Math.max(0, n(i.qty) - n(i.receivedQty));
    const got = Math.min(want, Math.max(0, Math.floor(n(receive[idx]))));
    return { ...i, receivedQty: n(i.receivedQty) + got, _got: got };
  });
  const done = items.every((i) => n(i.receivedQty) >= n(i.qty));
  const any = items.some((i) => n(i.receivedQty) > 0);
  return { items: items.map((i) => { const r = { ...i }; delete r._got; return r; }), moves: items.map((i, idx) => ({ idx, item: i, qty: i._got })).filter((m) => m.qty > 0), status: done ? 'received' : any ? 'partial' : po.status };
}

// متوسط التكلفة المرجّح بعد إضافة كمية جديدة
export function weightedAvgCost(oldQty, oldAvg, addQty, addCost) {
  const q0 = Math.max(0, n(oldQty)); const q1 = Math.max(0, n(addQty));
  if (q0 + q1 === 0) return n(addCost);
  if (!n(oldAvg) || q0 === 0) return round2(n(addCost));
  return round2((q0 * n(oldAvg) + q1 * n(addCost)) / (q0 + q1));
}

export function supplierBalances(pos = []) {
  const m = new Map();
  pos.filter((p) => p.status !== 'cancelled').forEach((p) => {
    const k = p.supplierId || p.supplierName;
    const r = m.get(k) || { supplierId: p.supplierId, name: p.supplierName, ordered: 0, received: 0, paid: 0, open: 0 };
    r.ordered += poTotal(p); r.received += poReceivedValue(p); r.paid += poPaid(p);
    if (['sent', 'partial'].includes(p.status)) r.open += 1;
    m.set(k, r);
  });
  return [...m.values()].map((r) => ({ ...r, due: round2(r.received - r.paid) })).sort((a, b) => b.due - a.due);
}

// من توقع النفاد لأمر شراء (الكمية المقترحة لكل صنف في مخزن واحد)
export function poItemsFromForecast(rows = [], warehouseId = 'main') {
  return rows.filter((r) => r.suggestedOrder > 0 && (r.warehouseId || 'main') === warehouseId)
    .map((r) => ({ serialNumber: r.serialNumber, name: r.name, qty: r.suggestedOrder, cost: n(r.cost) || 0, receivedQty: 0 }));
}

// ---------------------------------------------------------------- (49) الجرد
export function countDiffs(lines = {}) {
  return Object.entries(lines).map(([serial, l]) => {
    const counted = l.countedQty === undefined || l.countedQty === null || l.countedQty === '' ? null : n(l.countedQty);
    const diff = counted === null ? null : counted - n(l.systemQty);
    return { serial, ...l, counted, diff, valueDiff: diff === null ? 0 : round2(diff * (n(l.cost) || n(l.price))) };
  }).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));
}
export function countSummary(rows) {
  const counted = rows.filter((r) => r.counted !== null);
  return {
    total: rows.length, counted: counted.length,
    shortage: counted.filter((r) => r.diff < 0).reduce((s, r) => s + r.diff, 0),
    surplus: counted.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0),
    valueDiff: round2(counted.reduce((s, r) => s + r.valueDiff, 0)),
    mismatched: counted.filter((r) => r.diff !== 0).length,
  };
}

// ---------------------------------------------------------------- (50) الخزنة والوردية
export function shiftExpected(shift, transactions = []) {
  const opened = toDate(shift.openedAt);
  const closed = toDate(shift.closedAt) || new Date(8.64e15);
  const mine = transactions.filter((t) => {
    const d = toDate(t.timestamp);
    return d && opened && d >= opened && d < closed && (!shift.operator || t.operator === shift.operator);
  });
  const cashSales = mine.filter((t) => isSale(t) && (t.paymentMethod || 'cash') === 'cash').reduce((s, t) => s + n(t.totalPaid ?? t.finalTotal), 0);
  const otherSales = mine.filter((t) => isSale(t) && (t.paymentMethod || 'cash') !== 'cash').reduce((s, t) => s + n(t.totalPaid ?? t.finalTotal), 0);
  const refunds = mine.filter((t) => t.type === 'return').reduce((s, t) => s + Math.abs(n(t.finalTotal)), 0);
  const cashIn = (shift.cashIn || []).reduce((s, x) => s + n(x.amount), 0);
  const cashOut = (shift.cashOut || []).reduce((s, x) => s + n(x.amount), 0);
  const expected = round2(n(shift.openingCash) + cashSales + cashIn - cashOut - refunds);
  return { cashSales: round2(cashSales), otherSales: round2(otherSales), refunds: round2(refunds), cashIn, cashOut, expected, invoices: mine.filter(isSale).length, diff: shift.countedCash === undefined || shift.countedCash === null ? null : round2(n(shift.countedCash) - expected) };
}

// ---------------------------------------------------------------- (51) كشف حساب العميل
export function customerStatement(sales = [], tickets = []) {
  const rows = [];
  sales.filter(isSale).forEach((t) => rows.push({ date: toDate(t.timestamp), kind: 'فاتورة', ref: t.invoiceNumber || '', desc: (t.items || []).map((i) => i.name).filter(Boolean).join('، ').slice(0, 80), amount: n(t.finalTotal), paid: n(t.totalPaid ?? t.finalTotal), remaining: n(t.remaining) }));
  sales.filter((t) => t.type === 'return').forEach((t) => rows.push({ date: toDate(t.timestamp), kind: 'مرتجع', ref: t.invoiceNumber || '', desc: t.itemName || '', amount: -Math.abs(n(t.finalTotal)), paid: -Math.abs(n(t.finalTotal)), remaining: 0 }));
  tickets.forEach((t) => { if (n(t.totalCost) > 0) rows.push({ date: toDate(t.createdAt), kind: 'صيانة', ref: t.ticketNumber || '', desc: [t.device, t.deviceModel].filter(Boolean).join(' '), amount: n(t.totalCost), paid: n(t.totalPaid), remaining: Math.max(0, n(t.totalCost) - n(t.totalPaid)) }); });
  rows.sort((a, b) => (a.date || 0) - (b.date || 0));
  const totals = rows.reduce((s, r) => ({ amount: s.amount + r.amount, paid: s.paid + r.paid, remaining: s.remaining + r.remaining }), { amount: 0, paid: 0, remaining: 0 });
  return { rows, totals: { amount: round2(totals.amount), paid: round2(totals.paid), remaining: round2(totals.remaining) } };
}

// ---------------------------------------------------------------- (52) الأرباح والهامش الحقيقي
export function marginReport(transactions = [], costOf = () => null) {
  const items = new Map();
  let revenue = 0; let cost = 0; let missing = 0; let services = 0;
  transactions.filter(isSale).forEach((t) => (t.items || []).forEach((i) => {
    const qty = n(i.quantity) || 1;
    const rev = qty * n(i.price);
    if (i.isService) { services += rev; return; }
    const c = n(i.avgCost) || n(i.cost) || n(costOf(i.serialNumber, t.warehouseId));
    const k = i.serialNumber || i.name;
    const r = items.get(k) || { key: k, name: i.name || k, qty: 0, revenue: 0, cost: 0, missingCost: false };
    r.qty += qty; r.revenue += rev;
    if (c > 0) { r.cost += qty * c; cost += qty * c; revenue += rev; } else { r.missingCost = true; missing += 1; }
    items.set(k, r);
  }));
  const rows = [...items.values()].map((r) => ({ ...r, profit: round2(r.revenue - r.cost), margin: r.revenue && !r.missingCost ? (r.revenue - r.cost) / r.revenue : null })).sort((a, b) => b.profit - a.profit);
  return { rows, revenue: round2(revenue), cost: round2(cost), profit: round2(revenue - cost), margin: revenue ? (revenue - cost) / revenue : null, missingCostLines: missing, services: round2(services) };
}
