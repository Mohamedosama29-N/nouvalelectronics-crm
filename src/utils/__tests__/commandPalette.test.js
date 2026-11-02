import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { classifyQuery, matchCommands, looksLikeQuestion } from '../../ai/commandPalette';

const admin = { role: 'admin' };
const cashier = { role: 'cashier', permissions: { viewPOS: true } };

describe('command palette', () => {
  it('classifies ticket, invoice, phone, search', () => {
    expect(classifyQuery('تذكرة 1234')).toEqual({ type: 'ticket', value: '1234' });
    expect(classifyQuery('#TK-55')).toEqual({ type: 'ticket', value: 'TK-55' });
    expect(classifyQuery('فاتورة 42')).toEqual({ type: 'invoice', value: 'INV-000042' });
    expect(classifyQuery('inv-000042')).toEqual({ type: 'invoice', value: 'INV-000042' });
    expect(classifyQuery('010 1234 5678')).toEqual({ type: 'phone', value: '01012345678' });
    expect(classifyQuery('+201012345678')).toEqual({ type: 'phone', value: '01012345678' });
    expect(classifyQuery('٠١٠١٢٣٤٥٦٧٨')).toEqual({ type: 'phone', value: '01012345678' });
    expect(classifyQuery('شاشة سامسونج')).toEqual({ type: 'search', value: 'شاشة سامسونج' });
    expect(classifyQuery('  ')).toEqual({ type: 'empty' });
  });
  it('matches commands by arabic keywords and respects permissions', () => {
    expect(matchCommands('كاشير', admin)[0].id).toBe('pos');
    expect(matchCommands('تذكره جديده', admin)[0].id).toBe('new-ticket');
    expect(matchCommands('اعدادات', cashier).find((c) => c.id === 'settings')).toBeUndefined();
    expect(matchCommands('', cashier).map((c) => c.id)).toEqual(['dashboard', 'pos']);
  });
  it('detects questions', () => {
    expect(looksLikeQuestion('مبيعات النهارده')).toBe(true);
    expect(looksLikeQuestion('كام عميل؟')).toBe(true);
    expect(looksLikeQuestion('شاشة سامسونج')).toBe(false);
  });
});

import { ticketNumberVariants, invoiceNumberVariants } from '../../ai/globalSearch';
describe('number variants', () => {
  it('ticket numbers', () => {
    expect(ticketNumberVariants('123')).toContain('TKT-000123');
    expect(ticketNumberVariants('tkt-000123')).toContain('TKT-000123');
  });
  it('invoice numbers keep old 8-digit format and new padded one', () => {
    const v = invoiceNumberVariants('INV-12345678');
    expect(v).toContain('INV-12345678');
    expect(invoiceNumberVariants('42')).toContain('INV-000042');
  });
});
