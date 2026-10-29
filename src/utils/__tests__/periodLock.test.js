import { describe, it, expect } from 'vitest';
import { isDateLocked, parseLockDate } from '../periodLock';

describe('periodLock', () => {
  it('no lock date means nothing is locked', () => {
    expect(isDateLocked(new Date('2020-01-01'), '')).toBe(false);
    expect(isDateLocked(new Date('2020-01-01'), undefined)).toBe(false);
  });
  it('ignores malformed lock dates', () => {
    expect(parseLockDate('31/12/2025')).toBeNull();
    expect(isDateLocked(new Date('2020-01-01'), 'garbage')).toBe(false);
  });
  it('locks records on or before the lock day (inclusive of whole day)', () => {
    expect(isDateLocked(new Date(2025, 11, 31, 23, 0), '2025-12-31')).toBe(true);
    expect(isDateLocked(new Date(2025, 5, 1), '2025-12-31')).toBe(true);
  });
  it('does not lock records after the lock day', () => {
    expect(isDateLocked(new Date(2026, 0, 1, 0, 0, 1), '2025-12-31')).toBe(false);
  });
  it('supports Firestore-like timestamps and unreadable dates', () => {
    expect(isDateLocked({ toDate: () => new Date(2025, 0, 1) }, '2025-12-31')).toBe(true);
    expect(isDateLocked(null, '2025-12-31')).toBe(false);
  });
});
