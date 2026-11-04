import React, { useEffect, useMemo, useState } from 'react';
import { arrayUnion, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Wrench, Loader2, RefreshCw, Phone, Play, PackageSearch, BadgeDollarSign, CheckCircle2, StickyNote, MapPin, Clock } from 'lucide-react';
import { db } from '../../firebase/config';
import { TICKET_STATUSES, TICKET_TERMINAL_STATUSES } from '../../constants/tickets';
import { refreshTrackingIfAny } from '../../utils/ticketTracking';
import { showError, showSuccess } from '../../utils/alerts';
import { AttendanceWidget } from './AttendanceWidget';
import { TicketNetworkTools } from './TicketNetworkTools';
import { mapsLink, VISIT_STATUS, ymd } from '../../ai/staff';
import { toDate } from '../../utils/liveStats';

// أزرار كبيرة للحالات اللي الفني بيستخدمها كل يوم
const QUICK = [
  { status: 'received_maintenance', label: 'بدأت الفحص', icon: <Play size={16} />, cls: 'bg-sky-600' },
  { status: 'waiting_customer_approval_cost', label: 'محتاج موافقة العميل', icon: <BadgeDollarSign size={16} />, cls: 'bg-amber-500', needsCost: true },
  { status: 'waiting_spare_parts', label: 'مستني قطعة', icon: <PackageSearch size={16} />, cls: 'bg-orange-500' },
  { status: 'maintenance_after_approval', label: 'بصلّح', icon: <Wrench size={16} />, cls: 'bg-violet-600' },
  { status: 'contacted_customer', label: 'خلص — جاهز', icon: <CheckCircle2 size={16} />, cls: 'bg-emerald-600' },
];

