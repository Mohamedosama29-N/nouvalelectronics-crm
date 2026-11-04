// 📄 (12) التقرير الشهري لمراكز الصيانة (للإدارة أو المصنع): أداء كل مركز + مستحقاته + مطالبات الضمان
import { maintenanceCenterScorecard, repeatRepairs } from './quality';
import { centerDues } from './network';
import { formatDuration } from './repairTime';
import { toDate } from '../utils/liveStats';

const n = (v) => Number(v) || 0;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v) => `${Math.round(n(v)).toLocaleString('en-US')} ج`;
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

export const monthRange = (ym) => { const [y, m] = String(ym).split('-').map(Number); return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }; };
export const monthLabel = (ym) => { const { from } = monthRange(ym); return from.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }); };

export function buildCentersMonthlyReport({ month, tickets = [], openTickets = [], claims = [], settlements = [], centers = [], slaHours }) {
  const { from, to } = monthRange(month);
  const repeats = repeatRepairs(tickets, { from, to });
  const cards = maintenanceCenterScorecard(tickets, { from, to, slaHours, repeats, openTickets });
  const dues = centerDues(tickets, centers, { from, to });
  const inMonth = (d) => { const x = toDate(d); return x && x >= from && x < to; };
  const names = new Set([...cards.map((c) => c.key), ...dues.map((d) => d.center), ...centers.map((c) => c.name)]);
  const rows = [...names].filter(Boolean).map((name) => {
    const sc = cards.find((c) => c.key === name) || { created: 0, completed: 0, open: 0, overdueOpen: 0, avgTotal: null, slaRate: null, repeatRate: null, satisfaction: null, rated: 0, score: null };
    const due = dues.find((d) => d.center === name) || { count: 0, amount: 0, missingRate: false };
    const paid = settlements.filter((s) => s.center === name).reduce((s, x) => s + n(x.amount), 0);
    const cl = claims.filter((c) => c.center === name && inMonth(c.createdAt));
    const faults = new Map();
    tickets.filter((t) => t.assignedMaintenanceCenter === name && inMonth(t.createdAt)).forEach((t) => { const f = t.mainFaultDescription || t.mainFaultCode; if (f) faults.set(f, (faults.get(f) || 0) + 1); });
    return {
      name, ...sc,
      dueCount: due.count, dueAmount: due.amount, missingRate: due.missingRate, paid, balance: due.amount - paid,
      claims: cl.length, claimsAmount: cl.reduce((s, c) => s + (n(c.total) || n(c.partsCost) + n(c.laborCost)), 0),
      claimsApproved: cl.filter((c) => ['approved', 'paid'].includes(c.status)).reduce((s, c) => s + n(c.approvedAmount), 0),
      claimsRejected: cl.filter((c) => c.status === 'rejected').length,
      topFaults: [...faults].sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }).filter((r) => r.created || r.completed || r.open || r.dueAmount || r.claims)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.completed - a.completed);
  const totals = rows.reduce((s, r) => ({ created: s.created + r.created, completed: s.completed + r.completed, open: s.open + r.open, overdue: s.overdue + r.overdueOpen, due: s.due + r.dueAmount, paid: s.paid + r.paid, claims: s.claims + r.claims, claimsAmount: s.claimsAmount + r.claimsAmount }), { created: 0, completed: 0, open: 0, overdue: 0, due: 0, paid: 0, claims: 0, claimsAmount: 0 });
  return { month, label: monthLabel(month), rows, totals, generatedAt: new Date() };
}

