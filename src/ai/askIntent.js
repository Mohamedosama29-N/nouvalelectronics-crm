// 💬 "اسأل السيستم" — تحويل السؤال لاستعلام منظّم (intent).
// الأرقام نفسها عمرها ما بتيجي من الذكاء الاصطناعي: هو بس بيفهم السؤال،
// والسيستم بيحسب الرقم من قاعدة البيانات. فمفيش أرقام متألّفة.
// فيه كمان محلّل محلي بالكلمات المفتاحية بيشتغل من غير أي ذكاء اصطناعي.
import { normalizeArabic } from './ticketAssist';
import { toLatinDigits } from './redact';

export const METRICS = {
  sales_total: 'إجمالي المبيعات',
  invoice_count: 'عدد الفواتير',
  avg_invoice: 'متوسط الفاتورة',
  returns_total: 'المرتجعات',
  net_sales: 'صافي المبيعات (بعد المرتجعات)',
  expenses_total: 'المصروفات',
  net_profit: 'صافي الربح التقريبي (مبيعات − مرتجعات − مصروفات)',
  top_products: 'الأصناف الأكثر مبيعًا',
  tickets_created: 'التذاكر الجديدة',
  tickets_open: 'التذاكر المفتوحة حاليًا',
};

export const PERIODS = {
  today: 'النهارده',
  yesterday: 'امبارح',
  this_week: 'الأسبوع ده',
  last_week: 'الأسبوع اللي فات',
  last_7_days: 'آخر 7 أيام',
  this_month: 'الشهر ده',
  last_month: 'الشهر اللي فات',
  last_30_days: 'آخر 30 يوم',
  this_year: 'السنة دي',
  last_year: 'السنة اللي فاتت',
  custom: 'فترة محددة',
};

const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// أول الأسبوع = السبت (المعتاد في مصر)
const startOfWeek = (d) => addDays(sod(d), -((d.getDay() + 1) % 7));

// بيرجّع [from, to) كتواريخ
export function resolvePeriod(period, now = new Date(), from, to) {
  const today = sod(now);
  switch (period) {
    case 'today': return [today, addDays(today, 1)];
    case 'yesterday': return [addDays(today, -1), today];
    case 'this_week': return [startOfWeek(now), addDays(today, 1)];
    case 'last_week': { const s = startOfWeek(now); return [addDays(s, -7), s]; }
    case 'last_7_days': return [addDays(today, -6), addDays(today, 1)];
    case 'last_month': return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
    case 'last_30_days': return [addDays(today, -29), addDays(today, 1)];
    case 'this_year': return [new Date(now.getFullYear(), 0, 1), addDays(today, 1)];
    case 'last_year': return [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1)];
    case 'custom': {
      const f = parseYMD(from); const t = parseYMD(to);
      if (f && t && f <= t) return [f, addDays(t, 1)];
      if (f) return [f, addDays(f, 1)];
      return resolvePeriod('this_month', now);
    }
    case 'this_month':
    default: return [new Date(now.getFullYear(), now.getMonth(), 1), addDays(today, 1)];
  }
}

// الفترة اللي قبلها للمقارنة (نفس الطول، أو الشهر/السنة/اليوم اللي قبل)
export function previousPeriod(period, range, now = new Date()) {
  const [f, t] = range;
  if (period === 'this_month') {
    // نفس عدد الأيام من الشهر اللي فات (مقارنة عادلة)
    const pf = new Date(f.getFullYear(), f.getMonth() - 1, 1);
    const len = Math.round((t - f) / 86400000);
    const pEndCap = new Date(f.getFullYear(), f.getMonth(), 1);
    const pt = addDays(pf, len);
    return [pf, pt < pEndCap ? pt : pEndCap];
  }
  if (period === 'last_month') return [new Date(f.getFullYear(), f.getMonth() - 1, 1), f];
  if (period === 'this_year') {
    const pf = new Date(f.getFullYear() - 1, 0, 1);
    return [pf, new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1)];
  }
  if (period === 'last_year') return [new Date(f.getFullYear() - 1, 0, 1), f];
  const len = t - f;
  return [new Date(f.getTime() - len), f];
}

const parseYMD = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const has = (text, words) => words.some((w) => text.includes(normalizeArabic(w)));

