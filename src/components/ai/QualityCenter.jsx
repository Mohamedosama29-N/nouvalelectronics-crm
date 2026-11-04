import React, { useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Award, Loader2, RefreshCw, Clock, Repeat, Bug, Smile, Users, FileText, Printer, Sparkles, Wand2, TrendingUp, AlertTriangle } from 'lucide-react';
import { db } from '../../firebase/config';
import { loadOpenTickets } from '../../ai/ticketPool';
import { agingReport, AGING_BUCKETS, repeatRepairs, faultsByModel, faultSpikes, satisfactionSummary, centerScorecard, technicianScorecard, maintenanceCenterScorecard } from '../../ai/quality';
import { analyzeTicket, buildRepairTimeReport, formatDuration } from '../../ai/repairTime';
import { askText, friendlyAIError, isAIFeatureOn } from '../../ai/aiClient';
import { exportToExcel } from '../../utils/exportUtils';
import { showError } from '../../utils/alerts';
import { requestNavigation } from '../../utils/appEvents';
import { ticketWarehouseOf } from '../../utils/liveStats';

const DAY = 86400000;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const PRESETS = [
  ['month', 'الشهر ده', (n) => [new Date(n.getFullYear(), n.getMonth(), 1), n]],
  ['last_month', 'الشهر اللي فات', (n) => [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]],
  ['30', 'آخر 30 يوم', (n) => [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29), n]],
  ['90', 'آخر 90 يوم', (n) => [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 89), n]],
];
const TABS = [
  ['overview', 'نظرة عامة', <Award size={14} key="i" />], ['aging', 'أعمار التذاكر', <Clock size={14} key="i" />],
  ['repeats', 'الأجهزة اللي رجعت', <Repeat size={14} key="i" />], ['faults', 'أعطال الموديلات', <Bug size={14} key="i" />],
  ['satisfaction', 'رضا العملاء', <Smile size={14} key="i" />], ['technicians', 'تقييم الفنيين', <Users size={14} key="i" />],
  ['monthly', 'التقرير الشهري', <FileText size={14} key="i" />],
];
const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const th = 'p-2 text-[11px] text-slate-500 font-bold';
const td = 'p-2 text-xs';

function Kpi({ label, value, sub, cls = 'from-teal-500 to-teal-700', i = 0 }) {
  return (
    <div className={`anim-up card-lift rounded-2xl p-4 text-white bg-gradient-to-br ${cls}`} style={{ '--d': `${i * 50}ms` }}>
      <p className="text-[11px] font-bold opacity-90">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
      {sub && <p className="text-[11px] opacity-80 mt-1">{sub}</p>}
    </div>
  );
}

