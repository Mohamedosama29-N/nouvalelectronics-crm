// 💬 رد مقترح على رسالة العميل (محلي): بيفهم العميل عايز إيه، ويرد بحالة تذكرته
import { normalizeArabic } from './ticketAssist';
import { firstName } from './redact';
import { statusLabel } from './ticketAssist';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';

const has = (t, words) => words.some((w) => t.includes(normalizeArabic(w)));

export function detectCustomerIntent(message) {
  const t = normalizeArabic(message || '');
  const intents = [];
  if (has(t, ['اتاخر', 'اتأخر', 'زهقت', 'مشكله', 'وحش', 'شكوي', 'شكوى', 'مش معقول', 'حرام', 'كل ده', 'بقالي', 'بقالى', 'مفيش رد', 'محدش بيرد'])) intents.push('complaint');
  if (has(t, ['كام', 'تكلفه', 'سعر', 'بكام', 'الحساب', 'هدفع', 'المبلغ'])) intents.push('price');
  if (has(t, ['استلم', 'اجي', 'آجي', 'مواعيد', 'العنوان', 'فين المكان', 'امتي اعدي'])) intents.push('pickup');
  if (!intents.length || has(t, ['خلص', 'جاهز', 'امتي', 'امتى', 'وصل لفين', 'اخباره', 'الحاله', 'ايه الاخبار', 'لسه'])) intents.push('status');
  return [...new Set(intents)];
}

export function suggestReply(ticket, message, { trackUrl = '', company = '', expectedLabel = '' } = {}) {
  const intents = detectCustomerIntent(message);
  const name = firstName(ticket.customerName);
  const dev = [ticket.device, ticket.deviceModel].filter(Boolean).join(' ') || 'الجهاز';
  const status = ticket.status;
  const lines = [name ? `أهلاً أستاذ/ة ${name}،` : 'أهلاً بحضرتك،'];
  if (intents.includes('complaint')) lines.push('بنعتذر جدًا عن التأخير وعن أي إزعاج، وبنتابع جهاز حضرتك بنفسنا.');
  const ready = status === 'contacted_customer';
  const closed = TICKET_TERMINAL_STATUSES.includes(status);
  if (ready) lines.push(`${dev} (تذكرة ${ticket.ticketNumber || ''}) جاهز للاستلام.`);
  else if (closed) lines.push(`تذكرة ${dev} (${ticket.ticketNumber || ''}) حالتها: ${statusLabel(status)}.`);
  else {
    lines.push(`${dev} (تذكرة ${ticket.ticketNumber || ''}) حالته دلوقتي: ${statusLabel(status)}.`);
    if (['waiting_spare_parts', 'spare_parts_unavailable'].includes(status)) lines.push('مستنيين قطعة الغيار، وهنكمّل الإصلاح أول ما توصل.');
    if (status === 'waiting_customer_approval_cost') lines.push('محتاجين موافقة حضرتك على التكلفة عشان نبدأ الإصلاح.');
    if (expectedLabel && !['waiting_customer_approval_cost'].includes(status)) lines.push(`المدة المعتادة لحالات زي دي: ${expectedLabel}.`);
  }
  const cost = Number(ticket.totalCost) || Number(ticket.estimatedCost) || 0;
  const remaining = Number(ticket.remaining) || Math.max(0, cost - (Number(ticket.totalPaid) || 0));
  if ((intents.includes('price') || status === 'waiting_customer_approval_cost' || ready) && cost) {
    lines.push(ready && remaining ? `المبلغ المتبقي: ${Math.round(remaining).toLocaleString()} ج.` : `تكلفة الإصلاح: ${Math.round(cost).toLocaleString()} ج.`);
  } else if (intents.includes('price')) lines.push('التكلفة بتتحدد بعد الفحص، وهنبلغ حضرتك بيها قبل أي إصلاح.');
  if (intents.includes('pickup') || ready) lines.push('تقدر تشرّف في مواعيد العمل، ومعاك إيصال الاستلام.');
  if (trackUrl) lines.push(`تقدر تتابع الحالة أول بأول من هنا: ${trackUrl}`);
  if (company) lines.push(`\nمع تحيات ${company}`);
  return { text: lines.join('\n'), intents };
}
