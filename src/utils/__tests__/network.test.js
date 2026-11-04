import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { centersFromSettings, suggestCenters, timeByCenter, centerDues, canMovePart, claimFromTicket, claimTotals, warrantyStatus, contractInfo } from '../../ai/network';

const H = 3600000; const D = 24 * H;
const now = new Date(2026, 10, 3, 12);
const ago = (d) => new Date(now.getTime() - d * D);

describe('network', () => {
  const centers = centersFromSettings({ maintenanceCenters: [
    { name: 'مركز الجيزة', governorates: 'الجيزة، 6 أكتوبر', devices: 'شاشة, غسالة', capacity: 10, rate: 150, deviceRates: { 'شاشة': 200 } },
    { name: 'مركز القاهرة', governorates: ['القاهرة'], capacity: 2 }, 'مركز عام',
  ] });
  it('parses centers config', () => {
    expect(centers[0].governorates).toEqual(['الجيزة', '6 أكتوبر']);
    expect(centers[2]).toMatchObject({ name: 'مركز عام', governorates: [] });
  });
  it('suggests center by governorate, specialty and load', () => {
    const open = [{ assignedMaintenanceCenter: 'مركز القاهرة', status: 'received_maintenance' }, { assignedMaintenanceCenter: 'مركز القاهرة', status: 'received_maintenance' }];
    const s = suggestCenters({ governorate: 'الجيزة', device: 'شاشة سامسونج' }, centers, open);
    expect(s[0].name).toBe('مركز الجيزة');
    const s2 = suggestCenters({ governorate: 'القاهرة', device: 'تكييف' }, centers, open);
    expect(s2.find((x) => x.name === 'مركز القاهرة').reasons.join(' ')).toContain('وصل لطاقته');
  });
  it('time by center from transfer history', () => {
    const t = { createdAt: ago(10), assignedMaintenanceCenter: 'B', centerHistory: [{ from: 'A', to: 'B', at: ago(6).toISOString() }],
      statusHistory: [{ status: 'created', timestamp: ago(10).toISOString() }, { status: 'closed', timestamp: ago(2).toISOString() }] };
    const r = Object.fromEntries(timeByCenter(t, now).map((x) => [x.center, Math.round(x.ms / D)]));
    expect(r).toEqual({ A: 4, B: 4 });
  });
  it('center dues for in-warranty repairs with device rates', () => {
    const mk = (id, device, center, w = 'in_warranty') => ({ id, ticketNumber: id, device, assignedMaintenanceCenter: center, warrantyStatus: w, status: 'closed', createdAt: ago(5),
      statusHistory: [{ status: 'created', timestamp: ago(5).toISOString() }, { status: 'closed', timestamp: ago(3).toISOString() }] });
    const d = centerDues([mk('1', 'شاشة', 'مركز الجيزة'), mk('2', 'غسالة', 'مركز الجيزة'), mk('3', 'شاشة', 'مركز الجيزة', 'out_of_warranty'), mk('4', 'شاشة', 'مركز القاهرة')], centers, { from: ago(30), to: now });
    expect(d[0]).toMatchObject({ center: 'مركز الجيزة', count: 2, amount: 350 });
    expect(d[1]).toMatchObject({ center: 'مركز القاهرة', missingRate: true });
  });
  it('part request flow and claims', () => {
    expect(canMovePart('pending', 'approved')).toBe(true);
    expect(canMovePart('pending', 'received')).toBe(false);
    const c = claimFromTicket({ id: 't', ticketNumber: 'T', device: 'شاشة', deviceModel: 'UA55', assignedMaintenanceCenter: 'مركز الجيزة', mainFaultCode: 'F1', spareParts: [{ name: 'بورد', price: 300, quantity: 2 }] }, centers);
    expect(c).toMatchObject({ partsCost: 600, laborCost: 150, fault: 'F1', status: 'draft' });
    expect(claimTotals([{ status: 'submitted', partsCost: 100, laborCost: 50 }, { status: 'paid', approvedAmount: 70 }])).toMatchObject({ pending: 1, pendingAmount: 150, paidAmount: 70 });
  });
  it('warranty status and contracts', () => {
    expect(warrantyStatus({ purchaseDate: '2026-01-01', months: 12 }, now)).toMatchObject({ known: true, active: true });
    expect(warrantyStatus({ endDate: '2026-10-01' }, now).active).toBe(false);
    expect(warrantyStatus({}, now).known).toBe(false);
    const c = contractInfo({ startDate: '2026-05-01', endDate: '2026-11-20', visitsPerYear: 2, visits: [] }, now);
    expect(c.status).toBe('expiring');
    expect(c.nextVisit.getMonth()).toBe(10); // نوفمبر
    expect(c.visitDue).toBe(true);
  });
});
