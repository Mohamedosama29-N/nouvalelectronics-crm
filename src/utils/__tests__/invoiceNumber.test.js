import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: (...a) => ({ path: a.slice(1).join('/') }) }));
import { readNextInvoiceNumber, formatInvoiceNumber, sanitizeQty, isValidSaleQty } from '../invoiceNumber';

describe('invoiceNumber helpers', () => {
  it('formats with zero padding', () => {
    expect(formatInvoiceNumber(7)).toBe('INV-000007');
    expect(formatInvoiceNumber(123456)).toBe('INV-123456');
  });
  it('validates sale quantity as positive integer', () => {
    expect(isValidSaleQty(1)).toBe(true);
    expect(isValidSaleQty('3')).toBe(true);
    expect(isValidSaleQty(0)).toBe(false);
    expect(isValidSaleQty(-2)).toBe(false);
    expect(isValidSaleQty(1.5)).toBe(false);
    expect(isValidSaleQty('abc')).toBe(false);
  });
  it('sanitizeQty never returns invalid values', () => {
    for (const v of [undefined, null, '', -5, 'x', 2.7]) {
      const q = sanitizeQty(v);
      expect(Number.isFinite(q)).toBe(true);
      expect(q).toBeGreaterThanOrEqual(0);
    }
  });
  it('readNextInvoiceNumber reads counter, writes only on commit (mock transaction)', async () => {
    const writes = [];
    const tx = {
      get: async () => ({ exists: () => true, data: () => ({ value: 41 }) }),
      set: (...a) => writes.push(a),
    };
    const r = await readNextInvoiceNumber(tx);
    expect(r.number).toBe('INV-000042');
    expect(writes.length).toBe(0);
    r.commit();
    expect(writes.length).toBe(1);
    expect(writes[0][1]).toEqual({ value: 42 });
  });
  it('starts at 1 when counter missing', async () => {
    const tx = { get: async () => ({ exists: () => false }), set: () => {} };
    expect((await readNextInvoiceNumber(tx)).number).toBe('INV-000001');
  });
});
