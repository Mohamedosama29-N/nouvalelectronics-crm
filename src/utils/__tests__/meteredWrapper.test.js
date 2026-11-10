// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
const g = vi.hoisted(() => ({ calls: [], fail: null, cacheSnap: { size: 2, docs: [1, 2], metadata: { fromCache: true } } }));
vi.mock('@firebase/firestore', () => ({
  serverTimestamp: () => 'TS',
  updateDoc: async (...a) => { g.calls.push(['update', ...a]); },
  setDoc: async (...a) => { g.calls.push(['set', ...a]); },
  addDoc: async (...a) => { g.calls.push(['add', ...a]); return { id: 'n' }; },
  getDocs: async () => { if (g.fail) throw g.fail; return { size: 1, docs: [1], metadata: { fromCache: false } }; },
  getDocsFromCache: async () => g.cacheSnap,
}));
import { updateDoc, setDoc, addDoc, getDocs } from '../../firebase/firestoreMetered';
import { clearExhausted, quotaStatus } from '../quotaGuard';

const ref = (path) => ({ path, _key: { path: { segments: path.split('/') } } });
describe('firestoreMetered', () => {
  beforeEach(() => { g.calls.length = 0; g.fail = null; clearExhausted(); });
  it('stamps updatedAt on synced collections only, and never overrides it', async () => {
    await updateDoc(ref('tickets/t1'), { status: 'done' });
    await updateDoc(ref('notifications/n1'), { read: true });
    await setDoc(ref('inventory/i1'), { quantity: 2, updatedAt: 'MINE' }, { merge: true });
    await addDoc({ id: 'transactions' }, { total: 5 });
    expect(g.calls[0][2]).toEqual({ status: 'done', updatedAt: 'TS' });
    expect(g.calls[1][2]).toEqual({ read: true });
    expect(g.calls[2][2]).toEqual({ quantity: 2, updatedAt: 'MINE' });
    expect(g.calls[2][3]).toEqual({ merge: true });
    expect(g.calls[3][2]).toEqual({ total: 5, updatedAt: 'TS' });
  });
  it('falls back to the device cache when the daily quota is exhausted', async () => {
    g.fail = Object.assign(new Error('Quota exceeded'), { code: 'resource-exhausted' });
    const r = await getDocs({});
    expect(r.size).toBe(2);
    expect(quotaStatus().exhausted).toBe(true);
  });
  it('still throws other errors', async () => {
    g.fail = Object.assign(new Error('nope'), { code: 'permission-denied' });
    await expect(getDocs({})).rejects.toThrow('nope');
  });
});
