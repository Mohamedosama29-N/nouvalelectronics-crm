import React, { useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Timer, Loader2, Download, Sparkles, Wand2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { db } from '../../firebase/config';
import { buildRepairTimeReport, formatDuration, repairInsights } from '../../ai/repairTime';
import { askText, friendlyAIError, isAIFeatureOn } from '../../ai/aiClient';
import { AdvancedCharts } from '../common/AdvancedCharts';
import { exportToExcel } from '../../utils/exportUtils';
import { showError } from '../../utils/alerts';
import { requestNavigation } from '../../utils/appEvents';
import { canSeeWarehouse } from '../../utils/liveStats';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS = [
  ['30', 'آخر 30 يوم', (n) => [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29), n]],
  ['month', 'الشهر ده', (n) => [new Date(n.getFullYear(), n.getMonth(), 1), n]],
  ['last_month', 'الشهر اللي فات', (n) => [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]],
  ['90', 'آخر 90 يوم', (n) => [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 89), n]],
  ['year', 'السنة دي', (n) => [new Date(n.getFullYear(), 0, 1), n]],
];
const BAR = { work: 'bg-teal-500', customer: 'bg-amber-400', parts: 'bg-rose-500', factory: 'bg-violet-500' };
const ICON = { warn: <AlertTriangle size={14} className="text-amber-500 shrink-0" />, good: <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />, info: <Info size={14} className="text-sky-500 shrink-0" /> };

const cache = new Map();

