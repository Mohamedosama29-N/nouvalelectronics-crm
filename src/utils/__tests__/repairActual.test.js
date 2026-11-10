import { describe, it, expect } from 'vitest';
import { analyzeTicket, buildRepairTimeReport } from '../../ai/repairTime';

const H = 3600000; const t0 = new Date('2026-10-01T09:00:00Z');
const at = (h) => new Date(t0.getTime() + h * H).toISOString();
describe('وقت الصيانة الفعلي', () => {
  it('measures from creation to the first «تمت الصيانة», not delivery', () => {
    const t = { id: 'a', createdAt: t0, status: 'delivered_to_customer', statusHistory: [
      { status: 'received_maintenance', timestamp: at(1) }, { status: 'maintenance_done', timestamp: at(30) },
      { status: 'financial_reviewed', timestamp: at(32) }, { status: 'technical_reviewed', timestamp: at(33) }, { status: 'delivered_to_customer', timestamp: at(80) }] };
    const a = analyzeTicket(t);
    expect(a.repair).toBe(30 * H);
    expect(a.total).toBe(80 * H);
  });
  it('counts tickets repaired but not delivered yet', () => {
    const t = { id: 'b', createdAt: t0, status: 'financial_reviewed', statusHistory: [{ status: 'maintenance_done', timestamp: at(10) }, { status: 'financial_reviewed', timestamp: at(12) }] };
    const rep = buildRepairTimeReport([t], { from: new Date('2026-09-01'), to: new Date('2026-11-01') });
    expect(rep.repairCount).toBe(1);
    expect(rep.repair.avg).toBe(10 * H);
    expect(rep.count).toBe(0);
  });
  it('factory repair counts too', () => {
    const t = { id: 'c', createdAt: t0, status: 'sent_from_factory', statusHistory: [{ status: 'sent_to_factory', timestamp: at(5) }, { status: 'factory_maintenance_done', timestamp: at(100) }] };
    expect(analyzeTicket(t).repair).toBe(100 * H);
  });
});
