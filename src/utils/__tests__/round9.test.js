import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {} }));
const calls = [];
let DATA = [];
vi.mock('firebase/firestore', () => {
  class TS { constructor(m) { this.m = m; } toMillis() { return this.m; } toDate() { return new Date(this.m); } static fromMillis(m) { return new TS(m); } static fromDate(d) { return new TS(d.getTime()); } }
  class GeoPoint { constructor(a, b) { this.latitude = a; this.longitude = b; } }
  return {
    Timestamp: TS, GeoPoint,
    collection: (_d, n) => ({ n }), doc: (_d, c, id) => ({ c, id }), query: (c, ...k) => ({ ...c, k }), where: (f, op, v) => ({ f, op, v }), orderBy: () => ({}), limit: (n) => ({ lim: n }), startAfter: () => ({}),
    getDocs: async (q) => {
      calls.push(q);
      const w = q.k.find((x) => x.op === '>');
      let l = DATA;
      if (w) l = l.filter((t) => t.updatedAt.toMillis() > w.v.toMillis());
      if (q.k.find((x) => x.op === 'not-in')) l = l.filter((t) => t.status !== 'delivered_to_customer');
      return { size: l.length, docs: l.map((t) => ({ id: t.id, data: () => t })) };
    },
    getDoc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: () => 'ST', writeBatch: vi.fn(), increment: (n) => n,
  };
});
import { Timestamp } from 'firebase/firestore';
import { loadRecentTickets, loadOpenTickets, invalidateTicketPools } from '../../ai/ticketPool';
import { deserialize, parseBackupFile, serialize } from '../fullBackup';
import { validRatings, ratingAverage } from '../ticketRating';
import { quotaDay, usageLevel, countReads, deviceUsage, takeUnflushed, markFlushed } from '../readMeter';

describe('incremental ticket pool', () => {
  beforeEach(() => { calls.length = 0; });
  it('full load once, then fetches only changed tickets', async () => {
    DATA = [{ id: 'a', status: 'received_maintenance', updatedAt: Timestamp.fromMillis(1000) }, { id: 'b', status: 'delivered_to_customer', updatedAt: Timestamp.fromMillis(2000) }];
    expect((await loadRecentTickets()).length).toBe(2);
    expect((await loadOpenTickets()).map((t) => t.id)).toEqual(['a']);
    const before = calls.length;
    await loadRecentTickets();
    expect(calls.length).toBe(before); // من الكاش
    DATA = [{ ...DATA[0], status: 'delivered_to_customer', updatedAt: Timestamp.fromMillis(3000) }, DATA[1], { id: 'c', status: 'created', updatedAt: Timestamp.fromMillis(3500) }];
    invalidateTicketPools();
    const open = await loadOpenTickets();
    const last = calls[calls.length - 1];
    expect(last.k.find((x) => x.op === '>')).toBeTruthy(); // استعلام الفرق بس
    expect(open.map((t) => t.id)).toEqual(['c']);
    expect((await loadRecentTickets()).map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('restore & rating & meter', () => {
  it('backup round-trip keeps ids and timestamps', () => {
    const s = serialize({ d: Timestamp.fromMillis(5000), g: { latitude: 1, longitude: 2 } });
    const back = deserialize(s);
    expect(back.d.toMillis()).toBe(5000);
    expect(back.g.latitude).toBe(1);
    expect(parseBackupFile('nope').ok).toBe(false);
    expect(parseBackupFile(JSON.stringify({ app: 'x' })).ok).toBe(false);
    const p = parseBackupFile(JSON.stringify({ app: 'nouval-erp', version: 2, data: { tickets: [{ __id: 't1', id: 'inner' }], x: 'bad' } }));
    expect(p.ok).toBe(true);
    expect(p.counts).toEqual({ tickets: 1 });
  });
  it('rating validation', () => {
    expect(validRatings({ accessibility: 5, maintenanceTime: 1, centerDealing: 3, deliveryProcedures: 4 })).toBe(true);
    expect(validRatings({ accessibility: 6, maintenanceTime: 1, centerDealing: 3, deliveryProcedures: 4 })).toBe(false);
    expect(validRatings({ accessibility: 2.5, maintenanceTime: 1, centerDealing: 3, deliveryProcedures: 4 })).toBe(false);
    expect(ratingAverage({ accessibility: 4, maintenanceTime: 2, centerDealing: 2, deliveryProcedures: 2 })).toBe(2.5);
  });
  it('meter counts and flush deltas, pacific quota day', () => {
    expect(quotaDay(new Date('2026-11-04T06:00:00Z'))).toBe('2026-11-03'); // لسه 10 بالليل في كاليفورنيا
    countReads(10, { source: 'tickets' }); countReads(5, { fromCache: true });
    const u = deviceUsage();
    expect(u.reads).toBeGreaterThanOrEqual(10);
    const d = takeUnflushed(); markFlushed(d);
    expect(takeUnflushed().reads).toBe(0);
    expect(usageLevel(46000, 50000).level).toBe('danger');
    expect(usageLevel(36000, 50000).level).toBe('warn');
  });
});
