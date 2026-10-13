// دوال حساب إحصائيات الداشبورد والتقارير الحية.
// كلها دوال نقية (مفيش Firestore ولا React هنا) عشان تتختبر بسهولة،
// ونفس الأرقام بتظهر في الداشبورد وفي صفحة التقارير.

export const toDate = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const amountOf = (t) => Number(t?.finalTotal ?? t?.total ?? 0) || 0;

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const pad = (n) => String(n).padStart(2, '0');
// مفاتيح بالتوقيت المحلي (مش UTC) عشان معاملات بعد منتصف الليل متروحش لليوم اللي قبله
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const isSale = (t) => !t.type || t.type === 'sell';
export const isReturnTx = (t) => t.type === 'return';

// نسبة التغيّر. null لو مفيش أساس للمقارنة (بدل رقم وهمي)
export const pctChange = (current, previous) => {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
};

// هل السجل يخص المستخدم؟ (الأدمن أو اللي معاه viewAllWarehouses يشوف الكل)
export const canSeeWarehouse = (user, warehouseId) => {
  if (!user) return false;
  if (user.role === 'admin' || user.permissions?.viewAllWarehouses) return true;
  return warehouseId === (user.assignedWarehouseId || 'main');
};

export const countBy = (list, keyFn, labelFn = (k) => k) => {
  const m = new Map();
  list.forEach((x) => {
    const k = keyFn(x);
    if (k === undefined || k === null || k === '') return;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].map(([k, value]) => ({ key: k, name: labelFn(k), value })).sort((a, b) => b.value - a.value);
};

export const sumBy = (list, keyFn, valFn, labelFn = (k) => k) => {
  const m = new Map();
  list.forEach((x) => {
    const k = keyFn(x);
    if (k === undefined || k === null || k === '') return;
    m.set(k, (m.get(k) || 0) + (Number(valFn(x)) || 0));
  });
  return [...m.entries()].map(([k, value]) => ({ key: k, name: labelFn(k), value })).sort((a, b) => b.value - a.value);
};

// آخر N يوم (شامل النهارده) - كل يوم له رقم حتى لو صفر، عشان الرسم ميبقاش فيه فجوات
export const bucketByDay = (list, getDate, getValue, days, now = new Date()) => {
  const start = startOfDay(addDays(now, -(days - 1)));
  const map = new Map();
  for (let i = 0; i < days; i++) map.set(dayKey(addDays(start, i)), 0);
  list.forEach((x) => {
    const d = toDate(getDate(x));
    if (!d || d < start) return;
    const k = dayKey(d);
    if (map.has(k)) map.set(k, map.get(k) + (Number(getValue(x)) || 0));
  });
  return [...map.entries()].map(([k, value]) => ({ name: k.slice(5), key: k, value }));
};

export const bucketByMonth = (list, getDate, getValue, months, now = new Date()) => {
  const first = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const map = new Map();
  for (let i = 0; i < months; i++) map.set(monthKey(new Date(first.getFullYear(), first.getMonth() + i, 1)), 0);
  list.forEach((x) => {
    const d = toDate(getDate(x));
    if (!d || d < first) return;
    const k = monthKey(d);
    if (map.has(k)) map.set(k, map.get(k) + (Number(getValue(x)) || 0));
  });
  return [...map.entries()].map(([k, value]) => ({ name: k, key: k, value }));
};

// ==========================================================================
// المبيعات
// ==========================================================================
export function buildSalesStats(txs, now = new Date()) {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);
  const yearStart = addDays(today, -364);

  const r = {
    today: 0, yesterday: 0, week: 0, month: 0, year: 0,
    todayCount: 0, weekCount: 0, monthCount: 0, yearCount: 0,
    returnsToday: 0, returnsWeek: 0, returnsMonth: 0, returnsYear: 0
  };

  txs.forEach((t) => {
    const d = toDate(t.timestamp);
    if (!d) return;
    const amt = amountOf(t);
    if (isReturnTx(t)) {
      if (d >= today) r.returnsToday += amt;
      if (d >= weekStart) r.returnsWeek += amt;
      if (d >= monthStart) r.returnsMonth += amt;
      if (d >= yearStart) r.returnsYear += amt;
      return;
    }
    if (!isSale(t)) return;
    if (d >= today) { r.today += amt; r.todayCount++; }
    else if (d >= yesterday) r.yesterday += amt;
    if (d >= weekStart) { r.week += amt; r.weekCount++; }
    if (d >= monthStart) { r.month += amt; r.monthCount++; }
    if (d >= yearStart) { r.year += amt; r.yearCount++; }
  });

  // متوسط الفاتورة = إجمالي مبيعات الأسبوع ÷ عدد فواتير الأسبوع
  r.avgInvoice = r.weekCount ? Math.round(r.week / r.weekCount) : 0;
  r.trendVsYesterday = pctChange(r.today, r.yesterday);
  r.netToday = r.today - r.returnsToday;
  r.netMonth = r.month - r.returnsMonth;
  return r;
}

