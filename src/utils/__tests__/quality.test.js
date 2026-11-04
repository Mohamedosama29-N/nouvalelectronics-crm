import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { agingReport, repeatRepairs, faultsByModel, faultSpikes, satisfactionOf, satisfactionSummary, centerScorecard, technicianScorecard, morningBrief, deviceKey } from '../../ai/quality';

const H = 3600000; const D = 24 * H;
const now = new Date(2026, 10, 3, 12);
const ago = (d) => new Date(now.getTime() - d * D);
const closed = (id, createdDaysAgo, hours, extra = {}) => ({
  id, ticketNumber: id, status: 'closed', priority: 'medium', assignedCenter: 'main', createdAt: ago(createdDaysAgo),
  statusHistory: [{ status: 'created', timestamp: ago(createdDaysAgo).toISOString() }, { status: 'closed', timestamp: new Date(ago(createdDaysAgo).getTime() + hours * H).toISOString() }],
  ...extra,
});

describe('quality', () => {
  it('aging buckets per center', () => {
    const r = agingReport([
      { id: 'a', status: 'received_maintenance', createdAt: ago(1), assignedCenter: 'main' },
      { id: 'b', status: 'received_maintenance', createdAt: ago(5), assignedCenter: 'main' },
      { id: 'c', status: 'waiting_spare_parts', createdAt: ago(20), assignedCenter: 'b1' },
      { id: 'd', status: 'closed', createdAt: ago(40), assignedCenter: 'b1' },
    ], { now });
    expect(r.total).toBe(3);
    expect(r.totals).toMatchObject({ b0: 1, b1: 1, b2: 0, b3: 1 });
    expect(r.rows[0].key).toBe('b1');
    expect(r.oldest[0].id).toBe('c');
  });

  it('repeat repairs by serial or phone+model, within window only', () => {
    const list = [
      closed('T1', 40, 24, { deviceSerial: 'SN12345', mainFaultCode: 'F1', assignedTechnician: 'سامي' }),
      closed('T2', 20, 24, { deviceSerial: 'sn12345', mainFaultCode: 'F1' }),
      closed('T3', 200, 24, { customerPhone: '01012345678', deviceModel: 'UA55' }),
      closed('T4', 10, 24, { customerPhone: '01012345678', deviceModel: 'UA55' }),
      closed('T5', 30, 24, { deviceSerial: '0000' }), closed('T6', 5, 24, { deviceSerial: '0000' }),
    ];
    const r = repeatRepairs(list, { windowDays: 90 });
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ sameFault: true, byserial: true });
    expect(r[0].previous.technician).toBe('سامي');
    expect(deviceKey({ deviceSerial: '0000' })).toBeNull();
  });

  it('faults by model and spikes', () => {
    const mk = (d, fault = 'باور') => ({ createdAt: ago(d), deviceModel: 'UA55', mainFaultDescription: fault });
    const list = [mk(1), mk(2), mk(3), mk(4), mk(5), mk(40), mk(10, 'ريموت')];
    const f = faultsByModel(list, { from: ago(30), to: now });
    expect(f[0]).toMatchObject({ model: 'UA55', fault: 'باور', count: 5 });
    const s = faultSpikes(list, { now, days: 30 });
    expect(s[0]).toMatchObject({ fault: 'باور', count: 5, previous: 1 });
    expect(faultSpikes([mk(1), mk(2), mk(40), mk(41), mk(42)], { now, days: 30 })).toEqual([]);
  });

  it('satisfaction from customer rating (1-5) or followup (1-10)', () => {
    expect(satisfactionOf({ customerRating: { accessibility: 5, maintenanceTime: 4, centerDealing: 5, deliveryProcedures: 4 } }).score).toBe(9);
    expect(satisfactionOf({ followUp: { accessibility: 6, maintenanceTime: 0, centerDealing: 8, deliveryProcedures: 7 } }).score).toBe(7);
    expect(satisfactionOf({ followUp: { accessibility: 0 } })).toBeNull();
    const s = satisfactionSummary([
      { followUp: { accessibility: 10, maintenanceTime: 10, centerDealing: 10, deliveryProcedures: 10, repurchase: 'yes' } },
      { followUp: { accessibility: 4, maintenanceTime: 4, centerDealing: 4, deliveryProcedures: 4, repurchase: 'no' } },
      { followUp: { accessibility: 8, maintenanceTime: 8, centerDealing: 8, deliveryProcedures: 8 } }, {},
    ]);
    expect(s).toMatchObject({ count: 3, nps: 0, repurchase: 0.5 });
    expect(s.csat).toBeCloseTo(2 / 3);
  });

  it('center and technician scorecards rank by sla/speed/quality/satisfaction', () => {
    const list = [
      closed('A', 10, 10, { assignedCenter: 'main', assignedTechnician: 'سامي', totalCost: 300 }),
      closed('B', 10, 12, { assignedCenter: 'main', assignedTechnician: 'سامي', totalCost: 200 }),
      closed('C', 10, 80, { assignedCenter: 'b1', assignedTechnician: 'علي' }),
      closed('D', 10, 90, { assignedCenter: 'b1', assignedTechnician: 'علي' }),
    ];
    const opts = { from: ago(30), to: now, openTickets: [{ status: 'received_maintenance', assignedCenter: 'b1', createdAt: ago(5) }] };
    const c = centerScorecard(list, opts);
    expect(c[0].key).toBe('main');
    expect(c[0].slaRate).toBe(1);
    expect(c.find((r) => r.key === 'b1')).toMatchObject({ open: 1, overdueOpen: 1, slaRate: 0 });
    const t = technicianScorecard(list, opts);
    expect(t[0]).toMatchObject({ key: 'سامي', completed: 2, revenue: 500 });
  });

  it('morning brief', () => {
    const list = [closed('A', 1.2, 5), { id: 'o', status: 'received_maintenance', createdAt: ago(1.1) }];
    const b = morningBrief({ tickets: list, transactions: [{ type: 'sell', finalTotal: 1000, timestamp: ago(0.8) }], overdueCount: 1, atRiskCount: 2, now });
    expect(b.stats).toMatchObject({ created: 2, delivered: 1, sales: 1, open: 1 });
    expect(b.lines.map((l) => l.text).join(' ')).toContain('1,000');
  });
});
