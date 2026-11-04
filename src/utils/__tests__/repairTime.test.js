import { describe, it, expect } from 'vitest';
import { analyzeTicket, buildRepairTimeReport, summarize, formatDuration, repairInsights } from '../../ai/repairTime';

const H = 3600000; const D = 24 * H;
const base = new Date(2026, 9, 1, 10).getTime();
const at = (h) => new Date(base + h * H).toISOString();
const tk = (id, hist, extra = {}) => ({ id, ticketNumber: id, createdAt: new Date(base), statusHistory: [{ status: 'created', timestamp: at(0) }, ...hist.map(([s, h]) => ({ status: s, timestamp: at(h) }))], assignedCenter: 'main', ...extra });

describe('repair time', () => {
  it('splits time into work / customer wait / parts wait', () => {
    const r = analyzeTicket(tk('A', [
      ['received_maintenance', 2], ['waiting_customer_approval_cost', 10], ['customer_approved_cost', 34],
      ['waiting_spare_parts', 40], ['maintenance_after_approval', 88], ['contacted_customer', 100], ['delivered_to_customer', 124],
    ]));
    expect(r.total).toBe(124 * H);
    expect(r.waitCustomer).toBe((34 - 10 + 124 - 100) * H);
    expect(r.waitParts).toBe(48 * H);
    expect(r.net).toBe((124 - 48 - 48) * H);
    expect(r.toReady).toBe(100 * H);
    expect(r.estimated).toBe(false);
  });
  it('open tickets are ignored, rejected are not counted as repaired, old tickets estimated', () => {
    expect(analyzeTicket(tk('O', [['received_maintenance', 2]]))).toBeNull();
    expect(analyzeTicket(tk('R', [['rejected_by_customer', 20]])).outcome).toBe('not_repaired');
    const old = analyzeTicket({ id: 'X', createdAt: new Date(base), status: 'closed', deliveryDate: '2026-10-03', deliveryTime: '10:00' });
    expect(old.estimated).toBe(true);
    expect(old.total).toBe(2 * D);
  });
  it('report: period filter by completion date, sla rate, groups, weekly', () => {
    const list = [
      tk('A', [['delivered_to_customer', 20]], { priority: 'medium', assignedTechnician: 'سامي' }),
      tk('B', [['delivered_to_customer', 48]], { priority: 'medium', assignedTechnician: 'سامي' }),
      tk('C', [['closed', 10]], { priority: 'high', assignedTechnician: 'علي' }),
      tk('Z', [['delivered_to_customer', 24 * 40]]), // اتسلمت برا الفترة
      tk('R', [['rejected_by_customer', 5]]),
    ];
    const rep = buildRepairTimeReport(list, { from: new Date(base), to: new Date(base + 10 * D), slaHours: { high: 4, medium: 24, low: 72 } });
    expect(rep.count).toBe(3);
    expect(rep.notRepaired).toBe(1);
    expect(rep.total.avg).toBe(26 * H);
    expect(rep.slaRate).toBeCloseTo(1 / 3);
    expect(rep.byTechnician.find((t) => t.key === 'سامي').count).toBe(2);
    expect(rep.slowest[0].id).toBe('B');
    expect(rep.weekly.reduce((s, w) => s + w.count, 0)).toBe(3);
  });
  it('scope filter for branch users', () => {
    const list = [tk('A', [['closed', 5]], { assignedCenter: 'b1' }), tk('B', [['closed', 5]], { assignedCenter: 'main' })];
    const rep = buildRepairTimeReport(list, { from: new Date(base), to: new Date(base + D), scope: (c) => c === 'b1' });
    expect(rep.count).toBe(1);
  });
  it('summaries and formatting', () => {
    expect(summarize([1, 2, 3, 4, 100])).toMatchObject({ count: 5, median: 3, min: 1, max: 100 });
    expect(summarize([]).count).toBe(0);
    expect(formatDuration(26 * H)).toBe('1 يوم و 2 ساعة');
    expect(formatDuration(5 * H)).toBe('5 ساعة');
    expect(formatDuration(0)).toBe('0 ساعة');
  });
  it('insights point to the bottleneck', () => {
    const list = [1, 2, 3].map((i) => tk(`P${i}`, [['waiting_spare_parts', 1], ['received_maintenance', 60], ['closed', 62]]));
    const rep = buildRepairTimeReport(list, { from: new Date(base), to: new Date(base + 10 * D) });
    expect(repairInsights(rep).map((x) => x.text).join(' ')).toContain('انتظار قطع الغيار');
  });
});
