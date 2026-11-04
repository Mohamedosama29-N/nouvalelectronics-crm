// 🧠 ذكاء متقدم محلي (مجاني بالكامل، وGemini بيحسّنه لو متفعّل):
//   (18) بحث بالمعنى  (6) قاعدة معرفة بتبني نفسها  (9) مزاج العميل
//   (11) مؤشرات تلاعب الضمان  (16) توقع حجم التذاكر
import { normalizeArabic, tokenize, ticketText } from './ticketAssist';
import { satisfactionOf } from './quality';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate, ticketWarehouseOf } from '../utils/liveStats';

const DAY = 86400000;
const n = (v) => Number(v) || 0;
const norm = (s) => normalizeArabic(String(s || '')).trim();
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ================================================================ (18) البحث بالمعنى
// مجموعات كلمات بنفس المعنى (عامية مصرية + فصحى + إنجليزي) — أي كلمة منها بتجيب الباقي
export const CONCEPTS = [
  ['مش بتنور', 'مبتنورش', 'مطفيه', 'مش شغاله', 'مبتشتغلش', 'مش بتشتغل', 'بايظه', 'عطلانه', 'واقفه', 'مفيش باور', 'باور', 'power', 'dead', 'فاصله', 'بتفصل', 'بيفصل'],
  ['مش بتبرد', 'مبتبردش', 'تبريد', 'تلج', 'سقعه', 'فريون', 'غاز', 'كمبروسر', 'ضاغط', 'compressor', 'مش بيبرد', 'تكييف سخن', 'هوا سخن'],
  ['بتسرب', 'تسريب', 'بتنقط', 'تنقيط', 'مايه', 'ميه', 'نازل ميه', 'leak', 'بتهرب'],
  ['صوت', 'زن', 'زنه', 'خبط', 'تخبيط', 'صوت عالي', 'دوشه', 'noise', 'بيزيق', 'تزييق', 'طقطقه'],
  ['شاشه', 'سكرين', 'screen', 'بانل', 'panel', 'خطوط', 'شرخ', 'مكسوره', 'بقع', 'لمبه', 'باك لايت', 'backlight', 'اضاءه'],
  ['مش بتعصر', 'عصر', 'تجفيف', 'مبتعصرش', 'حله', 'درام', 'drum', 'سير', 'belt', 'موتور', 'motor', 'مش بتلف', 'مبتلفش'],
  ['مش بتسخن', 'تسخين', 'سخان', 'heater', 'مقاومه', 'هيتر', 'ميه بارده'],
  ['شرار', 'ماس', 'ماس كهربا', 'كهربا', 'بيكهرب', 'ريحه حريق', 'دخان', 'محروق', 'اتحرق', 'short', 'فيوز', 'fuse'],
  ['بورده', 'بورد', 'board', 'كارته', 'كارت', 'pcb', 'لوحه', 'لوحه تحكم', 'كنترول'],
  ['ريموت', 'remote', 'ريسيفر', 'مش بيستجيب', 'زراير', 'زرار', 'تاتش', 'touch'],
  ['ايرور', 'error', 'كود', 'code', 'خطأ', 'رساله خطا', 'بيطلع كود'],
  ['صوت تلفزيون', 'سماعه', 'سماعات', 'speaker', 'مفيش صوت', 'الصوت قاطع', 'audio'],
  ['واي فاي', 'wifi', 'نت', 'انترنت', 'شبكه', 'سمارت', 'smart', 'تطبيق', 'ابلكيشن'],
  ['ضمان', 'warranty', 'جديد', 'لسه شاريه', 'فاتوره'],
];
const CONCEPT_INDEX = (() => {
  const m = new Map();
  CONCEPTS.forEach((group, gi) => group.forEach((phrase) => tokenize(phrase).forEach((w) => { if (!m.has(w)) m.set(w, new Set()); m.get(w).add(gi); })));
  return m;
})();
const conceptTokens = (gi) => [...new Set(CONCEPTS[gi].flatMap((p) => tokenize(p)))];

// بيرجّع كلمات البحث + المرادفات (بوزن أقل) + أي كلمات إضافية من Gemini
export function expandQuery(q, extra = []) {
  const base = tokenize(q);
  const groups = new Set();
  const nq = norm(q);
  CONCEPTS.forEach((g, gi) => { if (g.some((p) => nq.includes(norm(p)))) groups.add(gi); });
  base.forEach((w) => (CONCEPT_INDEX.get(w) || []).forEach((gi) => groups.add(gi)));
  const weights = new Map();
  base.forEach((w) => weights.set(w, 1));
  extra.flatMap((x) => tokenize(x)).forEach((w) => { if (!weights.has(w)) weights.set(w, 0.7); });
  groups.forEach((gi) => conceptTokens(gi).forEach((w) => { if (!weights.has(w)) weights.set(w, 0.45); }));
  return { weights, groups: [...groups], base };
}

