// 🧮 تنفيذ الاستعلام على Firestore. الإجماليات بتتحسب بـ Aggregation Queries
// (قراءة واحدة لكل 1000 مستند)، فالسؤال مش بيكلّف قراءات كتير.
import { collection, count, getAggregateFromServer, getDocs, limit, orderBy, query, sum, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { topProductsFrom } from '../utils/liveStats';
import { previousPeriod, resolvePeriod } from './askIntent';
import { buildRepairTimeReport } from './repairTime';

const txAgg = async (type, wh, [f, t]) => {
  const cons = [where('type', '==', type)];
  if (wh !== 'all') cons.push(where('warehouseId', '==', wh));
  cons.push(where('timestamp', '>=', f), where('timestamp', '<', t));
  const d = (await getAggregateFromServer(query(collection(db, 'transactions'), ...cons), { total: sum('finalTotal'), n: count() })).data();
  return { total: Number(d.total) || 0, n: Number(d.n) || 0 };
};

const expAgg = async (wh, [f, t]) => {
  const cons = [];
  if (wh !== 'all') cons.push(where('warehouseId', '==', wh));
  cons.push(where('date', '>=', f), where('date', '<', t));
  const d = (await getAggregateFromServer(query(collection(db, 'expenses'), ...cons), { total: sum('amount'), n: count() })).data();
  return { total: Number(d.total) || 0, n: Number(d.n) || 0 };
};

const ticketsCreated = async (wh, [f, t]) => {
  const cons = [];
  if (wh !== 'all') cons.push(where('assignedCenter', '==', wh));
  cons.push(where('createdAt', '>=', f), where('createdAt', '<', t));
  return Number((await getAggregateFromServer(query(collection(db, 'tickets'), ...cons), { n: count() })).data().n) || 0;
};

const ticketsOpen = async (wh) => {
  const cons = [];
  if (wh !== 'all') cons.push(where('assignedCenter', '==', wh));
  cons.push(where('status', 'not-in', TICKET_TERMINAL_STATUSES));
  return Number((await getAggregateFromServer(query(collection(db, 'tickets'), ...cons), { n: count() })).data().n) || 0;
};

async function valueFor(metric, wh, range) {
  switch (metric) {
    case 'sales_total': { const s = await txAgg('sell', wh, range); return { value: s.total, count: s.n }; }
    case 'invoice_count': { const s = await txAgg('sell', wh, range); return { value: s.n }; }
    case 'avg_invoice': { const s = await txAgg('sell', wh, range); return { value: s.n ? s.total / s.n : 0, count: s.n }; }
    case 'returns_total': { const r = await txAgg('return', wh, range); return { value: Math.abs(r.total), count: r.n }; }
    case 'expenses_total': { const e = await expAgg(wh, range); return { value: e.total, count: e.n }; }
    case 'net_sales': {
      const [s, r] = await Promise.all([txAgg('sell', wh, range), txAgg('return', wh, range)]);
      return { value: s.total - Math.abs(r.total), parts: { sales: s.total, returns: Math.abs(r.total) } };
    }
    case 'net_profit': {
      const [s, r, e] = await Promise.all([txAgg('sell', wh, range), txAgg('return', wh, range), expAgg(wh, range)]);
      return { value: s.total - Math.abs(r.total) - e.total, parts: { sales: s.total, returns: Math.abs(r.total), expenses: e.total } };
    }
    case 'tickets_created': return { value: await ticketsCreated(wh, range) };
    default: return { value: 0 };
  }
}

const customersNew = async ([f, t]) => Number((await getAggregateFromServer(query(collection(db, 'customers'), where('createdAt', '>=', f), where('createdAt', '<', t)), { n: count() })).data().n) || 0;

// تذاكر اتعدّلت من بداية الفترة (أي تذكرة خلصت جوه الفترة لازم تكون منهم)
const ticketsTouchedSince = async (wh, since) => {
  const cons = [];
  if (wh !== 'all') cons.push(where('assignedCenter', '==', wh));
  cons.push(where('updatedAt', '>=', since), orderBy('updatedAt', 'desc'), limit(5000));
  return (await getDocs(query(collection(db, 'tickets'), ...cons))).docs.map((d) => ({ id: d.id, ...d.data() }));
};

const repairReport = async (wh, range, slaHours, warehouseName) => {
  const list = await ticketsTouchedSince(wh, range[0]);
  return buildRepairTimeReport(list, { from: range[0], to: range[1], slaHours, warehouseName, scope: (c) => wh === 'all' || c === wh });
};


export async function executeIntent(intent, now = new Date(), { slaHours, warehouses = [] } = {}) {
  const wh = intent.warehouseId || 'all';
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || (id === 'main' ? 'الرئيسي' : id);
  if (intent.metric === 'tickets_open') return { value: await ticketsOpen(wh) };

  if (intent.metric === 'tickets_overdue') {
    const cons = [];
    if (wh !== 'all') cons.push(where('assignedCenter', '==', wh));
    cons.push(where('status', 'not-in', TICKET_TERMINAL_STATUSES), limit(5000));
    const open = (await getDocs(query(collection(db, 'tickets'), ...cons))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const hours = (p) => (slaHours?.[p || 'medium'] ?? 24);
    const created = (t) => (t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt));
    const overdue = open.filter((t) => { const c = created(t); return !Number.isNaN(c.getTime()) && now - c > hours(t.priority) * 3600000; })
      .sort((a, b) => created(a) - created(b));
    return { value: overdue.length, examples: overdue.slice(0, 3).map((t) => t.ticketNumber).filter(Boolean) };
  }

  const range = resolvePeriod(intent.period, now, intent.from, intent.to);

  if (intent.metric === 'top_products') {
    const MAX = 3000;
    const cons = [where('type', '==', 'sell')];
    if (wh !== 'all') cons.push(where('warehouseId', '==', wh));
    cons.push(where('timestamp', '>=', range[0]), where('timestamp', '<', range[1]), limit(MAX));
    const snap = await getDocs(query(collection(db, 'transactions'), ...cons));
    const txs = snap.docs.map((d) => d.data());
    return { top: topProductsFrom(txs, intent.topN || 5, 'revenue'), truncated: snap.size >= MAX, range };
  }

  if (intent.metric === 'top_faults') {
    const cons = [];
    if (wh !== 'all') cons.push(where('assignedCenter', '==', wh));
    cons.push(where('createdAt', '>=', range[0]), where('createdAt', '<', range[1]), limit(5000));
    const list = (await getDocs(query(collection(db, 'tickets'), ...cons))).docs.map((d) => d.data());
    const m = new Map();
    let uncoded = 0;
    list.forEach((t) => {
      const faults = [t.mainFaultDescription, ...(t.additionalFaults || []).map((f) => f?.mainFaultDescription || f?.description)].filter(Boolean);
      if (!faults.length) uncoded += 1;
      faults.forEach((f) => { const k = String(f).trim(); m.set(k, (m.get(k) || 0) + 1); });
    });
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, intent.topN || 5).map(([name, n]) => ({ name, n }));
    return { top, uncoded, range };
  }

  if (intent.metric === 'avg_repair_time' || intent.metric === 'technician_performance') {
    const rep = await repairReport(wh, range, slaHours, whName);
    if (intent.metric === 'technician_performance') {
      const top = rep.byTechnician.filter((t) => t.count >= 2 && t.key !== 'غير محدد').sort((a, b) => a.avg - b.avg).slice(0, intent.topN || 10);
      return { top, range };
    }
    if (intent.groupBy === 'warehouse') {
      return { value: rep.total.avg, groups: rep.byCenter.map((g) => ({ name: g.name, value: g.avg, count: g.count })), range };
    }
    const out = { value: rep.total.avg, range, extra: { net: rep.net.avg, median: rep.total.median, count: rep.count, slaRate: rep.slaRate } };
    if (intent.compare) {
      const prev = await repairReport(wh, previousPeriod(intent.period, range, now), slaHours, whName);
      out.previous = prev.total.avg;
    }
    return out;
  }

  if (intent.metric === 'new_customers') {
    const out = { value: await customersNew(range), range };
    if (intent.compare) out.previous = await customersNew(previousPeriod(intent.period, range, now));
    return out;
  }

  // تقسيم حسب الفرع: استعلام مجمّع لكل فرع
  if (intent.groupBy === 'warehouse' && warehouses.length) {
    const groups = await Promise.all(warehouses.map(async (w) => ({ name: w.name, ...(await valueFor(intent.metric, w.id, range)) })));
    const total = await valueFor(intent.metric, 'all', range);
    return { value: total.value, groups: groups.sort((a, b) => b.value - a.value), range };
  }

  const cur = await valueFor(intent.metric, wh, range);
  const out = { ...cur, range };
  if (intent.compare) {
    const prev = await valueFor(intent.metric, wh, previousPeriod(intent.period, range, now));
    out.previous = prev.value;
  }
  return out;
}

// رسالة ودية لأخطاء Firestore في الاستعلام
export const friendlyQueryError = (e) => {
  if (e?.code === 'failed-precondition') return 'السؤال ده محتاج Index جديد في Firestore. شغّل: firebase deploy --only firestore:indexes واستنى لحد ما يخلص.';
  if (e?.code === 'permission-denied') return 'مفيش صلاحية لقراءة البيانات دي.';
  return 'معرفتش أحسب الرقم دلوقتي. جرّب تاني.';
};
