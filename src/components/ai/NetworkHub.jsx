import React, { useEffect, useMemo, useState } from 'react';
import { ticketsUpdatedSince } from '../../data/mirror';
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Building2, PackagePlus, PackageX, FileBadge, ShieldCheck, FileSignature, Loader2, RefreshCw, Search, Plus, Save, ExternalLink, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';
import { db } from '../../firebase/config';
import { loadOpenTickets } from '../../ai/ticketPool';
import { centerDues, centersFromSettings, claimTotals, CLAIM_FLOW, contractInfo, CONTRACT_STATUS, DEFECTIVE_FLOW, PART_REQUEST_FLOW, warrantyStatus } from '../../ai/network';
import { buildQueryTokens } from '../../utils/search';
import { exportToExcel } from '../../utils/exportUtils';
import { showError, showSuccess } from '../../utils/alerts';
import { notify } from '../../utils/notifications';
import { requestNavigation } from '../../utils/appEvents';
import { whatsappLink, statusLabel } from '../../ai/ticketAssist';
import { toDate } from '../../utils/liveStats';
import { addPartToTicket, findStockItem, setTicketStatusQuiet } from '../../utils/ticketParts';
import { GovernorateMap } from './GovernorateMap';
import { CentersReportTab } from './CentersReportTab';

