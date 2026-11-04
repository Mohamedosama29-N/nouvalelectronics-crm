import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {} }));
import { canonicalGov, governorateStats, GOV_TILES } from '../../ai/geo';
import { EGYPT_GOVERNORATES } from '../../constants/misc';

const now = new Date(2026, 10, 3, 12); const D = 86400000;
describe('governorate map', () => {
  it('covers all 27 governorates and aliases', () => {
    EGYPT_GOVERNORATES.forEach((g) => expect(GOV_TILES[g]).toBeTruthy());
    expect(canonicalGov('اسكندرية')).toBe('الإسكندرية');
    expect(canonicalGov('جيزه')).toBe('الجيزة');
    expect(canonicalGov('6 أكتوبر')).toBe('الجيزة');
    expect(canonicalGov('xyz')).toBe(null);
  });
  it('aggregates open/overdue/volume/coverage', () => {
    const { list, unknown } = governorateStats([
      { governorate: 'الجيزة', status: 'received_maintenance', priority: 'medium', createdAt: new Date(now - 2 * D) },
      { governorate: 'جيزة', status: 'received_maintenance', priority: 'medium', createdAt: new Date(now - 3600000) },
      { governorate: 'أسوان', status: 'delivered_to_customer', createdAt: new Date(now - 5 * D), statusHistory: [{ status: 'delivered_to_customer', timestamp: new Date(now - 3 * D).toISOString() }] },
      { governorate: '' },
    ], { centers: [{ name: 'مركز الجيزة', governorates: ['الجيزة'] }], now });
    const giza = list.find((r) => r.gov === 'الجيزة');
    expect(giza).toMatchObject({ open: 2, overdue: 1, volume: 2, uncovered: false });
    expect(list.find((r) => r.gov === 'أسوان')).toMatchObject({ volume: 1, uncovered: true });
    expect(list.find((r) => r.gov === 'أسوان').avgDays).toBeCloseTo(2, 0);
    expect(unknown).toBe(1);
  });
});
