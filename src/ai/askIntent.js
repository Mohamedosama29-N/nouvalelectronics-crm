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
  tickets_overdue: 'التذاكر المتأخرة عن الـ SLA حاليًا',
  avg_repair_time: 'متوسط وقت الصيانة',
  technician_performance: 'أداء الفنيين (صافي وقت الصيانة)',
  top_faults: 'الأعطال الأكثر تكرارًا',
  new_customers: 'العملاء الجدد',
};

// المقاييس اللي ينفع تتقسّم حسب الفرع (كل فرع لوحده)
export const GROUPABLE = ['sales_total', 'invoice_count', 'avg_invoice', 'returns_total', 'expenses_total', 'tickets_created', 'avg_repair_time'];
// مقاييس لحظية (ملهاش فترة)
export const SNAPSHOT_METRICS = ['tickets_open', 'tickets_overdue'];

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

export function detectMetric(t) {
  if (has(t, ['وقت الصيانه', 'مده الصيانه', 'متوسط الصيانه', 'وقت الاصلاح', 'مده الاصلاح', 'سرعه الصيانه', 'بتاخد قد ايه', 'بناخد قد ايه', 'بتقعد قد ايه', 'repair time'])) return 'avg_repair_time';
  if (has(t, ['الفنيين', 'اداء الفني', 'انهي فني', 'مين الفني', 'افضل فني', 'اسرع فني', 'ابطأ فني', 'ابطا فني'])) return 'technician_performance';
  if (has(t, ['اعطال', 'الاعطال', 'عطل', 'مشاكل الاجهزه'])) return 'top_faults';
  if (has(t, ['عملاء جدد', 'العملاء الجدد', 'عميل جديد', 'عملا جدد'])) return 'new_customers';
  if (has(t, ['تذاكر', 'تذكره', 'صيانه'])) {
    if (has(t, ['متاخر', 'متأخر', 'sla', 'فات ميعاد'])) return 'tickets_overdue';
    if (has(t, ['مفتوح', 'مفتوحه', 'شغال', 'لسه', 'معلق', 'حاليا', 'دلوقتي'])) return 'tickets_open';
    return 'tickets_created';
  }
  if (has(t, ['اكتر', 'أكثر', 'اكثر', 'افضل', 'أفضل', 'top', 'الاعلي', 'الأعلى']) && has(t, ['منتج', 'صنف', 'اصناف', 'أصناف', 'منتجات', 'مبيع', 'بيع', 'حاجه'])) return 'top_products';
  if (has(t, ['ربح', 'مكسب', 'ارباح', 'كسبنا'])) return 'net_profit';
  if (has(t, ['مصروف', 'مصاريف', 'مصروفات', 'صرفنا'])) return 'expenses_total';
  if (has(t, ['مرتجع', 'مرتجعات', 'رجوع'])) return 'returns_total';
  if (has(t, ['متوسط'])) return 'avg_invoice';
  if (has(t, ['صافي المبيعات', 'صافي البيع'])) return 'net_sales';
  if (has(t, ['عدد الفواتير', 'كام فاتوره', 'فواتير', 'فاتوره'])) return 'invoice_count';
  if (has(t, ['مبيعات', 'بيع', 'ايراد', 'دخل', 'بعنا', 'بعت'])) return 'sales_total';
  return null;
}

// null لو مفيش فترة مذكورة (عشان أسئلة المتابعة متغيّرش الفترة)
export function detectPeriod(t) {
  if (has(t, ['النهارده', 'انهارده', 'اليوم', 'النهار ده'])) return 'today';
  if (has(t, ['امبارح', 'امس'])) return 'yesterday';
  if (has(t, ['الاسبوع اللي فات', 'الاسبوع الماضي'])) return 'last_week';
  if (has(t, ['اخر 7', 'اخر اسبوع', '7 ايام'])) return 'last_7_days';
  if (has(t, ['الاسبوع', 'اسبوع'])) return 'this_week';
  if (has(t, ['الشهر اللي فات', 'الشهر الماضي', 'الشهر السابق'])) return 'last_month';
  if (has(t, ['اخر 30', 'اخر شهر', '30 يوم'])) return 'last_30_days';
  if (has(t, ['السنه اللي فاتت', 'العام الماضي', 'السنه الماضيه'])) return 'last_year';
  if (has(t, ['السنه', 'العام', 'سنه'])) return 'this_year';
  if (has(t, ['الشهر ده', 'الشهر دا', 'هذا الشهر', 'الشهر الحالي', 'الشهر'])) return 'this_month';
  return null;
}

