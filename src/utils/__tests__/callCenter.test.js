import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { triageQuestions, customerDevices, followUpQueue, periodicDue, periodicMessage } from '../../ai/callCenter';

const H = 3600000; const D = 24 * H;
const now = new Date(2026, 10, 3, 12);
const ago = (d) => new Date(now.getTime() - d * D);
const closed = (id, doneDaysAgo, extra = {}) => ({ id, ticketNumber: id, status: 'closed', createdAt: ago(doneDaysAgo + 2),
  statusHistory: [{ status: 'created', timestamp: ago(doneDaysAgo + 2).toISOString() }, { status: 'closed', timestamp: ago(doneDaysAgo).toISOString() }], ...extra });

describe('call center', () => {
  it('triage by device type', () => {
    expect(triageQuestions('غسالة توشيبا').device).toBe('غساله');
    expect(triageQuestions('الشاشة').questions.join(' ')).toContain('صوت من غير صورة');
    expect(triageQuestions('حاجة غريبة').questions.length).toBe(3);
  });
  it('devices from tickets and sales', () => {
    const d = customerDevices([closed('T1', 5, { deviceSerial: 'SN100', device: 'شاشة' })], [{ invoiceNumber: 'INV-1', timestamp: ago(100), items: [{ serialNumber: 'sn100', name: 'شاشة 55', warrantyEndDate: '2027-01-01' }, { name: 'تركيب', isService: true }] }]);
    expect(d.length).toBe(1);
    expect(d[0].tickets.length).toBe(1);
    expect(d[0].warrantyEnd.getFullYear()).toBe(2027);
  });
  it('follow-up queue excludes already followed, too recent, too old', () => {
    const q = followUpQueue([
      closed('A', 4), closed('B', 1), closed('C', 20), closed('D', 5, { followUpDate: '2026-11-01' }),
      closed('E', 6, { followUp: { accessibility: 7 } }), { id: 'O', status: 'received_maintenance', createdAt: ago(5) },
    ], { now });
    expect(q.map((x) => x.ticket.id)).toEqual(['A']);
  });
  it('periodic maintenance due uses latest visit per device', () => {
    const list = [
      closed('AC1', 175, { device: 'تكييف', deviceSerial: 'AC-1', customerName: 'محمد علي' }),
      closed('AC2', 370, { device: 'تكييف', deviceSerial: 'AC-2' }), closed('AC2b', 20, { device: 'تكييف', deviceSerial: 'AC-2' }),
      closed('TV', 175, { device: 'شاشة', deviceSerial: 'TV-1' }),
    ];
    const r = periodicDue(list, { now });
    expect(r.map((x) => x.ticket.id)).toEqual(['AC1']);
    expect(periodicMessage(r[0], 'نوڤال')).toContain('محمد');
  });
});
