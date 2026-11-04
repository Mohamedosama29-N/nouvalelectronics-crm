import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { expandQuery, semanticSearch, mineSolutions, articleFromTicket, sentimentOf, customerMood, fraudSignals, buildWarrantyMaps, fraudScan, forecastTicketVolume } from '../../ai/insights';

const DAY = 86400000;
const now = new Date(2026, 10, 3, 12);
describe('semantic search', () => {
  it('expands colloquial synonyms', () => {
    const { weights } = expandQuery('التلاجة مبتبردش');
    expect(weights.get('كمبروسر')).toBeGreaterThan(0);
    expect(weights.get('فريون')).toBeGreaterThan(0);
  });
  it('finds tickets by meaning, not exact words', () => {
    const docs = [
      { id: 1, device: 'ثلاجة', issue: 'الكمبروسر مش بيشتغل والفريزر سخن' },
      { id: 2, device: 'غسالة', issue: 'مش بتعصر والسير مقطوع' },
      { id: 3, device: 'شاشة', issue: 'خطوط في الشاشة' },
    ];
    const r = semanticSearch('التلاجة مبتبردش', docs);
    expect(r[0].doc.id).toBe(1);
    expect(semanticSearch('الحلة مبتلفش', docs)[0].doc.id).toBe(2);
  });
});

describe('knowledge base', () => {
  it('mines recurring solved faults', () => {
    const pool = Array.from({ length: 4 }, (_, i) => ({ ticketNumber: `T${i}`, status: 'delivered_to_customer', device: 'غسالة LG', deviceModel: 'WM7', mainFaultCode: 'W1', mainFaultDescription: 'عطل موتور', issue: 'مش بتعصر', spareParts: [{ name: 'موتور' }], totalCost: 700 + i * 10 }));
    pool.push({ status: 'received_maintenance', device: 'غسالة', mainFaultCode: 'W1' });
    const s = mineSolutions(pool);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ count: 4, faultCode: 'W1', medianCost: 715 });
    expect(s[0].parts[0].name).toBe('موتور');
    expect(mineSolutions(pool, { existing: [{ device: 'غسالة', faultCode: 'W1' }] })).toHaveLength(0);
    expect(articleFromTicket({ ...pool[0], notes: 'فك الموتور\nغير الكربون' }).steps).toEqual(['فك الموتور', 'غير الكربون']);
  });
});

describe('sentiment & mood', () => {
  it('egyptian sentiment with negation and escalation', () => {
    expect(sentimentOf('شكرا جدا الخدمة ممتازة').label).toBe('happy');
    expect(sentimentOf('الخدمة مش كويسة واتأخرتوا').label).toBe('unhappy');
    const a = sentimentOf('ده نصب وهشتكي لجهاز حماية المستهلك!!');
    expect(a.label).toBe('angry');
    expect(a.escalate).toBe(true);
    expect(sentimentOf('').label).toBe('neutral');
  });
  it('customer mood combines logs, ratings, overdue', () => {
    const m = customerMood({ now, logs: [{ outcome: 'complaint', note: 'مستني من أسبوعين ومحدش بيرد', at: new Date(now - DAY) }], tickets: [{ ticketNumber: 'T1', status: 'received_maintenance', createdAt: new Date(now - 15 * DAY) }] });
    expect(['angry', 'unhappy']).toContain(m.label);
    expect(m.reasons.join(' ')).toContain('شكوى');
    expect(customerMood({ now, logs: [{ outcome: 'info', note: 'متشكر جدا ربنا يخليك', at: now }] }).label).toBe('happy');
  });
});

describe('warranty fraud', () => {
  const maps = buildWarrantyMaps([{ timestamp: new Date(2025, 0, 1), items: [{ serialNumber: 'SN-1234', warrantyEndDate: '2026-01-01' }] }], [{ serial: 'reg9999', purchaseDate: '2026-06-01', months: 12 }]);
  it('flags expired warranty, wrong invoice date, unknown serial', () => {
    const r = fraudSignals({ id: 'a', warrantyStatus: 'in_warranty', deviceSerial: 'sn 1234', invoiceDate: '2026-05-01', createdAt: now, device: 'غسالة' }, { ...maps, now });
    expect(r.level).toBe('high');
    expect(r.signals.map((s) => s.label).join('|')).toMatch(/انتهى/);
    expect(r.signals.map((s) => s.label).join('|')).toMatch(/مختلف/);
    expect(fraudSignals({ warrantyStatus: 'in_warranty', deviceSerial: 'zzzz9', createdAt: now }, { ...maps, now }).signals[0].label).toMatch(/مش لاقيينه/);
    expect(fraudSignals({ warrantyStatus: 'out_of_warranty' }).score).toBe(0);
    expect(fraudSignals({ warrantyStatus: 'in_warranty', deviceSerial: 'reg9999', invoiceDate: '2026-06-01', createdAt: now }, { ...maps, now }).level).toBe('low');
  });
  it('scan flags repeated serial on different device and damage', () => {
    const pool = [
      { id: '1', warrantyStatus: 'in_warranty', deviceSerial: 'reg9999', device: 'تلاجة', createdAt: now, aiDamage: [{ physicalDamage: true, summary: 'كسر' }] },
      { id: '2', warrantyStatus: 'in_warranty', deviceSerial: 'reg9999', device: 'غسالة', createdAt: new Date(now - 10 * DAY) },
    ];
    const s = fraudScan(pool, { ...maps, now });
    expect(s[0].ticket.id).toBe('1');
    expect(s[0].signals.map((x) => x.label).join('|')).toMatch(/جهاز تاني/);
  });
});

describe('ticket volume forecast', () => {
  it('captures weekday seasonality and trend', () => {
    const tickets = [];
    for (let i = 1; i <= 112; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 10);
      const c = d.getDay() === 6 ? 10 : d.getDay() === 5 ? 1 : 4; // السبت زحمة والجمعة هادية
      for (let k = 0; k < c; k += 1) tickets.push({ createdAt: d, assignedTechnician: k % 2 ? 'أ' : 'ب', warehouseId: 'main' });
    }
    const f = forecastTicketVolume(tickets, { now });
    expect(f.enough).toBe(true);
    const sat = f.forecast.find((x) => x.wd === 6); const fri = f.forecast.find((x) => x.wd === 5);
    expect(sat.expected).toBeGreaterThan(8);
    expect(fri.expected).toBeLessThan(2);
    expect(f.peak.wd).toBe(6);
    expect(f.staffing[0].techsNeeded).toBeGreaterThanOrEqual(1);
    expect(Math.abs(f.trendPerWeek)).toBeLessThan(1);
    expect(forecastTicketVolume([], { now }).enough).toBe(false);
  });
});
