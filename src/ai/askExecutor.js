// 🧮 تنفيذ الاستعلام على Firestore. الإجماليات بتتحسب بـ Aggregation Queries
// (قراءة واحدة لكل 1000 مستند)، فالسؤال مش بيكلّف قراءات كتير.
import { collection, count, getAggregateFromServer, getDocs, limit, query, sum, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { topProductsFrom } from '../utils/liveStats';
import { previousPeriod, resolvePeriod } from './askIntent';

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

export async function executeIntent(intent, now = new Date()) {
  const wh = intent.warehouseId || 'all';
  if (intent.metric === 'tickets_open') return { value: await ticketsOpen(wh) };

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