// سلسلة المبيعات/المرتجعات حسب المدى: day=ساعات اليوم، week=7 أيام، month=30 يوم، year=12 شهر
export function buildSalesSeries(txs, range = 'week', now = new Date()) {
  let keys;
  let keyOf;
  if (range === 'day') {
    keys = Array.from({ length: 24 }, (_, h) => pad(h));
    const t0 = startOfDay(now);
    keyOf = (d) => (d >= t0 ? pad(d.getHours()) : null);
  } else if (range === 'year') {
    const first = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    keys = Array.from({ length: 12 }, (_, i) => monthKey(new Date(first.getFullYear(), first.getMonth() + i, 1)));
    keyOf = (d) => (d >= first ? monthKey(d) : null);
  } else {
    const days = range === 'month' ? 30 : 7;
    const start = startOfDay(addDays(now, -(days - 1)));
    keys = Array.from({ length: days }, (_, i) => dayKey(addDays(start, i)));
    keyOf = (d) => (d >= start ? dayKey(d) : null);
  }
  const rows = new Map(keys.map((k) => [k, { sales: 0, returns: 0 }]));
  txs.forEach((t) => {
    const d = toDate(t.timestamp);
    if (!d) return;
    const k = keyOf(d);
    if (!k || !rows.has(k)) return;
    const row = rows.get(k);
    if (isReturnTx(t)) row.returns += amountOf(t);
    else if (isSale(t)) row.sales += amountOf(t);
  });
  return keys.map((k) => {
    const { sales, returns } = rows.get(k);
    return { name: range === 'week' || range === 'month' ? k.slice(5) : k, sales, returns, net: sales - returns };
  });
}

// أفضل الأصناف: من items[] لو الفاتورة متعددة الأصناف، وإلا من itemName (فواتير قديمة)
export function topProductsFrom(txs, limitN = 10, by = 'revenue') {
  const m = new Map();
  txs.filter(isSale).forEach((t) => {
    const items = Array.isArray(t.items) && t.items.length
      ? t.items.filter((i) => !i.isService)
      : (t.itemName ? [{ name: t.itemName, quantity: 1, price: amountOf(t) }] : []);
    items.forEach((i) => {
      const key = i.serialNumber || i.name;
      if (!key) return;
      const qty = Number(i.quantity) || 1;
      const rev = qty * (Number(i.price) || 0);
      const p = m.get(key) || { name: i.name || key, qty: 0, revenue: 0 };
      p.qty += qty;
      p.revenue += rev;
      m.set(key, p);
    });
  });
  return [...m.values()]
    .sort((a, b) => (by === 'qty' ? b.qty - a.qty : b.revenue - a.revenue))
    .slice(0, limitN)
    .map((p) => ({ name: p.name, value: by === 'qty' ? p.qty : p.revenue, qty: p.qty, revenue: p.revenue }));
}

// ==========================================================================
// المخزون
// ==========================================================================
export function buildInventoryStats(items, warehouseName = (id) => id) {
  const live = items.filter((i) => i.isDeleted === false);
  let totalQty = 0;
  let totalValue = 0;
  let outOfStock = 0;
  const lowStock = [];
  live.forEach((i) => {
    const qty = Number(i.quantity ?? 0);
    const price = Number(i.price ?? 0);
    const min = Number(i.minStock ?? 0);
    totalQty += qty;
    totalValue += qty * price;
    if (qty <= 0) outOfStock++;
    if (min > 0 && qty <= min) lowStock.push({ ...i, quantity: qty, minStock: min });
  });
  const category = (i) => i.category || 'عام';
  return {
    live,
    skuCount: live.length,
    totalQty,
    totalValue,
    outOfStock,
    lowStock,
    byCategory: sumBy(live, category, (i) => i.quantity),
    valueByCategory: sumBy(live, category, (i) => (Number(i.quantity) || 0) * (Number(i.price) || 0)),
    byWarehouse: sumBy(live, (i) => i.warehouseId, (i) => i.quantity, warehouseName),
    valueByWarehouse: sumBy(live, (i) => i.warehouseId, (i) => (Number(i.quantity) || 0) * (Number(i.price) || 0), warehouseName)
  };
}

// ==========================================================================
// التذاكر
// ==========================================================================
export const PRIORITY_LABELS = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

