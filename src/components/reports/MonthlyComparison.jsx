import React, { useState, useMemo } from 'react';
import { collection, getDocs, getCountFromServer, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, Loader2, TrendingUp, TrendingDown, Minus, FileDown, Download } from 'lucide-react';
import { db } from '../../firebase/config';
import { showError, showSuccess } from '../../utils/alerts';
import { exportToExcel } from '../../utils/exportUtils';
import { exportToPDF } from '../../utils/pdfExport';
import { monthRange, previousMonth, pctChange, summarizeTransactions } from '../../utils/reportHelpers';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const money = (n) => `${Math.round(n).toLocaleString('ar-EG')} ج`;
const MAX_DOCS = 5000;

function Delta({ current, previous, inverse = false }) {
  const p = pctChange(current, previous);
  if (p === null) return <span className="text-[10px] text-slate-400">جديد</span>;
  if (Math.abs(p) < 0.05) return <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"><Minus size={11}/> 0%</span>;
  const good = inverse ? p < 0 : p > 0;
  const Icon = p > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`text-[11px] font-black inline-flex items-center gap-0.5 ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon size={12}/> {p > 0 ? '+' : ''}{p.toFixed(1)}%
    </span>
  );
}

// مقارنة شهر بشهر: المبيعات الصافية، عدد الفواتير، المتوسط، المرتجعات، التذاكر،
// ومنحنى المبيعات اليومي + أعلى الأصناف. قابلة للتصدير PDF/Excel.
export function MonthlyComparison({ warehouses = [] }) {
  const [monthA, setMonthA] = useState(thisMonth());
  const [monthB, setMonthB] = useState(previousMonth(thisMonth()));
  const [warehouse, setWarehouse] = useState('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const loadMonth = async (ym) => {
    const { start, end, daysInMonth } = monthRange(ym);
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);
    const [txSnap, ticketsCount] = await Promise.all([
      getDocs(query(collection(db, 'transactions'), where('timestamp', '>=', startTs), where('timestamp', '<=', endTs), orderBy('timestamp', 'desc'), limit(MAX_DOCS))),
      getCountFromServer(query(collection(db, 'tickets'), where('createdAt', '>=', startTs), where('createdAt', '<=', endTs)))
    ]);
    let list = txSnap.docs.map(d => d.data());
    if (warehouse !== 'all') list = list.filter(t => (t.warehouseId || 'main') === warehouse);
    return { ...summarizeTransactions(list, daysInMonth), tickets: ticketsCount.data().count, truncated: txSnap.size >= MAX_DOCS, daysInMonth };
  };

  const handleCompare = async () => {
    if (!monthA || !monthB) return showError('اختر الشهرين');
    if (monthA === monthB) return showError('اختر شهرين مختلفين');
    setLoading(true);
    try {
      const [a, b] = await Promise.all([loadMonth(monthA), loadMonth(monthB)]);
      setResult({ a, b, monthA, monthB });
    } catch (e) {
      console.error(e);
      showError(e.code === 'permission-denied' ? 'خطأ في الصلاحيات' : 'فشل تحميل المقارنة: ' + e.message);
    }
    setLoading(false);
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    const days = Math.max(result.a.daysInMonth, result.b.daysInMonth);
    let ca = 0, cb = 0;
    return Array.from({ length: days }, (_, i) => {
      ca += result.a.daily[i] || 0;
      cb += result.b.daily[i] || 0;
      return {
        day: i + 1,
        [result.monthA]: i < result.a.daysInMonth ? ca : null,
        [result.monthB]: i < result.b.daysInMonth ? cb : null
      };
    });
  }, [result]);

  const metrics = result ? [
    { label: 'صافي المبيعات', a: result.a.net, b: result.b.net, fmt: money },
    { label: 'إجمالي المبيعات', a: result.a.sales, b: result.b.sales, fmt: money },
    { label: 'عدد الفواتير', a: result.a.salesCount, b: result.b.salesCount, fmt: (n) => String(n) },
    { label: 'متوسط الفاتورة', a: result.a.avgInvoice, b: result.b.avgInvoice, fmt: money },
    { label: 'المرتجعات', a: result.a.returns, b: result.b.returns, fmt: money, inverse: true },
    { label: 'تذاكر الصيانة المفتوحة', a: result.a.tickets, b: result.b.tickets, fmt: (n) => String(n) }
  ] : [];

  const rowsForExport = () => metrics.map(m => ({
    'المؤشر': m.label,
    [result.monthA]: m.fmt(m.a),
    [result.monthB]: m.fmt(m.b),
    'التغيّر': pctChange(m.a, m.b) === null ? 'جديد' : `${pctChange(m.a, m.b).toFixed(1)}%`
  }));

  const handlePDF = async () => {
    try {
      const rows = rowsForExport();
      const tops = result.a.topProducts.map((p, i) => ({
        'المؤشر': `أعلى صنف ${i + 1}: ${p.name}`,
        [result.monthA]: `${p.qty} قطعة`,
        [result.monthB]: `${result.b.topProducts.find(x => (x.serialNumber || x.name) === (p.serialNumber || p.name))?.qty || 0} قطعة`,
        'التغيّر': '-'
      }));
      await exportToPDF([...rows, ...tops], `مقارنة ${result.monthA} مع ${result.monthB}`, ['المؤشر', result.monthA, result.monthB, 'التغيّر'], {
        summary: [
          { label: `صافي ${result.monthA}`, value: money(result.a.net) },
          { label: `صافي ${result.monthB}`, value: money(result.b.net) },
          { label: 'التغيّر', value: pctChange(result.a.net, result.b.net) === null ? 'جديد' : `${pctChange(result.a.net, result.b.net).toFixed(1)}%` }
        ]
      });
      showSuccess('تم تصدير PDF');
    } catch (e) { console.error(e); showError('فشل تصدير PDF'); }
  };

  const handleExcel = () => {
    exportToExcel(rowsForExport(), `مقارنة_${result.monthA}_${result.monthB}`, 'المقارنة');
    showSuccess('تم تصدير Excel');
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-6 text-right" dir="rtl">
      <div className="p-5 border-b bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-end gap-3">
        <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2 ml-auto">
          <BarChart3 className="text-teal-600" size={20}/> مقارنة شهرية
        </h2>
        <label className="text-xs font-bold text-slate-500">الشهر
          <input type="month" value={monthA} onChange={e => setMonthA(e.target.value)} className="block border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900" />
        </label>
        <label className="text-xs font-bold text-slate-500">مقارنة بـ
          <input type="month" value={monthB} onChange={e => setMonthB(e.target.value)} className="block border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900" />
        </label>
        <label className="text-xs font-bold text-slate-500">المخزن
          <select value={warehouse} onChange={e => setWarehouse(e.target.value)} className="block border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900">
            <option value="all">كل المخازن</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={handleCompare} disabled={loading} className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin"/> : <BarChart3 size={16}/>} قارن
        </button>
      </div>

      {result && (
        <div className="p-5 space-y-5">
          {(result.a.truncated || result.b.truncated) && (
            <p className="text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
              الشهر فيه أكتر من {MAX_DOCS} معاملة، فالأرقام تقريبية (أحدث {MAX_DOCS} معاملة).
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {metrics.map(m => (
              <div key={m.label} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4">
                <p className="text-[11px] font-bold text-slate-500 mb-1">{m.label}</p>
                <p className="text-xl font-black text-slate-800 dark:text-white">{m.fmt(m.a)}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-400">{result.monthB}: {m.fmt(m.b)}</span>
                  <Delta current={m.a} previous={m.b} inverse={m.inverse} />
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">المبيعات التراكمية خلال الشهر</h3>
            <div style={{ width: '100%', height: 260 }} dir="ltr">
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => (v == null ? '-' : money(v))} labelFormatter={(d) => `يوم ${d}`} />
                  <Legend />
                  <Line type="monotone" dataKey={result.monthA} stroke="#0d9488" strokeWidth={2.5} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey={result.monthB} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[[result.monthA, result.a], [result.monthB, result.b]].map(([ym, s]) => (
              <div key={ym} className="border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                <h4 className="font-black text-sm text-slate-700 dark:text-slate-200 mb-2">أعلى الأصناف - {ym}</h4>
                {s.topProducts.length === 0 ? <p className="text-xs text-slate-400">لا توجد مبيعات</p> : (
                  <ol className="space-y-1.5">
                    {s.topProducts.map((p, i) => (
                      <li key={i} className="flex justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300 truncate">{i + 1}. {p.name}</span>
                        <span className="text-slate-500 shrink-0">{p.qty} قطعة · {money(p.revenue)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handlePDF} className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-rose-100"><FileDown size={14}/> تصدير PDF</button>
            <button type="button" onClick={handleExcel} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100"><Download size={14}/> تصدير Excel</button>
          </div>
          <p className="text-[10px] text-slate-400">الصافي = المبيعات − المرتجعات. أعلى الأصناف بالكمية (الخدمات مستبعدة) والإيراد تقريبي قبل الخصم.</p>
        </div>
      )}
    </div>
  );
}
