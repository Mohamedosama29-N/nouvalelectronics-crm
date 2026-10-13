// دوال حساب مقارنة الأشهر (منفصلة عن الواجهة عشان تتختبر)

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);
const amountOf = (t) => Number(t.finalTotal || t.total || 0);

// "2026-10" → بداية ونهاية الشهر (بالتوقيت المحلي)
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end, daysInMonth: end.getDate() };
}

export function previousMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// نسبة التغيّر من الفترة السابقة للحالية. null لو مفيش أساس للمقارنة.
export function pctChange(current, previous) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ملخص معاملات شهر: المبيعات - المرتجعات = الصافي، وأعلى الأصناف، والإجمالي اليومي
export function summarizeTransactions(list, daysInMonth = 31) {
  let sales = 0, returns = 0, salesCount = 0, returnsCount = 0;
  const products = new Map();
  const daily = Array.from({ length: daysInMonth }, () => 0);

  list.forEach(t => {
    const amt = amountOf(t);
    const day = toDate(t.timestamp)?.getDate();
    if (t.type === 'return') {
      returns += amt; returnsCount++;
      if (day) daily[day - 1] -= amt;
      return;
    }
    if (t.type && t.type !== 'sell') return;
    sales += amt; salesCount++;
    if (day) daily[day - 1] += amt;
    (Array.isArray(t.items) ? t.items : []).forEach(i => {
      if (i.isService) return;
      const key = i.serialNumber || i.name;
      if (!key) return;
      const qty = Number(i.quantity) || 0;
      const rev = qty * (Number(i.price) || 0);
      const p = products.get(key) || { name: i.name || key, serialNumber: i.serialNumber || '', qty: 0, revenue: 0 };
      p.qty += qty; p.revenue += rev;
      products.set(key, p);
    });
  });

  const topProducts = [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  return {
    sales, returns, net: sales - returns, salesCount, returnsCount,
    avgInvoice: salesCount ? sales / salesCount : 0,
    topProducts, daily
  };
}
