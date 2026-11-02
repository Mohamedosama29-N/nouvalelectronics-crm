// ⌨️ البحث والأوامر السريعة (Ctrl+K): فهم اللي المستخدم كتبه محليًا.
import { normalizeArabic } from './ticketAssist';
import { toLatinDigits } from './redact';
import { parseQuestionLocally } from './askIntent';

const can = (user, perm) => !perm || user?.role === 'admin' || user?.permissions?.[perm] === true;

export const COMMANDS = [
  { id: 'dashboard', label: 'الداشبورد', view: 'dashboard', keywords: ['داشبورد', 'الرئيسيه', 'لوحه', 'مؤشرات', 'dashboard', 'home'] },
  { id: 'pos', label: 'نقطة البيع (الكاشير)', view: 'transactions', perm: 'viewPOS', keywords: ['كاشير', 'بيع', 'فاتوره جديده', 'pos', 'نقطه البيع', 'بيع جديد'] },
  { id: 'new-ticket', label: 'تذكرة صيانة جديدة', view: 'tickets', perm: 'manageTickets', intent: { kind: 'ticket-new' }, keywords: ['تذكره جديده', 'تذكرة جديدة', 'صيانه جديده', 'اضافه تذكره', 'new ticket'] },
  { id: 'tickets', label: 'تذاكر الصيانة', view: 'tickets', perm: 'manageTickets', keywords: ['تذاكر', 'صيانه', 'tickets'] },
  { id: 'inventory', label: 'المخزون', view: 'inventory', perm: 'viewInventory', keywords: ['مخزون', 'اصناف', 'منتجات', 'inventory', 'بضاعه'] },
  { id: 'transfers', label: 'التحويلات المخزنية', view: 'transfers', perm: 'viewTransfers', keywords: ['تحويل', 'تحويلات', 'نقل', 'transfer'] },
  { id: 'customers', label: 'العملاء', view: 'customers', perm: 'viewCustomers', keywords: ['عملاء', 'عميل', 'customers'] },
  { id: 'invoices', label: 'أرشيف الفواتير', view: 'invoices', perm: 'viewInvoices', keywords: ['فواتير', 'ارشيف', 'invoices'] },
  { id: 'returns', label: 'المرتجعات', view: 'returns', perm: 'viewReturns', keywords: ['مرتجع', 'مرتجعات', 'returns'] },
  { id: 'reports', label: 'التقارير', view: 'reports', perm: 'viewReports', keywords: ['تقارير', 'تقرير', 'reports'] },
  { id: 'finance', label: 'الملف المالي والمصروفات', view: 'finance', perm: 'viewFinance', keywords: ['مالي', 'مصروفات', 'مصاريف', 'finance', 'ارباح'] },
  { id: 'lowstock', label: 'النواقص وتوقع النفاد', view: 'lowstock', perm: 'viewLowStock', keywords: ['نواقص', 'نفاد', 'توقع', 'طلبيه', 'low stock'] },
  { id: 'warranty', label: 'تنبيهات الضمان', view: 'warranty_alerts', perm: 'viewReports', keywords: ['ضمان', 'warranty'] },
  { id: 'settings', label: 'الإعدادات', view: 'settings', perm: 'adminOnly', keywords: ['اعدادات', 'settings', 'ضبط'] },
];

const visibleCommands = (user) => COMMANDS.filter((c) => (c.perm === 'adminOnly' ? user?.role === 'admin' : can(user, c.perm)));

// ترتيب الأوامر حسب التطابق مع اللي اتكتب
export function matchCommands(text, user, max = 6) {
  const t = normalizeArabic(text).trim();
  const list = visibleCommands(user);
  if (!t) return list.slice(0, max);
  const scored = list.map((c) => {
    const hay = [c.label, ...c.keywords].map(normalizeArabic);
    let score = 0;
    hay.forEach((h) => {
      if (h === t) score = Math.max(score, 100);
      else if (h.startsWith(t)) score = Math.max(score, 80);
      else if (h.includes(t)) score = Math.max(score, 60);
      else if (t.includes(h) && h.length >= 3) score = Math.max(score, 50);
    });
    return { c, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.c);
}

// تصنيف المكتوب: رقم تذكرة؟ رقم فاتورة؟ تليفون؟ سؤال؟ ولا بحث عام
export function classifyQuery(raw) {
  const text = toLatinDigits(String(raw || '')).trim();
  const t = normalizeArabic(text);
  if (!t) return { type: 'empty' };
  const ticket = /^(?:تذكره|تذكرة|ticket|#)\s*#?\s*([\w-]+)$/i.exec(text) || /^(?:تذكره)\s*#?\s*([\w-]+)$/.exec(t);
  if (ticket) return { type: 'ticket', value: ticket[1] };
  const inv = /^(?:فاتوره|فاتورة|invoice)\s*#?\s*([\w-]+)$/i.exec(text) || /^(INV-?\d+)$/i.exec(text);
  if (inv) {
    let v = inv[1].toUpperCase();
    if (/^\d+$/.test(v)) v = `INV-${v.padStart(6, '0')}`;
    else if (/^INV\d+$/.test(v)) v = `INV-${v.slice(3).padStart(6, '0')}`;
    return { type: 'invoice', value: v };
  }
  const digits = text.replace(/[\s-]/g, '');
  if (/^(?:\+?20|0)?1[0125]\d{8}$/.test(digits)) {
    const phone = digits.replace(/^\+?20/, '0').replace(/^(?!0)/, '0');
    return { type: 'phone', value: phone };
  }
  return { type: 'search', value: text };
}

// هل ده سؤال للمساعد؟ (بنعرض خيار "اسأل المساعد" لو المحلّل فهمه أو شكله سؤال)
export function looksLikeQuestion(text, warehouses = []) {
  const t = normalizeArabic(text);
  if (/[?؟]$/.test(text.trim())) return true;
  if (/^(كام|ايه|اية|مين|امتي|فين|هل|اد ايه|قد ايه|how|what|which)\b/.test(t)) return true;
  return !!parseQuestionLocally(text, warehouses);
}
