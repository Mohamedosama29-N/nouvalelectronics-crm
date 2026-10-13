import { describe, it, expect } from 'vitest';
import { monthRange, previousMonth, pctChange, summarizeTransactions } from '../reportHelpers';

describe('monthRange / previousMonth', () => {
  it('يحسب بداية ونهاية الشهر وعدد الأيام', () => {
    const r = monthRange('2026-02');
    expect(r.daysInMonth).toBe(28);
    expect(r.start.getDate()).toBe(1);
    expect(r.end.getDate()).toBe(28);
  });
  it('الشهر السابق يعدّي على حدود السنة', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-10')).toBe('2026-09');
  });
});

describe('pctChange', () => {
  it('نسبة التغيّر العادية', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
  });
  it('مفيش أساس للمقارنة', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe('summarizeTransactions', () => {
  const d = (day) => ({ toDate: () => new Date(2026, 9, day, 12) });
  const list = [
    { type: 'sell', finalTotal: 1000, timestamp: d(1), items: [{ name: 'A', serialNumber: 'a1', quantity: 2, price: 400 }, { name: 'خدمة', isService: true, quantity: 1, price: 200 }] },
    { type: 'sell', total: 500, timestamp: d(1), items: [{ name: 'A', serialNumber: 'a1', quantity: 1, price: 400 }] },
    { type: 'return', finalTotal: 400, timestamp: d(2), items: [] }
  ];
  it('يحسب المبيعات والمرتجعات والصافي', () => {
    const s = summarizeTransactions(list, 31);
    expect(s.sales).toBe(1500);
    expect(s.returns).toBe(400);
    expect(s.net).toBe(1100);
    expect(s.salesCount).toBe(2);
    expect(s.avgInvoice).toBe(750);
  });
  it('أعلى الأصناف بدون الخدمات ويجمّع بالسيريال', () => {
    const s = summarizeTransactions(list, 31);
    expect(s.topProducts).toHaveLength(1);
    expect(s.topProducts[0]).toMatchObject({ serialNumber: 'a1', qty: 3, revenue: 1200 });
  });
  it('الإجمالي اليومي بيخصم المرتجع', () => {
    const s = summarizeTransactions(list, 31);
    expect(s.daily[0]).toBe(1500);
    expect(s.daily[1]).toBe(-400);
  });
});