// 🔤 محلّل محلي (من غير ذكاء اصطناعي)
export function parseQuestionLocally(question, warehouses = []) {
  const t = normalizeArabic(toLatinDigits(question));
  if (!t.trim()) return null;

  let metric = null;
  if (has(t, ['تذاكر', 'تذكره', 'تذكرة', 'صيانه', 'صيانة'])) {
    metric = has(t, ['مفتوح', 'مفتوحه', 'شغال', 'متأخر', 'متاخر', 'لسه', 'معلق', 'حاليا', 'دلوقتي']) ? 'tickets_open' : 'tickets_created';
  } else if (has(t, ['اكتر', 'أكثر', 'اكثر', 'افضل', 'أفضل', 'top', 'الاعلي', 'الأعلى']) && has(t, ['منتج', 'صنف', 'اصناف', 'أصناف', 'منتجات', 'مبيع', 'بيع', 'حاجه', 'حاجة'])) {
    metric = 'top_products';
  } else if (has(t, ['ربح', 'مكسب', 'ارباح', 'أرباح'])) metric = 'net_profit';
  else if (has(t, ['مصروف', 'مصاريف', 'مصروفات'])) metric = 'expenses_total';
  else if (has(t, ['مرتجع', 'مرتجعات', 'رجوع'])) metric = 'returns_total';
  else if (has(t, ['متوسط'])) metric = 'avg_invoice';
  else if (has(t, ['صافي المبيعات', 'صافي البيع'])) metric = 'net_sales';
  else if (has(t, ['عدد الفواتير', 'كام فاتوره', 'كام فاتورة', 'فواتير', 'فاتوره', 'فاتورة'])) metric = 'invoice_count';
  else if (has(t, ['مبيعات', 'بيع', 'ايراد', 'إيراد', 'دخل', 'بعنا', 'بعت'])) metric = 'sales_total';
  if (!metric) return null;

  let period = 'this_month';
  if (has(t, ['النهارده', 'النهاردة', 'انهارده', 'اليوم', 'النهار ده'])) period = 'today';
  else if (has(t, ['امبارح', 'إمبارح', 'امس', 'أمس'])) period = 'yesterday';
  else if (has(t, ['الاسبوع اللي فات', 'الأسبوع اللي فات', 'الاسبوع الماضي', 'الأسبوع الماضي'])) period = 'last_week';
  else if (has(t, ['اخر 7', 'آخر 7', 'اخر اسبوع', 'آخر أسبوع', '7 ايام', '7 أيام'])) period = 'last_7_days';
  else if (has(t, ['الاسبوع', 'الأسبوع', 'اسبوع'])) period = 'this_week';
  else if (has(t, ['الشهر اللي فات', 'الشهر الماضي', 'الشهر السابق'])) period = 'last_month';
  else if (has(t, ['اخر 30', 'آخر 30', 'اخر شهر', 'آخر شهر', '30 يوم'])) period = 'last_30_days';
  else if (has(t, ['السنه اللي فاتت', 'السنة اللي فاتت', 'العام الماضي', 'السنه الماضيه', 'السنة الماضية'])) period = 'last_year';
  else if (has(t, ['السنه', 'السنة', 'العام', 'سنه', 'سنة'])) period = 'this_year';

  const compare = has(t, ['مقارنه', 'مقارنة', 'قارن', 'بالمقارنه', 'عن اللي فات', 'زياده', 'زيادة', 'نقص', 'اتغير']);

  let warehouseId = 'all';
  const wh = [...warehouses]
    .filter((w) => w?.name)
    .sort((a, b) => b.name.length - a.name.length)
    .find((w) => t.includes(normalizeArabic(w.name)));
  if (wh) warehouseId = wh.id;

  const topMatch = /(?:اكتر|اكثر|افضل|top)\s*(\d{1,2})|(\d{1,2})\s*(?:منتجات|اصناف|منتج|صنف)/.exec(t);
  const topN = topMatch ? Math.min(20, Math.max(1, Number(topMatch[1] || topMatch[2]))) : 5;

  return { metric, period, warehouseId, compare, topN, source: 'local' };
}

// JSON Schema للرد المنظّم من Gemini
export const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    metric: { type: 'string', enum: [...Object.keys(METRICS), 'unsupported'] },
    period: { type: 'string', enum: Object.keys(PERIODS) },
    from: { type: 'string', description: 'YYYY-MM-DD only when period=custom' },
    to: { type: 'string', description: 'YYYY-MM-DD only when period=custom' },
    warehouseId: { type: 'string', description: 'one of the given warehouse ids, or "all"' },
    compare: { type: 'boolean' },
    topN: { type: 'integer' },
  },
  required: ['metric', 'period', 'warehouseId', 'compare'],
};

export const buildIntentPrompt = (question, warehouses, now = new Date()) => ({
  system: [
    'You convert questions about a retail/repair ERP (Egyptian Arabic or English) into a JSON query. Never answer with numbers yourself.',
    `Metrics: ${Object.entries(METRICS).map(([k, v]) => `${k} = ${v}`).join('; ')}. Use "unsupported" if the question is about anything else.`,
    `Periods: ${Object.keys(PERIODS).join(', ')}. Weeks start on Saturday. Default period is this_month. Use custom with from/to (YYYY-MM-DD) only for explicit dates.`,
    'warehouseId: pick the matching id from the list, or "all". compare=true when the user asks to compare or about change/growth. topN default 5.',
  ].join('\n'),
  prompt: `Today: ${now.toISOString().slice(0, 10)}\nWarehouses: ${JSON.stringify(warehouses.map((w) => ({ id: w.id, name: w.name })))}\nQuestion: ${question}`,
});

