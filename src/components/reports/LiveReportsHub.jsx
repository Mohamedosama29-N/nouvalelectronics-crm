import React, { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Building2, Download, FileText, FileSpreadsheet, Loader2, Package, Receipt,
  RotateCcw, ShieldCheck, Truck, Users, Wallet, Wrench
} from 'lucide-react';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { LiveBadge } from '../common/LiveBadge';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { useLiveSources } from '../../hooks/useLiveSources';
import { exportToExcel } from '../../utils/exportUtils';
import { exportToPDF } from '../../utils/pdfExport';
import { showError, showSuccess } from '../../utils/alerts';
import { getTicketSLAInfo } from '../../utils/ticketHelpers';
import { MODULE_REPORTS, RANGE_OPTIONS, canViewReport, formatKpi, makeReportContext } from '../../utils/moduleReports';

const ICONS = {
  receipt: Receipt, file: FileText, package: Package, wrench: Wrench, truck: Truck, users: Users,
  undo: RotateCcw, wallet: Wallet, shield: ShieldCheck, activity: Activity, building: Building2
};

const TONES = {
  teal: 'text-teal-600 dark:text-teal-400', emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400', rose: 'text-rose-600 dark:text-rose-400',
  violet: 'text-violet-600 dark:text-violet-400', sky: 'text-sky-600 dark:text-sky-400',
  slate: 'text-slate-600 dark:text-slate-400'
};

const SOURCE_LABELS = {
  transactions: 'المبيعات', inventory: 'المخزون', tickets: 'التذاكر', transfers: 'التحويلات', customers: 'العملاء',
  returns: 'المرتجعات', returnsWarehouse: 'مخزن المرتجعات', expenses: 'المصروفات', employees: 'الموظفين',
  activity: 'سجل النشاط', logins: 'سجل الدخول'
};

const PREVIEW_ROWS = 100;

