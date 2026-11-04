import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { applyReceipt, weightedAvgCost, supplierBalances, poTotal, poItemsFromForecast, countDiffs, countSummary, shiftExpected, customerStatement, marginReport } from '../../ai/accounts';

const at = (h) => new Date(2026, 10, 3, h);
describe('accounts', () => {
  it('PO receipt partial then full, never over-receives', () => {
    const po = { status: 'sent', items: [{ serialNumber: 'a', qty: 10, cost: 5, receivedQty: 0 }, { serialNumber: 'b', qty: 2, cost: 100, receivedQty: 0 }] };
    const r1 = applyReceipt(po, { 0: 4, 1: 5 });
    expect(r1.status).toBe('partial');
    expect(r1.items.map((i) => i.receivedQty)).toEqual([4, 2]);
    expect(r1.moves.map((m) => m.qty)).toEqual([4, 2]);
    const r2 = applyReceipt({ ...po, items: r1.items }, { 0: 6 });
    expect(r2.status).toBe('received');
    expect(poTotal(po)).toBe(250);
  });
  it('weighted average cost', () => {
    expect(weightedAvgCost(10, 100, 10, 120)).toBe(110);
    expect(weightedAvgCost(0, 0, 5, 80)).toBe(80);
    expect(weightedAvgCost(5, 0, 5, 80)).toBe(80);
  });
  it('supplier balances and forecast to PO', () => {
    const b = supplierBalances([
      { supplierId: 's1', supplierName: 'مورد 1', status: 'partial', items: [{ qty: 10, cost: 10, receivedQty: 5 }], payments: [{ amount: 20 }] },
      { supplierId: 's1', supplierName: 'مورد 1', status: 'cancelled', items: [{ qty: 99, cost: 99, receivedQty: 99 }] },
    ]);
    expect(b[0]).toMatchObject({ received: 50, paid: 20, due: 30, open: 1 });
    expect(poItemsFromForecast([{ serialNumber: 'x', name: 'X', suggestedOrder: 4, warehouseId: 'main' }, { serialNumber: 'y', suggestedOrder: 0 }, { serialNumber: 'z', suggestedOrder: 2, warehouseId: 'b1' }])).toEqual([{ serialNumber: 'x', name: 'X', qty: 4, cost: 0, receivedQty: 0 }]);
  });
  it('stock count diffs and summary', () => {
    const rows = countDiffs({ a: { name: 'A', systemQty: 10, countedQty: 8, cost: 50 }, b: { name: 'B', systemQty: 1, countedQty: 3, price: 10 }, c: { name: 'C', systemQty: 5 } });
    expect(rows[0]).toMatchObject({ serial: 'a', diff: -2, valueDiff: -100 });
    expect(countSummary(rows)).toMatchObject({ total: 3, counted: 2, shortage: -2, surplus: 2, valueDiff: -80, mismatched: 2 });
  });
  it('shift expected cash', () => {
    const s = shiftExpected({ openingCash: 500, operator: 'سارة', openedAt: at(9), cashIn: [{ amount: 100 }], cashOut: [{ amount: 50 }], countedCash: 1500 }, [
      { type: 'sell', operator: 'سارة', paymentMethod: 'cash', totalPaid: 1000, timestamp: at(10) },
      { type: 'sell', operator: 'سارة', paymentMethod: 'card', totalPaid: 700, timestamp: at(11) },
      { type: 'sell', operator: 'علي', paymentMethod: 'cash', totalPaid: 999, timestamp: at(11) },
      { type: 'return', operator: 'سارة', finalTotal: -100, timestamp: at(12) },
      { type: 'sell', operator: 'سارة', paymentMethod: 'cash', totalPaid: 5, timestamp: at(8) },
    ]);
    expect(s).toMatchObject({ cashSales: 1000, otherSales: 700, refunds: 100, expected: 1450, diff: 50, invoices: 2 });
  });
  it('customer statement', () => {
    const st = customerStatement([{ type: 'sell', invoiceNumber: 'INV-1', finalTotal: 1000, totalPaid: 600, remaining: 400, timestamp: at(9) }], [{ ticketNumber: 'T1', totalCost: 300, totalPaid: 100, createdAt: at(8) }]);
    expect(st.rows.map((r) => r.kind)).toEqual(['صيانة', 'فاتورة']);
    expect(st.totals).toEqual({ amount: 1300, paid: 700, remaining: 600 });
  });
  it('margin report with stored or looked-up costs', () => {
    const r = marginReport([{ type: 'sell', warehouseId: 'main', items: [{ serialNumber: 'a', name: 'A', quantity: 2, price: 100, cost: 60 }, { serialNumber: 'b', name: 'B', quantity: 1, price: 50 }, { name: 'تركيب', price: 30, isService: true }] }], (s) => (s === 'b' ? 20 : null));
    expect(r).toMatchObject({ revenue: 250, cost: 140, profit: 110, missingCostLines: 0, services: 30 });
    expect(marginReport([{ type: 'sell', items: [{ serialNumber: 'z', price: 10 }] }]).missingCostLines).toBe(1);
  });
});