export function buildTicketStats(tickets, { now = new Date(), isOverdue = () => false, statusLabel = (s) => s, terminal = [] } = {}) {
  const today = startOfDay(now);
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);
  const r = { total: tickets.length, today: 0, week: 0, month: 0, closed: 0, open: 0, waitingApproval: 0, highPriority: 0, overdueSLA: 0, totalCost: 0 };
  tickets.forEach((t) => {
    const d = toDate(t.createdAt);
    if (d) {
      if (d >= today) r.today++;
      if (d >= weekStart) r.week++;
      if (d >= monthStart) r.month++;
    }
    const isTerminal = terminal.includes(t.status);
    if (t.status === 'delivered_to_customer' || t.status === 'closed') r.closed++;
    if (!isTerminal) r.open++;
    if (t.status === 'waiting_customer_approval_cost') r.waitingApproval++;
    if (t.priority === 'high') r.highPriority++;
    if (isOverdue(t)) r.overdueSLA++;
    r.totalCost += Number(t.totalCost) || 0;
  });
  r.byStatus = countBy(tickets, (t) => t.status || 'unknown', statusLabel);
  r.byPriority = countBy(tickets, (t) => t.priority || 'low', (p) => PRIORITY_LABELS[p] || p);
  r.perDay = bucketByDay(tickets, (t) => t.createdAt, () => 1, 30, now);
  return r;
}

// ==========================================================================
// التحويلات
// ==========================================================================
export const TRANSFER_STATUS_LABELS = {
  pending: 'بانتظار الموافقة', approved: 'تمت الموافقة', shipped: 'تم الإرسال',
  received: 'تم الاستلام', rejected: 'مرفوض', cancelled: 'ملغي'
};

export const transferItems = (t) => {
  if (Array.isArray(t.items) && t.items.length) return t.items;
  if (t.serialNumber || t.itemName || t.name) return [{ name: t.itemName || t.name, serialNumber: t.serialNumber, quantity: t.quantity || 1 }];
  return [];
};
export const transferQty = (t) => transferItems(t).reduce((s, i) => s + (Number(i.quantity) || 0), 0);

export function buildTransferStats(transfers, warehouseName = (id) => id, now = new Date()) {
  const by = (s) => transfers.filter((t) => t.status === s).length;
  return {
    total: transfers.length,
    pending: by('pending'),
    inTransit: by('shipped') + by('approved'),
    received: by('received'),
    rejected: by('rejected') + by('cancelled'),
    totalQty: transfers.filter((t) => t.status === 'received').reduce((s, t) => s + transferQty(t), 0),
    byStatus: countBy(transfers, (t) => t.status, (s) => TRANSFER_STATUS_LABELS[s] || s),
    byDestination: countBy(transfers, (t) => t.toWarehouseId, warehouseName),
    bySource: countBy(transfers, (t) => t.fromWarehouseId, warehouseName),
    perDay: bucketByDay(transfers, (t) => t.createdAt, () => 1, 30, now)
  };
}

// ==========================================================================
// المرتجعات
// ==========================================================================
export const RETURN_STATUS_LABELS = { pending: 'بانتظار الموافقة', approved: 'تمت الموافقة', rejected: 'مرفوض', completed: 'مكتمل' };

export function buildReturnsStats(returns, now = new Date()) {
  const value = (r) => (Number(r.price) || 0) * (Number(r.quantity) || 1);
  return {
    total: returns.length,
    pending: returns.filter((r) => r.status === 'pending').length,
    approved: returns.filter((r) => r.status === 'approved').length,
    rejected: returns.filter((r) => r.status === 'rejected').length,
    totalValue: returns.filter((r) => r.status !== 'rejected').reduce((s, r) => s + value(r), 0),
    byStatus: countBy(returns, (r) => r.status || 'pending', (s) => RETURN_STATUS_LABELS[s] || s),
    byReason: countBy(returns, (r) => r.reasonLabel || r.reason),
    perDay: bucketByDay(returns, (r) => r.createdAt, () => 1, 30, now),
    value
  };
}

// ==========================================================================
// العملاء
// ==========================================================================
export function buildCustomerStats(customers, now = new Date()) {
  const monthStart = addDays(startOfDay(now), -29);
  const newThisMonth = customers.filter((c) => {
    const d = toDate(c.createdAt);
    return d && d >= monthStart;
  }).length;
  const buyers = customers.filter((c) => (Number(c.totalPurchases) || 0) > 0);
  return {
    total: customers.length,
    newThisMonth,
    buyers: buyers.length,
    repeatRate: customers.length ? Math.round((buyers.length / customers.length) * 100) : 0,
    byGovernorate: countBy(customers, (c) => c.governorate).slice(0, 8),
    topBuyers: [...customers].sort((a, b) => (Number(b.totalPurchases) || 0) - (Number(a.totalPurchases) || 0)).slice(0, 8)
      .filter((c) => (Number(c.totalPurchases) || 0) > 0)
      .map((c) => ({ name: c.name || c.phone || '-', value: Number(c.totalPurchases) || 0 })),
    perMonth: bucketByMonth(customers, (c) => c.createdAt, () => 1, 12, now)
  };
}