// تنظيف رد الموديل (مبنثقش في أي قيمة من غير تحقق)
export function sanitizeIntent(raw, warehouses = []) {
  if (!raw || typeof raw !== 'object') return null;
  const metric = Object.prototype.hasOwnProperty.call(METRICS, raw.metric) ? raw.metric : (raw.metric === 'unsupported' ? 'unsupported' : null);
  if (!metric) return null;
  const period = Object.prototype.hasOwnProperty.call(PERIODS, raw.period) ? raw.period : 'this_month';
  const ids = new Set(warehouses.map((w) => w.id));
  const warehouseId = ids.has(raw.warehouseId) ? raw.warehouseId : 'all';
  const topN = Math.min(20, Math.max(1, Number.parseInt(raw.topN, 10) || 5));
  return { metric, period, from: raw.from, to: raw.to, warehouseId, compare: raw.compare === true, topN, source: 'ai' };
}

// صلاحيات: غير الأدمن (ومن غير viewAllWarehouses) بيتقفل على مخزنه مهما سأل
export function enforceScope(intent, user) {
  if (!intent) return intent;
  const all = user?.role === 'admin' || user?.permissions?.viewAllWarehouses;
  if (all) return intent;
  return { ...intent, warehouseId: user?.assignedWarehouseId || 'main', scoped: true };
}

const fmtMoney = (n) => `${Math.round(Number(n) || 0).toLocaleString()} ج`;
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString();
const fmtDate = (d) => d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

export const isMoneyMetric = (m) => ['sales_total', 'avg_invoice', 'returns_total', 'net_sales', 'expenses_total', 'net_profit'].includes(m);

// صياغة الإجابة بالعربي من الأرقام المحسوبة
export function formatAnswer(intent, result, { warehouseName = 'كل الفروع' } = {}) {
  const label = METRICS[intent.metric];
  const scope = intent.metric === 'tickets_open' ? warehouseName : `${warehouseName} — ${PERIODS[intent.period]}`;
  const range = result.range ? `${fmtDate(result.range[0])} → ${fmtDate(new Date(result.range[1].getTime() - 1))}` : '';
  const fmt = isMoneyMetric(intent.metric) ? fmtMoney : fmtNum;
  const out = { title: label, scope, range, headline: '', details: [], list: null, change: null };

  if (intent.metric === 'top_products') {
    out.list = (result.top || []).map((p, i) => ({ rank: i + 1, name: p.name, qty: p.qty, revenue: p.revenue }));
    out.headline = out.list.length ? `${out.list[0].name} هو الأعلى بـ ${fmtMoney(out.list[0].revenue)}` : 'مفيش مبيعات في الفترة دي';
    if (result.truncated) out.details.push('الحساب على أول 3000 فاتورة في الفترة (تقريبي).');
    return out;
  }
  out.headline = fmt(result.value);
  if (intent.metric === 'sales_total' || intent.metric === 'avg_invoice') out.details.push(`عدد الفواتير: ${fmtNum(result.count)}`);
  if (intent.metric === 'sales_total' && result.count) out.details.push(`متوسط الفاتورة: ${fmtMoney(result.value / result.count)}`);
  if (intent.metric === 'net_profit' || intent.metric === 'net_sales') {
    out.details.push(`المبيعات: ${fmtMoney(result.parts?.sales)}`, `المرتجعات: ${fmtMoney(result.parts?.returns)}`);
    if (intent.metric === 'net_profit') out.details.push(`المصروفات: ${fmtMoney(result.parts?.expenses)}`, 'ملحوظة: من غير تكلفة البضاعة، فده تقريبي.');
  }
  if (result.previous !== undefined && result.previous !== null) {
    const prev = Number(result.previous) || 0;
    const pct = prev ? Math.round(((result.value - prev) / Math.abs(prev)) * 100) : null;
    out.change = { previous: fmt(prev), pct, dir: pct === null ? 'na' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }
  return out;
}

export const SUGGESTED_QUESTIONS = [
  'مبيعات النهارده كام؟',
  'مبيعات الشهر ده مقارنة بالشهر اللي فات',
  'أكتر 5 أصناف مبيعًا الشهر ده',
  'كام تذكرة مفتوحة دلوقتي؟',
  'المصروفات الشهر اللي فات',
  'صافي الربح السنة دي',
];