// 📱 "تذاكري": شاشة الفني على الموبايل
export function MyTickets({ appUser, systemSettings, warehouses = [] }) {
  const [items, setItems] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({});
  const [cost, setCost] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [now] = useState(() => Date.now());
  const name = appUser?.name || '';

  const load = async () => {
    setLoading(true);
    try {
      const [t, v] = await Promise.all([
        getDocs(query(collection(db, 'tickets'), where('assignedTechnician', '==', name), orderBy('updatedAt', 'desc'), limit(200))),
        getDocs(query(collection(db, 'homeVisits'), where('technician', '==', name), where('date', '==', ymd()), limit(30))).catch(() => ({ docs: [] })),
      ]);
      setItems(t.docs.map((d) => ({ id: d.id, ...d.data() })));
      setVisits(v.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); showError(e?.code === 'failed-precondition' ? 'محتاج Index: شغّل firebase deploy --only firestore:indexes' : 'معرفتش أحمّل تذاكرك'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل مرة واحدة
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [name]);

  const rows = useMemo(() => {
    const sla = systemSettings?.ticketSLA || { high: 4, medium: 24, low: 72 };
    return (items || []).filter((t) => showAll || !TICKET_TERMINAL_STATUSES.includes(t.status)).map((t) => {
      const c = toDate(t.createdAt);
      const ageH = c ? (now - c) / 3600000 : 0;
      const limitH = sla[t.priority || 'medium'] ?? 24;
      return { t, ageH, leftH: limitH - ageH };
    }).sort((a, b) => a.leftH - b.leftH);
  }, [items, showAll, systemSettings, now]);

  const setStatus = async (t, q) => {
    if (q.needsCost && !(Number(cost[t.id]) > 0)) { showError('اكتب تكلفة الإصلاح الأول'); return; }
    setBusy(`${t.id}:${q.status}`);
    try {
      const at = new Date().toISOString();
      const upd = { status: q.status, updatedAt: serverTimestamp(), statusHistory: arrayUnion({ status: q.status, timestamp: at, by: name }),
        history: arrayUnion({ action: `${q.label} (من شاشة الفني)`, timestamp: at, by: name }) };
      if (q.needsCost) upd.estimatedCost = Number(cost[t.id]);
      await updateDoc(doc(db, 'tickets', t.id), upd);
      const patched = { ...t, status: q.status, ...(q.needsCost ? { estimatedCost: Number(cost[t.id]) } : {}), statusHistory: [...(t.statusHistory || []), { status: q.status, timestamp: at, by: name }] };
      refreshTrackingIfAny(patched, { company: systemSettings?.storeName || '', companyPhone: systemSettings?.storePhone || '' });
      setItems((arr) => arr.map((x) => (x.id === t.id ? patched : x)));
      showSuccess(q.label);
    } catch (e) { console.error(e); showError('معرفتش أغيّر الحالة'); }
    finally { setBusy(''); }
  };

  const addNote = async (t) => {
    const txt = String(note[t.id] || '').trim();
    if (!txt) return;
    try {
      await updateDoc(doc(db, 'tickets', t.id), { updatedAt: serverTimestamp(), history: arrayUnion({ action: 'ملاحظة الفني', details: txt, timestamp: new Date().toISOString(), by: name }) });
      setNote((n) => ({ ...n, [t.id]: '' })); showSuccess('اتسجلت الملاحظة');
    } catch { showError('معرفتش أسجل الملاحظة'); }
  };

  return (
    <section className="space-y-3 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Wrench size={20} className="text-teal-600" /> تذاكري</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowAll((v) => !v)} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-xs font-bold">{showAll ? 'المفتوحة بس' : 'كله'}</button>
          <button type="button" onClick={load} aria-label="تحديث" className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
        </div>
      </div>
      <AttendanceWidget appUser={appUser} systemSettings={systemSettings} />

      {visits.length > 0 && (
        <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60 p-3 space-y-2">
          <p className="text-sm font-black text-sky-800 dark:text-sky-300 flex items-center gap-1.5"><MapPin size={16} /> زيارات النهارده ({visits.length})</p>
          {visits.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white dark:bg-slate-800 rounded-xl p-2">
              <span><b>{v.slot}</b> · {v.customerName} · {v.device} <span className="text-slate-500">({VISIT_STATUS[v.status] || v.status})</span></span>
              <span className="flex gap-2">
                <a href={`tel:${v.phone}`} className="text-teal-700 font-bold flex items-center gap-1"><Phone size={12} /> اتصال</a>
                {mapsLink(v) && <a href={mapsLink(v)} target="_blank" rel="noopener noreferrer" className="text-sky-700 font-bold flex items-center gap-1"><MapPin size={12} /> الخريطة</a>}
              </span>
            </div>
          ))}
        </div>
      )}

      {items && !rows.length && <p className="text-center text-sm text-slate-400 p-8">مفيش تذاكر مفتوحة عليك 👌</p>}
      {rows.map(({ t, ageH, leftH }) => (
        <div key={t.id} className={`anim-up rounded-2xl bg-white dark:bg-slate-800 border p-4 space-y-3 ${leftH < 0 ? 'border-rose-300 dark:border-rose-900' : leftH < 6 ? 'border-amber-300 dark:border-amber-900' : 'border-slate-100 dark:border-slate-700'}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-black text-slate-800 dark:text-white">{[t.device, t.deviceModel].filter(Boolean).join(' ')} <span className="text-xs font-normal text-slate-500">· {t.ticketNumber}</span></p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{t.issue}</p>
              {t.mainFaultDescription && <p className="text-xs text-slate-500">العطل: {t.mainFaultDescription}</p>}
            </div>
            <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 ${leftH < 0 ? 'bg-rose-100 text-rose-700' : leftH < 6 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
              <Clock size={11} /> {leftH < 0 ? `متأخرة ${Math.round(-leftH)} س` : `فاضل ${Math.round(leftH)} س`}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">الحالة: <b>{TICKET_STATUSES.find((s) => s.value === t.status)?.label}</b> · من {ageH >= 48 ? `${Math.floor(ageH / 24)} يوم` : `${Math.round(ageH)} ساعة`} · {t.customerName}{t.customerPhone ? <a href={`tel:${t.customerPhone}`} className="text-teal-700 font-bold mr-2"><Phone size={11} className="inline" /> اتصال</a> : null}</p>
          {!TICKET_TERMINAL_STATUSES.includes(t.status) && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QUICK.map((q) => (
                  <button key={q.status} type="button" disabled={t.status === q.status || !!busy} onClick={() => setStatus(t, q)}
                    className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-white text-xs font-black active:scale-95 transition disabled:opacity-40 ${q.cls}`}>
                    {busy === `${t.id}:${q.status}` ? <Loader2 size={16} className="animate-spin" /> : q.icon} {q.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="number" inputMode="numeric" aria-label="تكلفة الإصلاح" value={cost[t.id] ?? (t.estimatedCost || '')} onChange={(e) => setCost((c) => ({ ...c, [t.id]: e.target.value }))} placeholder="التكلفة (ج)" className="w-28 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900" />
                <input aria-label="ملاحظة" value={note[t.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [t.id]: e.target.value }))} placeholder="ملاحظة (اللي لقيته/عملته)" className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900" />
                <button type="button" onClick={() => addNote(t)} aria-label="سجّل الملاحظة" className="px-3 rounded-xl bg-slate-100 dark:bg-slate-700"><StickyNote size={16} /></button>
              </div>
              <TicketNetworkTools ticket={t} systemSettings={systemSettings} appUser={appUser} warehouses={warehouses} onTicketPatched={(p) => setItems((arr) => arr.map((x) => (x.id === t.id ? { ...x, ...p } : x)))} />
            </>
          )}
        </div>
      ))}
      <p className="text-[10px] text-slate-400 text-center">التسليم للعميل (محتاج توقيعه) بيتعمل من الاستقبال. كل حركة بتتسجل في سجل التذكرة باسمك.</p>
    </section>
  );
}
