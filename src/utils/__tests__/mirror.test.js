// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 🧪 Firestore وهمي فيه «سيرفر» و«كاش على الجهاز» منفصلين عشان نختبر إن المرايا بتجيب الجديد بس
const g = vi.hoisted(() => ({ server: new Map(), cache: new Map(), reads: 0, T: (ms) => ({ ms, toMillis: () => ms, toDate: () => new Date(ms) }) }));
const { server, cache, T } = g; let now = 1_800_000_000_000;
vi.mock('../../firebase/config', () => ({ db: {}, persistentCacheOn: true }));
vi.mock('../../utils/quotaGuard', () => ({ economyMode: () => false, quotaBlocked: () => false }));
vi.mock('firebase/firestore', () => {
  const val = (d, f) => (f === '__name__' ? d.id : d.data[f]);
  const num = (v) => (v && typeof v === 'object' && 'ms' in v ? v.ms : v);
  const match = (d, cons) => cons.every((c) => {
    if (c.t !== 'where') return true;
    const v = num(val(d, c.f)); const x = num(c.v);
    if (v === undefined) return false;
    return c.op === '>=' ? v >= x : c.op === '>' ? v > x : c.op === '<=' ? v <= x : c.op === '<' ? v < x : c.op === '==' ? v === x : true;
  });
  const run = (store, q) => {
    let l = [...store.values()].filter((d) => match(d, q.cons));
    const o = q.cons.find((c) => c.t === 'orderBy');
    if (o) l.sort((a, b) => (num(val(a, o.f)) > num(val(b, o.f)) ? 1 : -1));
    const sa = q.cons.find((c) => c.t === 'startAfter');
    if (sa) l = l.slice(l.findIndex((d) => d.id === sa.d.id) + 1);
    const lim = q.cons.find((c) => c.t === 'limit');
    if (lim) l = l.slice(0, lim.n);
    return l;
  };
  const snap = (l, fromCache) => ({ size: l.length, metadata: { fromCache }, docs: l.map((d) => ({ id: d.id, data: () => ({ ...d.data }), get: (f) => d.data[f] })) });
  return {
    collection: (db, c) => ({ c }), query: (c, ...cons) => ({ c: c.c, cons }),
    where: (f, op, v) => ({ t: 'where', f, op, v }), orderBy: (f) => ({ t: 'orderBy', f: f === '__ID__' ? '__name__' : f }), limit: (n) => ({ t: 'limit', n }),
    startAfter: (d) => ({ t: 'startAfter', d }), documentId: () => '__ID__', Timestamp: { fromMillis: g.T },
    getDocs: async (q) => {
      const l = run(g.server, q); g.reads += Math.max(1, l.length);
      l.forEach((d) => g.cache.set(d.id, { id: d.id, data: { ...d.data } }));
      // زي Firestore: المستندات اللي اتمسحت من السيرفر بتتشال من الكاش لما الاستعلام الكامل يرجع من غيرها
      if (!q.cons.some((c) => c.t === 'limit' && l.length >= c.n)) [...g.cache.values()].filter((d) => match(d, q.cons) && !g.server.has(d.id)).forEach((d) => g.cache.delete(d.id));
      return snap(l, false);
    },
    getDocsFromCache: async (q) => snap(run(g.cache, { cons: q.cons.filter((c) => c.t === 'where') }), true),
    getCountFromServer: async (q) => { g.reads += 1; return { data: () => ({ count: run(g.server, { cons: q.cons }).length }) }; },
  };
});

import { mirrorDocs, resetMirrors } from '../../data/mirror';

const H = 3600000; const DAY = 24 * H;
const put = (id, created, upd = created, extra = {}) => server.set(id, { id, data: { createdAt: T(created), updatedAt: T(upd), ...extra } });

describe('mirror (المرايا المحلية)', () => {
  beforeEach(() => { server.clear(); cache.clear(); g.reads = 0; localStorage.clear(); resetMirrors(); vi.spyOn(Date, 'now').mockImplementation(() => now); });

  it('first load reads the range, then only new and changed docs', async () => {
    for (let i = 0; i < 50; i++) put(`t${i}`, now - (i + 1) * H);
    const a = await mirrorDocs('tickets', 'createdAt', { from: now - 10 * DAY });
    expect(a.length).toBe(50);
    const firstReads = g.reads;
    expect(firstReads).toBeGreaterThanOrEqual(50);

    g.reads = 0;
    const b = await mirrorDocs('tickets', 'createdAt', { from: now - 10 * DAY });
    expect(b.length).toBe(50); expect(g.reads).toBe(0); // خلال دقيقة: من الكاش بس

    now += 2 * 60000; put('new1', now - 1000); put('t3', now - 4 * H, now - 500, { status: 'done' });
    g.reads = 0;
    const c = await mirrorDocs('tickets', 'createdAt', { from: now - 10 * DAY });
    expect(c.length).toBe(51);
    expect(c.find((x) => x.id === 't3').status).toBe('done');
    expect(g.reads).toBeLessThanOrEqual(3); // الجديد + المتعدّل بس (مش الـ 50)
    expect(c[0].id).toBe('new1'); // مترتبين من الأحدث
  });

  it('applies extra filters and the to-date on the cached copy', async () => {
    put('a', now - DAY, now - DAY, { assignedCenter: 'x' }); put('b', now - 2 * DAY, now - 2 * DAY, { assignedCenter: 'y' }); put('c', now - 5 * DAY, now - 5 * DAY, { assignedCenter: 'x' });
    const l = await mirrorDocs('tickets', 'createdAt', { from: now - 10 * DAY, to: now - 1.5 * DAY, wheres: [['assignedCenter', '==', 'x']] });
    expect(l.map((x) => x.id)).toEqual(['c']);
  });

  it('extends to an older period by reading only the missing part', async () => {
    for (let i = 0; i < 20; i++) put(`t${i}`, now - i * DAY - H);
    await mirrorDocs('tickets', 'createdAt', { from: now - 5 * DAY });
    g.reads = 0;
    const l = await mirrorDocs('tickets', 'createdAt', { from: now - 15 * DAY });
    expect(l.length).toBe(15);
    expect(g.reads).toBe(10); // الأيام الـ 10 الناقصة بس
  });

  it('a count check after 30 minutes catches deleted docs', async () => {
    for (let i = 0; i < 5; i++) put(`t${i}`, now - (i + 1) * H);
    await mirrorDocs('tickets', 'createdAt', { from: now - DAY });
    server.delete('t2');
    now += 31 * 60000;
    const l = await mirrorDocs('tickets', 'createdAt', { from: now - DAY - 31 * 60000 });
    expect(l.map((x) => x.id)).not.toContain('t2');
  });

  it('whole-collection mirror (inventory) picks up edits via updatedAt', async () => {
    for (let i = 0; i < 30; i++) server.set(`i${i}`, { id: `i${i}`, data: { quantity: 5, warehouseId: i % 2 ? 'b1' : 'main', updatedAt: T(now - DAY) } });
    const a = await mirrorDocs('inventory', null, { wheres: [['warehouseId', '==', 'main']] });
    expect(a.length).toBe(15);
    now += 5 * 60000;
    server.set('i4', { id: 'i4', data: { quantity: 1, warehouseId: 'main', updatedAt: T(now - 1000) } });
    g.reads = 0;
    const b = await mirrorDocs('inventory', null, { wheres: [['warehouseId', '==', 'main']] });
    expect(b.find((x) => x.id === 'i4').quantity).toBe(1);
    expect(g.reads).toBe(1);
  });
});
