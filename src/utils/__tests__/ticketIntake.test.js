import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { extractTicketFromMessage, textForAI, mergeIntake, normalizeEgPhone } from '../../ai/ticketIntake';

const GOV = ['القاهرة', 'الجيزة', 'الإسكندرية'];

describe('ticket intake extraction', () => {
  it('extracts name, phones, device, brand, model, size, governorate, issue', () => {
    const msg = 'السلام عليكم انا محمد أسامة عندي شاشة سامسونج 55 بوصة موديل UA55TU7000 مش بتنور خالص والصوت شغال، رقمي 01012345678 وده رقم تاني +20 111 222 3333 ساكن في الجيزة';
    const r = extractTicketFromMessage(msg, { governorates: GOV });
    expect(r.customerName).toBe('محمد أسامة');
    expect(r.customerPhone).toBe('01012345678');
    expect(r.secondPhone).toBe('01112223333');
    expect(r.device).toBe('شاشة Samsung');
    expect(r.deviceModel).toContain('UA55TU7000');
    expect(r.deviceModel).toContain('55 بوصة');
    expect(r.governorate).toBe('الجيزة');
    expect(r.issue).toContain('مش بتنور');
    expect(r.issue).not.toMatch(/01012345678|السلام عليكم|محمد/);
    expect(r.priority).toBe('medium');
  });
  it('priority detection', () => {
    expect(extractTicketFromMessage('التلاجة بيطلع منها شرار وريحة شياط').priority).toBe('high');
    expect(extractTicketFromMessage('الغسالة مش بتعصر بس مش مستعجل').priority).toBe('low');
    expect(extractTicketFromMessage('التلاجة مش بتبرد').device).toBe('ثلاجة');
  });
  it('arabic digits phone and stop-words in names', () => {
    const r = extractTicketFromMessage('أنا أحمد عندي غسالة LG رقمي ٠١٢٢٣٣٤٤٥٥٦');
    expect(r.customerName).toBe('أحمد');
    expect(r.customerPhone).toBe('01223344556');
    expect(r.device).toBe('غسالة LG');
  });
  it('does not treat phone as model', () => {
    expect(extractTicketFromMessage('تكييف رقمي 01012345678').deviceModel).toBe('');
  });
  it('text for AI has no phones or name', () => {
    const msg = 'انا محمد عندي شاشة رقمي 01012345678';
    const ex = extractTicketFromMessage(msg);
    const t = textForAI(msg, ex);
    expect(t).not.toContain('01012345678');
    expect(t).not.toContain('محمد');
  });
  it('merge keeps local name/phone and validates priority', () => {
    const m = mergeIntake({ customerName: 'محمد', customerPhone: '010', device: 'شاشة', issue: 'x', priority: 'medium' }, { device: 'شاشة سامسونج', issue: 'الشاشة لا تعمل', priority: 'urgent', customerName: 'hack' });
    expect(m).toMatchObject({ customerName: 'محمد', customerPhone: '010', device: 'شاشة سامسونج', issue: 'الشاشة لا تعمل', priority: 'medium' });
  });
  it('phone normalization', () => {
    expect(normalizeEgPhone('+20 101 234 5678')).toBe('01012345678');
    expect(normalizeEgPhone('1012345678')).toBe('01012345678');
    expect(normalizeEgPhone('12345')).toBe('');
  });
});
