import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ addDoc: vi.fn(), collection: vi.fn(), deleteField: () => '__del__', doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: () => ({ _methodName: 'serverTimestamp' }), updateDoc: vi.fn() }));
import { diffFields, revertPlan, plain } from '../audit';

describe('audit trail', () => {
  it('diffs only real changes, skips sentinels and noise', () => {
    const d = diffFields({ price: 100, name: 'A', tags: ['x'], updatedAt: 1 }, { price: 120, name: 'A', tags: ['x'], updatedAt: { _methodName: 'serverTimestamp' }, cost: 50 });
    expect(d.map((c) => c.field)).toEqual(['price', 'cost']);
    expect(d[0]).toMatchObject({ before: 100, after: 120, hadField: true });
    expect(d[1]).toMatchObject({ before: null, after: 50, hadField: false });
  });
  it('marks huge values as non-revertible', () => {
    const d = diffFields({ invoiceLogo: 'a'.repeat(5000) }, { invoiceLogo: 'b'.repeat(5000) });
    expect(d[0].big).toBe(true);
    expect(revertPlan({ changes: d }, {}).conflicts[0].locked).toBe(true);
  });
  it('detects conflicts when the field changed since', () => {
    const entry = { changes: [{ field: 'price', before: 100, after: 120 }, { field: 'quantity', before: 5, after: 8 }] };
    const p = revertPlan(entry, { price: 120, quantity: 6 });
    expect(p.ok.map((c) => c.field)).toEqual(['price']);
    expect(p.conflicts[0]).toMatchObject({ field: 'quantity', now: 6 });
  });
  it('plain() normalizes timestamps', () => {
    expect(plain({ a: { toDate: () => new Date('2026-01-01T00:00:00Z') }, b: undefined })).toEqual({ a: '2026-01-01T00:00:00.000Z', b: null });
  });
});