export const detectCompare = (t) => has(t, ['مقارنه', 'قارن', 'بالمقارنه', 'عن اللي فات', 'زياده', 'نقص', 'اتغير']);
export const detectGroupBy = (t) => (has(t, ['حسب الفرع', 'لكل فرع', 'كل فرع', 'الفروع', 'كل الفروع', 'كل المخازن', 'حسب المخزن']) ? 'warehouse' : 'none');

export function detectWarehouse(t, warehouses = []) {
  const wh = [...warehouses].filter((w) => w?.name).sort((a, b) => b.name.length - a.name.length)
    .find((w) => t.includes(normalizeArabic(w.name)));
  return wh ? wh.id : null;
}

const detectTopN = (t) => {
  const m = /(?:اكتر|اكثر|افضل|top)\s*(\d{1,2})|(\d{1,2})\s*(?:منتجات|اصناف|منتج|صنف|اعطال|عطل)/.exec(t);
  return m ? Math.min(20, Math.max(1, Number(m[1] || m[2]))) : 5;
};

// 🔤 محلّل محلي (من غير ذكاء اصطناعي)
export function parseQuestionLocally(question, warehouses = []) {
  const t = normalizeArabic(toLatinDigits(question));
  if (!t.trim()) return null;
  const metric = detectMetric(t);
  if (!metric) return null;
  const groupBy = GROUPABLE.includes(metric) ? detectGroupBy(t) : 'none';
  return {
    metric,
    period: detectPeriod(t) || 'this_month',
    warehouseId: groupBy === 'warehouse' ? 'all' : (detectWarehouse(t, warehouses) || 'all'),
    compare: detectCompare(t),
    groupBy,
    topN: detectTopN(t),
    source: 'local',
  };
}

// 🔁 سؤال متابعة زي "وفرع 2؟" أو "والشهر اللي فات؟" أو "حسب الفرع" — بيكمّل على السؤال اللي فات
export function parseFollowUp(question, prev, warehouses = []) {
  const t = normalizeArabic(toLatinDigits(question));
  if (!prev || !t.trim()) return null;
  if (detectMetric(t)) return null; // سؤال جديد كامل
  const period = detectPeriod(t);
  const wh = detectWarehouse(t, warehouses);
  const compare = detectCompare(t);
  const groupBy = detectGroupBy(t);
  if (!period && !wh && !compare && groupBy === 'none') return null;
  return {
    ...prev,
    period: period || prev.period,
    warehouseId: groupBy === 'warehouse' ? 'all' : (wh || prev.warehouseId),
    compare: compare || false,
    groupBy: GROUPABLE.includes(prev.metric) ? (groupBy === 'warehouse' ? 'warehouse' : (wh ? 'none' : prev.groupBy || 'none')) : 'none',
    source: 'followup',
  };
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
    groupBy: { type: 'string', enum: ['none', 'warehouse'] },
    compare: { type: 'boolean' },
    topN: { type: 'integer' },
  },
  required: ['metric', 'period', 'warehouseId', 'compare'],
};

