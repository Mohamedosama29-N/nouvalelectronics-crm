import { describe, expect, it } from 'vitest';
import {
  bucketByDay, buildCustomerStats, buildFinanceStats, buildInventoryStats, buildReturnsStats, buildSalesSeries,
  buildSalesSeriesByDays, buildSalesStats, buildTicketStats, buildTransferStats, buildWarrantyStats, countBy, pctChange,
  topProductsFrom
} from '../liveStats';
import { MODULE_REPORTS, canViewReport, formatKpi, makeReportContext } from '../moduleReports';

const NOW = new Date(2026, 9, 13, 15, 0, 0); // 13 أكتوبر 2026 3 م
const at = (daysAgo, hour = 10) => new Date(2026, 9, 13 - daysAgo, hour, 0, 0);

describe('buildSalesStats', () => {
  const txs = [
    { type: 'sell', finalTotal: 1000, timestamp: at(0) },
    { type: 'sell', finalTotal: 500, timestamp: at(0, 11) },
    { type: 'sell', finalTotal: 400, timestamp: at(1) },
    { type: 'sell', total: 300, timestamp: at(5) },
    { type: 'sell', finalTotal: 700, timestamp: at(20) },
    { type: 'return', finalTotal: 100, timestamp: at(0) },
    { type: 'sell', finalTotal: 50, timestamp: at(400) }
  ];
  const s = buildSalesStats(txs, NOW);
  it('يحسب الفترات الصح', () => {
    expect(s.today).toBe(1500);
    expect(s.yesterday).toBe(400);
    expect(s.week).toBe(1500 + 400 + 300);
    expect(s.month).toBe(1500 + 400 + 300 + 700);
    expect(s.returnsToday).toBe(100);
    expect(s.netToday).toBe(1400);
  });
  it('متوسط الفاتورة = مبيعات الأسبوع ÷ عدد فواتيره (مش الصيغة القديمة الغلط)', () => {
    expect(s.weekCount).toBe(4);
    expect(s.avgInvoice).toBe(Math.round(2200 / 4));
  });
  it('الاتجاه عن الأمس حقيقي، وnull لو مفيش أمس', () => {
    expect(s.trendVsYesterday).toBe(275);
    expect(buildSalesStats([{ type: 'sell', finalTotal: 10, timestamp: at(0) }], NOW).trendVsYesterday).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe('buildSalesSeries', () => {
  const txs = [
    { type: 'sell', finalTotal: 100, timestamp: at(0, 9) },
    { type: 'sell', finalTotal: 50, timestamp: at(0, 9) },
    { type: 'return', finalTotal: 30, timestamp: at(1) }
  ];
  it('week: 7 نقاط بالصافي', () => {
    const w = buildSalesSeries(txs, 'week', NOW);
    expect(w).toHaveLength(7);
    expect(w[6].sales).toBe(150);
    expect(w[5].returns).toBe(30);
    expect(w[5].net).toBe(-30);
  });
  it('day: 24 ساعة', () => {
    const d = buildSalesSeries(txs, 'day', NOW);
    expect(d).toHaveLength(24);
    expect(d[9].sales).toBe(150);
  });
  it('year: 12 شهر، وbyDays بيرجع شهور لو أكتر من 90 يوم', () => {
    expect(buildSalesSeries(txs, 'year', NOW)).toHaveLength(12);
    expect(buildSalesSeriesByDays(txs, 365, NOW)).toHaveLength(12);
    expect(buildSalesSeriesByDays(txs, 30, NOW)).toHaveLength(30);
  });
});

describe('topProductsFrom', () => {
  it('بيقرأ items[] ويتجاهل الخدمات، ويرجع لـ itemName للفواتير القديمة', () => {
    const top = topProductsFrom([
      { type: 'sell', items: [{ name: 'شاشة', serialNumber: 'S1', quantity: 2, price: 100 }, { name: 'توصيل', isService: true, quantity: 1, price: 50 }] },
      { type: 'sell', items: [{ name: 'شاشة', serialNumber: 'S1', quantity: 1, price: 100 }] },
      { type: 'sell', itemName: 'كابل', finalTotal: 40 }
    ]);
    expect(top[0]).toMatchObject({ name: 'شاشة', qty: 3, revenue: 300 });
    expect(top.map((t) => t.name)).toEqual(['شاشة', 'كابل']);
  });
});

describe('inventory / tickets / transfers / returns / customers', () => {
  it('المخزون: بيستبعد المحذوف ويعد النواقص والنافد', () => {
    const st = buildInventoryStats([
      { isDeleted: false, quantity: 5, price: 10, minStock: 5, category: 'أ', warehouseId: 'main' },
      { isDeleted: false, quantity: 0, price: 10, minStock: 0, warehouseId: 'b1' },
      { isDeleted: true, quantity: 99, price: 1 },
      { quantity: 99, price: 1 }
    ]);
    expect(st.skuCount).toBe(2);
    expect(st.totalQty).toBe(5);
    expect(st.totalValue).toBe(50);
    expect(st.lowStock).toHaveLength(1);
    expect(st.outOfStock).toBe(1);
  });
  it('التذاكر', () => {
    const st = buildTicketStats([
      { status: 'created', priority: 'high', createdAt: at(0) },
      { status: 'closed', priority: 'low', createdAt: at(10) },
      { status: 'waiting_customer_approval_cost', priority: 'medium', createdAt: at(40) }
    ], { now: NOW, terminal: ['closed'], isOverdue: (t) => t.status === 'created' });
    expect(st).toMatchObject({ total: 3, today: 1, month: 2, closed: 1, open: 2, waitingApproval: 1, highPriority: 1, overdueSLA: 1 });
    expect(st.perDay).toHaveLength(30);
  });
  it('التحويلات: القطع المستلمة فقط + دعم الشكل القديم', () => {
    const st = buildTransferStats([
      { status: 'received', items: [{ quantity: 2 }, { quantity: 3 }], toWarehouseId: 'b1', createdAt: at(1) },
      { status: 'received', serialNumber: 'X', quantity: 1, toWarehouseId: 'b1', createdAt: at(1) },
      { status: 'shipped', items: [{ quantity: 9 }], toWarehouseId: 'b2', createdAt: at(1) },
      { status: 'pending', toWarehouseId: 'b2', createdAt: at(1) }
    ], (x) => x, NOW);
    expect(st.totalQty).toBe(6);
    expect(st).toMatchObject({ pending: 1, inTransit: 1, received: 2 });
    expect(st.byDestination[0].value).toBe(2);
  });
  it('المرتجعات: المرفوض مش بيتحسب في القيمة', () => {
    const st = buildReturnsStats([
      { status: 'approved', price: 100, quantity: 2, createdAt: at(1) },
      { status: 'rejected', price: 1000, createdAt: at(1) }
    ], NOW);
    expect(st.totalValue).toBe(200);
  });
  it('العملاء', () => {
    const st = buildCustomerStats([
      { name: 'أ', totalPurchases: 3, createdAt: at(2), governorate: 'القاهرة' },
      { name: 'ب', totalPurchases: 0, createdAt: at(90), governorate: 'القاهرة' }
    ], NOW);
    expect(st).toMatchObject({ total: 2, newThisMonth: 1, buyers: 1, repeatRate: 50 });
    expect(st.perMonth).toHaveLength(12);
  });
  it('المالية: صافي = إيراد − مرتجع − مصروف', () => {
    const st = buildFinanceStats(
      [{ amount: 200, date: at(1), category: 'إيجار' }],
      [{ type: 'sell', finalTotal: 1000, timestamp: at(1) }, { type: 'return', finalTotal: 100, timestamp: at(1) }],
      NOW, 30
    );
    expect(st.netProfit).toBe(700);
  });
  it('الضمان', () => {
    const st = buildWarrantyStats([{ type: 'sell', items: [
      { name: 'أ', warrantyEndDate: at(-10).toISOString() },
      { name: 'ب', warrantyEndDate: at(5).toISOString() },
      { name: 'ج', warrantyEndDate: at(-60).toISOString() }
    ] }], NOW);
    expect(st).toMatchObject({ total: 3, expired: 1, soon30: 1, soon90: 1 });
  });
  it('bucketByDay و countBy', () => {
    expect(bucketByDay([{ d: at(0) }], (x) => x.d, () => 1, 3, NOW).map((b) => b.value)).toEqual([0, 0, 1]);
    expect(countBy([{ a: 'x' }, { a: 'x' }, { a: '' }], (r) => r.a)).toEqual([{ key: 'x', name: 'x', value: 2 }]);
  });
});

describe('تعريفات التقارير (moduleReports)', () => {
  const admin = { role: 'admin', permissions: {} };
  const ctx = makeReportContext({ user: admin, warehouses: [{ id: 'main', name: 'الرئيسي' }], rangeDays: 30, now: NOW });
  it('كل قسم له تقرير يتبني من بيانات فاضية من غير أخطاء', () => {
    expect(MODULE_REPORTS.map((m) => m.id)).toEqual(['sales', 'invoices', 'inventory', 'tickets', 'transfers', 'returns', 'customers', 'finance', 'warranty', 'team', 'warehouses']);
    MODULE_REPORTS.forEach((def) => {
      const r = def.build({}, ctx);
      expect(r.kpis.length).toBeGreaterThan(0);
      expect(r.charts.length).toBeGreaterThan(0);
      expect(Array.isArray(r.table.rows)).toBe(true);
      expect(def.sources(ctx).length).toBeGreaterThan(0);
    });
  });
  it('تقرير المبيعات بيحسب ويصفّي بالمخزن لغير الأدمن', () => {
    const sales = MODULE_REPORTS.find((m) => m.id === 'sales');
    const data = { transactions: [
      { id: 'a1', type: 'sell', finalTotal: 100, timestamp: at(1), warehouseId: 'main' },
      { id: 'a2', type: 'sell', finalTotal: 900, timestamp: at(1), warehouseId: 'b1' }
    ] };
    expect(sales.build(data, ctx).kpis[0].value).toBe(1000);
    const clerk = makeReportContext({ user: { role: 'sales', assignedWarehouseId: 'b1', permissions: {} }, rangeDays: 30, now: NOW });
    expect(sales.build(data, clerk).kpis[0].value).toBe(900);
  });
  it('قيمة المخزون مخفية بدون صلاحية', () => {
    const inv = MODULE_REPORTS.find((m) => m.id === 'inventory');
    const clerk = makeReportContext({ user: { role: 'sales', permissions: { viewInventory: true } }, rangeDays: 30, now: NOW });
    const r = inv.build({ inventory: [{ isDeleted: false, quantity: 1, price: 5, warehouseId: 'main' }] }, clerk);
    expect(r.kpis[2].value).toBeNull();
    expect(r.table.headers).not.toContain('السعر');
  });
  it('الصلاحيات', () => {
    const wh = MODULE_REPORTS.find((m) => m.id === 'warehouses');
    const tk = MODULE_REPORTS.find((m) => m.id === 'tickets');
    expect(canViewReport(wh, admin)).toBe(true);
    expect(canViewReport(wh, { role: 'sales', permissions: { viewAllWarehouses: true } })).toBe(false);
    expect(canViewReport(tk, { role: 'sales', permissions: {} })).toBe(false);
    expect(canViewReport(tk, { role: 'sales', permissions: { manageTickets: true } })).toBe(true);
  });
  it('formatKpi', () => {
    expect(formatKpi({ value: null })).toBe('—');
    expect(formatKpi({ value: 5, format: 'percent' })).toContain('%');
  });
});
