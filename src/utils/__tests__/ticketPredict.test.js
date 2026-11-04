import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { classifyFaults, analyzePool, predictDuration, predictPartsAndCost, suggestTechnicians, qualityCheck, riskOf, expectedByType } from '../../ai/ticketPredict';

const H = 3600000; const D = 24 * H;
const base = new Date(2026, 9, 1, 10).getTime();
const done = (id, { hours = 24, model = 'UA55', fault = 'F1', faultDesc = 'باور سبلاي', issue = 'الشاشة مش بتنور', tech = 'سامي', parts = ['بورد باور'], cost = 500, device = 'شاشة' } = {}) => ({
  id, ticketNumber: id, device, deviceModel: model, mainFaultCode: fault, mainFaultDescription: faultDesc, issue, assignedTechnician: tech,
  spareParts: parts.map((name) => ({ name })), totalCost: cost, status: 'delivered_to_customer', priority: 'medium',
  createdAt: new Date(base), statusHistory: [{ status: 'created', timestamp: new Date(base).toISOString() }, { status: 'delivered_to_customer', timestamp: new Date(base + hours * H).toISOString() }],
});
const pool = [
  done('A', { hours: 20 }), done('B', { hours: 30 }), done('C', { hours: 40, tech: 'علي' }), done('D', { hours: 50, tech: 'علي' }),
  done('E', { fault: 'F2', faultDesc: 'باك لايت', issue: 'صوت من غير صورة', parts: ['ليد'], hours: 72, cost: 900 }),
  done('F', { device: 'غسالة', model: 'WM7', fault: 'W1', faultDesc: 'موتور', issue: 'مش بتعصر', parts: ['موتور'], hours: 100, tech: 'حسن' }),
];
const faults = [{ id: 'f1', code: 'F1', description: 'عطل باور سبلاي الشاشة مش بتنور' }, { id: 'f2', code: 'F2', description: 'باك لايت صوت بدون صورة' }, { id: 'f3', code: 'F3', description: 'ريموت' }];

describe('ticket predictions', () => {
  it('classifies faults from text and history', () => {
    const r = classifyFaults({ device: 'شاشة', deviceModel: 'UA55', issue: 'الشاشة مش بتنور خالص' }, faults, pool);
    expect(r[0].code).toBe('F1');
    expect(r[0].confidence).toBeGreaterThan(0.4);
    const r2 = classifyFaults({ device: 'شاشة', deviceModel: 'UA55', issue: 'فيه صوت بس من غير صورة' }, faults, pool);
    expect(r2[0].code).toBe('F2');
    expect(classifyFaults({ issue: 'x' }, [], pool)).toEqual([]);
  });

  it('predicts duration with fallback levels', () => {
    const an = analyzePool(pool);
    const p = predictDuration({ device: 'شاشة', deviceModel: 'UA55', mainFaultCode: 'F1' }, an);
    expect(p.basis).toBe('نفس الموديل ونفس العطل');
    expect(p.count).toBe(4);
    expect(p.median).toBe(35 * H);
    expect(predictDuration({ device: 'غسالة', deviceModel: 'X' }, an).basis).toBe('كل التذاكر');
    expect(predictDuration({}, [])).toBeNull();
  });

  it('predicts parts and cost', () => {
    const r = predictPartsAndCost({ device: 'شاشة', deviceModel: 'UA55', issue: 'الشاشة مش بتنور' }, pool);
    expect(r.parts[0].name).toBe('بورد باور');
    expect(r.cost.median).toBe(500);
  });

  it('suggests technicians by experience, speed and load', () => {
    const an = analyzePool(pool);
    const s = suggestTechnicians({ device: 'شاشة', deviceModel: 'UA55' }, an, [{ assignedTechnician: 'علي' }, { assignedTechnician: 'علي' }], ['سامي', 'علي', 'حسن']);
    expect(s[0].name).toBe('سامي');
    expect(s.find((x) => x.name === 'علي').reasons.join(' ')).toContain('2 تذكرة مفتوحة');
  });

  it('quality check finds missing/invalid/expired/duplicates', () => {
    const now = new Date(2026, 10, 3);
    const q = qualityCheck({ customerName: '', customerPhone: '0123', issue: 'خربان', device: 'شاشة', warrantyStatus: 'in_warranty', warrantyPeriod: '1_year', invoiceDate: '2024-01-01' },
      { openForPhone: [{ id: 't1', ticketNumber: 'TKT-1', device: 'شاشة سامسونج', status: 'received_maintenance' }], now });
    const txt = q.map((x) => x.text).join(' | ');
    expect(q[0].level).toBe('error');
    expect(txt).toContain('اسم العميل');
    expect(txt).toContain('مش مصري');
    expect(txt).toContain('قصير');
    expect(txt).toContain('الضمان انتهى');
    expect(txt).toContain('TKT-1');
    expect(qualityCheck({ customerName: 'محمد', customerPhone: '01012345678', device: 'شاشة', issue: 'الشاشة مش بتنور خالص من امبارح' }, { now })).toEqual([]);
  });

  it('risk levels for open tickets', () => {
    const now = new Date(base + 20 * H);
    expect(riskOf({ status: 'received_maintenance', priority: 'medium', createdAt: new Date(base) }, { now }).level).toBe('high');
    expect(riskOf({ status: 'received_maintenance', priority: 'medium', createdAt: new Date(base) }, { now: new Date(base + 30 * H) }).level).toBe('overdue');
    expect(riskOf({ status: 'received_maintenance', priority: 'low', createdAt: new Date(base) }, { now: new Date(base + 2 * H) }).level).toBe('low');
    expect(riskOf({ status: 'received_maintenance', priority: 'low', createdAt: new Date(base) }, { now: new Date(base + 2 * H), expectedMs: 100 * H }).level).toBe('high');
    expect(riskOf({ status: 'closed', createdAt: new Date(base) }, { now })).toBeNull();
    const exp = expectedByType(analyzePool(pool));
    expect(exp({ device: 'شاشة' })).toBeGreaterThan(0);
  });
});
