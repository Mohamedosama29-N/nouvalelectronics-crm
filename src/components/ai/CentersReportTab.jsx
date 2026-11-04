import React, { useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { FileText, Loader2, Printer } from 'lucide-react';
import { db } from '../../firebase/config';
import { loadOpenTickets } from '../../ai/ticketPool';
import { centersFromSettings } from '../../ai/network';
import { buildCentersMonthlyReport, buildCentersReportHtml, monthRange } from '../../ai/centerReport';
import { formatDuration } from '../../ai/repairTime';
import { openPrintWindow } from '../../utils/printDocs';
import { exportToExcel } from '../../utils/exportUtils';
import { showError } from '../../utils/alerts';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const money = (v) => `${Math.round(Number(v) || 0).toLocaleString()} ج`;
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

// 📄 (12) التقرير الشهري للمراكز — PDF للإدارة أو المصنع
export function CentersReportTab({ systemSettings }) {
  const [month, setMonth] = useState(prevMonth);
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { from, to } = monthRange(month);
      const [t, open, c, s] = await Promise.all([
        getDocs(query(collection(db, 'tickets'), where('updatedAt', '>=', from), orderBy('updatedAt', 'desc'), limit(8000))),
        loadOpenTickets().catch(() => []),
        getDocs(query(collection(db, 'warrantyClaims'), where('createdAt', '>=', from), where('createdAt', '<', to), limit(2000))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'centerSettlements'), where('month', '==', month), limit(200))).catch(() => ({ docs: [] })),
      ]);
      setRep(buildCentersMonthlyReport({
        month, tickets: t.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.isDeleted), openTickets: open,
        claims: c.docs.map((d) => d.data()), settlements: s.docs.map((d) => d.data()), centers: centersFromSettings(systemSettings), slaHours: systemSettings?.ticketSLA,
      }));
    } catch (e) { console.error(e); showError(e?.code === 'failed-precondition' ? 'محتاج Index: firebase deploy --only firestore:indexes' : 'معرفتش أعمل التقرير'); }
    setBusy(false);
  };
  const pdf = (perCenter) => { if (!openPrintWindow(buildCentersReportHtml(rep, { company: systemSettings?.storeName, perCenterPages: perCenter }))) showError('المتصفح منع النافذة — اسمح بالنوافذ المنبثقة'); };
  const excel = () => exportToExcel(rep.rows.map((r) => ({
    'المركز': r.name, 'الدرجة': r.score ?? '', 'استلم': r.created, 'خلّص': r.completed, 'مفتوح': r.open, 'متأخر': r.overdueOpen,
    'متوسط الإصلاح (ساعات)': r.avgTotal ? Math.round(r.avgTotal / 3600000) : '', 'SLA %': r.slaRate === null ? '' : Math.round(r.slaRate * 100), 'رجع %': r.repeatRate === null ? '' : Math.round(r.repeatRate * 100),
    'الرضا /10': r.satisfaction ?? '', 'إصلاحات ضمان': r.dueCount, 'المستحق': r.dueAmount, 'اتدفع': r.paid, 'المتبقي': r.balance, 'مطالبات': r.claims, 'قيمة المطالبات': r.claimsAmount, 'المعتمد': r.claimsApproved,
  })), `Centers_Report_${month}`, 'تقرير المراكز');
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-2`}>
        <label className="text-xs font-bold">الشهر<input type="month" className="block mt-1 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900" value={month} onChange={(e) => { setMonth(e.target.value); setRep(null); }} /></label>
        <button type="button" onClick={run} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} اعمل التقرير</button>
        {rep && <>
          <button type="button" onClick={() => pdf(true)} className={`${btn} bg-slate-800 text-white`}><Printer size={14} /> PDF كامل (صفحة لكل مركز)</button>
          <button type="button" onClick={() => pdf(false)} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Printer size={14} /> PDF ملخص</button>
          <button type="button" onClick={excel} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>
        </>}
      </div>
      {rep && (
        <div className={`${card} overflow-x-auto`}>
          <p className="font-black text-sm mb-2">{rep.label}: {rep.totals.created} تذكرة اتستلمت · {rep.totals.completed} اتصلحت · مستحقات {money(rep.totals.due)} (اتدفع {money(rep.totals.paid)})</p>
          <table className="w-full text-xs"><thead><tr className="text-slate-500">{['المركز', 'الدرجة', 'استلم', 'خلّص', 'مفتوح', 'متوسط', 'SLA', 'رجع', 'الرضا', 'المستحق', 'المتبقي', 'مطالبات'].map((h) => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
            <tbody>{rep.rows.length === 0 ? <tr><td colSpan={12} className="p-6 text-center text-slate-400">مفيش بيانات للمراكز في الشهر ده</td></tr> : rep.rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100 dark:border-slate-700">
                <td className="p-2 font-bold">{r.name}</td><td className="p-2 font-black text-teal-700 dark:text-teal-300">{r.score ?? '—'}</td><td className="p-2">{r.created}</td><td className="p-2">{r.completed}</td>
                <td className="p-2">{r.open}{r.overdueOpen ? <span className="text-rose-600"> ({r.overdueOpen})</span> : ''}</td><td className="p-2">{r.avgTotal ? formatDuration(r.avgTotal) : '—'}</td><td className="p-2">{pct(r.slaRate)}</td><td className="p-2">{pct(r.repeatRate)}</td>
                <td className="p-2">{r.satisfaction === null || r.satisfaction === undefined ? '—' : r.satisfaction.toFixed(1)}</td><td className="p-2">{money(r.dueAmount)}{r.missingRate ? ' ⚠️' : ''}</td><td className="p-2 font-bold">{money(r.balance)}</td><td className="p-2">{r.claims ? `${r.claims} · ${money(r.claimsAmount)}` : '—'}</td>
              </tr>
            ))}</tbody></table>
          <p className="text-[11px] text-slate-500 mt-2">⚠️ = فيه أجهزة مالهاش سعر إصلاح ضمان في إعدادات المركز. الدرجة: SLA 35 + السرعة 25 + عدم رجوع العطل 20 + الرضا 20.</p>
        </div>
      )}
    </div>
  );
}
