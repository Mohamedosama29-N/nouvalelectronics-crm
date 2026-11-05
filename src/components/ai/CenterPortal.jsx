import React, { useEffect, useMemo, useState } from 'react';
import { loadErrorMessage } from '../../ai/forecastStore';
import { arrayUnion, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Building, Loader2, RefreshCw, Clock, Save } from 'lucide-react';
import { db } from '../../firebase/config';
import { TICKET_STATUSES, TICKET_TERMINAL_STATUSES } from '../../constants/tickets';
import { centersFromSettings } from '../../ai/network';
import { refreshTrackingIfAny } from '../../utils/ticketTracking';
import { showError, showSuccess } from '../../utils/alerts';
import { TicketNetworkTools } from './TicketNetworkTools';
import { toDate } from '../../utils/liveStats';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
// التسليم للعميل محتاج توقيع، فبيتعمل من شاشة التذاكر مش من البوابة
const NEEDS_SIGNATURE = ['delivered_to_customer', 'rejected_and_delivered', 'delivered_asc'];
const PORTAL_STATUSES = TICKET_STATUSES.filter((s) => !NEEDS_SIGNATURE.includes(s.value));

// 🏢 بوابة مركز الصيانة: المركز بيشوف تذاكره بس، ويحدّث الحالة، ويطلب قطع
export function CenterPortal({ appUser, systemSettings, warehouses = [] }) {
  const centers = centersFromSettings(systemSettings);
  const isAdmin = appUser?.role === 'admin';
  const [center, setCenter] = useState(appUser?.maintenanceCenter || (isAdmin ? centers[0]?.name || '' : ''));
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('open');
  const [edit, setEdit] = useState({});
  const [now] = useState(() => Date.now());

  const load = async (c = center) => {
    if (!c) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'tickets'), where('assignedMaintenanceCenter', '==', c), orderBy('updatedAt', 'desc'), limit(500)));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); showError(loadErrorMessage(e)); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل عند تغيير المركز بس
  useEffect(() => { const t = setTimeout(() => load(center), 0); return () => clearTimeout(t); }, [center]);

  const rows = useMemo(() => (items || []).map((t) => {
    const sla = systemSettings?.ticketSLA || { high: 4, medium: 24, low: 72 };
    const c = toDate(t.createdAt);
    const ageH = c ? (now - c) / 3600000 : 0;
    return { t, ageH, overdue: !TICKET_TERMINAL_STATUSES.includes(t.status) && ageH > (sla[t.priority || 'medium'] ?? 24) };
  }).filter(({ t, overdue }) => (filter === 'open' ? !TICKET_TERMINAL_STATUSES.includes(t.status) : filter === 'overdue' ? overdue : true)), [items, filter, systemSettings, now]);

  const save = async (t) => {
    const e = edit[t.id] || {};
    if (!e.status && !String(e.note || '').trim()) return;
    try {
      const at = new Date().toISOString();
      const by = appUser?.name || center;
      const upd = { updatedAt: serverTimestamp() };
      const hist = [];
      if (e.status && e.status !== t.status) {
        upd.status = e.status;
        upd.statusHistory = arrayUnion({ status: e.status, timestamp: at, by });
        hist.push({ action: `تغيير الحالة إلى "${TICKET_STATUSES.find((s) => s.value === e.status)?.label}" (بوابة ${center})`, timestamp: at, by });
      }
      if (String(e.note || '').trim()) hist.push({ action: `ملاحظة من ${center}`, details: e.note.trim(), timestamp: at, by });
      if (hist.length) upd.history = arrayUnion(...hist);
      await updateDoc(doc(db, 'tickets', t.id), upd);
      const patched = { ...t, status: e.status || t.status, statusHistory: e.status ? [...(t.statusHistory || []), { status: e.status, timestamp: at, by }] : t.statusHistory };
      refreshTrackingIfAny(patched, { centerName: center, company: systemSettings?.storeName || '', companyPhone: systemSettings?.storePhone || '' });
      setItems((arr) => arr.map((x) => (x.id === t.id ? patched : x)));
      setEdit((x) => ({ ...x, [t.id]: {} }));
      showSuccess('اتحفظ');
    } catch (err) { console.error(err); showError('معرفتش أحفظ'); }
  };

  if (!center && !isAdmin) {
    return <div className={`${card} text-center text-sm text-slate-500`}>حسابك مش مربوط بمركز صيانة. الأدمن يربطه من إدارة المستخدمين ← "مركز الصيانة".</div>;
  }

  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><Building size={20} className="text-teal-600" /> بوابة المركز {center && <span className="text-teal-700">— {center}</span>}</h2>
        <div className="flex flex-wrap gap-2 items-center">
          {isAdmin && <select aria-label="المركز" value={center} onChange={(e) => setCenter(e.target.value)} className={inp}>{centers.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>}
          {[['open', 'المفتوحة'], ['overdue', 'المتأخرة'], ['all', 'الكل']].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`px-3 py-2 rounded-lg text-xs font-bold ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}</button>)}
          <button type="button" onClick={() => load()} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
        </div>
      </div>
      {items && !rows.length && <p className="text-sm text-slate-400 text-center p-6">مفيش تذاكر في الفلتر ده 👌</p>}
      {rows.map(({ t, ageH, overdue }) => (
        <div key={t.id} className={`${card} space-y-2 anim-up ${overdue ? 'border-rose-200 dark:border-rose-900/60' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-xs">
              <p className="text-sm font-black">{t.ticketNumber} · {[t.device, t.deviceModel].filter(Boolean).join(' ')}</p>
              <p className="text-slate-600 dark:text-slate-300">{t.issue}</p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1"><Clock size={11} /> من {ageH >= 48 ? `${Math.floor(ageH / 24)} يوم` : `${Math.round(ageH)} ساعة`}{overdue && <b className="text-rose-600"> · متأخرة عن الـ SLA</b>} · {t.warrantyStatus === 'in_warranty' ? 'داخل الضمان' : 'خارج الضمان'}{t.assignedTechnician ? ` · ${t.assignedTechnician}` : ''}</p>
            </div>
            <span className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 font-bold">{TICKET_STATUSES.find((s) => s.value === t.status)?.label || t.status}</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select aria-label={`حالة ${t.ticketNumber}`} value={edit[t.id]?.status || ''} onChange={(e) => setEdit((x) => ({ ...x, [t.id]: { ...x[t.id], status: e.target.value } }))} className={inp}>
              <option value="">— غيّر الحالة —</option>{PORTAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input aria-label={`ملاحظة ${t.ticketNumber}`} value={edit[t.id]?.note || ''} onChange={(e) => setEdit((x) => ({ ...x, [t.id]: { ...x[t.id], note: e.target.value } }))} placeholder="ملاحظة للفرع/الكول سنتر" className={`${inp} flex-1 min-w-[160px]`} />
            <button type="button" onClick={() => save(t)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold"><Save size={14} /> حفظ</button>
          </div>
          <TicketNetworkTools ticket={t} systemSettings={systemSettings} appUser={appUser} warehouses={warehouses}
            onTicketPatched={(patch) => setItems((arr) => arr.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))} />
        </div>
      ))}
      <p className="text-[10px] text-slate-400">التسليم للعميل (محتاج توقيعه) بيتعمل من شاشة التذاكر. كل تغيير هنا بيتسجل في سجل التذكرة باسمك وبيحدّث صفحة "تابع تذكرتك".</p>
    </section>
  );
}