function ScoreTable({ rows, nameLabel, extra }) {
  if (!rows.length) return <p className="text-sm text-slate-400 p-4">مفيش بيانات في الفترة دي.</p>;
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-right">
        <thead className="bg-slate-50 dark:bg-slate-900"><tr>
          <th className={th}>#</th><th className={th}>{nameLabel}</th><th className={th}>الدرجة</th><th className={th}>جديدة</th><th className={th}>خلصت</th>
          <th className={th}>متوسط الوقت</th><th className={th}>جوه SLA</th><th className={th}>رجعت تاني</th><th className={th}>الرضا /10</th><th className={th}>مفتوحة (متأخرة)</th>{extra && <th className={th}>{extra.label}</th>}
        </tr></thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
          {rows.map((r, i) => (
            <tr key={r.key} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
              <td className={td}>{i + 1}</td>
              <td className={`${td} font-bold`}>{r.name}</td>
              <td className={td}>{r.score === null ? '—' : (
                <span className={`px-2 py-0.5 rounded-lg font-black ${r.score >= 75 ? 'bg-emerald-100 text-emerald-700' : r.score >= 55 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{r.score}</span>
              )}</td>
              <td className={td}>{r.created}</td><td className={td}>{r.completed}</td>
              <td className={td}>{r.avgTotal ? formatDuration(r.avgTotal) : '—'}</td>
              <td className={td}>{pct(r.slaRate)}</td>
              <td className={td}>{r.repeats ? `${r.repeats} (${pct(r.repeatRate)})` : '0'}</td>
              <td className={td}>{r.satisfaction ? `${r.satisfaction.toFixed(1)} (${r.rated})` : '—'}</td>
              <td className={td}>{r.open}{r.overdueOpen ? <span className="text-rose-600"> ({r.overdueOpen})</span> : ''}</td>
              {extra && <td className={td}>{extra.render(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-2">الدرجة من 100: الالتزام بالـ SLA (35) + السرعة مقارنة بالباقيين (25) + عدم رجوع الأجهزة (20) + رضا العملاء (20).</p>
    </div>
  );
}

export function QualityCenter({ appUser, warehouses = [], systemSettings }) {
  const now = new Date();
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const own = appUser?.assignedWarehouseId || 'main';
  const [tab, setTab] = useState('overview');
  const [dim, setDim] = useState('mcenter'); // ترتيب حسب مركز الصيانة أو الفرع
  const [from, setFrom] = useState(ymd(PRESETS[0][2](now)[0]));
  const [to, setTo] = useState(ymd(now));
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
    if (!range) { showError('اختار فترة صحيحة'); return; }
    setLoading(true); setAiText('');
    try {
      const since = new Date(range[0].getTime() - 90 * DAY); // عشان نلاقي الإصلاح السابق للأجهزة اللي رجعت
      const cons = seeAll ? [] : [where('assignedCenter', '==', own)];
      cons.push(where('updatedAt', '>=', since), orderBy('updatedAt', 'desc'), limit(8000));
      const [snap, open] = await Promise.all([getDocs(query(collection(db, 'tickets'), ...cons)), loadOpenTickets().catch(() => [])]);
      setData({
        tickets: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        open: open.filter((t) => seeAll || ticketWarehouseOf(t) === own),
        truncated: snap.size >= 8000,
      });
    } catch (e) {
      console.error(e);
      showError(e?.code === 'failed-precondition' ? 'محتاج Index: شغّل firebase deploy --only firestore:indexes' : 'معرفتش أحمّل البيانات.');
    } finally { setLoading(false); }
  };

  const rep = useMemo(() => {
    if (!data || !range) return null;
    const [f, t] = range;
    const days = Math.max(1, Math.round((t - f) / DAY));
    const repeats = repeatRepairs(data.tickets, { windowDays: 90, from: f, to: t });
    const opts = { from: f, to: t, slaHours: systemSettings?.ticketSLA, repeats, openTickets: data.open, warehouseName: whName };
    const inPeriod = data.tickets.filter((x) => { const c = x.createdAt?.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return c >= f && c < t; });
    return {
      aging: agingReport(data.open, { warehouseName: whName }),
      repeats,
      faults: faultsByModel(data.tickets, { from: f, to: t }),
      spikes: faultSpikes(data.tickets, { now: t < new Date() ? t : new Date(), days: Math.min(30, days) }),
      // الرضا للتذاكر اللي خلصت جوه الفترة
      satisfaction: satisfactionSummary(data.tickets.filter((x) => { const a = analyzeTicket(x); return a && a.completedAt >= f && a.completedAt < t; })),
      centers: centerScorecard(data.tickets, opts),
      mcenters: maintenanceCenterScorecard(data.tickets, opts),
      techs: technicianScorecard(data.tickets, opts),
      time: buildRepairTimeReport(data.tickets, { from: f, to: t, slaHours: systemSettings?.ticketSLA, warehouseName: whName }),
      created: inPeriod.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range, systemSettings]);

  const narrative = async () => {
    if (!rep) return;
    const aliases = new Map(); const alias = (n) => { if (!aliases.has(n)) aliases.set(n, `فني ${aliases.size + 1}`); return aliases.get(n); };
    const d = (ms) => (ms ? +(ms / DAY).toFixed(1) : null);
    setAiBusy(true);
    try {
      let text = await askText(systemSettings, {
        system: 'أنت مدير جودة لشبكة مراكز صيانة أجهزة في مصر. اكتب تقرير شهري مختصر بالعامية المصرية المهنية: (1) ملخص الأداء في 3 سطور، (2) أهم 3 مشاكل بالأرقام، (3) المراكز/الفنيين الأفضل والأضعف، (4) 3-5 توصيات عملية للشهر الجاي. استخدم الأرقام الموجودة بس. عناوين قصيرة ونقاط تبدأ بـ "•".',
        prompt: JSON.stringify({
          period: `${from} → ${to}`, created: rep.created, completed: rep.time.count, avgDays: d(rep.time.total.avg), netDays: d(rep.time.net.avg), slaRate: rep.time.slaRate,
          satisfaction: { avg10: rep.satisfaction.avg, csat: rep.satisfaction.csat, nps: rep.satisfaction.nps, rated: rep.satisfaction.count },
          repeats: rep.repeats.length, openAging: rep.aging.totals,
          centers: rep.centers.map((c) => ({ name: c.name, score: c.score, completed: c.completed, avgDays: d(c.avgTotal), sla: c.slaRate, repeats: c.repeats, sat: c.satisfaction })),
          technicians: rep.techs.slice(0, 10).map((c) => ({ name: alias(c.name), score: c.score, completed: c.completed, netDays: d(c.medianNet), sla: c.slaRate, repeats: c.repeats })),
          topFaults: rep.faults.slice(0, 8).map((x) => ({ model: x.model, fault: x.fault, count: x.count })),
          spikes: rep.spikes.slice(0, 5).map((x) => ({ model: x.model, fault: x.fault, count: x.count, previous: x.previous })),
        }),
        temperature: 0.3,
      });
      aliases.forEach((a, n) => { text = String(text).split(a).join(n); });
      setAiText(String(text).trim());
    } catch (e) { showError(friendlyAIError(e)); }
    finally { setAiBusy(false); }
  };

  const printMonthly = () => {
    if (!rep) return;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rows = (list, cols) => list.map((r) => `<tr>${cols.map((c) => `<td>${esc(c(r))}</td>`).join('')}</tr>`).join('');
    const company = systemSettings?.storeName || '';
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>التقرير الشهري ${esc(from)} - ${esc(to)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;margin:24px;color:#0f172a}h1{font-size:20px;margin:0}h2{font-size:15px;margin:20px 0 8px;border-bottom:2px solid #0d9488;padding-bottom:4px}
.k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.k div{border:1px solid #e2e8f0;border-radius:8px;padding:8px}.k b{display:block;font-size:18px}
table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #e2e8f0;padding:5px;text-align:right}th{background:#f1f5f9}pre{white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8}small{color:#64748b}</style></head><body>
<h1>التقرير الشهري للصيانة ${company ? `— ${esc(company)}` : ''}</h1><small>${esc(from)} → ${esc(to)}</small>
<h2>المؤشرات</h2><div class="k">
<div>تذاكر جديدة<b>${rep.created}</b></div><div>اتسلّمت<b>${rep.time.count}</b></div><div>متوسط وقت الصيانة<b>${esc(formatDuration(rep.time.total.avg))}</b></div><div>جوه SLA<b>${pct(rep.time.slaRate)}</b></div>
<div>رضا العملاء /10<b>${rep.satisfaction.avg ? rep.satisfaction.avg.toFixed(1) : '—'}</b></div><div>CSAT<b>${pct(rep.satisfaction.csat)}</b></div><div>أجهزة رجعت تاني<b>${rep.repeats.length}</b></div><div>مفتوحة أكتر من 15 يوم<b>${rep.aging.totals.b3 || 0}</b></div></div>
${aiText ? `<h2>التحليل والتوصيات</h2><pre>${esc(aiText)}</pre>` : ''}
<h2>ترتيب المراكز</h2><table><tr><th>#</th><th>المركز</th><th>الدرجة</th><th>خلصت</th><th>متوسط الوقت</th><th>SLA</th><th>رجعت</th><th>الرضا</th></tr>
${rows(rep.centers, [(r) => rep.centers.indexOf(r) + 1, (r) => r.name, (r) => r.score ?? '—', (r) => r.completed, (r) => (r.avgTotal ? formatDuration(r.avgTotal) : '—'), (r) => pct(r.slaRate), (r) => r.repeats, (r) => (r.satisfaction ? r.satisfaction.toFixed(1) : '—')])}</table>
<h2>الفنيين</h2><table><tr><th>الفني</th><th>الدرجة</th><th>خلصت</th><th>صافي الوقت</th><th>SLA</th><th>رجعت</th></tr>
${rows(rep.techs.slice(0, 15), [(r) => r.name, (r) => r.score ?? '—', (r) => r.completed, (r) => (r.medianNet ? formatDuration(r.medianNet) : '—'), (r) => pct(r.slaRate), (r) => r.repeats])}</table>
<h2>أكتر الأعطال</h2><table><tr><th>الموديل</th><th>العطل</th><th>العدد</th><th>من أعطال الموديل</th></tr>
${rows(rep.faults.slice(0, 15), [(r) => r.model, (r) => r.fault, (r) => r.count, (r) => pct(r.share)])}</table>
${rep.spikes.length ? `<h2>زيادات مفاجئة</h2><table><tr><th>الموديل</th><th>العطل</th><th>الفترة دي</th><th>اللي قبلها</th></tr>${rows(rep.spikes, [(r) => r.model, (r) => r.fault, (r) => r.count, (r) => r.previous])}</table>` : ''}
<script>window.onload=()=>{window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showError('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const exportAll = () => {
    if (!rep) return;
    exportToExcel(rep.centers.map((r) => ({ 'المركز': r.name, 'الدرجة': r.score ?? '', 'جديدة': r.created, 'خلصت': r.completed, 'متوسط الوقت (ساعة)': r.avgTotal ? +(r.avgTotal / 3600000).toFixed(1) : '', 'SLA %': r.slaRate === null ? '' : Math.round(r.slaRate * 100), 'رجعت': r.repeats, 'الرضا': r.satisfaction ? +r.satisfaction.toFixed(1) : '', 'مفتوحة': r.open, 'متأخرة': r.overdueOpen })), `Centers_${from}_${to}`, 'المراكز');
  };

  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm space-y-3 anim-up`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Award size={20} className="text-teal-600" /> الجودة ومتابعة المراكز</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">أداء المراكز والفنيين، الأجهزة اللي رجعت، أعمار التذاكر، الأعطال، ورضا العملاء.</p>
          </div>
          <div className="flex gap-2">
            {rep && <button type="button" onClick={exportAll} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200">تصدير Excel</button>}
            <button type="button" onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700 disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {data ? 'تحديث' : 'احسب'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs font-bold text-slate-500">
          {PRESETS.map(([id, label, fn]) => (
            <button key={id} type="button" onClick={() => { const [f, t] = fn(new Date()); setFrom(ymd(f)); setTo(ymd(t)); }} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 hover:text-teal-700">{label}</button>
          ))}
          <label className="flex flex-col gap-1">من<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" /></label>
          <label className="flex flex-col gap-1">إلى<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" /></label>
        </div>
        {data?.truncated && <p className="text-[11px] text-amber-600">اتقرا أول 8000 تذكرة — ضيّق الفترة لدقة كاملة.</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {TABS.map(([id, label, icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{icon} {label}</button>
          ))}
        </div>
      </div>

      {!rep && !loading && <div className="p-10 text-center text-slate-400 text-sm bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700"><Award size={36} className="mx-auto mb-3 opacity-40 anim-float" /> اختار الفترة واضغط "احسب".</div>}

      {rep && tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi i={0} label="متوسط وقت الصيانة" value={rep.time.count ? formatDuration(rep.time.total.avg) : '—'} sub={`${rep.time.count} تذكرة خلصت · ${rep.created} جديدة`} />
            <Kpi i={1} label="جوه مهلة الـ SLA" value={pct(rep.time.slaRate)} cls="from-emerald-500 to-emerald-700" />
            <Kpi i={2} label="أجهزة رجعت خلال 90 يوم" value={rep.repeats.length} sub={rep.time.count ? `${pct(rep.repeats.length / rep.time.count)} من اللي خلصت` : ''} cls="from-rose-500 to-rose-700" />
            <Kpi i={3} label="رضا العملاء" value={rep.satisfaction.avg ? `${rep.satisfaction.avg.toFixed(1)} / 10` : '—'} sub={rep.satisfaction.count ? `CSAT ${pct(rep.satisfaction.csat)} · ${rep.satisfaction.count} تقييم` : 'مفيش تقييمات'} cls="from-violet-500 to-violet-700" />
          </div>
          {rep.spikes.length > 0 && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-4 anim-up">
              <p className="text-sm font-black text-rose-700 dark:text-rose-300 flex items-center gap-2 mb-2"><TrendingUp size={16} /> زيادة مفاجئة في أعطال</p>
              {rep.spikes.slice(0, 5).map((s) => <p key={`${s.model}|${s.fault}`} className="text-xs text-slate-700 dark:text-slate-200">• «{s.fault}» على <b>{s.model}</b>: {s.count} تذكرة {s.previous ? `(كانت ${s.previous} في الفترة اللي قبلها)` : '(ماكانتش موجودة قبل كده)'}</p>)}
            </div>
          )}
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-black text-slate-700 dark:text-slate-200">ترتيب المراكز</p>
              <div className="flex gap-1">{[['mcenter', 'حسب مركز الصيانة'], ['branch', 'حسب الفرع']].map(([k, l]) => <button key={k} type="button" onClick={() => setDim(k)} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${dim === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}</button>)}</div>
            </div>
            <ScoreTable rows={dim === 'mcenter' && rep.mcenters.length ? rep.mcenters : rep.centers} nameLabel={dim === 'mcenter' && rep.mcenters.length ? 'مركز الصيانة' : 'الفرع'} />
          </div>
        </>
      )}

      {rep && tab === 'aging' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {AGING_BUCKETS.map((b, i) => <Kpi key={b.key} i={i} label={b.label} value={rep.aging.totals[b.key] || 0} cls={['from-emerald-500 to-emerald-700', 'from-sky-500 to-sky-700', 'from-amber-500 to-amber-700', 'from-rose-500 to-rose-700'][i]} />)}
          </div>
          <div className={card}>
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">حسب المركز (التذاكر المفتوحة دلوقتي)</p>
            <div className="space-y-2">
              {rep.aging.rows.map((r) => (
                <div key={r.key}>
                  <div className="flex justify-between text-xs"><b>{r.name}</b><span className="text-slate-500">{r.total} مفتوحة · متوسط عمرها {r.avgDays.toFixed(1)} يوم</span></div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 mt-1">
                    {AGING_BUCKETS.map((b, i) => r[b.key] > 0 && <div key={b.key} title={`${b.label}: ${r[b.key]}`} className={['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500'][i]} style={{ width: `${(r[b.key] / r.total) * 100}%` }} />)}
                  </div>
                </div>
              ))}
              {!rep.aging.rows.length && <p className="text-xs text-slate-400">مفيش تذاكر مفتوحة 👌</p>}
            </div>
          </div>
          <div className={card}>
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">أقدم التذاكر المفتوحة</p>
            {rep.aging.oldest.map((t) => (
              <button key={t.id} type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: t.id })} className="w-full flex justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30">
                <span><b className="text-teal-700 dark:text-teal-300">{t.ticketNumber}</b> · {t.device} · {whName(t.center)}</span><span className={t.days > 15 ? 'text-rose-600 font-bold' : ''}>{Math.floor(t.days)} يوم</span>
              </button>
            ))}
          </div>
        </>
      )}

      {rep && tab === 'repeats' && (
        <div className={card}>
          <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-1">أجهزة رجعت تاني خلال 90 يوم من آخر إصلاح ({rep.repeats.length})</p>
          <p className="text-[11px] text-slate-500 mb-3">بالمطابقة بالسيريال، أو برقم العميل + الموديل لو مفيش سيريال. "نفس العطل" = غالبًا الإصلاح الأول ماكانش كامل.</p>
          {!rep.repeats.length && <p className="text-xs text-slate-400">مفيش أجهزة رجعت في الفترة دي 👌</p>}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right">
              {rep.repeats.length > 0 && <thead className="bg-slate-50 dark:bg-slate-900"><tr><th className={th}>التذكرة الجديدة</th><th className={th}>الجهاز</th><th className={th}>بعد</th><th className={th}>الإصلاح السابق</th><th className={th}>الفني السابق</th><th className={th}>المركز</th><th className={th}>نفس العطل؟</th></tr></thead>}
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                {rep.repeats.map((r) => (
                  <tr key={r.current.id}>
                    <td className={td}><button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: r.current.id })} className="font-bold text-teal-700 dark:text-teal-300 hover:underline">{r.current.ticketNumber}</button></td>
                    <td className={td}>{r.device}</td><td className={td}>{Math.round(r.gapDays)} يوم</td>
                    <td className={td}><button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: r.previous.id })} className="hover:underline">{r.previous.ticketNumber}</button>{r.previous.fault ? ` · ${r.previous.fault}` : ''}</td>
                    <td className={td}>{r.previous.technician}</td><td className={td}>{whName(r.previous.center)}</td>
                    <td className={td}>{r.sameFault ? <span className="text-rose-600 font-bold">أيوه</span> : 'لأ'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rep && tab === 'faults' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={card}>
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">أكتر الأعطال لكل موديل</p>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {rep.faults.slice(0, 40).map((f) => (
                <div key={`${f.model}|${f.fault}`} className="text-xs">
                  <div className="flex justify-between"><span><b>{f.model}</b> · {f.fault}</span><span className="text-slate-500">{f.count} ({pct(f.share)} من أعطاله)</span></div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-1 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${(f.count / rep.faults[0].count) * 100}%` }} /></div>
                </div>
              ))}
              {!rep.faults.length && <p className="text-xs text-slate-400">لا يوجد</p>}
            </div>
          </div>
          <div className={card}>
            <p className="text-sm font-black text-rose-700 dark:text-rose-300 mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> زيادات مفاجئة (مقارنة بالفترة اللي قبلها)</p>
            {!rep.spikes.length && <p className="text-xs text-slate-400">مفيش زيادات غير طبيعية.</p>}
            {rep.spikes.map((s) => <p key={`${s.model}|${s.fault}`} className="text-xs py-1 border-b border-slate-50 dark:border-slate-700">«{s.fault}» على <b>{s.model}</b>: {s.count} {s.previous ? `بدل ${s.previous} (×${s.factor.toFixed(1)})` : '(جديد)'}</p>)}
            <p className="text-[10px] text-slate-400 mt-2">مفيد ترفعه للمصنع لو موديل معيّن بيتكرر فيه نفس العيب.</p>
          </div>
        </div>
      )}

      {rep && tab === 'satisfaction' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi i={0} label="متوسط الرضا" value={rep.satisfaction.avg ? `${rep.satisfaction.avg.toFixed(1)} / 10` : '—'} cls="from-violet-500 to-violet-700" />
            <Kpi i={1} label="CSAT (راضي جدًا 8+)" value={pct(rep.satisfaction.csat)} cls="from-emerald-500 to-emerald-700" />
            <Kpi i={2} label="مؤشر الولاء (شبه NPS)" value={rep.satisfaction.nps === null ? '—' : rep.satisfaction.nps} sub="9-10 مروّج · 6 وأقل منتقد" cls="from-sky-500 to-sky-700" />
            <Kpi i={3} label="هيشتري تاني" value={pct(rep.satisfaction.repurchase)} sub={`${rep.satisfaction.count} تقييم`} cls="from-amber-500 to-amber-700" />
          </div>
          <div className={card}>
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">أقل التقييمات (محتاجة متابعة)</p>
            {!rep.satisfaction.lowest?.length && <p className="text-xs text-slate-400">مفيش تقييمات ضعيفة 👌</p>}
            {(rep.satisfaction.lowest || []).map((x) => (
              <button key={x.id} type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: x.id })} className="w-full text-right text-xs px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20">
                <b className="text-rose-600">{x.score.toFixed(1)}</b> · {x.ticketNumber} {x.comment ? `— «${x.comment.slice(0, 100)}»` : ''}
              </button>
            ))}
            <p className="text-[10px] text-slate-400 mt-2">المصدر: تقييم المتابعة اللي الكول سنتر بيسجله في التذكرة (1-10)، أو تقييم العميل من رابط التقييم لو موجود.</p>
          </div>
        </>
      )}

      {rep && tab === 'technicians' && (
        <div className={card}>
          <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">تقييم الفنيين للفترة</p>
          <ScoreTable rows={rep.techs} nameLabel="الفني" extra={{ label: 'قيمة الإصلاحات', render: (r) => `${Math.round(r.revenue).toLocaleString()} ج` }} />
        </div>
      )}

      {rep && tab === 'monthly' && (
        <div className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2"><FileText size={16} /> التقرير الشهري للإدارة والمصنع</p>
            <div className="flex gap-2">
              {aiOn && (
                <button type="button" onClick={narrative} disabled={aiBusy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                  {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} اكتب التحليل والتوصيات
                </button>
              )}
              <button type="button" onClick={printMonthly} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"><Printer size={14} /> اطبع / PDF</button>
            </div>
          </div>
          <p className="text-xs text-slate-500">التقرير بيجمع: المؤشرات، ترتيب المراكز والفنيين، أكتر الأعطال، والزيادات المفاجئة{aiOn ? '، ولو كتبت التحليل بيتضاف كمان' : ''}. من نافذة الطباعة اختار "Save as PDF".</p>
          {aiText ? <div className="anim-pop whitespace-pre-wrap text-sm leading-7 bg-violet-50 dark:bg-violet-950/40 rounded-xl p-3">{aiText}</div>
            : !aiOn && <p className="text-[11px] text-slate-400 flex items-center gap-1"><Sparkles size={12} /> فعّل Gemini من الإعدادات عشان يكتبلك التحليل والتوصيات.</p>}
        </div>
      )}
    </section>
  );
}