const DAY = 86400000;
const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const th = 'p-2 text-[11px] text-slate-500 font-bold text-right';
const td = 'p-2 text-xs';
const fmt = (d) => (d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString()} ج`;
const ymNow = () => new Date().toISOString().slice(0, 7);
const isManager = (u) => u?.role === 'admin' || u?.role === 'main_warehouse_manager' || u?.permissions?.approvePartRequests;

const useList = (coll, deps = []) => {
  const [state, setState] = useState({ items: null, loading: false });
  const load = async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const snap = await getDocs(query(collection(db, coll), orderBy('createdAt', 'desc'), limit(500)));
      setState({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false });
    } catch (e) { console.error(e); showError('معرفتش أحمّل البيانات'); setState((s) => ({ ...s, loading: false })); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل مرة عند فتح التبويب
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, deps);
  return [state, load, (fn) => setState((s) => ({ ...s, items: fn(s.items || []) }))];
};

const advance = async (coll, item, status, by, extra = {}) => {
  await updateDoc(doc(db, coll, item.id), { status, updatedAt: serverTimestamp(), log: arrayUnion({ status, at: new Date().toISOString(), by }), ...extra });
};

// ---------------------------------------------------------------- المراكز والمستحقات (19/21/23)
function CentersTab({ systemSettings, appUser }) {
  const centers = centersFromSettings(systemSettings);
  const [open, setOpen] = useState(null);
  const [month, setMonth] = useState(ymNow());
  const [dues, setDues] = useState(null);
  const [paid, setPaid] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadOpenTickets().then((l) => setOpen({ list: l, at: Date.now() })).catch(() => setOpen({ list: [], at: Date.now() })); }, []);
  const sla = systemSettings?.ticketSLA || { high: 4, medium: 24, low: 72 };
  const rows = useMemo(() => {
    if (!open) return [];
    const m = new Map(centers.map((c) => [c.name, { ...c, open: 0, overdue: 0, unassigned: false }]));
    open.list.forEach((t) => {
      const k = t.assignedMaintenanceCenter || 'من غير مركز';
      if (!m.has(k)) m.set(k, { name: k, open: 0, overdue: 0, capacity: 0, unassigned: k === 'من غير مركز' });
      const r = m.get(k); r.open += 1;
      const c = toDate(t.createdAt);
      if (c && open.at - c > (sla[t.priority || 'medium'] ?? 24) * 3600000) r.overdue += 1;
    });
    return [...m.values()].sort((a, b) => b.open - a.open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, systemSettings]);

  const loadDues = async () => {
    setBusy(true);
    try {
      const [y, mo] = month.split('-').map(Number);
      const from = new Date(y, mo - 1, 1); const to = new Date(y, mo, 1);
      const [t, s] = await Promise.all([
        ticketsUpdatedSince(from, { max: 20000 }),
        getDocs(query(collection(db, 'centerSettlements'), where('month', '==', month), limit(200))),
      ]);
      setDues(centerDues(t, centers, { from, to }));
      setPaid(Object.fromEntries(s.docs.map((d) => [d.data().center, d.data()])));
    } catch (e) { console.error(e); showError('معرفتش أحسب المستحقات'); }
    finally { setBusy(false); }
  };
  const markPaid = async (r) => {
    try {
      const rec = { center: r.center, month, count: r.count, amount: r.amount, tickets: r.tickets.map((x) => x.ticketNumber), paidBy: appUser?.name || '', paidAt: serverTimestamp(), createdAt: serverTimestamp() };
      await addDoc(collection(db, 'centerSettlements'), rec);
      setPaid((p) => ({ ...p, [r.center]: rec })); showSuccess('اتسجل الدفع');
    } catch { showError('معرفتش أسجل'); }
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">الحمل الحالي على المراكز</p>
        {!open && <Loader2 className="animate-spin text-teal-600" size={18} />}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => {
            const full = r.capacity ? r.open / r.capacity : null;
            return (
              <div key={r.name} className={`rounded-xl border p-3 ${r.unassigned ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20' : 'border-slate-100 dark:border-slate-700'}`}>
                <div className="flex justify-between"><b className="text-sm">{r.name}</b><span className="text-xs text-slate-500">{r.open} مفتوحة{r.capacity ? ` / ${r.capacity}` : ''}</span></div>
                {full !== null && <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 mt-2 overflow-hidden"><div className={`h-full ${full >= 1 ? 'bg-rose-500' : full >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, full * 100)}%` }} /></div>}
                {r.overdue > 0 && <p className="text-[11px] text-rose-600 mt-1">{r.overdue} متأخرة عن الـ SLA</p>}
                {r.governorates?.length > 0 && <p className="text-[10px] text-slate-400 mt-1">بيغطي: {r.governorates.join('، ')}</p>}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">التغطية والطاقة والمستحقات بتتظبط من الإعدادات ← مراكز الصيانة. ترتيب أداء المراكز في التقارير ← الجودة والمراكز.</p>
      </div>
      <div className={card}>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <p className="text-sm font-black text-slate-700 dark:text-slate-200 flex-1">مستحقات المراكز عن إصلاحات الضمان</p>
          <input type="month" aria-label="الشهر" value={month} onChange={(e) => setMonth(e.target.value)} className={inp} />
          <button type="button" onClick={loadDues} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} احسب</button>
          {dues?.length > 0 && <button type="button" onClick={() => exportToExcel(dues.flatMap((r) => r.tickets.map((x) => ({ 'المركز': r.center, 'التذكرة': x.ticketNumber, 'الجهاز': x.device, 'المستحق': x.fee }))), `Center_Dues_${month}`, 'المستحقات')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>}
        </div>
        {dues && !dues.length && <p className="text-xs text-slate-400">مفيش إصلاحات ضمان خلصت في الشهر ده.</p>}
        {dues?.map((r) => (
          <div key={r.center} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-50 dark:border-slate-700 text-sm">
            <span><b>{r.center}</b> · {r.count} إصلاح · <b className="text-teal-700">{money(r.amount)}</b>{r.missingRate && <span className="text-[11px] text-amber-600"> (مفيش سعر متسجل للمركز ده)</span>}</span>
            {paid[r.center] ? <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 size={14} /> اتدفع {money(paid[r.center].amount)}</span>
              : <button type="button" onClick={() => markPaid(r)} disabled={!r.amount || appUser?.role !== 'admin'} className={`${btn} bg-emerald-600 text-white`}>سجّل كمدفوع</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- طلبات القطع (42 + 44)
function PartsTab({ appUser }) {
  const [{ items, loading }, load, patch] = useList('partRequests');
  const [filter, setFilter] = useState('active');
  const [stock, setStock] = useState({});
  const by = appUser?.name || '';
  const list = (items || []).filter((r) => (filter === 'active' ? ['pending', 'approved', 'shipped'].includes(r.status) : filter === 'all' ? true : r.status === filter));

  // (44) فحص توفّر القطع في كل المخازن
  useEffect(() => {
    if (!items) return undefined;
    let cancelled = false;
    const todo = items.filter((r) => ['pending', 'approved'].includes(r.status)).slice(0, 20);
    Promise.all(todo.map(async (r) => {
      const res = await Promise.all(r.items.map(async (it) => {
        const tokens = buildQueryTokens(it.name);
        if (!tokens.length) return { name: it.name, qty: 0, where: [] };
        const snap = await getDocs(query(collection(db, 'inventory'), where('isDeleted', '==', false), where('searchTokens', 'array-contains-any', tokens), limit(10))).catch(() => ({ docs: [] }));
        const rows = snap.docs.map((d) => d.data()).filter((x) => (Number(x.quantity) || 0) > 0);
        return { name: it.name, qty: rows.reduce((s, x) => s + (Number(x.quantity) || 0), 0), where: rows.map((x) => `${x.warehouseId}: ${x.quantity}`) };
      }));
      return [r.id, res];
    })).then((pairs) => { if (!cancelled) setStock(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [items]);

  // 🔗 لما المركز يستلم: القطع المربوطة بالمخزون بتتضاف على التذكرة وتتخصم من مخزن فرع التذكرة،
  // والتذكرة بترجع «تحت الصيانة» لو كانت مستنية القطع
  const attachToTicket = async (r) => {
    const linked = (r.items || []).filter((i) => i.serialNumber);
    const added = []; const missing = [];
    for (const i of linked) {
      try {
        const st = await findStockItem(i.serialNumber, r.branch || 'main');
        if (!st) { missing.push(i.name); continue; }
        await addPartToTicket(r.ticketId, { id: st.id, serialNumber: st.serialNumber, name: st.name, quantity: i.qty, price: Number(st.price) || Number(i.price) || 0 }, { by, source: `partRequest:${r.id}` });
        added.push(i.name);
      } catch { missing.push(i.name); }
    }
    (r.items || []).filter((i) => !i.serialNumber).forEach((i) => missing.push(i.name));
    try {
      const t = await getDoc(doc(db, 'tickets', r.ticketId));
      if (t.exists() && t.data().status === 'waiting_spare_parts') await setTicketStatusQuiet({ id: t.id, ...t.data() }, 'received_maintenance', { by, note: 'وصلت قطع الغيار' });
      if (added.length) await updateDoc(doc(db, 'partRequests', r.id), { addedToTicket: true });
      const tech = t.exists() ? t.data().assignedTechnician : '';
      if (tech) notify({ toName: tech, title: `وصلت قطع ${r.ticketNumber}`, body: [added.length ? `اتضافت: ${added.join('، ')}` : '', missing.length ? `ضيفها يدوي: ${missing.join('، ')}` : ''].filter(Boolean).join(' · '), view: 'my_tickets', from: by });
    } catch (e) { console.warn('part request → ticket', e); }
    if (added.length) showSuccess(`اتضافت على التذكرة واتخصمت من المخزن: ${added.join('، ')}`);
    if (missing.length) showError(`ضيف القطع دي على التذكرة يدوي (مش مربوطة أو مش موجودة في مخزن الفرع): ${missing.join('، ')}`);
  };

  const move = async (r, status) => {
    try {
      await advance('partRequests', r, status, by); patch((arr) => arr.map((x) => (x.id === r.id ? { ...x, status } : x))); showSuccess(PART_REQUEST_FLOW[status].label);
      if (status === 'received') await attachToTicket(r);
      if (r.requestedBy) notify({ toName: r.requestedBy, title: `طلب القطع ${r.ticketNumber}: ${PART_REQUEST_FLOW[status].label}`, body: r.items.map((i) => `${i.name}×${i.qty}`).join('، '), view: 'tickets', intent: { kind: 'ticket', id: r.ticketId }, from: by });
    }
    catch { showError('معرفتش أحدّث الطلب'); }
  };
  const unavailable = Object.entries(stock).filter(([, res]) => res.some((x) => x.qty === 0)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[['active', 'الجارية'], ['pending', 'مستنية موافقة'], ['shipped', 'اتشحنت'], ['received', 'اتستلمت'], ['rejected', 'مرفوضة'], ['all', 'الكل']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`${btn} ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}</button>
        ))}
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700 mr-auto`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} تحديث</button>
      </div>
      {unavailable > 0 && <p className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-3 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2"><AlertTriangle size={14} /> {unavailable} طلب فيه قطع مش موجودة في أي مخزن — التذاكر دي هتتعطل لحد ما القطعة تتطلب من المورد.</p>}
      {items && !list.length && <p className="text-sm text-slate-400 text-center p-6">مفيش طلبات.</p>}
      {list.map((r) => (
        <div key={r.id} className={`${card} anim-up`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <p className="text-sm font-black"><button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: r.ticketId })} className="text-teal-700 hover:underline">{r.ticketNumber}</button> · {r.device} <span className="font-normal text-slate-500">· {r.center || r.branch}</span></p>
              <p className="text-slate-600 dark:text-slate-300">{r.items.map((i) => `${i.name} × ${i.qty}`).join('، ')}</p>
              <p className="text-[10px] text-slate-400">{fmt(toDate(r.createdAt))} · {r.requestedBy} · من مخزن {r.fromWarehouse}{r.note ? ` · ${r.note}` : ''}</p>
              {stock[r.id] && <p className="text-[11px] mt-1">{stock[r.id].map((x) => <span key={x.name} className={`mr-2 ${x.qty ? 'text-emerald-600' : 'text-rose-600 font-bold'}`}>{x.name}: {x.qty ? `متوفر (${x.where.join('، ')})` : 'مش موجود في أي مخزن'}</span>)}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 font-bold">{PART_REQUEST_FLOW[r.status]?.label}</span>
              {r.status === 'pending' && isManager(appUser) && <><button type="button" onClick={() => move(r, 'approved')} className={`${btn} bg-teal-600 text-white`}>موافقة</button><button type="button" onClick={() => move(r, 'rejected')} className={`${btn} bg-rose-50 text-rose-600`}>رفض</button></>}
              {r.status === 'approved' && isManager(appUser) && <button type="button" onClick={() => move(r, 'shipped')} className={`${btn} bg-sky-600 text-white`}>اتشحن</button>}
              {r.status === 'shipped' && <button type="button" onClick={() => move(r, 'received')} className={`${btn} bg-emerald-600 text-white`}>المركز استلم</button>}
            </div>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-slate-400">الطلبات بتتعمل من جوه التذكرة (المركز وقطع الغيار ← طلب قطع). نقل القطعة لمخزن الفرع بيتعمل بتحويل مخزني بالكود، ولما تضغط «المركز استلم» القطع المربوطة (🔗) بتتضاف على التذكرة وتتخصم من مخزن الفرع لوحدها.</p>
    </div>
  );
}

// ---------------------------------------------------------------- القطع التالفة (43)
function DefectiveTab({ appUser }) {
  const [{ items, loading }, load, patch] = useList('defectiveParts');
  const by = appUser?.name || '';
  const move = async (r, status) => {
    try { await advance('defectiveParts', r, status, by); patch((arr) => arr.map((x) => (x.id === r.id ? { ...x, status } : x))); }
    catch { showError('معرفتش أحدّث'); }
  };
  const counts = Object.fromEntries(Object.keys(DEFECTIVE_FLOW).map((k) => [k, (items || []).filter((x) => x.status === k).length]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {Object.entries(DEFECTIVE_FLOW).map(([k, v]) => <span key={k} className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700">{v.label}: <b>{counts[k] || 0}</b></span>)}
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700 mr-auto`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} تحديث</button>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-900"><tr><th className={th}>القطعة</th><th className={th}>الموديل</th><th className={th}>التذكرة</th><th className={th}>المركز</th><th className={th}>من</th><th className={th}>الحالة</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
            {(items || []).map((r) => (
              <tr key={r.id}>
                <td className={td}><b>{r.partName}</b>{r.serial ? <span className="text-slate-400 font-mono"> · {r.serial}</span> : ''}</td>
                <td className={td}>{r.model}</td>
                <td className={td}><button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: r.ticketId })} className="text-teal-700 hover:underline">{r.ticketNumber}</button></td>
                <td className={td}>{r.center || '—'}</td><td className={td}>{fmt(toDate(r.createdAt))}</td>
                <td className={td}>{DEFECTIVE_FLOW[r.status]?.label}</td>
                <td className={td}>{(DEFECTIVE_FLOW[r.status]?.next || []).map((n) => <button key={n} type="button" onClick={() => move(r, n)} className="text-teal-700 font-bold hover:underline">← {DEFECTIVE_FLOW[n].label}</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items && !items.length && <p className="text-xs text-slate-400 p-4">مفيش قطع تالفة متسجلة. بتتسجل من جوه التذكرة.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- مطالبات المصنع (46)
function ClaimsTab({ appUser }) {
  const [{ items, loading }, load, patch] = useList('warrantyClaims');
  const [amounts, setAmounts] = useState({});
  const by = appUser?.name || '';
  const totals = useMemo(() => claimTotals(items || []), [items]);
  const move = async (c, status, extra = {}) => {
    try { await advance('warrantyClaims', c, status, by, extra); patch((arr) => arr.map((x) => (x.id === c.id ? { ...x, status, ...extra } : x))); }
    catch { showError('معرفتش أحدّث المطالبة'); }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['مستنية رد المصنع', `${totals.pending} · ${money(totals.pendingAmount)}`, 'from-amber-500 to-amber-700'], ['اتوافق عليها (لسه ماتصرفتش)', money(totals.approvedAmount), 'from-sky-500 to-sky-700'], ['اتصرفت', money(totals.paidAmount), 'from-emerald-500 to-emerald-700'], ['مرفوضة', totals.rejected, 'from-rose-500 to-rose-700']].map(([l, v, c], i) => (
          <div key={l} className={`anim-up rounded-2xl p-4 text-white bg-gradient-to-br ${c}`} style={{ '--d': `${i * 50}ms` }}><p className="text-[11px] opacity-90">{l}</p><p className="text-xl font-black mt-1">{v}</p></div>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => exportToExcel((items || []).map((c) => ({ 'التذكرة': c.ticketNumber, 'الموديل': c.model, 'السيريال': c.serial, 'العطل': c.fault, 'المركز': c.center, 'القطع': (c.parts || []).map((p) => `${p.name}×${p.qty}`).join('، '), 'تكلفة القطع': c.partsCost, 'المصنعية': c.laborCost, 'الحالة': CLAIM_FLOW[c.status]?.label, 'المعتمد': c.approvedAmount || '' })), 'Warranty_Claims', 'المطالبات')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>تصدير للمصنع (Excel)</button>
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} تحديث</button>
      </div>
      {(items || []).map((c) => (
        <div key={c.id} className={`${card} flex flex-wrap items-center justify-between gap-2 text-xs`}>
          <div>
            <p className="text-sm font-black"><button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: c.ticketId })} className="text-teal-700 hover:underline">{c.ticketNumber}</button> · {c.model} {c.serial && <span className="font-mono font-normal text-slate-400">{c.serial}</span>}</p>
            <p className="text-slate-600 dark:text-slate-300">{c.fault || '—'} · {(c.parts || []).map((p) => `${p.name}×${p.qty}`).join('، ') || 'من غير قطع'} · قطع {money(c.partsCost)} + مصنعية {money(c.laborCost)}</p>
            <p className="text-[10px] text-slate-400">{c.center} · {fmt(toDate(c.createdAt))}{c.approvedAmount ? ` · معتمد ${money(c.approvedAmount)}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 font-bold">{CLAIM_FLOW[c.status]?.label}</span>
            {(c.status === 'draft' || c.status === 'rejected') && <button type="button" onClick={() => move(c, 'submitted', { submittedAt: new Date().toISOString() })} className={`${btn} bg-teal-600 text-white`}>اتقدّمت للمصنع</button>}
            {c.status === 'submitted' && (
              <>
                <input type="number" aria-label="المبلغ المعتمد" placeholder="المعتمد" value={amounts[c.id] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))} className={`${inp} w-24`} />
                <button type="button" onClick={() => move(c, 'approved', { approvedAmount: Number(amounts[c.id]) || (Number(c.partsCost) + Number(c.laborCost)) })} className={`${btn} bg-sky-600 text-white`}>اتوافق</button>
                <button type="button" onClick={() => move(c, 'rejected')} className={`${btn} bg-rose-50 text-rose-600`}>اترفضت</button>
              </>
            )}
            {c.status === 'approved' && <button type="button" onClick={() => move(c, 'paid', { paidAt: new Date().toISOString() })} className={`${btn} bg-emerald-600 text-white`}>اتصرفت</button>}
          </div>
        </div>
      ))}
      {items && !items.length && <p className="text-sm text-slate-400 text-center p-6">مفيش مطالبات. بتتعمل من جوه تذكرة داخل الضمان.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- فحص الضمان بالسيريال (45)
function WarrantyCheckTab({ appUser }) {
  const [serial, setSerial] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState({ months: 12 });
  const check = async (e) => {
    e?.preventDefault?.();
    const s = serial.trim();
    if (s.length < 3) { showError('اكتب السيريال'); return; }
    setBusy(true);
    try {
      const variants = [...new Set([s, s.toUpperCase(), s.toLowerCase()])];
      const [t, r, x] = await Promise.all([
        getDocs(query(collection(db, 'tickets'), where('deviceSerial', 'in', variants), limit(30))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'deviceRegistry'), where('serial', '==', s.toLowerCase()), limit(5))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'transactions'), where('serialNumber', 'in', variants), limit(10))).catch(() => ({ docs: [] })),
      ]);
      const sales = x.docs.map((d) => d.data());
      const sale = sales[0];
      const item = sale ? (sale.items || []).find((i) => variants.includes(String(i.serialNumber || ''))) || {} : null;
      const registry = r.docs.map((d) => ({ id: d.id, ...d.data() }))[0] || null;
      const ws = item?.warrantyEndDate ? warrantyStatus({ endDate: item.warrantyEndDate }) : registry ? warrantyStatus({ purchaseDate: registry.purchaseDate, months: registry.months }) : { known: false };
      setRes({ serial: s, tickets: t.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)), registry, sale, item, ws });
    } finally { setBusy(false); }
  };
  const register = async () => {
    if (!reg.purchaseDate || !reg.model) { showError('اكتب الموديل وتاريخ الشراء'); return; }
    try {
      await addDoc(collection(db, 'deviceRegistry'), { serial: res.serial.toLowerCase(), serialRaw: res.serial, model: reg.model, customerName: reg.customerName || '', phone: reg.phone || '', purchaseDate: reg.purchaseDate, months: Number(reg.months) || 12, dealer: reg.dealer || '', createdBy: appUser?.name || '', createdAt: serverTimestamp() });
      showSuccess('اتسجل الجهاز'); check();
    } catch { showError('معرفتش أسجل الجهاز'); }
  };
  return (
    <div className="space-y-3">
      <form onSubmit={check} className={`${card} flex flex-wrap gap-2 items-center`}>
        <ShieldCheck size={20} className="text-teal-600" />
        <input autoFocus value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="سيريال الجهاز" aria-label="سيريال الجهاز" dir="ltr" className={`${inp} flex-1 min-w-[180px] text-lg font-mono`} />
        <button type="submit" disabled={busy} className={`${btn} bg-teal-600 text-white py-3`}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} افحص</button>
      </form>
      {res && (
        <div className="grid lg:grid-cols-2 gap-3 anim-up">
          <div className={card}>
            <p className="text-sm font-black mb-2">حالة الضمان</p>
            {res.ws.known ? (
              <p className={`text-lg font-black ${res.ws.active ? 'text-emerald-600' : 'text-rose-600'}`}>{res.ws.active ? `ساري — باقي ${res.ws.daysLeft} يوم (لحد ${fmt(res.ws.end)})` : `منتهي من ${fmt(res.ws.end)}`}</p>
            ) : <p className="text-sm text-amber-600 font-bold">مش معروف — الجهاز مش متسجل في المبيعات ولا في سجل الأجهزة.</p>}
            {res.sale && <p className="text-xs text-slate-500 mt-1">اتباع في فاتورة {res.sale.invoiceNumber} لـ {res.sale.customerName} · {fmt(toDate(res.sale.timestamp))}</p>}
            {res.registry && <p className="text-xs text-slate-500 mt-1">متسجل: {res.registry.model} · اتشرى {res.registry.purchaseDate} · ضمان {res.registry.months} شهر{res.registry.dealer ? ` · من ${res.registry.dealer}` : ''}</p>}
            {!res.sale && !res.registry && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                <p className="col-span-2 font-bold text-slate-700 dark:text-slate-200">سجّل الجهاز (لو اتشرى من موزّع):</p>
                <input aria-label="الموديل" placeholder="الموديل" value={reg.model || ''} onChange={(e) => setReg({ ...reg, model: e.target.value })} className={inp} />
                <input aria-label="الموزّع" placeholder="اتشرى من (موزّع)" value={reg.dealer || ''} onChange={(e) => setReg({ ...reg, dealer: e.target.value })} className={inp} />
                <label className="flex flex-col">تاريخ الشراء<input type="date" value={reg.purchaseDate || ''} onChange={(e) => setReg({ ...reg, purchaseDate: e.target.value })} className={inp} /></label>
                <label className="flex flex-col">مدة الضمان (شهر)<input type="number" value={reg.months} onChange={(e) => setReg({ ...reg, months: e.target.value })} className={inp} /></label>
                <input aria-label="اسم العميل" placeholder="اسم العميل" value={reg.customerName || ''} onChange={(e) => setReg({ ...reg, customerName: e.target.value })} className={inp} />
                <input aria-label="موبايل العميل" placeholder="الموبايل" value={reg.phone || ''} onChange={(e) => setReg({ ...reg, phone: e.target.value })} className={inp} />
                <button type="button" onClick={register} className={`${btn} bg-teal-600 text-white col-span-2 justify-center`}><Save size={14} /> سجّل</button>
              </div>
            )}
          </div>
          <div className={card}>
            <p className="text-sm font-black mb-2">الإصلاحات السابقة ({res.tickets.length})</p>
            {!res.tickets.length && <p className="text-xs text-slate-400">مفيش تذاكر قبل كده للسيريال ده.</p>}
            {res.tickets.map((t) => (
              <button key={t.id} type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: t.id })} className="w-full text-right text-xs py-1.5 border-b border-slate-50 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/20">
                <b className="text-teal-700">{t.ticketNumber}</b> · {fmt(toDate(t.createdAt))} · {t.mainFaultDescription || t.issue?.slice(0, 60)} · {statusLabel(t.status)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- عقود الضمان الممتد والصيانة (47)
function ContractsTab({ appUser, systemSettings }) {
  const [{ items, loading }, load, patch] = useList('serviceContracts');
  const [filter, setFilter] = useState('due');
  const [form, setForm] = useState(null);
  const by = appUser?.name || '';
  const rows = (items || []).map((c) => ({ c, i: contractInfo(c) })).filter(({ i }) => (filter === 'due' ? i.visitDue || i.status === 'expiring' : filter === 'all' ? true : i.status === filter));
  const save = async () => {
    if (!form.customerName || !form.phone || !form.device || !form.startDate || !form.endDate) { showError('كمّل البيانات الأساسية'); return; }
    try {
      const rec = { ...form, visitsPerYear: Number(form.visitsPerYear) || 0, price: Number(form.price) || 0, visits: [], createdBy: by, createdAt: serverTimestamp() };
      const r = await addDoc(collection(db, 'serviceContracts'), rec);
      patch((arr) => [{ id: r.id, ...rec, createdAt: new Date() }, ...arr]); setForm(null); showSuccess('اتسجل العقد');
    } catch { showError('معرفتش أسجل العقد'); }
  };
  const visit = async (c) => {
    const v = { date: new Date().toISOString().slice(0, 10), by };
    try { await updateDoc(doc(db, 'serviceContracts', c.id), { visits: arrayUnion(v) }); patch((arr) => arr.map((x) => (x.id === c.id ? { ...x, visits: [...(x.visits || []), v] } : x))); showSuccess('اتسجلت الزيارة'); }
    catch { showError('معرفتش أسجل الزيارة'); }
  };
  const field = (k, l, type = 'text') => <label key={k} className="flex flex-col text-[11px] text-slate-500">{l}<input type={type} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp} /></label>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[['due', 'محتاجة تصرّف'], ['active', 'سارية'], ['expiring', 'قربت تنتهي'], ['expired', 'منتهية'], ['all', 'الكل']].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`${btn} ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}</button>)}
        <button type="button" onClick={() => setForm({ type: 'maintenance', visitsPerYear: 2, startDate: new Date().toISOString().slice(0, 10) })} className={`${btn} bg-teal-600 text-white mr-auto`}><Plus size={14} /> عقد جديد</button>
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
      </div>
      {form && (
        <div className={`${card} grid sm:grid-cols-2 lg:grid-cols-4 gap-2 anim-fade`}>
          <label className="flex flex-col text-[11px] text-slate-500">النوع<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inp}><option value="maintenance">عقد صيانة دورية</option><option value="extended">ضمان ممتد</option></select></label>
          {field('customerName', 'اسم العميل')}{field('phone', 'الموبايل')}{field('device', 'الجهاز / الموديل')}{field('serial', 'السيريال')}
          {field('startDate', 'من', 'date')}{field('endDate', 'إلى', 'date')}{field('visitsPerYear', 'زيارات في السنة', 'number')}{field('price', 'السعر (ج)', 'number')}
          <div className="flex items-end gap-2 lg:col-span-3"><button type="button" onClick={save} className={`${btn} bg-teal-600 text-white`}><Save size={14} /> حفظ</button><button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button></div>
        </div>
      )}
      {items && !rows.length && <p className="text-sm text-slate-400 text-center p-6">مفيش عقود في الفلتر ده.</p>}
      {rows.map(({ c, i }) => {
        const renew = whatsappLink(c.phone, `أهلاً أستاذ/ة ${String(c.customerName || '').split(' ')[0]}، ${c.type === 'extended' ? 'الضمان الممتد' : 'عقد الصيانة'} لـ ${c.device} هينتهي يوم ${c.endDate}. تحب نجدده؟${systemSettings?.storeName ? `\n${systemSettings.storeName}` : ''}`);
        return (
          <div key={c.id} className={`${card} flex flex-wrap items-center justify-between gap-2 text-xs anim-up`}>
            <div>
              <p className="text-sm font-black">{c.customerName} · {c.device} <span className="text-[11px] font-normal px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700">{c.type === 'extended' ? 'ضمان ممتد' : 'صيانة دورية'}</span></p>
              <p className="text-slate-500">{c.startDate} → {c.endDate} · <b className={i.status === 'expiring' ? 'text-amber-600' : i.status === 'expired' ? 'text-rose-600' : 'text-emerald-600'}>{CONTRACT_STATUS[i.status]}</b>{i.daysToEnd !== null && i.daysToEnd >= 0 ? ` (باقي ${i.daysToEnd} يوم)` : ''} · زيارات: {i.visitsDone}{c.visitsPerYear ? `/${c.visitsPerYear} في السنة` : ''}{i.nextVisit ? ` · الزيارة الجاية ${fmt(i.nextVisit)}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {i.visitDue && <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-bold">ميعاد زيارة</span>}
              <button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket-new', prefill: { customerName: c.customerName, customerPhone: c.phone, device: c.device, deviceSerial: c.serial || '', issue: c.type === 'extended' ? 'إصلاح ضمن الضمان الممتد' : 'زيارة صيانة دورية (عقد)', ticketType: 'maintenance', notes: `عقد ${c.type === 'extended' ? 'ضمان ممتد' : 'صيانة'} ساري لحد ${c.endDate}` } })} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Plus size={14} /> تذكرة</button>
              {c.visitsPerYear > 0 && <button type="button" onClick={() => visit(c)} className={`${btn} bg-teal-600 text-white`}><CheckCircle2 size={14} /> سجّل زيارة النهارده</button>}
              {(i.status === 'expiring' || i.status === 'expired') && renew && <a href={renew} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}><ExternalLink size={14} /> تجديد (واتساب)</a>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  ['centers', 'المراكز والمستحقات', <Building2 size={14} key="i" />], ['parts', 'طلبات القطع', <PackagePlus size={14} key="i" />],
  ['defective', 'القطع التالفة', <PackageX size={14} key="i" />], ['claims', 'مطالبات المصنع', <FileBadge size={14} key="i" />],
  ['warranty', 'فحص الضمان', <ShieldCheck size={14} key="i" />], ['contracts', 'العقود', <FileSignature size={14} key="i" />],
  ['map', 'خريطة المحافظات', <MapPin size={14} key="i" />], ['report', 'التقرير الشهري للمراكز', <FileBadge size={14} key="i" />],
];

// 🏢 شبكة مراكز الصيانة
export function NetworkHub({ appUser, systemSettings }) {
  const [tab, setTab] = useState('centers');
  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Building2 size={20} className="text-teal-600" /> شبكة المراكز وقطع الغيار والضمان</h2>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{icon} {label}</button>)}
        </div>
      </div>
      {tab === 'centers' && <CentersTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'parts' && <PartsTab appUser={appUser} />}
      {tab === 'defective' && <DefectiveTab appUser={appUser} />}
      {tab === 'claims' && <ClaimsTab appUser={appUser} />}
      {tab === 'warranty' && <WarrantyCheckTab appUser={appUser} />}
      {tab === 'contracts' && <ContractsTab appUser={appUser} systemSettings={systemSettings} />}
      {tab === 'map' && <GovernorateMap systemSettings={systemSettings} />}
      {tab === 'report' && <CentersReportTab systemSettings={systemSettings} />}
    </section>
  );
}
