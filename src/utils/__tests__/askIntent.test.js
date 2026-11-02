import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { parseQuestionLocally, resolvePeriod, previousPeriod, sanitizeIntent, enforceScope, formatAnswer } from '../../ai/askIntent';

const WH = [{ id: 'main', name: 'الرئيسي' }, { id: 'b1', name: 'فرع 1' }, { id: 'b10', name: 'فرع 10' }];
const now = new Date(2026, 10, 2, 11); // الاثنين 2 نوفمبر 2026

describe('askIntent local parser', () => {
  it.each([
    ['مبيعات النهارده كام؟', 'sales_total', 'today'],
    ['كام فاتورة امبارح', 'invoice_count', 'yesterday'],
    ['أكتر 3 أصناف مبيعا الشهر ده', 'top_products', 'this_month'],
    ['كام تذكرة مفتوحة دلوقتي', 'tickets_open', 'this_month'],
    ['التذاكر الجديدة الاسبوع اللي فات', 'tickets_created', 'last_week'],
    ['المصاريف الشهر الماضي', 'expenses_total', 'last_month'],
    ['صافي الربح السنة دي', 'net_profit', 'this_year'],
    ['المرتجعات آخر 30 يوم', 'returns_total', 'last_30_days'],
    ['متوسط الفاتورة الأسبوع ده', 'avg_invoice', 'this_week'],
  ])('%s', (q, metric, period) => {
    const r = parseQuestionLocally(q, WH);
    expect(r.metric).toBe(metric);
    expect(r.period).toBe(period);
  });
  it('detects warehouse (longest name first), compare and topN', () => {
    const r = parseQuestionLocally('مبيعات فرع 10 الشهر ده مقارنة بالشهر اللي فات', WH);
    expect(r.warehouseId).toBe('b10');
    expect(r.compare).toBe(true);
    expect(parseQuestionLocally('أكتر 3 أصناف', WH).topN).toBe(3);
  });
  it('returns null for unrelated questions', () => {
    expect(parseQuestionLocally('الجو عامل ايه', WH)).toBeNull();
    expect(parseQuestionLocally('', WH)).toBeNull();
  });
});

describe('periods', () => {
  it('week starts saturday', () => {
    const [f, t] = resolvePeriod('this_week', now);
    expect(f.getDay()).toBe(6);
    expect(f.getDate()).toBe(31);
    expect(t.getDate()).toBe(3);
  });
  it('last month and comparison windows', () => {
    const [f, t] = resolvePeriod('last_month', now);
    expect([f.getMonth(), f.getDate(), t.getMonth(), t.getDate()]).toEqual([9, 1, 10, 1]);
    const cur = resolvePeriod('this_month', now);
    const [pf, pt] = previousPeriod('this_month', cur, now);
    expect([pf.getMonth(), pf.getDate(), pt.getMonth(), pt.getDate()]).toEqual([9, 1, 9, 3]);
    const [yf, yt] = resolvePeriod('yesterday', now);
    const [pyf] = previousPeriod('yesterday', [yf, yt], now);
    expect(pyf.getDate()).toBe(31);
  });
  it('custom range inclusive and invalid fallback', () => {
    const [f, t] = resolvePeriod('custom', now, '2026-10-05', '2026-10-07');
    expect((t - f) / 86400000).toBe(3);
    const [f2] = resolvePeriod('custom', now, 'bad', 'x');
    expect(f2.getDate()).toBe(1);
  });
});

describe('sanitize & scope & format', () => {
  it('rejects unknown metric and unknown warehouses', () => {
    expect(sanitizeIntent({ metric: 'drop_tables' }, WH)).toBeNull();
    const s = sanitizeIntent({ metric: 'sales_total', period: 'whenever', warehouseId: 'hack', compare: 'yes', topN: 999 }, WH);
    expect(s).toMatchObject({ period: 'this_month', warehouseId: 'all', compare: false, topN: 20 });
  });
  it('branch users are locked to their warehouse', () => {
    const i = { metric: 'sales_total', warehouseId: 'all' };
    expect(enforceScope(i, { role: 'cashier', assignedWarehouseId: 'b1' }).warehouseId).toBe('b1');
    expect(enforceScope(i, { role: 'admin' }).warehouseId).toBe('all');
  });
  it('formats change percentage', () => {
    const a = formatAnswer({ metric: 'sales_total', period: 'this_month' }, { value: 1200, count: 4, previous: 1000, range: resolvePeriod('this_month', now) });
    expect(a.headline).toBe('1,200 ج');
    expect(a.change).toMatchObject({ pct: 20, dir: 'up' });
    expect(a.details.join(' ')).toContain('300');
  });
});
