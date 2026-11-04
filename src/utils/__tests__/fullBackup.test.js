import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {} }));
import { serialize, backupDue } from '../fullBackup';
import { hasPerm, discountCheck, workHoursCheck, canSeeCost } from '../permissions';

describe('backup', () => {
  it('serializes timestamps and geo points', () => {
    expect(serialize({ a: { toDate: () => new Date('2026-01-02T00:00:00Z') }, g: { latitude: 30, longitude: 31 }, l: [1, null] })).toEqual({ a: { __ts: '2026-01-02T00:00:00.000Z' }, g: { __geo: [30, 31] }, l: [1, null] });
  });
  it('reminder after N days', () => {
    const now = new Date('2026-11-10T10:00:00Z');
    expect(backupDue({}, now)).toMatchObject({ due: true, days: null });
    expect(backupDue({ backupInfo: { lastAt: '2026-11-08T10:00:00Z' } }, now)).toMatchObject({ due: false, days: 2 });
    expect(backupDue({ backupReminderDays: 1, backupInfo: { lastAt: { toDate: () => new Date('2026-11-08T10:00:00Z') } } }, now)).toMatchObject({ due: true, days: 2 });
  });
});

describe('finer permissions', () => {
  it('opt-out vs opt-in keys', () => {
    expect(hasPerm({ permissions: {} }, 'exportData')).toBe(true);
    expect(hasPerm({ permissions: { exportData: false } }, 'exportData')).toBe(false);
    expect(hasPerm({ permissions: {} }, 'viewMargins')).toBe(false);
    expect(hasPerm({ role: 'admin', permissions: { exportData: false } }, 'exportData')).toBe(true);
    expect(canSeeCost({ role: 'cashier', permissions: {} })).toBe(false);
    expect(canSeeCost({ role: 'main_warehouse_manager' })).toBe(true);
  });
  it('discount limit', () => {
    expect(discountCheck({ limits: { maxDiscountPercent: 10 } }, 1000, 150)).toMatchObject({ ok: false, max: 10, pct: 15 });
    expect(discountCheck({ limits: { maxDiscountPercent: 10 } }, 1000, 100).ok).toBe(true);
    expect(discountCheck({ limits: {} }, 1000, 900).ok).toBe(true);
    expect(discountCheck({ limits: { maxDiscountPercent: '' } }, 1000, 900).ok).toBe(true);
    expect(discountCheck({ role: 'admin', limits: { maxDiscountPercent: 0 } }, 1000, 900).ok).toBe(true);
    expect(discountCheck({ limits: { maxDiscountPercent: 0 } }, 1000, 1).ok).toBe(false);
  });
  it('work hours incl. overnight', () => {
    const at = (h, m = 0) => new Date(2026, 10, 3, h, m);
    expect(workHoursCheck({ limits: { workFrom: '09:00', workTo: '17:00' } }, at(8, 59)).ok).toBe(false);
    expect(workHoursCheck({ limits: { workFrom: '09:00', workTo: '17:00' } }, at(12)).ok).toBe(true);
    expect(workHoursCheck({ limits: { workFrom: '22:00', workTo: '06:00' } }, at(2)).ok).toBe(true);
    expect(workHoursCheck({ limits: { workFrom: '22:00', workTo: '06:00' } }, at(12)).ok).toBe(false);
    expect(workHoursCheck({ limits: {} }, at(3)).ok).toBe(true);
  });
});
