// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
const calls = [];
let pages = [];
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), limit: (n) => ({ n }), orderBy: () => ({}),
  where: (f, op, v) => ({ v }), query: (...a) => a,
  Timestamp: { fromMillis: (ms) => ({ ms, toDate: () => new Date(ms) }) },
  getDocs: vi.fn(async (q) => { calls.push(q[1].v.ms); const p = pages.shift(); if (p instanceof Error) throw p; return { docs: (p || []).map(([id, c, w]) => ({ id, data: () => ({ createdAt: new Date(c), warehouseId: w }) })) }; }),
}));
import { loadForecastTickets, clearForecastCache, loadErrorMessage, asTickets } from '../../ai/forecastStore';

const now = Date.now(); const H = 3600000;
describe('forecastStore', () => {
  beforeEach(() => { clearForecastCache(); calls.length = 0; pages = []; });
  it('loads once, then only asks for tickets newer than the last one', async () => {
    pages = [[['a', now - 50 * H, 'main'], ['b', now - 10 * H, 'b1']]];
    const r1 = await loadForecastTickets();
    expect(r1.list.map((x) => x.id)).toEqual(['a', 'b']);
    const r2 = await loadForecastTickets(); // جديد: مفيش قراءة
    expect(calls.length).toBe(1); expect(r2.list.length).toBe(2);
    pages = [[['c', now - H, 'main']]];
    const r3 = await loadForecastTickets({ force: true });
    expect(calls[1]).toBe(now - 10 * H); // بعد آخر تذكرة عندنا بس
    expect(r3.list.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(JSON.parse(localStorage.getItem('nouval_forecast_v1')).list.length).toBe(3);
  });
  it('keeps the saved copy when the read fails', async () => {
    pages = [[['a', now - 5 * H, 'main']]];
    await loadForecastTickets();
    pages = [Object.assign(new Error('quota'), { code: 'resource-exhausted' })];
    const r = await loadForecastTickets({ force: true });
    expect(r.stale).toBe(true); expect(r.list.length).toBe(1);
    expect(loadErrorMessage(r.error)).toContain('حصة القراءات');
  });
  it('maps compact rows back to tickets', () => {
    const [t] = asTickets([{ id: 'x', c: now, w: 'main', ac: '', at: 'سامي' }]);
    expect(t.createdAt.getTime()).toBe(now); expect(t.warehouseId).toBe('main'); expect(t.assignedCenter).toBeUndefined();
  });
});
