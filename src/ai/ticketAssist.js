// 🧰 مساعد التذاكر — الجزء المحلي (مجاني، بيشتغل حتى لو الذكاء الاصطناعي مقفول):
//   1) البحث عن تذاكر قديمة مشابهة (TF-IDF + تشابه جيب التمام) من غير بيانات العميل
//   2) تجميع الأعطال وقطع الغيار الأكثر تكرارًا في التذاكر المشابهة
//   3) رسائل جاهزة للعميل حسب حالة التذكرة + رابط واتساب
import { TICKET_STATUSES, TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate } from '../utils/liveStats';
import { firstName } from './redact';

// توحيد الحروف العربية عشان "شاشه" = "شاشة" و"أ/إ/آ" = "ا"
export const normalizeArabic = (s) => String(s || '')
  .toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');

const STOP = new Set(['في', 'من', 'على', 'عن', 'الى', 'الي', 'مع', 'و', 'او', 'ان', 'لا', 'مش', 'بس', 'ده', 'دي', 'دا', 'هو', 'هي', 'كان', 'بعد', 'قبل', 'the', 'and', 'of', 'is', 'not', 'جهاز', 'العميل', 'عميل', 'يوجد', 'فيه']);

export const tokenize = (s) => normalizeArabic(s)
  .split(/[^0-9a-z؀-ۿ]+/)
  .map((w) => w.replace(/^ال(?=..)/, ''))
  .filter((w) => w.length >= 2 && !STOP.has(w));

export const ticketText = (t) => [t.device, t.deviceModel, t.productCode, t.issue, t.mainFaultDescription, t.subFaultDescription].filter(Boolean).join(' ');

// ترتيب التذاكر حسب التشابه (TF-IDF + جيب التمام + أولوية لنفس كود المنتج/الموديل)
export function rankSimilar(target, pool, { minScore = 0.12 } = {}) {
  const docs = (pool || []).filter((t) => t && t.id !== target.id);
  if (!docs.length) return [];
  const tokenLists = docs.map((t) => tokenize(ticketText(t)));
  const df = new Map();
  tokenLists.forEach((toks) => new Set(toks).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length;
  const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;
  const vec = (toks) => {
    const tf = new Map();
    toks.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    const v = new Map();
    let norm = 0;
    tf.forEach((c, w) => { const x = c * idf(w); v.set(w, x); norm += x * x; });
    return { v, norm: Math.sqrt(norm) || 1 };
  };
  const q = vec(tokenize(ticketText(target)));
  if (!q.v.size) return [];
  const same = (a, b) => a && b && normalizeArabic(a).trim() === normalizeArabic(b).trim();
  return docs.map((t, i) => {
    const d = vec(tokenLists[i]);
    let dot = 0;
    q.v.forEach((x, w) => { const y = d.v.get(w); if (y) dot += x * y; });
    let score = dot / (q.norm * d.norm);
    if (same(target.productCode, t.productCode)) score += 0.25;
    else if (same(target.deviceModel, t.deviceModel)) score += 0.15;
    if (t.mainFaultDescription || (t.spareParts || []).length) score += 0.03; // تذكرة فيها تشخيص فعلي أفيد
    return { ticket: t, score };
  })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

// بيرجّع أقرب التذاكر للتذكرة/الوصف ده (من غير التذكرة نفسها ومن غير بيانات العميل)
export function findSimilarTickets(target, pool, { limit = 5, minScore = 0.12 } = {}) {
  return rankSimilar(target, pool, { minScore }).slice(0, limit).map(({ ticket: t, score }) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    device: [t.device, t.deviceModel].filter(Boolean).join(' '),
    issue: t.issue || '',
    fault: [t.mainFaultDescription, t.subFaultDescription].filter(Boolean).join(' — '),
    parts: (t.spareParts || []).map((p) => p.name).filter(Boolean),
    status: t.status,
    solved: TICKET_TERMINAL_STATUSES.includes(t.status) && t.status !== 'rejected_by_customer',
    score: Math.min(1, score),
  }));
}

