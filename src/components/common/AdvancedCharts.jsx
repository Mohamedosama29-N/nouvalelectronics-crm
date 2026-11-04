import React, { useId, useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

// 🎨 لوحة ألوان الرسوم: 7 ألوان مرتّبة ومتفحوصة لعمى الألوان والتباين (فاتح/غامق) — التيل لون الهوية أول واحد.
// اللون بيتبع الفئة بالترتيب، ومفيش لون ثامن: أي فئات زيادة بتتجمّع في "أخرى" (رمادي).
const PALETTE = {
  light: ['#0d9488', '#eb6834', '#2a78d6', '#eda100', '#e87ba4', '#6250d6', '#e34948'],
  dark: ['#0f9e8f', '#d95926', '#3987e5', '#c98500', '#d55181', '#9085e9', '#e66767'],
};
const OTHER = { light: '#a8a29e', dark: '#57534e' };
const KNOWN = new Set([...PALETTE.light, ...PALETTE.dark]);
const MAX_CATS = 7;

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const cf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = (v) => (Number.isFinite(Number(v)) ? nf.format(Number(v)) : v);
const compact = (v) => (Number.isFinite(Number(v)) ? (Math.abs(Number(v)) >= 10000 ? cf.format(Number(v)) : nf.format(Number(v))) : v);
const shortLabel = (s, n = 18) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// "2026-10-08" → "8/10" عشان المحور يبقى مقروء
const tickLabel = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); if (m) return `${Number(m[3])}/${Number(m[2])}`; const m2 = /^(\d{2})-(\d{2})$/.exec(String(s)); if (m2) return `${Number(m2[2])}/${Number(m2[1])}`; return shortLabel(s, 12); };