function ModuleReport({ def, appUser, warehouses, systemSettings, rangeDays }) {
  const [exporting, setExporting] = useState('');
  const baseCtx = useMemo(() => makeReportContext({ user: appUser, warehouses, rangeDays, systemSettings, getSLAInfo: getTicketSLAInfo }), [appUser, warehouses, rangeDays, systemSettings]);
  const specs = useMemo(() => def.sources(baseCtx), [def, baseCtx]);
  const { data, errors, truncated, loading, updatedAt } = useLiveSources(specs);

  // now بيتجدد مع كل وصول بيانات جديدة عشان أرقام "النهارده" تفضل صح
  const report = useMemo(() => {
    const ctx = { ...baseCtx, now: new Date() };
    return def.build(data, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, data, baseCtx, updatedAt]);

  const errorList = Object.entries(errors).filter(([, v]) => v);
  const anyTruncated = Object.values(truncated).some(Boolean);

  const filenameBase = `${def.label}_${new Date().toISOString().split('T')[0]}`;
  const handleExcel = () => {
    if (!report.table.rows.length) return showError('لا توجد بيانات للتصدير');
    setExporting('xlsx');
    const ok = exportToExcel(report.table.rows, filenameBase, def.label.slice(0, 28));
    ok ? showSuccess(`تم تصدير ${report.table.rows.length} سجل`) : showError('حدث خطأ أثناء التصدير');
    setExporting('');
  };
  const handlePdf = async () => {
    if (!report.table.rows.length) return showError('لا توجد بيانات للتصدير');
    setExporting('pdf');
    try {
      await exportToPDF(report.table.rows, `تقرير ${def.label}`, report.table.headers, {
        summary: report.kpis.filter((k) => k.value !== null && k.value !== undefined).map((k) => ({ label: k.label, value: formatKpi(k) }))
      });
      showSuccess('تم تصدير PDF');
    } catch (e) {
      console.error(e);
      showError('حدث خطأ أثناء إنشاء PDF');
    }
    setExporting('');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton type="card" count={4} />
        <LoadingSkeleton type="table" count={3} />
      </div>
    );
  }

  const shownRows = report.table.rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LiveBadge updatedAt={updatedAt} loading={loading} />
        <div className="flex gap-2">
          <button onClick={handleExcel} disabled={!!exporting} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
            {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
          </button>
          <button onClick={handlePdf} disabled={!!exporting} className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
            {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
          </button>
        </div>
      </div>

      {errorList.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>{errorList.map(([k, v]) => <p key={k}>تعذّر تحميل «{SOURCE_LABELS[k] || k}»: {v}</p>)}</div>
        </div>
      )}
      {anyTruncated && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-amber-800 dark:text-amber-300 text-xs font-bold">
          البيانات وصلت للحد الأقصى للعرض الحي، قلّل الفترة الزمنية للحصول على أرقام كاملة.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {report.kpis.map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4" title={k.hint}>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">{k.label}</p>
            <p className={`text-xl font-black ${TONES[k.tone] || TONES.slate}`}>{formatKpi(k)}</p>
            {k.hint && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{k.hint}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {report.charts.map((c) => (
          <div key={c.id} className={c.wide ? 'lg:col-span-2' : ''}>
            <AdvancedCharts data={c.data} series={c.series} type={c.type} title={c.title} height={c.wide ? 280 : 260} />
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">التفاصيل</h3>
          <span className="text-[10px] text-slate-400">
            {report.table.rows.length > PREVIEW_ROWS ? `عرض أول ${PREVIEW_ROWS} من ${report.table.rows.length} (التصدير بيشمل الكل)` : `${report.table.rows.length} سجل`}
          </span>
        </div>
        <div className="overflow-x-auto max-h-[60vh] custom-scrollbar">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold sticky top-0">
              <tr>{report.table.headers.map((h) => <th key={h} className="p-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {shownRows.length === 0 ? (
                <tr><td colSpan={report.table.headers.length} className="p-8 text-center text-slate-400">لا توجد بيانات في الفترة المختارة</td></tr>
              ) : shownRows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  {report.table.headers.map((h) => (
                    <td key={h} className="p-3 whitespace-nowrap max-w-xs truncate text-slate-700 dark:text-slate-300">
                      {typeof r[h] === 'number' ? r[h].toLocaleString('ar-EG') : (r[h] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.notes && <p className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-700">{report.notes}</p>}
      </div>
    </div>
  );
}

// مركز التقارير الحية: تقرير لكل قسم في النظام (المبيعات، الفواتير، المخزون، التذاكر،
// التحويلات، المرتجعات، العملاء، المالية، الضمان، الفريق، المخازن)
export function LiveReportsHub({ appUser, warehouses = [], systemSettings }) {
  const available = useMemo(() => MODULE_REPORTS.filter((d) => canViewReport(d, appUser)), [appUser]);
  const [activeId, setActiveId] = useState(available[0]?.id);
  const [rangeDays, setRangeDays] = useState(30);
  const def = available.find((d) => d.id === activeId) || available[0];

  if (!def) {
    return <div className="p-8 text-center text-slate-400">لا توجد تقارير متاحة لصلاحياتك.</div>;
  }

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-lg font-black text-slate-800 dark:text-white">مركز التقارير الحية</h2>
          {def.timeBound ? (
            <select
              className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
            >
              {RANGE_OPTIONS.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
            </select>
          ) : (
            <span className="text-[11px] text-slate-400">هذا التقرير لحظي بدون فترة زمنية</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {available.map((d) => {
            const Icon = ICONS[d.icon] || FileText;
            const active = d.id === def.id;
            return (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${active ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
              >
                <Icon size={14} /> {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <ModuleReport key={`${def.id}-${rangeDays}`} def={def} appUser={appUser} warehouses={warehouses} systemSettings={systemSettings} rangeDays={rangeDays} />
    </div>
  );
}