export const buildIntentPrompt = (question, warehouses, now = new Date(), previous = null) => ({
  system: [
    'You convert questions about a retail/repair ERP (Egyptian Arabic or English) into a JSON query. Never answer with numbers yourself.',
    `Metrics: ${Object.entries(METRICS).map(([k, v]) => `${k} = ${v}`).join('; ')}. Use "unsupported" if the question is about anything else.`,
    `Periods: ${Object.keys(PERIODS).join(', ')}. Weeks start on Saturday. Default period is this_month. Use custom with from/to (YYYY-MM-DD) only for explicit dates.`,
    'warehouseId: pick the matching id from the list, or "all". groupBy="warehouse" when the user wants each branch separately. compare=true when the user asks to compare or about change/growth. topN default 5.',
    'If a previous query is given and the new question is a short follow-up (e.g. "and branch 2?", "last month?"), keep the previous fields and change only what the user changed.',
  ].join('\n'),
  prompt: `Today: ${now.toISOString().slice(0, 10)}\nWarehouses: ${JSON.stringify(warehouses.map((w) => ({ id: w.id, name: w.name })))}\n${previous ? `Previous query: ${JSON.stringify({ metric: previous.metric, period: previous.period, warehouseId: previous.warehouseId, groupBy: previous.groupBy || 'none' })}\n` : ''}Question: ${question}`,
});

// تنظيف رد الموديل (مبنثقش في أي قيمة من غير تحقق)
export function sanitizeIntent(raw, warehouses = []) {
  if (!raw || typeof raw !== 'object') return null;
  const metric = Object.prototype.hasOwnProperty.call(METRICS, raw.metric) ? raw.metric : (raw.metric === 'unsupported' ? 'unsupported' : null);
  if (!metric) return null;
  const period = Object.prototype.hasOwnProperty.call(PERIODS, raw.period) ? raw.period : 'this_month';
  const ids = new Set(warehouses.map((w) => w.id));
  const groupBy = raw.groupBy === 'warehouse' && GROUPABLE.includes(metric) ? 'warehouse' : 'none';
  const warehouseId = groupBy === 'warehouse' ? 'all' : (ids.has(raw.warehouseId) ? raw.warehouseId : 'all');
  const topN = Math.min(20, Math.max(1, Number.parseInt(raw.topN, 10) || 5));
  return { metric, period, from: raw.from, to: raw.to, warehouseId, groupBy, compare: raw.compare === true, topN, source: 'ai' };
}

// صلاحيات: غير الأدمن (ومن غير viewAllWarehouses) بيتقفل على مخزنه مهما سأل
export function enforceScope(intent, user) {
  if (!intent) return intent;
  const all = user?.role === 'admin' || user?.permissions?.viewAllWarehouses;
  if (all) return intent;
  return { ...intent, warehouseId: user?.assignedWarehouseId || 'main', groupBy: 'none', scoped: true };
}

const fmtMoney = (n) => `${Math.round(Number(n) || 0).toLocaleString()} ج`;
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString();
const fmtDate = (d) => d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

export const isMoneyMetric = (m) => ['sales_total', 'avg_invoice', 'returns_total', 'net_sales', 'expenses_total', 'net_profit'].includes(m);

export const isDurationMetric = (m) => m === 'avg_repair_time' || m === 'technician_performance';