export function summarizeMatches(matches) {
  const count = (arr) => {
    const m = new Map();
    arr.forEach((x) => { const k = String(x).trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  };
  return {
    faults: count(matches.map((m) => m.fault).filter(Boolean)).slice(0, 3),
    parts: count(matches.flatMap((m) => m.parts)).slice(0, 5),
  };
}

// ------------------------- رسائل العملاء -------------------------
export const statusLabel = (v) => TICKET_STATUSES.find((s) => s.value === v)?.label || v || '';

const money = (n) => `${Math.round(Number(n) || 0).toLocaleString()} ج`;

export function templateMessage(ticket, { companyName = '' } = {}) {
  const name = firstName(ticket.customerName);
  const hi = name ? `أهلاً أستاذ/ة ${name}،` : 'أهلاً بحضرتك،';
  const dev = [ticket.device, ticket.deviceModel].filter(Boolean).join(' ') || 'الجهاز';
  const no = ticket.ticketNumber ? ` (تذكرة رقم ${ticket.ticketNumber})` : '';
  const sign = companyName ? `\n\nمع تحيات ${companyName}` : '';
  const cost = Number(ticket.totalCost) || 0;
  const remaining = Number(ticket.remaining) || Math.max(0, cost - (Number(ticket.totalPaid) || 0));
  switch (ticket.status) {
    case 'created':
    case 'received_maintenance':
    case 'maintenance_after_approval':
      return `${hi}\nاستلمنا ${dev}${no} وهو دلوقتي تحت الصيانة. هنبلغ حضرتك أول ما يخلص.${sign}`;
    case 'waiting_customer_approval_cost':
      return `${hi}\nتم فحص ${dev}${no}، وتكلفة الإصلاح ${money(cost)}. محتاجين موافقة حضرتك عشان نبدأ.${sign}`;
    case 'waiting_spare_parts':
    case 'spare_parts_unavailable':
      return `${hi}\n${dev}${no} مستني قطع غيار، وهنبلغ حضرتك أول ما توصل ونكمل الإصلاح. نعتذر عن التأخير.${sign}`;
    case 'sent_to_factory':
    case 'factory_maintenance_done':
    case 'sent_from_factory':
      return `${hi}\n${dev}${no} حالته: ${statusLabel(ticket.status)}. هنتابع مع حضرتك أول بأول.${sign}`;
    case 'contacted_customer':
    case 'factory_rejected':
      return `${hi}\n${dev}${no} جاهز للاستلام${remaining > 0 ? `، والمبلغ المتبقي ${money(remaining)}` : ''}. مستنيين حضرتك.${sign}`;
    case 'delivered_to_customer':
    case 'delivered_asc':
      return `${hi}\nشكراً لثقة حضرتك. اتسلم ${dev}${no}. لو احتاجت أي حاجة إحنا موجودين.${sign}`;
    default:
      return `${hi}\nحالة ${dev}${no}: ${statusLabel(ticket.status)}.${sign}`;
  }
}

// رابط واتساب: 01xxxxxxxxx → 201xxxxxxxxx
export function whatsappLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  while (d.startsWith('00')) d = d.slice(2);
  if (/^01\d{9}$/.test(d)) d = `2${d}`;
  if (!/^\d{10,15}$/.test(d)) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`;
}

// ملخص محلي للتذكرة (من غير ذكاء اصطناعي)
export function localTicketSummary(ticket, now = new Date()) {
  const created = toDate(ticket.createdAt);
  const days = created ? Math.max(0, Math.floor((now - created) / 86400000)) : null;
  const parts = (ticket.spareParts || []).map((p) => `${p.name}${Number(p.quantity) > 1 ? ` ×${p.quantity}` : ''}`);
  const hist = (ticket.statusHistory || []).slice(-3).map((h) => statusLabel(h.status));
  const lines = [
    `الجهاز: ${[ticket.device, ticket.deviceModel].filter(Boolean).join(' ') || '—'}`,
    `المشكلة: ${ticket.issue || '—'}`,
    `الحالة: ${statusLabel(ticket.status)}${days !== null ? ` (من ${days} يوم)` : ''}`,
  ];
  if (ticket.mainFaultDescription) lines.push(`العطل: ${[ticket.mainFaultDescription, ticket.subFaultDescription].filter(Boolean).join(' — ')}`);
  if (parts.length) lines.push(`قطع الغيار: ${parts.join('، ')}`);
  if (Number(ticket.totalCost)) lines.push(`التكلفة: ${money(ticket.totalCost)} — المدفوع: ${money(ticket.totalPaid)}`);
  if (hist.length) lines.push(`آخر الحالات: ${hist.join(' ← ')}`);
  return lines.join('\n');
}
