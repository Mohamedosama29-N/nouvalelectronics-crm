import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { findSimilarTickets, summarizeMatches, templateMessage, whatsappLink, normalizeArabic, localTicketSummary } from '../../ai/ticketAssist';

const pool = [
  { id: '1', ticketNumber: 'T1', device: 'شاشة', deviceModel: 'UA55', productCode: 'P55', issue: 'الشاشه مش بتنور وفي صوت', mainFaultDescription: 'باور سبلاي', spareParts: [{ name: 'بورد باور' }], status: 'delivered_to_customer', customerPhone: '01012345678' },
  { id: '2', ticketNumber: 'T2', device: 'شاشة', deviceModel: 'UA55', productCode: 'P55', issue: 'مفيش صورة والصوت شغال', mainFaultDescription: 'باك لايت', spareParts: [{ name: 'ليد باك لايت' }], status: 'closed' },
  { id: '3', ticketNumber: 'T3', device: 'غسالة', deviceModel: 'WM7', issue: 'مش بتعصر', mainFaultDescription: 'موتور', status: 'closed' },
  { id: '4', ticketNumber: 'T4', device: 'شاشة', deviceModel: 'UA55', productCode: 'P55', issue: 'الشاشة مش بتنور خالص', mainFaultDescription: 'باور سبلاي', spareParts: [{ name: 'بورد باور' }], status: 'closed' },
];

describe('ticketAssist', () => {
  it('normalizes arabic letters', () => {
    expect(normalizeArabic('الشاشة أحمد')).toBe(normalizeArabic('الشاشه احمد'));
  });
  it('finds similar tickets with product boost and excludes self & unrelated', () => {
    const target = { id: 'new', device: 'شاشة', deviceModel: 'UA55', productCode: 'P55', issue: 'الشاشة مش بتنور' };
    const res = findSimilarTickets(target, pool);
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(['1', '4']).toContain(res[0].id);
    expect(res.find((r) => r.id === '3')).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain('01012345678'); // مفيش بيانات عميل
    const sum = summarizeMatches(res);
    expect(sum.faults[0].name).toBe('باور سبلاي');
    expect(sum.parts[0].name).toBe('بورد باور');
  });
  it('empty input returns nothing', () => {
    expect(findSimilarTickets({ id: 'x', issue: '' }, pool)).toEqual([]);
    expect(findSimilarTickets({ id: 'x', issue: 'شاشة' }, [])).toEqual([]);
  });
  it('template messages use first name only and include cost when awaiting approval', () => {
    const m = templateMessage({ customerName: 'محمد أسامة', status: 'waiting_customer_approval_cost', device: 'شاشة', ticketNumber: 'T9', totalCost: 1250 }, { companyName: 'نوڤال' });
    expect(m).toContain('محمد');
    expect(m).not.toContain('أسامة');
    expect(m).toContain('1,250');
    expect(m).toContain('نوڤال');
  });
  it('whatsapp link normalizes egyptian numbers', () => {
    expect(whatsappLink('010 1234 5678', 'hi')).toBe('https://wa.me/201012345678?text=hi');
    expect(whatsappLink('+201012345678', '')).toBe('https://wa.me/201012345678?text=');
    expect(whatsappLink('123', 'x')).toBeNull();
  });
  it('local summary', () => {
    const s = localTicketSummary({ device: 'شاشة', issue: 'مش بتنور', status: 'closed', createdAt: new Date(2026, 9, 1), spareParts: [{ name: 'بورد', quantity: 2 }], totalCost: 500, totalPaid: 500 }, new Date(2026, 9, 11));
    expect(s).toContain('من 10 يوم');
    expect(s).toContain('بورد ×2');
  });
});
