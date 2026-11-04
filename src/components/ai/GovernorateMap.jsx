import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { loadOpenTickets, loadRecentTickets } from '../../ai/ticketPool';
import { GEO_METRICS, GOV_TILES, governorateStats, intensity } from '../../ai/geo';
import { centersFromSettings } from '../../ai/network';
import { exportToExcel } from '../../utils/exportUtils';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const COLS = 7; const ROWS = 10;

// 🗺️ (25) خريطة المحافظات
export function GovernorateMap({ systemSettings }) {
  const [tickets, setTickets] = useState(null);
  const [metric, setMetric] = useState('open');
  const [sel, setSel] = useState(null);
  const [now] = useState(() => new Date());
  useEffect(() => {
    Promise.all([loadRecentTickets(800).catch(() => []), loadOpenTickets().catch(() => [])]).then(([a, b]) => {
      const m = new Map(); [...a, ...b].forEach((t) => m.set(t.id || Math.random(), t)); setTickets([...m.values()]);
    });
  }, []);
  const centers = useMemo(() => centersFromSettings(systemSettings), [systemSettings]);
  const stats = useMemo(() => (tickets ? governorateStats(tickets, { centers, slaHours: systemSettings?.ticketSLA, now }) : null), [tickets, centers, systemSettings, now]);
  if (!stats) return <div className={card}><Loader2 className="animate-spin text-teal-600" /></div>;
  const max = Math.max(...stats.list.map((r) => r[metric] || 0), 0);
  const selRow = sel ? stats.list.find((r) => r.gov === sel) : null;
  const top = [...stats.list].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).filter((r) => r[metric]).slice(0, 6);
  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {Object.entries(GEO_METRICS).map(([k, m]) => <button key={k} type="button" onClick={() => setMetric(k)} className={`px-3 py-2 rounded-lg text-xs font-bold ${metric === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{m.label}</button>)}
        <button type="button" onClick={() => exportToExcel(stats.list.map((r) => ({ 'المحافظة': r.gov, 'مفتوحة': r.open, 'متأخرة': r.overdue, 'آخر 90 يوم': r.volume, 'متوسط أيام الصيانة': r.avgDays === null ? '' : Number(r.avgDays.toFixed(1)), 'المراكز': r.centers.join('، ') })), 'Governorates', 'المحافظات')} className="mr-auto px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700">Excel</button>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-3">
        <div className={card}>
          <div dir="ltr" className="grid gap-1 mx-auto" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${ROWS}, minmax(44px, auto))`, maxWidth: 560 }} role="img" aria-label={`خريطة المحافظات حسب ${GEO_METRICS[metric].label}`}>
            {stats.list.map((r) => {
              const [c, rr] = GOV_TILES[r.gov];
              const v = r[metric]; const k = intensity(v, max);
              return (
                <button key={r.gov} type="button" onClick={() => setSel(r.gov)} title={`${r.gov}: ${GEO_METRICS[metric].fmt(v ?? null)}`}
                  className={`rounded-lg text-[10px] leading-tight p-1 font-bold border transition-transform hover:scale-105 ${sel === r.gov ? 'ring-2 ring-indigo-500' : ''} ${r.uncovered ? 'border-rose-400 border-dashed' : 'border-transparent'}`}
                  style={{ gridColumn: c + 1, gridRow: rr + 1, background: `rgba(13,148,136,${0.08 + k * 0.85})`, color: k > 0.5 ? '#fff' : undefined }}>
                  <span className="block truncate" dir="rtl">{r.gov}</span>
                  <span className="block text-xs">{GEO_METRICS[metric].fmt(v ?? null)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">كل ما اللون يغمق القيمة تزيد. الإطار الأحمر المتقطع = محافظة فيها شغل ومفيش مركز مسؤول عنها في الإعدادات.{stats.unknown ? ` · ${stats.unknown} تذكرة من غير محافظة.` : ''}</p>
        </div>
        <div className={`${card} space-y-2 text-xs`}>
          {selRow ? (
            <>
              <p className="font-black text-sm flex items-center gap-1"><MapPin size={14} className="text-teal-600" /> {selRow.gov}</p>
              <p>مفتوحة: <b>{selRow.open}</b> · متأخرة: <b className={selRow.overdue ? 'text-rose-600' : ''}>{selRow.overdue}</b></p>
              <p>آخر 90 يوم: <b>{selRow.volume}</b> · متوسط الصيانة: <b>{GEO_METRICS.avgDays.fmt(selRow.avgDays)} يوم</b></p>
              <p>المراكز: {selRow.centers.length ? selRow.centers.join('، ') : <span className="text-rose-600 font-bold">مفيش مركز بيغطيها</span>}</p>
            </>
          ) : <p className="text-slate-400">اضغط على أي محافظة للتفاصيل.</p>}
          <hr className="border-slate-100 dark:border-slate-700" />
          <p className="font-bold">الأعلى في {GEO_METRICS[metric].label}</p>
          {top.length === 0 ? <p className="text-slate-400">مفيش بيانات.</p> : top.map((r) => <button key={r.gov} type="button" onClick={() => setSel(r.gov)} className="w-full flex justify-between hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded px-1"><span>{r.gov}</span><b>{GEO_METRICS[metric].fmt(r[metric])}</b></button>)}
        </div>
      </div>
    </div>
  );
}
