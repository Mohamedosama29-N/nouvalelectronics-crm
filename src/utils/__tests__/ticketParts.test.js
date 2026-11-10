// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
const g = vi.hoisted(() => ({ docs: new Map() }));
vi.mock('../../firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (path) => ({ path, id: path.split('/').pop() });
  const snap = (path) => { const d = g.docs.get(path); return { exists: () => !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), ref: ref(path) }; };
  return {
    doc: (db, c, id) => ref(`${c}/${id}`), collection: () => ({}), query: () => ({}), where: () => ({}), limit: () => ({}), getDocs: async () => ({ empty: true, docs: [] }),
    serverTimestamp: () => 'TS', arrayUnion: (...a) => ({ __union: a }), updateDoc: async () => {},
    runTransaction: async (db, fn) => {
      const writes = [];
      const tx = { get: async (r) => snap(r.path), update: (r, data) => { writes.push([r.path, data]); } };
      const out = await fn(tx);
      writes.forEach(([p, d]) => g.docs.set(p, { ...g.docs.get(p), ...d }));
      return out;
    },
  };
});
import { addPartToTicket, removePartFromTicket, deductTicketParts } from '../ticketParts';

describe('ربط التذاكر بقطع الغيار', () => {
  beforeEach(() => {
    g.docs.clear();
    g.docs.set('tickets/t1', { totalCost: 100, totalPaid: 0, spareParts: [], history: [] });
    g.docs.set('inventory/i1', { name: 'موتور', quantity: 3, warehouseId: 'b1' });
  });
  it('adding a stock part deducts it and marks it', async () => {
    const r = await addPartToTicket('t1', { id: 'i1', name: 'موتور', quantity: 2, price: 500 }, { by: 'سامي' });
    expect(r.deducted).toBe(true);
    expect(g.docs.get('inventory/i1').quantity).toBe(1);
    const p = g.docs.get('tickets/t1').spareParts[0];
    expect(p.stockDeducted).toBe(true); expect(p.fromWarehouse).toBe('b1');
    expect(g.docs.get('tickets/t1').totalCost).toBe(1100);
  });
  it('refuses when the warehouse does not have enough', async () => {
    await expect(addPartToTicket('t1', { id: 'i1', name: 'موتور', quantity: 5, price: 500 })).rejects.toMatchObject({ code: 'insufficient-stock' });
    expect(g.docs.get('inventory/i1').quantity).toBe(3);
  });
  it('manual part is added without touching stock', async () => {
    const r = await addPartToTicket('t1', { name: 'مسمار', quantity: 1, price: 5 });
    expect(r.deducted).toBe(false);
    expect(g.docs.get('inventory/i1').quantity).toBe(3);
  });
  it('removing a deducted part returns it to stock', async () => {
    await addPartToTicket('t1', { id: 'i1', name: 'موتور', quantity: 2, price: 500 });
    const r = await removePartFromTicket('t1', 'i1');
    expect(r.returned).toBe(true);
    expect(g.docs.get('inventory/i1').quantity).toBe(3);
    expect(g.docs.get('tickets/t1').totalCost).toBe(100);
  });
  it('parts chosen while creating the ticket get deducted after it is saved', async () => {
    g.docs.set('tickets/t2', { spareParts: [{ id: 'i1', name: 'موتور', quantity: 1, price: 500 }, { id: 'i9', name: 'بورده', quantity: 1 }] });
    const { missing } = await deductTicketParts('t2');
    expect(missing).toEqual(['بورده']);
    expect(g.docs.get('inventory/i1').quantity).toBe(2);
    expect(g.docs.get('tickets/t2').spareParts[0].stockDeducted).toBe(true);
  });
});
