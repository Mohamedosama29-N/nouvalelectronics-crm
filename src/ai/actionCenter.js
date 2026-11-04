// ✅ مركز المهام اليومي: بيحوّل البيانات اللحظية اللي الداشبورد بيقراها أصلًا
// لقائمة "محتاج تتصرف فيه النهارده" (من غير أي قراءات إضافية ولا ذكاء اصطناعي).
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate, isSale, amountOf } from '../utils/liveStats';

const DAY = 86400000;
const ageDays = (t, now) => {
  const d = toDate(t.updatedAt) || toDate(t.createdAt);
  return d ? (now - d) / DAY : 0;
};
const tRec = (t, extra = '') => ({ id: t.id, label: `${t.ticketNumber || 'تذكرة'} · ${t.customerName || ''}${extra ? ` · ${extra}` : ''}` });
const oldestFirst = (now) => (a, b) => ageDays(b, now) - ageDays(a, now);

export function buildActionItems({ tickets = [], transfers = [], returns = [], transactions = [], lowStock = [], isOverdue = () => false, atRisk = [], now = new Date() } = {}, perms = {}) {
  const items = [];
  const open = tickets.filter((t) => !TICKET_TERMINAL_STATUSES.includes(t.status));

  if (perms.tickets) {
    const reminders = open.filter((t) => t.reminderAt && !t.reminderDone && new Date(t.reminderAt) <= now);
    if (reminders.length) items.push({ id: 'reminders', level: 'danger', title: 'تذكيرات ميعادها جه', count: reminders.length, hint: 'متابعات انت حددتها بنفسك', records: reminders.slice(0, 5).map((t) => tRec(t, t.reminderNote || '')), action: { view: 'tickets' } });

    const overdue = open.filter(isOverdue).sort(oldestFirst(now));
    if (overdue.length) items.push({ id: 'overdue', level: 'danger', title: 'تذاكر متأخرة عن الـ SLA', count: overdue.length, hint: 'الأقدم الأول', records: overdue.slice(0, 5).map((t) => tRec(t, `${Math.floor(ageDays(t, now))} يوم`)), action: { view: 'tickets' } });

    // ⚠️ إنذار مبكر: لسه متأخرتش بس غالبًا هتعدّي الـ SLA
    if (atRisk.length) items.push({ id: 'atRisk', level: 'warn', title: 'تذاكر غالبًا هتتأخر قريب', count: atRisk.length, hint: 'اتصرف دلوقتي قبل ما تعدّي الـ SLA', records: atRisk.slice(0, 5).map(({ ticket, risk }) => tRec(ticket, risk.reason || '')), action: { view: 'tickets' } });

    const approval = open.filter((t) => t.status === 'waiting_customer_approval_cost' && ageDays(t, now) >= 2).sort(oldestFirst(now));
    if (approval.length) items.push({ id: 'approval', level: 'warn', title: 'مستنيين موافقة العميل من يومين+', count: approval.length, hint: 'كلّم العميل أو ابعتله رسالة من المساعد الذكي', records: approval.slice(0, 5).map((t) => tRec(t)), action: { view: 'tickets' } });

    const pickup = open.filter((t) => t.status === 'contacted_customer' && ageDays(t, now) >= 3).sort(oldestFirst(now));
    if (pickup.length) items.push({ id: 'pickup', level: 'warn', title: 'أجهزة جاهزة ومحدش استلمها', count: pickup.length, hint: 'من 3 أيام أو أكتر', records: pickup.slice(0, 5).map((t) => tRec(t)), action: { view: 'tickets' } });

    const parts = open.filter((t) => t.status === 'waiting_spare_parts' && ageDays(t, now) >= 5).sort(oldestFirst(now));
    if (parts.length) items.push({ id: 'parts', level: 'info', title: 'مستنية قطع غيار من 5 أيام+', count: parts.length, hint: 'تابع مع المورد أو اعمل تحويل', records: parts.slice(0, 5).map((t) => tRec(t)), action: { view: 'tickets' } });
  }

  if (perms.transfers) {
    const pending = transfers.filter((t) => t.status === 'pending');
    if (pending.length) items.push({ id: 'transfers', level: 'warn', title: 'تحويلات مستنية موافقة', count: pending.length, action: { view: 'transfers' } });
  }
  if (perms.returns) {
    const pending = returns.filter((r) => r.status === 'pending');
    if (pending.length) items.push({ id: 'returns', level: 'warn', title: 'مرتجعات مستنية مراجعة', count: pending.length, action: { view: 'returns' } });
  }
  if (perms.invoices) {
    const unpaid = transactions.filter((t) => isSale(t) && (t.paymentStatus === 'partial' || Number(t.remaining) > 0.01));
    if (unpaid.length) {
      const due = unpaid.reduce((s, t) => s + (Number(t.remaining) || Math.max(0, amountOf(t) - (Number(t.totalPaid) || 0))), 0);
      items.push({ id: 'unpaid', level: 'info', title: 'فواتير عليها فلوس متبقية (آخر 34 يوم)', count: unpaid.length, hint: `إجمالي المتبقي ${Math.round(due).toLocaleString()} ج`, action: { view: 'invoices' } });
    }
  }
  if (perms.lowStock && lowStock.length) {
    items.push({ id: 'lowstock', level: 'info', title: 'أصناف تحت حد الطلب', count: lowStock.length, hint: 'شوف توقع النفاد والكمية المقترحة', action: { view: 'lowstock' } });
  }

  const rank = { danger: 0, warn: 1, info: 2 };
  return items.sort((a, b) => rank[a.level] - rank[b.level] || b.count - a.count);
}
