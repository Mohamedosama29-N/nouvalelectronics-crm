import { useEffect, useState } from 'react';
import { collection, count, getAggregateFromServer, query, sum, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// إجماليات المبيعات الشهرية من السيرفر (Aggregation Queries) بدل قراءة آلاف الفواتير في المتصفح.
// Firestore بيحاسب على كل 1000 مستند مفهرس = قراءة واحدة، يعني شهر فيه 3000 فاتورة = 3 قراءات بس.
// الشهور اللي فاتت بتتخزن في الذاكرة (مبتتغيرش تقريباً)، والشهر السابق للحالي بس بيتجدد كل 5 دقايق.
// ملحوظة: استعلام المخزن الواحد (warehouseId + type + timestamp) محتاج Composite Index
// (موجود في firestore.indexes.json → شغّل firebase deploy --only firestore:indexes).

const cache = new Map(); // `${warehouseId}|${YYYY-MM}` -> { total, count }
const pad = (n) => String(n).padStart(2, '0');
const mkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

async function fetchMonth(warehouseId, first) {
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const cons = [where('type', '==', 'sell')];
  if (warehouseId) cons.push(where('warehouseId', '==', warehouseId));
  cons.push(where('timestamp', '>=', first), where('timestamp', '<', next));
  const snap = await getAggregateFromServer(query(collection(db, 'transactions'), ...cons), {
    total: sum('finalTotal'),
    count: count()
  });
  const d = snap.data();
  return { total: Number(d.total) || 0, count: Number(d.count) || 0 };
}

// بيرجع آخر `months` شهور *قبل* الشهر الحالي (الشهر الحالي بييجي من الاشتراك اللحظي)
export function useSalesAggregates(warehouseId, enabled = true, months = 11) {
  const [state, setState] = useState({ months: [], loading: true, error: null });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const run = async (forceRecent) => {
      try {
        const now = new Date();
        const list = [];
        for (let i = months; i >= 1; i--) {
          const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const ck = `${warehouseId || 'all'}|${mkey(first)}`;
          if (!cache.has(ck) || (forceRecent && i === 1)) cache.set(ck, await fetchMonth(warehouseId, first));
          list.push({ key: mkey(first), ...cache.get(ck) });
        }
        if (!cancelled) setState({ months: list, loading: false, error: null });
      } catch (e) {
        console.warn('Sales aggregates failed:', e);
        if (!cancelled) {
          const msg = e.code === 'failed-precondition'
            ? 'محتاج Index جديد: شغّل firebase deploy --only firestore:indexes'
            : (e.code === 'permission-denied' ? 'لا توجد صلاحية' : e.message);
          setState({ months: [], loading: false, error: msg });
        }
      }
    };
    run(false);
    const t = setInterval(() => run(true), 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [warehouseId, enabled, months]);

  return state;
}