export function buildCentersReportHtml(rep, { company = '', perCenterPages = true } = {}) {
  const t = rep.totals;
  const sum = rep.rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${r.score ?? '—'}</td><td>${r.created}</td><td>${r.completed}</td><td>${r.open}${r.overdueOpen ? ` <span class="bad">(${r.overdueOpen} متأخرة)</span>` : ''}</td><td>${r.avgTotal ? esc(formatDuration(r.avgTotal)) : '—'}</td><td>${pct(r.slaRate)}</td><td>${pct(r.repeatRate)}</td><td>${r.satisfaction === null || r.satisfaction === undefined ? '—' : `${r.satisfaction.toFixed(1)}/10`}</td><td>${money(r.dueAmount)}</td><td>${money(r.balance)}</td></tr>`).join('');
  const pages = perCenterPages ? rep.rows.map((r) => `<section class="pg"><h2>${esc(r.name)} — ${esc(rep.label)}</h2>
    <div class="kpis"><div><small>الدرجة</small><b>${r.score ?? '—'}/100</b></div><div><small>استلم</small><b>${r.created}</b></div><div><small>خلّص</small><b>${r.completed}</b></div><div><small>مفتوح</small><b>${r.open}</b></div><div><small>متوسط الإصلاح</small><b>${r.avgTotal ? esc(formatDuration(r.avgTotal)) : '—'}</b></div><div><small>جوه الـ SLA</small><b>${pct(r.slaRate)}</b></div><div><small>رجع تاني</small><b>${pct(r.repeatRate)}</b></div><div><small>رضا العملاء</small><b>${r.satisfaction === null || r.satisfaction === undefined ? '—' : r.satisfaction.toFixed(1)}</b></div></div>
    <table><tbody>
      <tr><th>إصلاحات ضمان مستحقة</th><td>${r.dueCount} إصلاح · ${money(r.dueAmount)}${r.missingRate ? ' <span class="bad">(فيه أجهزة من غير سعر في الإعدادات)</span>' : ''}</td></tr>
      <tr><th>اتدفع للمركز</th><td>${money(r.paid)}</td></tr><tr><th>المتبقي</th><td><b>${money(r.balance)}</b></td></tr>
      <tr><th>مطالبات المصنع</th><td>${r.claims} مطالبة · ${money(r.claimsAmount)} · المعتمد ${money(r.claimsApproved)}${r.claimsRejected ? ` · <span class="bad">${r.claimsRejected} مرفوضة</span>` : ''}</td></tr>
      <tr><th>أكتر الأعطال</th><td>${r.topFaults.length ? r.topFaults.map(([f, c]) => `${esc(f)} (${c})`).join('، ') : '—'}</td></tr>
    </tbody></table>
    <div class="sign"><span>توقيع مدير المركز: ................</span><span>اعتماد الإدارة: ................</span></div></section>`).join('') : '';
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير المراكز ${esc(rep.label)}</title>
<style>body{font-family:Tahoma,Arial;margin:20px;color:#0f172a;font-size:12px}h1{font-size:20px;margin:0}h2{font-size:16px;border-bottom:2px solid #0d9488;padding-bottom:6px}
header{display:flex;justify-content:space-between;border-bottom:3px solid #0d9488;padding-bottom:8px;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #e2e8f0;padding:5px;text-align:right}th{background:#f1f5f9;width:auto}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.kpis div{border:1px solid #e2e8f0;border-radius:8px;padding:6px}.kpis b{display:block;font-size:15px}small{color:#64748b}.bad{color:#be123c}
.tot{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.tot div{background:#f0fdfa;border-radius:8px;padding:6px}.tot b{display:block;font-size:15px}.pg{page-break-before:always}.sign{display:flex;justify-content:space-between;margin-top:40px}@media print{button{display:none}}</style></head>
<body><header><div><h1>${esc(company || 'تقرير مراكز الصيانة')}</h1><small>تقرير أداء ومستحقات مراكز الصيانة — ${esc(rep.label)}</small></div><small>اتطبع ${rep.generatedAt.toLocaleDateString('ar-EG')}</small></header>
<div class="tot"><div><small>تذاكر اتستلمت</small><b>${t.created}</b></div><div><small>اتصلحت</small><b>${t.completed}</b></div><div><small>مفتوحة (متأخرة)</small><b>${t.open} (${t.overdue})</b></div><div><small>مستحقات / اتدفع</small><b>${money(t.due)} / ${money(t.paid)}</b></div></div>
<table><thead><tr><th>#</th><th>المركز</th><th>الدرجة</th><th>استلم</th><th>خلّص</th><th>مفتوح</th><th>متوسط الإصلاح</th><th>SLA</th><th>رجع</th><th>الرضا</th><th>المستحق</th><th>المتبقي</th></tr></thead><tbody>${sum || '<tr><td colspan="12">مفيش بيانات للشهر ده</td></tr>'}</tbody></table>
<p><small>الدرجة من 100: الالتزام بالـ SLA 35 + السرعة 25 + عدم رجوع العطل 20 + رضا العملاء 20. مطالبات المصنع: ${t.claims} مطالبة بقيمة ${money(t.claimsAmount)}.</small></p>
${pages}<button onclick="print()">طباعة / حفظ PDF</button><script>setTimeout(()=>print(),400)</script></body></html>`;
}