// ترتيب أي مستندات (تذاكر/مقالات) حسب المعنى: TF-IDF على الكلمات الموسّعة + تطابق جزئي للكلمات
export function semanticSearch(q, docs = [], { textOf = ticketText, extra = [], limit = 20, minScore = 0.05 } = {}) {
  const { weights, groups } = expandQuery(q, extra);
  if (!weights.size || !docs.length) return [];
  const lists = docs.map((d) => tokenize(textOf(d)));
  const df = new Map();
  lists.forEach((l) => new Set(l).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length;
  const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;
  const qNorm = Math.sqrt([...weights].reduce((s, [w, x]) => s + (x * idf(w)) ** 2, 0)) || 1;
  return docs.map((d, i) => {
    const set = new Set(lists[i]);
    let dot = 0; const hits = [];
    weights.forEach((x, w) => {
      let m = set.has(w) ? 1 : 0;
      if (!m && w.length >= 4) m = [...set].some((t) => t.length >= 4 && (t.startsWith(w) || w.startsWith(t))) ? 0.6 : 0;
      if (m) { dot += m * x * idf(w) ** 2; if (x === 1) hits.push(w); }
    });
    const dNorm = Math.sqrt(set.size) * 2 || 1;
    let score = dot / (qNorm * dNorm);
    const dGroups = new Set(lists[i].flatMap((w) => [...(CONCEPT_INDEX.get(w) || [])]));
    const shared = groups.filter((g) => dGroups.has(g)).length;
    if (groups.length) score += 0.15 * (shared / groups.length);
    return { doc: d, score: Math.min(1, score), hits, concepts: shared };
  }).filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ================================================================ (6) قاعدة المعرفة
export const kbText = (a) => [a.title, a.device, a.model, a.faultCode, a.symptoms, a.cause, (a.steps || []).join(' '), (a.parts || []).join(' '), (a.tags || []).join(' ')].filter(Boolean).join(' ');

const solved = (t) => TICKET_TERMINAL_STATUSES.includes(t.status) && !['rejected_by_customer', 'rejected_and_delivered', 'cancelled'].includes(t.status);
const devType = (t) => norm(String(t.device || '').split(/\s+/)[0]);

// تجميع التذاكر المحلولة (نوع الجهاز + العطل) عشان نقترح مقالات تلقائي
export function mineSolutions(pool = [], { minCount = 3, existing = [] } = {}) {
  const have = new Set(existing.map((a) => `${norm(a.device)}|${norm(a.faultCode || a.title)}`));
  const groups = new Map();
  pool.filter(solved).forEach((t) => {
    const fault = t.mainFaultCode || t.mainFaultDescription;
    if (!fault || !t.device) return;
    const k = `${devType(t)}|${norm(t.mainFaultCode || t.mainFaultDescription)}`;
    const g = groups.get(k) || { key: k, device: String(t.device).split(/\s+/)[0], faultCode: t.mainFaultCode || '', fault: t.mainFaultDescription || t.mainFaultCode, tickets: [] };
    g.tickets.push(t); groups.set(k, g);
  });
  return [...groups.values()].filter((g) => g.tickets.length >= minCount && !have.has(`${norm(g.device)}|${norm(g.faultCode || g.fault)}`)).map((g) => {
    const parts = new Map(); const models = new Map(); const issues = new Map(); const subs = new Map();
    g.tickets.forEach((t) => {
      (t.spareParts || []).forEach((p) => p?.name && parts.set(p.name, (parts.get(p.name) || 0) + 1));
      if (t.deviceModel) models.set(t.deviceModel, (models.get(t.deviceModel) || 0) + 1);
      tokenize(t.issue).forEach((w) => issues.set(w, (issues.get(w) || 0) + 1));
      if (t.subFaultDescription) subs.set(t.subFaultDescription, (subs.get(t.subFaultDescription) || 0) + 1);
    });
    const top = (m, k = 5) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k);
    const costs = g.tickets.map((t) => n(t.totalCost) || n(t.estimatedCost)).filter((x) => x > 0);
    return {
      key: g.key, device: g.device, faultCode: g.faultCode, title: `${g.device}: ${g.fault}`, count: g.tickets.length,
      models: top(models, 4).map(([m]) => m), parts: top(parts).filter(([, c]) => c >= 2 || g.tickets.length < 6).map(([p, c]) => ({ name: p, share: c / g.tickets.length })),
      symptoms: top(issues, 8).map(([w]) => w).join('، '), subFaults: top(subs, 3).map(([s]) => s),
      medianCost: costs.length ? Math.round(median(costs)) : null, ticketNumbers: g.tickets.slice(0, 5).map((t) => t.ticketNumber),
    };
  }).sort((a, b) => b.count - a.count);
}

export const articleFromSuggestion = (s) => ({
  title: s.title, device: s.device, faultCode: s.faultCode || '', model: s.models.join('، '),
  symptoms: s.symptoms, cause: s.subFaults.join(' / '), steps: [], parts: s.parts.map((p) => p.name),
  typicalCost: s.medianCost || 0, source: 'mined', basedOn: s.count, tags: [],
});

export const articleFromTicket = (t) => ({
  title: `${String(t.device || '').split(/\s+/)[0] || 'جهاز'}: ${t.mainFaultDescription || t.issue || ''}`.slice(0, 120),
  device: String(t.device || '').split(/\s+/)[0] || '', model: t.deviceModel || '', faultCode: t.mainFaultCode || '',
  symptoms: t.issue || '', cause: [t.mainFaultDescription, t.subFaultDescription].filter(Boolean).join(' — '),
  steps: String(t.notes || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 8),
  parts: (t.spareParts || []).map((p) => p.name).filter(Boolean), typicalCost: n(t.totalCost) || n(t.estimatedCost),
  source: 'ticket', fromTicket: t.ticketNumber || '', tags: [],
});

// ================================================================ (9) مزاج العميل
const NEG = { زعلان: 1, متضايق: 1, مضايق: 1, وحش: 1, سيء: 1, سيئ: 1, زفت: 2, مقرف: 2, متاخر: 1, اتاخر: 1, تاخير: 1, اتاخرتوا: 1, شكوي: 1, اشتكي: 1, هشتكي: 2, اهمال: 2, فاشل: 2, فاشله: 2, بايظ: 1, غلط: 1, مستني: 1, مستنيه: 1, استرجاع: 1, فلوسي: 1, حرام: 1, بهدله: 2, لف: 1, مرمطه: 2, محترمين: 0, كذب: 2, كدب: 2, بتكدبوا: 2, ضحك: 1, مبيردوش: 2, محدش: 1, زهقت: 2, قرفت: 2, اخر: 0 };
const STRONG = ['نصب', 'نصابين', 'حرامي', 'حراميه', 'حمايه المستهلك', 'جهاز حمايه', 'هفضح', 'فضيحه', 'محامي', 'قضيه', 'بوست', 'سوشيال', 'هشهر', 'اخر مره اتعامل'];
const POS = { شكرا: 1, متشكر: 1, متشكرين: 1, ممتاز: 2, ممتازه: 2, جميل: 1, تمام: 0.5, كويس: 1, محترم: 1, محترمين: 1, سريع: 1, اتحل: 1, راضي: 1, برافو: 2, يخليك: 1, الف: 0, مبسوط: 2, احسن: 1, شاطر: 1, عظيم: 2, رائع: 2 };
const NEGATORS = new Set(['مش', 'مو', 'ما', 'لا', 'مكنش', 'مافيش', 'مفيش', 'غير']);

export function sentimentOf(text) {
  const t = norm(text);
  if (!t) return { score: 0, label: 'neutral', hits: [] };
  const words = t.split(/[^0-9a-z؀-ۿ]+/).filter(Boolean);
  let s = 0; const hits = [];
  words.forEach((w0, i) => {
    const w = w0.replace(/^(ال|وال|بال|و|ف)(?=...)/, '');
    const negated = i > 0 && NEGATORS.has(words[i - 1]);
    if (POS[w] !== undefined || POS[w0] !== undefined) { const v = POS[w] ?? POS[w0]; if (v) { s += negated ? -v : v; hits.push(negated ? `مش ${w0}` : w0); } }
    else if (NEG[w] || NEG[w0]) { const v = NEG[w] || NEG[w0]; s += negated ? v * 0.3 : -v; hits.push(w0); }
  });
  const strong = STRONG.filter((p) => t.includes(norm(p)));
  if (strong.length) { s -= 3 * strong.length; hits.push(...strong); }
  if (/!{2,}|؟{2,}|\?{2,}/.test(text)) s -= 0.5;
  const score = Math.max(-1, Math.min(1, s / 4));
  const label = strong.length || score <= -0.6 ? 'angry' : score < -0.15 ? 'unhappy' : score >= 0.25 ? 'happy' : 'neutral';
  return { score, label, hits: [...new Set(hits)].slice(0, 6), escalate: strong.length > 0 };
}

export const MOODS = {
  angry: { label: 'غاضب', emoji: '😡', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  unhappy: { label: 'مش راضي', emoji: '😟', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  neutral: { label: 'عادي', emoji: '😐', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  happy: { label: 'راضي', emoji: '😊', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

// مزاج العميل من: كلامه في سجل التواصل والملاحظات + التقييم + الشكاوى + التذاكر المتأخرة/المتكررة (الأحدث أهم)
export function customerMood({ logs = [], tickets = [], now = new Date(), slaDays = 7 } = {}) {
  let sum = 0; let wsum = 0; const reasons = []; let escalate = false;
  const add = (score, at, reason, w = 1) => {
    const age = at ? Math.max(0, (now - at) / DAY) : 30;
    const weight = w * 0.5 ** (age / 30);
    sum += score * weight; wsum += weight;
    if (reason) reasons.push({ reason, age: Math.round(age) });
  };
  logs.forEach((l) => {
    const at = toDate(l.at);
    const s = sentimentOf(l.note);
    if (s.escalate) escalate = true;
    if (l.outcome === 'complaint') add(-0.8, at, `شكوى${l.note ? `: ${String(l.note).slice(0, 50)}` : ''}`, 1.5);
    else if (s.label !== 'neutral') add(s.score, at, s.label === 'happy' ? null : `قال: ${s.hits.slice(0, 3).join('، ')}`);
    if (l.outcome === 'no_answer') add(-0.1, at, null, 0.3);
  });
  tickets.forEach((t) => {
    const created = toDate(t.createdAt);
    const sat = satisfactionOf(t);
    if (sat) add((sat.score - 7) / 3, toDate(t.updatedAt) || created, sat.score <= 6 ? `تقييمه ${sat.score.toFixed(1)}/10 في ${t.ticketNumber || 'تذكرة'}` : null, 1.2);
    const s = sentimentOf([t.followUp?.notes, t.customerRating?.comment, t.complaint].filter(Boolean).join(' '));
    if (s.label !== 'neutral') add(s.score, toDate(t.updatedAt) || created, s.label === 'happy' ? null : `في ${t.ticketNumber}: ${s.hits.slice(0, 3).join('، ')}`);
    if (s.escalate) escalate = true;
    const open = !TICKET_TERMINAL_STATUSES.includes(t.status);
    if (open && created && (now - created) / DAY > slaDays) add(-0.5, now, `تذكرة ${t.ticketNumber || ''} مفتوحة من ${Math.round((now - created) / DAY)} يوم`, 1);
  });
  const serials = tickets.map((t) => norm(t.deviceSerial)).filter((s) => s.length >= 4);
  const repeats = serials.length - new Set(serials).size;
  if (repeats > 0) add(-0.4, now, `الجهاز رجع للصيانة ${repeats + 1} مرات`, 1);
  const score = wsum ? sum / wsum : 0;
  const label = escalate || score <= -0.5 ? 'angry' : score < -0.15 ? 'unhappy' : score >= 0.25 ? 'happy' : 'neutral';
  return { label, score, escalate, reasons: reasons.sort((a, b) => a.age - b.age).slice(0, 4).map((r) => r.reason) };
}

// ================================================================ (11) مؤشرات تلاعب الضمان
export const FRAUD_LEVELS = {
  high: { label: 'مشبوهة جدًا', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  medium: { label: 'محتاجة مراجعة', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  low: { label: 'طبيعية', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};
const isWarranty = (t) => t.warrantyStatus === 'in_warranty' || t.ticketType === 'warranty';
const sNorm = (s) => String(s || '').toLowerCase().replace(/[\s-]/g, '');

// ctx: { pool, salesBySerial: Map(serial→{date, endDate}), registryBySerial: Map(serial→{purchaseDate, months, model}), now }
export function fraudSignals(t, { pool = [], salesBySerial = new Map(), registryBySerial = new Map(), now = new Date() } = {}) {
  if (!isWarranty(t)) return { score: 0, level: 'low', signals: [] };
  const sig = []; const add = (w, label) => sig.push({ w, label });
  const serial = sNorm(t.deviceSerial);
  const created = toDate(t.createdAt) || now;
  if (serial.length < 4) add(15, 'مفيش سيريال صالح على تذكرة ضمان');
  const sale = serial ? salesBySerial.get(serial) : null;
  const reg = serial ? registryBySerial.get(serial) : null;
  if (serial.length >= 4 && !sale && !reg) add(20, 'السيريال مش لاقيينه في مبيعاتنا ولا في سجل الأجهزة');
  let end = null;
  if (sale?.endDate) end = new Date(`${String(sale.endDate).slice(0, 10)}T23:59:59`);
  else if (reg?.purchaseDate && n(reg.months)) { end = new Date(`${String(reg.purchaseDate).slice(0, 10)}T23:59:59`); end.setMonth(end.getMonth() + n(reg.months)); }
  if (end && end < created) add(35, `الضمان انتهى ${end.toLocaleDateString('ar-EG')} قبل فتح التذكرة`);
  const inv = t.invoiceDate ? new Date(`${String(t.invoiceDate).slice(0, 10)}T00:00:00`) : null;
  if (inv && !Number.isNaN(inv.getTime())) {
    if (inv > created) add(25, 'تاريخ الفاتورة بعد تاريخ فتح التذكرة');
    const real = sale?.date || (reg?.purchaseDate ? new Date(`${String(reg.purchaseDate).slice(0, 10)}T00:00:00`) : null);
    if (real && Math.abs(inv - real) / DAY > 7) add(20, `تاريخ الفاتورة المكتوب (${t.invoiceDate}) مختلف عن تاريخ الشراء الحقيقي (${real.toLocaleDateString('ar-EG')})`);
  }
  if (serial.length >= 4) {
    const same = pool.filter((x) => x.id !== t.id && sNorm(x.deviceSerial) === serial);
    const recentW = same.filter((x) => isWarranty(x) && Math.abs(created - (toDate(x.createdAt) || created)) / DAY <= 180);
    if (recentW.length >= 2) add(20, `نفس السيريال عليه ${recentW.length + 1} تذاكر ضمان في 6 شهور`);
    const otherDev = same.find((x) => x.device && t.device && norm(String(x.device).split(/\s+/)[0]) !== norm(String(t.device).split(/\s+/)[0]));
    if (otherDev) add(25, `نفس السيريال اتسجل قبل كده على جهاز تاني (${otherDev.device} — ${otherDev.ticketNumber || ''})`);
  }
  if (t.customerPhone) {
    const mine = pool.filter((x) => x.id !== t.id && x.customerPhone === t.customerPhone && isWarranty(x) && Math.abs(created - (toDate(x.createdAt) || created)) / DAY <= 90);
    const serials = new Set(mine.map((x) => sNorm(x.deviceSerial)).filter(Boolean));
    serials.delete(serial);
    if (serials.size >= 2) add(15, `نفس العميل فتح ضمان على ${serials.size + 1} أجهزة مختلفة في 3 شهور`);
  }
  const cost = n(t.totalCost) || n(t.estimatedCost);
  if (cost > 0 && t.device) {
    const peers = pool.filter((x) => x.id !== t.id && isWarranty(x) && norm(String(x.device).split(/\s+/)[0]) === norm(String(t.device).split(/\s+/)[0])).map((x) => n(x.totalCost) || n(x.estimatedCost)).filter((x) => x > 0);
    const m = median(peers);
    if (peers.length >= 5 && cost > 2 * m) add(15, `التكلفة ${Math.round(cost)} ج أكتر من ضعف المعتاد لنفس الجهاز (${Math.round(m)} ج)`);
  }
  const dmg = (t.aiDamage || []).find((d) => d.physicalDamage);
  if (dmg) add(30, `تحليل الصور لقى تلف خارجي (${dmg.summary || 'كسر/سوائل'}) — غالبًا خارج الضمان`);
  const score = Math.min(100, sig.reduce((s, x) => s + x.w, 0));
  return { score, level: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low', signals: sig.sort((a, b) => b.w - a.w) };
}

// بيجهّز خرايط المبيعات والسجل من مستندات Firestore
export function buildWarrantyMaps(sales = [], registry = []) {
  const salesBySerial = new Map(); const registryBySerial = new Map();
  sales.forEach((s) => (s.items || []).forEach((i) => { const k = sNorm(i.serialNumber); if (k.length >= 4 && !salesBySerial.has(k)) salesBySerial.set(k, { date: toDate(s.timestamp), endDate: i.warrantyEndDate || null }); }));
  registry.forEach((r) => { const k = sNorm(r.serial || r.serialRaw); if (k.length >= 4) registryBySerial.set(k, r); });
  return { salesBySerial, registryBySerial };
}

export function fraudScan(pool = [], ctx = {}) {
  return pool.filter(isWarranty).map((t) => ({ ticket: t, ...fraudSignals(t, { ...ctx, pool }) })).filter((r) => r.level !== 'low').sort((a, b) => b.score - a.score);
}

// ================================================================ (16) توقع حجم التذاكر
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const WEEKDAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

// موسمية أيام الأسبوع × اتجاه عام (انحدار خطي على الأسابيع) — بيرجّع توقع يومي بمدى ثقة
export function forecastTicketVolume(tickets = [], { now = new Date(), historyDays = 112, horizon = 14, warehouse = 'all' } = {}) {
  const today = startOfDay(now);
  const from = new Date(today.getTime() - historyDays * DAY);
  const counts = new Map();
  for (let i = 0; i < historyDays; i += 1) counts.set(dayKey(new Date(from.getTime() + i * DAY)), 0);
  const techs = new Set();
  tickets.forEach((t) => {
    if (warehouse !== 'all' && ticketWarehouseOf(t) !== warehouse) return;
    const d = toDate(t.createdAt);
    if (!d || d < from || d >= today) return;
    const k = dayKey(d);
    if (counts.has(k)) counts.set(k, counts.get(k) + 1);
    if (t.assignedTechnician) techs.add(t.assignedTechnician);
  });
  const history = [...counts].map(([date, count]) => ({ date, count, wd: new Date(`${date}T00:00:00`).getDay() }));
  const total = history.reduce((s, h) => s + h.count, 0);
  if (total < 10) return { enough: false, total, history };
  // موسمية الأسبوع
  const wdSum = Array(7).fill(0); const wdN = Array(7).fill(0);
  history.forEach((h) => { wdSum[h.wd] += h.count; wdN[h.wd] += 1; });
  const avgDay = total / history.length;
  const factor = wdSum.map((s, i) => (wdN[i] ? s / wdN[i] / (avgDay || 1) : 1));
  // اتجاه: انحدار على المتوسط اليومي لكل أسبوع
  const weeks = [];
  for (let i = 0; i + 7 <= history.length; i += 7) weeks.push(history.slice(i, i + 7).reduce((s, h) => s + h.count, 0) / 7);
  const k = weeks.length; const xm = (k - 1) / 2; const ym = weeks.reduce((s, y) => s + y, 0) / (k || 1);
  let num = 0; let den = 0;
  weeks.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  const slope = den ? num / den : 0;
  const recent = weeks.slice(-4);
  const level = recent.length ? (recent.reduce((s, y) => s + y, 0) / recent.length) + slope * 1.5 : ym;
  const resid = history.map((h) => h.count - avgDay * factor[h.wd]);
  const sd = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, resid.length - 1));
  const forecast = [];
  for (let i = 0; i < horizon; i += 1) {
    const d = new Date(today.getTime() + i * DAY);
    const base = Math.max(0, (level + slope * (i / 7)) * factor[d.getDay()]);
    forecast.push({ date: dayKey(d), wd: d.getDay(), expected: Math.round(base * 10) / 10, low: Math.max(0, Math.floor(base - 1.28 * sd)), high: Math.ceil(base + 1.28 * sd) });
  }
  const perTechDay = techs.size ? avgDay / techs.size : null;
  const next7 = forecast.slice(0, 7).reduce((s, f) => s + f.expected, 0);
  const last7 = history.slice(-7).reduce((s, h) => s + h.count, 0);
  const peak = forecast.slice(0, 7).reduce((a, b) => (b.expected > a.expected ? b : a), forecast[0]);
  return {
    enough: true, total, history, forecast, factor, avgDay, trendPerWeek: slope * 7,
    next7: Math.round(next7), last7, changePct: last7 ? (next7 - last7) / last7 : null, peak,
    techs: techs.size, perTechDay, staffing: perTechDay ? forecast.slice(0, 7).map((f) => ({ ...f, techsNeeded: Math.max(1, Math.ceil(f.high / Math.max(1, perTechDay))) })) : null,
  };
}
