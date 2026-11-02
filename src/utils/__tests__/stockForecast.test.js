import { describe, it, expect } from 'vitest';
import { buildForecast, trendOf, salesVelocity } from '../../ai/stockForecast';

const now = new Date(2026, 9, 31, 12);
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);
const sale = (n, serial, qty, wh = 'main', extra = {}) => ({
  type: 'sell', warehouseId: wh, timestamp: daysAgo(n), items: [{ serialNumber: serial, name: serial, quantity: qty, ...extra }],
});

describe('stockForecast', () => {
  it('computes velocity per serial and warehouse, ignoring services/returns/out-of-window', () => {
    const txs = [
      sale(1, 'A', 3), sale(20, 'A', 3), sale(5, 'A', 10, 'b1'),
      sale(2, 'S', 5, 'main', { isService: true }),
      { type: 'return', warehouseId: 'main', timestamp: daysAgo(1), items: [{ serialNumber: 'A', quantity: 50 }] },
      sale(45, 'A', 100),
    ];
    const v = salesVelocity(txs, { days: 30, now });
    expect(v.get('a|main').sold).toBe(6);
    expect(v.get('a|b1').sold).toBe(10);
    expect(v.has('s|main')).toBe(false);
  });

  it('classifies levels and suggests order quantity', () => {
    const inv = [
      { id: '1', serialNumber: 'FAST', warehouseId: 'main', quantity: 3, price: 10 },   // 1/day -> 3 days left (critical)
      { id: '2', serialNumber: 'MID', warehouseId: 'main', quantity: 10, price: 10 },   // 1/day -> 10 days (soon)
      { id: '3', serialNumber: 'DEAD', warehouseId: 'main', quantity: 4, price: 25 },   // no sales
      { id: '4', serialNumber: 'GONE', warehouseId: 'main', quantity: 0, price: 5 },    // sells but zero
      { id: '5', serialNumber: 'X', warehouseId: 'main', quantity: 5, isDeleted: true },
    ];
    const txs = [];
    for (let d = 0; d < 30; d++) { txs.push(sale(d + 0.1, 'FAST', 1)); txs.push(sale(d + 0.1, 'MID', 1)); }
    txs.push(sale(3, 'GONE', 2));
    const { rows, summary } = buildForecast(inv, txs, { days: 30, leadDays: 7, coverDays: 30, now });
    const by = Object.fromEntries(rows.map((r) => [r.serialNumber, r]));
    expect(by.FAST.level).toBe('critical');
    expect(Math.round(by.FAST.daysLeft)).toBe(3);
    expect(by.FAST.suggestedOrder).toBe(37 - 3);
    expect(by.MID.level).toBe('soon');
    expect(by.DEAD.level).toBe('dead');
    expect(by.GONE.level).toBe('out');
    expect(by.X).toBeUndefined();
    expect(summary.deadValue).toBe(100);
    expect(rows[0].serialNumber).toBe('GONE'); // نفد أولًا في الترتيب
  });

  it('trend detection', () => {
    expect(trendOf(0, 0)).toBe('none');
    expect(trendOf(0, 3)).toBe('up');
    expect(trendOf(10, 15)).toBe('up');
    expect(trendOf(10, 5)).toBe('down');
    expect(trendOf(10, 10)).toBe('flat');
  });
});