// صياغة الإجابة بالعربي من الأرقام المحسوبة
export function formatAnswer(intent, result, { warehouseName = 'كل الفروع', formatDuration = (ms) => `${(ms / 86400000).toFixed(1)} يوم` } = {}) {
  const label = METRICS[intent.metric];
  const scopeName = intent.groupBy === 'warehouse' ? 'كل فرع لوحده' : warehouseName;
  const scope = SNAPSHOT_METRICS.includes(intent.metric) ? `${scopeName} — دلوقتي` : `${scopeName} — ${PERIODS[intent.period]}`;
  const range = result.range ? `${fmtDate(result.range[0])} → ${fmtDate(new Date(result.range[1].getTime() - 1))}` : '';
  const fmt = isDurationMetric(intent.metric) ? formatDuration : isMoneyMetric(intent.metric) ? fmtMoney : fmtNum;
  const out = { title: label, scope, range, headline: '', details: [], list: null, change: null };

  if (intent.metric === 'top_products') {
    out.list = (result.top || []).map((p, i) => ({ rank: i + 1, name: p.name, right: `${p.qty.toLocaleString()} قطعة · ${fmtMoney(p.revenue)}` }));
    out.headline = out.list.length ? `${out.list[0].name} هو الأعلى` : 'مفيش مبيعات في الفترة دي';
    if (result.truncated) out.details.push('الحساب على أول 3000 فاتورة في الفترة (تقريبي).');
    return out;
  }
  if (intent.metric === 'top_faults') {
    out.list = (result.top || []).map((f, i) => ({ rank: i + 1, name: f.name, right: `${f.n} تذكرة` }));
    out.headline = out.list.length ? `«${out.list[0].name}» هو الأكثر تكرارًا` : 'مفيش أعطال متسجلة في الفترة دي';
    if (result.uncoded) out.details.push(`${result.uncoded} تذكرة من غير كود عطل.`);
    return out;
  }
  if (intent.metric === 'technician_performance') {
    out.list = (result.top || []).map((t, i) => ({ rank: i + 1, name: t.name, right: `${formatDuration(t.avg)} · ${t.count} تذكرة` }));
    out.headline = out.list.length ? `الأسرع: ${out.list[0].name}` : 'مفيش تذاكر خلصت في الفترة دي';
    out.details.push('الترتيب بصافي وقت الصيانة (من غير انتظار العميل والقطع)، لفنيين عندهم تذكرتين على الأقل.');
    return out;
  }
  if (result.groups) {
    out.list = result.groups.map((g, i) => ({ rank: i + 1, name: g.name, right: fmt(g.value) + (g.count !== undefined && intent.metric !== 'invoice_count' && intent.metric !== 'tickets_created' ? ` · ${fmtNum(g.count)}` : '') }));
    out.headline = `الإجمالي: ${fmt(result.value)}`;
    return out;
  }
  out.headline = fmt(result.value);
  if (intent.metric === 'sales_total' || intent.metric === 'avg_invoice') out.details.push(`عدد الفواتير: ${fmtNum(result.count)}`);
  if (intent.metric === 'sales_total' && result.count) out.details.push(`متوسط الفاتورة: ${fmtMoney(result.value / result.count)}`);
  if (intent.metric === 'net_profit' || intent.metric === 'net_sales') {
    out.details.push(`المبيعات: ${fmtMoney(result.parts?.sales)}`, `المرتجعات: ${fmtMoney(result.parts?.returns)}`);
    if (intent.metric === 'net_profit') out.details.push(`المصروفات: ${fmtMoney(result.parts?.expenses)}`, 'ملحوظة: من غير تكلفة البضاعة، فده تقريبي.');
  }
  if (intent.metric === 'avg_repair_time' && result.extra) {
    const x = result.extra;
    out.details.push(`صافي الشغل عندنا: ${formatDuration(x.net)}`, `الوسيط: ${formatDuration(x.median)}`, `${fmtNum(x.count)} تذكرة اتسلّمت`);
    if (x.slaRate !== null && x.slaRate !== undefined) out.details.push(`جوه الـ SLA: ${Math.round(x.slaRate * 100)}%`);
    if (!x.count) out.headline = 'مفيش تذاكر خلصت في الفترة دي';
  }
  if (intent.metric === 'tickets_overdue' && result.examples?.length) out.details.push(`أقدمها: ${result.examples.join('، ')}`);
  if (result.previous !== undefined && result.previous !== null) {
    const prev = Number(result.previous) || 0;
    const pct = prev ? Math.round(((result.value - prev) / Math.abs(prev)) * 100) : null;
    // في وقت الصيانة: الزيادة وحشة، فبنقلب اللون
    const good = isDurationMetric(intent.metric) ? -1 : 1;
    out.change = {
      previous: fmt(prev), pct,
      dir: pct === null ? 'na' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
      tone: pct === null || pct === 0 ? 'neutral' : pct * good > 0 ? 'good' : 'bad',
    };
  }
  return out;
}

export const SUGGESTED_QUESTIONS = [
  'مبيعات النهارده كام؟',
  'متوسط وقت الصيانة الشهر ده',
  'مبيعات كل فرع الشهر ده',
  'أداء الفنيين الشهر اللي فات',
  'أكتر الأعطال تكرارًا',
  'مبيعات الشهر ده مقارنة بالشهر اللي فات',
  'أكتر 5 أصناف مبيعًا الشهر ده',
  'كام تذكرة مفتوحة دلوقتي؟',
  'المصروفات الشهر اللي فات',
  'صافي الربح السنة دي',
];
