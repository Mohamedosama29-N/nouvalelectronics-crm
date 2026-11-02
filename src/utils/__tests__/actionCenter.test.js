import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { buildActionItems } from '../../ai/actionCenter';

const now = new Date(2026, 10, 2, 12);
const ago = (d) => new Date(now.getTime() - d * 86400000);
const ALL = { tickets: true, transfers: true, returns: true, invoices: true, lowStock: true };

describe('action center', () => {
  const tickets = [
    { id: 'a', ticketNumber: 'T1', status: 'waiting_customer_approval_cost', updatedAt: ago(3), createdAt: ago(5) },
    { id: 'b', ticketNumber: 'T2', status: 'waiting_customer_approval_cost', updatedAt: ago(1), createdAt: ago(1) },
    { id: 'c', ticketNumber: 'T3', status: 'contacted_customer', updatedAt: ago(4) },
    { id: 'd', ticketNumber: 'T4', status: 'received_maintenance', createdAt: ago(10), reminderAt: '2026-11-01T10:00' },
    { id: 'e', ticketNumber: 'T5', status: 'closed', createdAt: ago(30), reminderAt: '2026-10-01T10:00' },
    { id: 'f', ticketNumber: 'T6', status: 'waiting_spare_parts', updatedAt: ago(6) },
  ];
  it('builds prioritized items with records', () => {
    const items = buildActionItems({
      tickets,
      transfers: [{ status: 'pending' }, { status: 'received' }],
      returns: [{ status: 'pending' }],
      transactions: [{ type: 'sell', paymentStatus: 'partial', remaining: 300, finalTotal: 500 }, { type: 'sell', remaining: 0 }],
      lowStock: [{}, {}],
      isOverdue: (t) => t.id === 'd',
      now,
    }, ALL);
    const ids = items.map((i) => i.id);
    expect(ids.slice(0, 2).sort()).toEqual(['overdue', 'reminders']);
    expect(items.find((i) => i.id === 'reminders').records.map((r) => r.id)).toEqual(['d']); // المقفولة مش بتظهر
    expect(items.find((i) => i.id === 'approval').count).toBe(1); // اللي من يوم واحد لسه
    expect(items.find((i) => i.id === 'pickup').count).toBe(1);
    expect(items.find((i) => i.id === 'parts').count).toBe(1);
    expect(items.find((i) => i.id === 'transfers').count).toBe(1);
    expect(items.find((i) => i.id === 'unpaid').hint).toContain('300');
    expect(items.find((i) => i.id === 'lowstock').count).toBe(2);
  });
  it('respects permissions', () => {
    const items = buildActionItems({ tickets, transfers: [{ status: 'pending' }] }, { transfers: true });
    expect(items.map((i) => i.id)).toEqual(['transfers']);
  });
  it('empty when nothing to do', () => {
    expect(buildActionItems({}, ALL)).toEqual([]);
  });
});