// جمع الفئات الكتير: أكبر 7 + "أخرى"
function topWithOther(rows, max = MAX_CATS) {
  const sorted = [...rows].filter((r) => Number(r.value) > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return { rows: sorted, folded: 0 };
  const keep = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  return { rows: [...keep, { name: `أخرى (${rest.length})`, value: rest.reduce((s, r) => s + Number(r.value || 0), 0), other: true }], folded: rest.length };
}

function ChartTooltip({ active, payload, label, total, mode }) {
  if (!active || !payload?.length) return null;
  const dark = mode === 'dark';
  return (
    <div dir="rtl" className={`rounded-xl border px-3 py-2 text-xs shadow-lg ${dark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
      {label !== undefined && label !== null && label !== '' && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey + String(p.name)} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.payload?.fill }} />
          <span className={dark ? 'text-slate-300' : 'text-slate-500'}>{p.name}</span>
          <b className="mr-auto tabular-nums">{fmt(p.value)}</b>
          {total ? <span className={dark ? 'text-slate-400' : 'text-slate-400'}>({Math.round((p.value / total) * 100)}%)</span> : null}
        </p>
      ))}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-slate-600 dark:text-slate-300">
      {items.map((it) => <span key={it.name} className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: it.color, height: 3 }} />{it.name}</span>)}
    </div>
  );
}

function DataTable({ rows, columns }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-slate-100 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0"><tr>{columns.map((c) => <th key={c.key} className="p-2 text-right font-bold text-slate-500">{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-700">{columns.map((c) => <td key={c.key} className="p-2 tabular-nums">{c.key === 'name' ? r[c.key] : fmt(r[c.key] ?? 0)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// قايمة مرتبة بشرايط أفقية (بدل البيتزا لما الفئات كتير، وبدل الأعمدة لما الأسماء طويلة)
// HTML عادي مش SVG: العربي بيتعرض صح، والأسماء الطويلة مبتدخلش في بعض
function RankedBars({ rows, colorOf, total, showPct }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((r, i) => {
        const p = total ? Math.round((r.value / total) * 100) : null;
        return (
          <li key={r.name} className="group" title={`${r.name}: ${fmt(r.value)}${showPct && p !== null ? ` (${p}%)` : ''}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-300 truncate group-hover:text-slate-900 dark:group-hover:text-white">{r.name}</span>
              <span className="shrink-0 tabular-nums inline-flex items-baseline gap-1.5"><b className="text-slate-800 dark:text-slate-100">{fmt(r.value)}</b>{showPct && p !== null && <span className="text-slate-400 text-[11px]">({p}%)</span>}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-500 group-hover:brightness-110" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: colorOf(r, i) }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// series (اختياري): [{ key, name, color }] لرسم أكتر من خط/عمود في نفس الرسم.
export function AdvancedCharts({ data, type = 'line', title, height = 300, series, subtitle }) {
  const { darkMode } = useTheme();
  const mode = darkMode ? 'dark' : 'light';
  const pal = PALETTE[mode];
  const surface = darkMode ? '#1e293b' : '#ffffff';
  const gridColor = darkMode ? '#334155' : '#eef2f6';
  const axisColor = darkMode ? '#94a3b8' : '#64748b';
  const [asTable, setAsTable] = useState(false);
  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const multi = Array.isArray(series) && series.length > 0 && type !== 'pie';
  const rows = useMemo(() => (data || []).map((item) => (multi
    ? { ...item, name: item.name || item.label || item.date }
    : { name: item.name || item.label || item.date, value: Number(item.value ?? item.count ?? item.total ?? 0) || 0 })), [data, multi]);
  const seriesList = (multi ? series : [{ key: 'value', name: 'القيمة' }]).map((sr, i) => ({ ...sr, color: sr.color && KNOWN.has(sr.color) ? sr.color : pal[i % pal.length] }));

  const empty = !rows.length || (!multi && rows.every((r) => !r.value));
  const longLabels = !multi && rows.some((r) => String(r.name).length > 10);

  // البيتزا: لحد 5 فئات = دونات، أكتر من كده = شرايط مرتبة
  const cat = useMemo(() => (type === 'pie' || (type === 'bar' && !multi && (longLabels || rows.length > 8)) ? topWithOther(rows) : null), [type, multi, longLabels, rows]);
  // الدونات: لون لكل فئة. الشرايط المرتبة: لون واحد (الطول هو اللي بيقول القيمة)
  const colorOf = (r, i) => (r.other ? OTHER[mode] : type === 'pie' && cat && cat.rows.length <= 5 ? pal[i % pal.length] : pal[0]);

  const renderChart = () => {
    if (type === 'pie' && cat && cat.rows.length <= 5) {
      const ctotal = cat.rows.reduce((s, r) => s + r.value, 0);
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <div className="relative w-full sm:w-1/2" style={{ height: Math.min(height, 240) }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cat.rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={cat.rows.length > 1 ? 2 : 0}
                  stroke={surface} strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                  {cat.rows.map((r, i) => <Cell key={r.name} fill={colorOf(r, i)} />)}
                </Pie>
                <Tooltip content={<ChartTooltip total={ctotal} mode={mode} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <b className="text-2xl text-slate-800 dark:text-white tabular-nums">{compact(ctotal)}</b>
              <span className="text-[11px] text-slate-400">الإجمالي</span>
            </div>
          </div>
          <ul className="w-full sm:w-1/2 sm:max-w-[260px] space-y-2.5 text-xs">
            {cat.rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(r, i) }} />
                <span className="text-slate-600 dark:text-slate-300 truncate" title={r.name}>{r.name}</span>
                <b className="mr-auto tabular-nums text-slate-800 dark:text-slate-100">{fmt(r.value)}</b>
                <span className="w-10 text-left text-slate-400 tabular-nums">{ctotal ? Math.round((r.value / ctotal) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (cat) return <div className="py-1" style={{ minHeight: Math.min(height, 200) }}><RankedBars rows={cat.rows} colorOf={colorOf} total={cat.rows.reduce((s, r) => s + r.value, 0)} showPct={type === 'pie'} /></div>;

    const xAxis = <XAxis dataKey="name" reversed={type === 'bar'} tickLine={false} axisLine={{ stroke: gridColor }} tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={tickLabel} minTickGap={18} interval="preserveStartEnd" />;
    const yAxis = <YAxis orientation="right" width={44} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={compact} />;
    const grid = <CartesianGrid vertical={false} stroke={gridColor} />;
    if (type === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={rows} margin={{ top: 18, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%" barGap={2}>
            {grid}{xAxis}{yAxis}
            <Tooltip cursor={{ fill: darkMode ? '#33415555' : '#f1f5f9aa' }} content={<ChartTooltip mode={mode} />} />
            {seriesList.map((sr) => (
              <Bar key={sr.key} dataKey={sr.key} name={sr.name} fill={sr.color} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                {!multi && rows.length <= 12 && <LabelList dataKey={sr.key} position="top" fill={axisColor} fontSize={11} formatter={compact} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            {seriesList.map((sr, i) => (
              <linearGradient key={sr.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sr.color} stopOpacity={seriesList.length > 1 ? 0.12 : 0.22} />
                <stop offset="100%" stopColor={sr.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {grid}{xAxis}{yAxis}
          <Tooltip cursor={{ stroke: axisColor, strokeDasharray: '3 3' }} content={<ChartTooltip mode={mode} />} />
          {seriesList.map((sr, i) => (
            <Area key={sr.key} type="monotone" dataKey={sr.key} name={sr.name} stroke={sr.color} strokeWidth={2} fill={`url(#${gid}-${i})`}
              dot={false} activeDot={{ r: 5, stroke: surface, strokeWidth: 2 }} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const tableCols = multi ? [{ key: 'name', label: 'البند' }, ...seriesList.map((s) => ({ key: s.key, label: s.name }))] : [{ key: 'name', label: 'البند' }, { key: 'value', label: 'القيمة' }];
  const tableRows = cat ? cat.rows : rows;
  const body = empty
    ? <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm gap-2" style={{ height: Math.min(height, 200) }}><BarChart3 size={28} className="opacity-50" />مفيش بيانات في الفترة دي</div>
    : asTable ? <DataTable rows={tableRows} columns={tableCols} /> : (
      <>
        {multi && seriesList.length > 1 && <Legend items={seriesList} />}
        {renderChart()}
      </>
    );

  // من غير عنوان: الرسم جوه كارت تاني فمفيش داعي لإطار
  if (!title) return <div dir="rtl">{body}</div>;
  return (
    <div dir="rtl" className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-black text-base text-slate-800 dark:text-white">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
          {cat?.folded > 0 && !asTable && <p className="text-[11px] text-slate-400 mt-0.5">أكبر {cat.rows.length - 1} + الباقي في «أخرى»</p>}
        </div>
        {!empty && (
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-label={asTable ? 'عرض كرسم' : 'عرض كجدول'} title={asTable ? 'عرض كرسم' : 'عرض كجدول'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-slate-50 dark:hover:bg-slate-700">
            {asTable ? <BarChart3 size={16} /> : <Table2 size={16} />}
          </button>
        )}
      </div>
      {body}
    </div>
  );
}

// ==========================================================================
// 📄 PDF EXPORT
// ==========================================================================