// ==========================================================================
// المصروفات / المالية
// ==========================================================================
export function buildFinanceStats(expenses, txs, now = new Date(), days = 30) {
  const monthStart = addDays(startOfDay(now), -(days - 1));
  const inMonth = (x, f) => { const d = toDate(f(x)); return d && d >= monthStart; };
  const revenue = txs.filter((t) => isSale(t) && inMonth(t, (z) => z.timestamp)).reduce((s, t) => s + amountOf(t), 0);
  const refunds = txs.filter((t) => isReturnTx(t) && inMonth(t, (z) => z.timestamp)).reduce((s, t) => s + amountOf(t), 0);
  const spent = expenses.filter((e) => inMonth(e, (z) => z.date)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return {
    revenue, refunds, spent,
    netProfit: revenue - refunds - spent,
    expensesCount: expenses.length,
    byCategory: sumBy(expenses, (e) => e.category || 'أخرى', (e) => e.amount),
    expensesPerDay: bucketByDay(expenses, (e) => e.date, (e) => e.amount, Math.min(days, 90), now),
    revenuePerDay: bucketByDay(txs.filter(isSale), (t) => t.timestamp, amountOf, Math.min(days, 90), now)
  };
}

// ==========================================================================
// الضمان
// ==========================================================================
export function buildWarrantyStats(txs, now = new Date()) {
  const today = startOfDay(now);
  const rows = [];
  txs.filter(isSale).forEach((t) => {
    (t.items || []).forEach((i) => {
      if (!i.warrantyEndDate) return;
      const end = toDate(i.warrantyEndDate);
      if (!end) return;
      const daysLeft = Math.ceil((end - today) / 86400000);
      rows.push({
        name: i.name, serialNumber: i.serialNumber, customerName: t.customerName,
        phone: t.phone || t.customerPhone, endDate: end, daysLeft
      });
    });
  });
  const bucket = (r) => (r.daysLeft < 0 ? 'منتهي' : r.daysLeft <= 30 ? 'ينتهي خلال 30 يوم' : r.daysLeft <= 90 ? 'ينتهي خلال 90 يوم' : 'ساري (أكثر من 90 يوم)');
  return {
    rows: rows.sort((a, b) => a.daysLeft - b.daysLeft),
    total: rows.length,
    expired: rows.filter((r) => r.daysLeft < 0).length,
    soon30: rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length,
    soon90: rows.filter((r) => r.daysLeft > 30 && r.daysLeft <= 90).length,
    valid: rows.filter((r) => r.daysLeft > 90).length,
    byBucket: countBy(rows, bucket),
    expiryPerMonth: (() => {
      const m = new Map();
      for (let i = 0; i < 6; i++) m.set(monthKey(new Date(now.getFullYear(), now.getMonth() + i, 1)), 0);
      rows.filter((r) => r.daysLeft >= 0).forEach((r) => {
        const k = monthKey(r.endDate);
        if (m.has(k)) m.set(k, m.get(k) + 1);
      });
      return [...m.entries()].map(([k, value]) => ({ name: k, key: k, value }));
    })()
  };
}

// سلسلة مبيعات/مرتجعات لعدد أيام معيّن: لحد 90 يوم بالأيام، وأكتر من كده بالشهور (12 شهر)
export function buildSalesSeriesByDays(txs, days = 30, now = new Date()) {
  if (days > 90) return buildSalesSeries(txs, 'year', now);
  const start = startOfDay(addDays(now, -(days - 1)));
  const keys = Array.from({ length: days }, (_, i) => dayKey(addDays(start, i)));
  const rows = new Map(keys.map((k) => [k, { sales: 0, returns: 0 }]));
  txs.forEach((t) => {
    const d = toDate(t.timestamp);
    if (!d || d < start) return;
    const row = rows.get(dayKey(d));
    if (!row) return;
    if (isReturnTx(t)) row.returns += amountOf(t);
    else if (isSale(t)) row.sales += amountOf(t);
  });
  return keys.map((k) => {
    const { sales, returns } = rows.get(k);
    return { name: k.slice(5), sales, returns, net: sales - returns };
  });
}