export function RepairTimeReport({ appUser, warehouses = [], systemSettings }) {
  const now = new Date();
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const own = appUser?.assignedWarehouseId || 'main';
  const [from, setFrom] = useState(ymd(PRESETS[0][2](now)[0]));
  const [to, setTo] = useState(ymd(now));
  const [center, setCenter] = useState(seeAll ? 'all' : own);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || (id === 'main' ? 'الرئيسي' : id);

  const range = useMemo(() => {
    const f = new Date(`${from}T00:00:00`); const t = new Date(`${to}T00:00:00`); t.setDate(t.getDate() + 1);
    return Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f >= t ? null : [f, t];
  }, [from, to]);

  const load = async () => {
    if (!range) { showError('اختار فترة صحيحة (من قبل إلى)'); return; }
    const wh = seeAll ? center : own;
    const key = `${wh}|${from}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) { setData(hit); return; }
    setLoading(true); setAiText('');
    try {
      // أي تذكرة خلصت جوه الفترة لازم يكون آخر تعديل عليها بعد بداية الفترة
      const cons = [];
      if (wh !== 'all') cons.push(where('assignedCenter', '==', wh));
      cons.push(where('updatedAt', '>=', range[0]), orderBy('updatedAt', 'desc'), limit(5000));
      const snap = await getDocs(query(collection(db, 'tickets'), ...cons));
      const entry = { at: Date.now(), tickets: snap.docs.map((d) => ({ id: d.id, ...d.data() })), truncated: snap.size >= 5000, wh };
      cache.set(key, entry);
      setData(entry);
    } catch (e) {
      console.error(e);
      showError(e?.code === 'failed-precondition' ? 'محتاج Index: شغّل firebase deploy --only firestore:indexes' : 'معرفتش أحمّل التذاكر.');
    } finally { setLoading(false); }
  };

  const report = useMemo(() => {
    if (!data || !range) return null;
    const scope = (c) => (data.wh === 'all' ? (seeAll || canSeeWarehouse(appUser, c)) : c === data.wh);
    return buildRepairTimeReport(data.tickets, { from: range[0], to: range[1], slaHours: systemSettings?.ticketSLA, warehouseName: whName, scope });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range, systemSettings, appUser, seeAll]);
  const insights = useMemo(() => (report ? repairInsights(report) : []), [report]);

  const analyzeAI = async () => {
    if (!report?.count) return;
    // أسماء الفنيين بتتبعت كأكواد (فني 1، فني 2) وبنرجّعها محليًا
    const aliases = new Map(report.byTechnician.map((t, i) => [t.name, `فني ${i + 1}`]));
    const d = (ms) => +(ms / 86400000).toFixed(2);
    const payload = {
      period: `${from} → ${to}`, repairedTickets: report.count, notRepaired: report.notRepaired,
      avgTotalDays: d(report.total.avg), medianTotalDays: d(report.total.median), p90TotalDays: d(report.total.p90),
      avgNetDays: d(report.net.avg), avgToReadyDays: d(report.toReady.avg),
      slaRate: report.slaRate === null ? null : Math.round(report.slaRate * 100),
      timeShare: Object.fromEntries(report.breakdown.map((b) => [b.name, Math.round(b.share * 100)])),
      technicians: report.byTechnician.slice(0, 12).map((t) => ({ name: aliases.get(t.name), tickets: t.count, avgNetDays: d(t.avg) })),
      devices: report.byDevice.slice(0, 10).map((t) => ({ device: t.name, tickets: t.count, avgDays: d(t.avg) })),
      weekly: report.weekly,
    };
    setAiBusy(true);
    try {
      let text = await askText(systemSettings, {
        system: 'أنت مدير عمليات مركز صيانة في مصر. حلّل أرقام وقت الصيانة دي واكتب 4-6 نقاط قصيرة بالعامية المصرية المهنية: أهم ملاحظة، فين الوقت بيضيع، مقارنة الفنيين والأجهزة، والاتجاه الأسبوعي، ثم 2-3 توصيات عملية محددة. استخدم الأرقام الموجودة بس ومتخترعش أرقام. اكتب كل نقطة في سطر يبدأ بـ "•".',
        prompt: JSON.stringify(payload),
        temperature: 0.3,
      });
      aliases.forEach((alias, name) => { text = String(text).split(alias).join(name); });
      setAiText(String(text).trim());
    } catch (e) { showError(friendlyAIError(e)); }
    finally { setAiBusy(false); }
  };

  const exportRows = () => {
    if (!report?.rows.length) return;
    exportToExcel(report.rows.map((r) => ({
      'التذكرة': r.ticketNumber, 'الجهاز': r.device, 'الفني': r.technician, 'الفرع': whName(r.center), 'الأولوية': r.priority,
      'تاريخ الفتح': r.createdAt.toISOString().slice(0, 16).replace('T', ' '), 'تاريخ الإنهاء': r.completedAt.toISOString().slice(0, 16).replace('T', ' '),
      'الإجمالي (ساعة)': +(r.total / 3600000).toFixed(1), 'الصافي (ساعة)': +(r.net / 3600000).toFixed(1),
      'انتظار العميل (ساعة)': +(r.waitCustomer / 3600000).toFixed(1), 'انتظار القطع (ساعة)': +(r.waitParts / 3600000).toFixed(1),
      'تقديري': r.estimated ? 'نعم' : '',
    })), `Repair_Time_${from}_${to}`, 'وقت الصيانة');
  };

  const kpis = report ? [
    { label: 'متوسط وقت الصيانة (إجمالي)', value: formatDuration(report.total.avg), sub: `الوسيط ${formatDuration(report.total.median)}`, cls: 'from-teal-500 to-teal-700' },
    { label: 'صافي الشغل عندنا', value: formatDuration(report.net.avg), sub: 'من غير انتظار العميل والقطع', cls: 'from-violet-500 to-violet-700' },
    { label: 'لحد ما الجهاز يبقى جاهز', value: formatDuration(report.toReady.avg), sub: 'من الاستلام للاتصال بالعميل', cls: 'from-sky-500 to-sky-700' },
    { label: 'جوه مهلة الـ SLA', value: report.slaRate === null ? '—' : `${Math.round(report.slaRate * 100)}%`, sub: `${report.count} تذكرة اتصلحت · ${report.notRepaired} اترفضت`, cls: 'from-emerald-500 to-emerald-700' },
  ] : [];

  const groupTable = (title, rows, metricLabel) => (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
      <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">{title}</p>
      {rows.length === 0 ? <p className="text-xs text-slate-400">لا يوجد</p> : (
        <div className="space-y-2">
          {rows.slice(0, 8).map((r) => {
            const max = Math.max(...rows.slice(0, 8).map((x) => x.avg)) || 1;
            return (
              <div key={r.key}>
                <div className="flex justify-between text-xs"><span className="font-bold text-slate-700 dark:text-slate-200 truncate">{r.name}</span><span className="text-slate-500 shrink-0">{formatDuration(r.avg)} · {r.count}</span></div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mt-1"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${(r.avg / max) * 100}%`, transition: 'width 600ms ease' }} /></div>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-400 pt-1">{metricLabel}</p>
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-4" dir="rtl">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4 anim-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Timer size={20} className="text-teal-600" /> متوسط وقت الصيانة</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">للتذاكر اللي اتسلّمت أو اتقفلت جوه الفترة — محسوب من سجل حالات كل تذكرة.</p>
          </div>
          <button type="button" onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700 active:scale-[0.98] transition disabled:opacity-60">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Timer size={16} />} احسب
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-xs font-bold text-slate-500">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([id, label, fn]) => (
              <button key={id} type="button" onClick={() => { const [f, t] = fn(new Date()); setFrom(ymd(f)); setTo(ymd(t)); }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 hover:text-teal-700">{label}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1">من<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500" /></label>
          <label className="flex flex-col gap-1">إلى<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500" /></label>
          {seeAll && (
            <label className="flex flex-col gap-1">الفرع
              <select value={center} onChange={(e) => setCenter(e.target.value)} className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="all">كل الفروع</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          {report && <button type="button" onClick={exportRows} className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200"><Download size={14} /> تصدير Excel</button>}
        </div>
        {data?.truncated && <p className="text-[11px] text-amber-600">اتقرا أول 5000 تذكرة اتعدّلت من بداية الفترة — ضيّق الفترة لدقة كاملة.</p>}
      </div>

      {!report && !loading && (
        <div className="p-10 text-center text-slate-400 text-sm bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Timer size={36} className="mx-auto mb-3 opacity-40 anim-float" /> اختار الفترة واضغط "احسب".
        </div>
      )}

      {report && report.count === 0 && (
        <div className="p-8 text-center text-slate-500 text-sm bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">مفيش تذاكر اتسلّمت أو اتقفلت في الفترة دي.</div>
      )}

      {report && report.count > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((k, i) => (
              <div key={k.label} className={`anim-up card-lift rounded-2xl p-4 text-white bg-gradient-to-br ${k.cls} shadow-sm`} style={{ '--d': `${i * 60}ms` }}>
                <p className="text-[11px] font-bold opacity-90">{k.label}</p>
                <p className="text-2xl font-black mt-2">{k.value}</p>
                <p className="text-[11px] opacity-80 mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 anim-up">
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-3">الوقت بيروح فين؟</p>
              <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                {report.breakdown.map((b) => b.share > 0 && <div key={b.key} className={BAR[b.key]} style={{ width: `${b.share * 100}%`, transition: 'width 700ms ease' }} title={`${b.name} ${Math.round(b.share * 100)}%`} />)}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {report.breakdown.map((b) => (
                  <div key={b.key} className="flex items-center gap-2 text-xs"><span className={`w-3 h-3 rounded ${BAR[b.key]}`} /><span className="text-slate-600 dark:text-slate-300">{b.name}</span><b className="mr-auto">{Math.round(b.share * 100)}%</b></div>
                ))}
              </div>
              {insights.length > 0 && (
                <div className="mt-4 space-y-1.5 border-t border-slate-100 dark:border-slate-700 pt-3">
                  {insights.map((x, i) => <p key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">{ICON[x.level]} {x.text}</p>)}
                </div>
              )}
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 anim-up">
              <AdvancedCharts data={report.weekly} type="line" height={220} title="متوسط وقت الصيانة أسبوعيًا (بالأيام)"
                series={[{ key: 'avgDays', name: 'الإجمالي' }, { key: 'netDays', name: 'الصافي' }]} />
            </div>
          </div>

          <div className="bg-gradient-to-l from-violet-50 to-teal-50 dark:from-violet-950/30 dark:to-teal-950/30 rounded-2xl border border-violet-100 dark:border-violet-900/50 p-4 anim-up">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-violet-700 dark:text-violet-300 flex items-center gap-1.5"><Sparkles size={16} /> تحليل وتوصيات</p>
              {aiOn ? (
                <button type="button" onClick={analyzeAI} disabled={aiBusy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                  {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} حلّل بالذكاء الاصطناعي
                </button>
              ) : <span className="text-[11px] text-slate-500">فعّل Gemini من الإعدادات للتحليل والتوصيات المكتوبة</span>}
            </div>
            {aiText && <div className="anim-pop mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/60 rounded-xl p-3">{aiText}</div>}
            {aiOn && <p className="text-[10px] text-slate-400 mt-2">بيتبعت أرقام مجمّعة بس، وأسماء الفنيين بتتبعت كأكواد.</p>}
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {groupTable('حسب الفني', report.byTechnician, 'صافي الوقت (من غير انتظار العميل والقطع)')}
            {groupTable('حسب الفرع', report.byCenter, 'الوقت الإجمالي')}
            {groupTable('حسب نوع الجهاز', report.byDevice, 'الوقت الإجمالي')}
            {groupTable('حسب الأولوية', report.byPriority, 'الوقت الإجمالي')}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">أطول 10 تذاكر</p>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm text-right">
                <thead className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-900"><tr><th className="p-2">التذكرة</th><th className="p-2">الجهاز</th><th className="p-2">الفني</th><th className="p-2">الإجمالي</th><th className="p-2">انتظار عميل</th><th className="p-2">انتظار قطع</th></tr></thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                  {report.slowest.map((r) => (
                    <tr key={r.id} onClick={() => requestNavigation('tickets', { kind: 'ticket', id: r.id })} className="cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20">
                      <td className="p-2 font-bold text-teal-700 dark:text-teal-300">{r.ticketNumber || r.id}{r.estimated && <span className="text-[10px] text-slate-400"> (تقديري)</span>}</td>
                      <td className="p-2 text-xs">{r.device}</td><td className="p-2 text-xs">{r.technician}</td>
                      <td className="p-2 font-bold">{formatDuration(r.total)}</td><td className="p-2 text-xs">{formatDuration(r.waitCustomer)}</td><td className="p-2 text-xs">{formatDuration(r.waitParts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {report.estimatedCount > 0 && <p className="text-[11px] text-slate-400">{report.estimatedCount} تذكرة قديمة مفيهاش سجل حالات، فوقتها اتحسب تقديري من تاريخ التسليم/آخر تعديل.</p>}
        </>
      )}
    </section>
  );
}
