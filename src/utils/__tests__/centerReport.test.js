import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {} }));
import { buildCentersMonthlyReport, buildCentersReportHtml, monthRange } from '../../ai/centerReport';

const d = (day, h = 10) => new Date(2026, 9, day, h);
const iso = (x) => x.toISOString();
describe('centers monthly report', () => {
  it('aggregates performance, dues, payments and claims per center', () => {
    const tickets = [
      { id: '1', ticketNumber: 'T1', assignedMaintenanceCenter: 'مركز أ', warrantyStatus: 'in_warranty', device: 'غسالة', mainFaultDescription: 'موتور', priority: 'medium', createdAt: d(2), status: 'delivered_to_customer', statusHistory: [{ status: 'delivered_to_customer', timestamp: iso(d(3)) }] },
      { id: '2', ticketNumber: 'T2', assignedMaintenanceCenter: 'مركز أ', warrantyStatus: 'out_of_warranty', device: 'شاشة', mainFaultDescription: 'موتور', priority: 'medium', createdAt: d(5), status: 'delivered_to_customer', statusHistory: [{ status: 'delivered_to_customer', timestamp: iso(d(9)) }] },
      { id: '3', ticketNumber: 'T3', assignedMaintenanceCenter: 'مركز ب', device: 'تكييف', priority: 'medium', createdAt: d(10), status: 'received_maintenance' },
    ];
    const rep = buildCentersMonthlyReport({
      month: '2026-10', tickets, openTickets: [tickets[2]],
      claims: [{ center: 'مركز أ', createdAt: d(4), partsCost: 300, laborCost: 100, status: 'approved', approvedAmount: 350 }],
      settlements: [{ center: 'مركز أ', amount: 50 }],
      centers: [{ name: 'مركز أ', rate: 150 }, { name: 'مركز ب', rate: 100 }, { name: 'مركز ج', rate: 1 }],
    });
    const a = rep.rows.find((r) => r.name === 'مركز أ');
    expect(a).toMatchObject({ created: 2, completed: 2, dueCount: 1, dueAmount: 150, paid: 50, balance: 100, claims: 1, claimsAmount: 400, claimsApproved: 350 });
    expect(a.topFaults[0]).toEqual(['موتور', 2]);
    expect(rep.rows.find((r) => r.name === 'مركز ب')).toMatchObject({ open: 1, created: 1 });
    expect(rep.rows.find((r) => r.name === 'مركز ج')).toBeUndefined(); // مالوش شغل
    expect(rep.totals).toMatchObject({ created: 3, completed: 2, due: 150, paid: 50 });
    const html = buildCentersReportHtml(rep, { company: 'نوفال' });
    expect(html).toContain('مركز أ');
    expect((html.match(/class="pg"/g) || []).length).toBe(2);
    expect(monthRange('2026-12').to.getMonth()).toBe(0);
  });
});
