import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { HardHat, MapPin, BookOpen, Clock, Loader2, RefreshCw, Plus, Save, Trash2, ExternalLink, Wand2, AlertTriangle } from 'lucide-react';
import { db } from '../../firebase/config';
import { attendanceInfo, attendanceSummary, DEFAULT_SHIFT, groupVisitsByDay, mapsLink, visitConfirmMessage, visitConflicts, VISIT_SLOTS, VISIT_STATUS, ymd } from '../../ai/staff';
import { loadRecentTickets } from '../../ai/ticketPool';
import { analyzePool, predictDuration, predictPartsAndCost } from '../../ai/ticketPredict';
import { whatsappLink } from '../../ai/ticketAssist';
import { useIntent } from '../../hooks/useIntent';
import { exportToExcel } from '../../utils/exportUtils';
import { showError, showSuccess } from '../../utils/alerts';
import { notify } from '../../utils/notifications';
import { EGYPT_GOVERNORATES } from '../../constants/misc';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const F = ({ label, children, className = '' }) => <label className={`flex flex-col gap-1 text-[11px] text-slate-500 ${className}`}>{label}{children}</label>;
const DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

// ---------------------------------------------------------------- (33) الزيارات المنزلية
function VisitsTab({ appUser, systemSettings, prefill, clearPrefill }) {
  const technicians = systemSettings?.technicians || [];
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tech, setTech] = useState('all');
  const [form, setForm] = useState(null);
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'homeVisits'), where('date', '>=', ymd(new Date(Date.now() - 86400000))), orderBy('date', 'asc'), limit(500)));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); showError('معرفتش أحمّل الزيارات'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!prefill) return undefined;
    const t = setTimeout(() => { setForm({ date: ymd(new Date(Date.now() + 86400000)), slot: VISIT_SLOTS[0], status: 'scheduled', ...prefill }); clearPrefill?.(); }, 0);
    return () => clearTimeout(t);
  }, [prefill, clearPrefill]);

  const days = useMemo(() => groupVisitsByDay((items || []).filter((v) => tech === 'all' || v.technician === tech), { days: 7 }), [items, tech]);
  const conflicts = form ? visitConflicts(items || [], form) : [];
  const save = async () => {
    if (!form.customerName || !form.phone || !form.date) { showError('اكتب العميل والموبايل والتاريخ'); return; }
    try {
      const rec = { ...form, createdBy: appUser?.name || '', createdAt: serverTimestamp() };
      if (form.id) { const { id, ...rest } = rec; await updateDoc(doc(db, 'homeVisits', id), rest); setItems((a) => a.map((x) => (x.id === id ? { ...x, ...rest } : x))); }
      else { const r = await addDoc(collection(db, 'homeVisits'), rec); setItems((a) => [...(a || []), { id: r.id, ...rec }]); }
      if (form.technician) notify({ toName: form.technician, title: `زيارة منزلية ${form.date} (${form.slot})`, body: `${form.customerName} — ${form.device || ''} — ${form.city || form.governorate || ''}`, view: 'my_tickets', from: appUser?.name || '' });
      setForm(null); showSuccess('اتحفظت الزيارة');
    } catch (e) { console.error(e); showError('معرفتش أحفظ الزيارة'); }
  };
  const setStatus = async (v, status) => {
    try { await updateDoc(doc(db, 'homeVisits', v.id), { status, statusAt: new Date().toISOString(), statusBy: appUser?.name || '' }); setItems((a) => a.map((x) => (x.id === v.id ? { ...x, status } : x))); }
    catch { showError('معرفتش أحدّث'); }
  };
  const field = (k, l, type = 'text') => <F key={k} label={l}><input type={type} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp} /></F>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="الفني" value={tech} onChange={(e) => setTech(e.target.value)} className={`${inp} w-auto`}><option value="all">كل الفنيين</option>{technicians.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <button type="button" onClick={() => setForm({ date: ymd(new Date(Date.now() + 86400000)), slot: VISIT_SLOTS[0], status: 'scheduled' })} className={`${btn} bg-teal-600 text-white`}><Plus size={14} /> زيارة جديدة</button>
        <button type="button" onClick={load} className={`${btn} bg-slate-100 dark:bg-slate-700 mr-auto`}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
      </div>
      {form && (
        <div className={`${card} grid sm:grid-cols-2 lg:grid-cols-4 gap-2 anim-fade`}>
          {field('customerName', 'العميل')}{field('phone', 'الموبايل')}{field('device', 'الجهاز')}{field('ticketNumber', 'رقم التذكرة (اختياري)')}
          <F label="المحافظة"><select value={form.governorate || ''} onChange={(e) => setForm({ ...form, governorate: e.target.value })} className={inp}><option value="">—</option>{EGYPT_GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}</select></F>
          {field('city', 'المنطقة')}{field('address', 'العنوان بالتفصيل')}
          <F label="الفني"><select value={form.technician || ''} onChange={(e) => setForm({ ...form, technician: e.target.value })} className={inp}><option value="">—</option>{technicians.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
          {field('date', 'اليوم', 'date')}
          <F label="الفترة"><select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })} className={inp}>{VISIT_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
          {field('notes', 'ملاحظات')}
          <div className="flex items-end gap-2"><button type="button" onClick={save} className={`${btn} bg-teal-600 text-white`}><Save size={14} /> حفظ</button><button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button></div>
          {conflicts.length > 0 && <p className="sm:col-span-2 lg:col-span-4 text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> الفني عنده زيارة تانية في نفس اليوم والفترة ({conflicts[0].customerName}).</p>}
        </div>
      )}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {days.map((d) => (
          <div key={d.key} className={card}>
            <p className="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">{DAYS[d.date.getDay()]} {d.date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })} {d.key === ymd() && <span className="text-[10px] text-teal-600">(النهارده)</span>} <span className="text-xs font-normal text-slate-400">· {d.visits.length}</span></p>
            {!d.visits.length && <p className="text-xs text-slate-300">—</p>}
            {d.visits.map((v) => {
              const wa = whatsappLink(v.phone, visitConfirmMessage(v, systemSettings?.storeName));
              return (
                <div key={v.id} className="text-xs border-r-2 border-teal-400 pr-2 py-1 mb-2">
                  <p><b>{v.slot}</b> · {v.customerName} · {v.device}</p>
                  <p className="text-slate-500">{v.technician || 'من غير فني'} · {[v.city, v.governorate].filter(Boolean).join('، ')} · <b>{VISIT_STATUS[v.status] || v.status}</b></p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {mapsLink(v) && <a href={mapsLink(v)} target="_blank" rel="noopener noreferrer" className="text-sky-700 font-bold flex items-center gap-0.5"><MapPin size={11} /> خريطة</a>}
                    {wa && v.status === 'scheduled' && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-bold flex items-center gap-0.5"><ExternalLink size={11} /> تأكيد واتساب</a>}
                    {v.status === 'scheduled' && <button type="button" onClick={() => setStatus(v, 'confirmed')} className="text-teal-700 font-bold">اتأكدت</button>}
                    {['scheduled', 'confirmed'].includes(v.status) && <><button type="button" onClick={() => setStatus(v, 'done')} className="text-emerald-700 font-bold">اتعملت</button><button type="button" onClick={() => setStatus(v, 'no_show')} className="text-amber-700 font-bold">مكانش موجود</button><button type="button" onClick={() => setStatus(v, 'cancelled')} className="text-rose-600 font-bold">إلغاء</button></>}
                    <button type="button" onClick={() => setForm(v)} className="text-slate-500">تعديل</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- (39) قوالب الأعطال
function TemplatesTab({ appUser }) {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const load = async () => {
    try { const s = await getDocs(query(collection(db, 'faultTemplates'), limit(1000))); setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }
    catch { showError('معرفتش أحمّل القوالب'); }
  };
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);
  const suggest = async () => {
    if (!form.faultCode) { showError('اكتب كود العطل الأول'); return; }
    setBusy(true);
    try {
      const pool = await loadRecentTickets();
      const draft = { deviceModel: form.model, mainFaultCode: form.faultCode, device: form.model, issue: form.faultDescription || '' };
      const d = predictDuration(draft, analyzePool(pool));
      const p = predictPartsAndCost(draft, pool);
      setForm((f) => ({ ...f, duration: f.duration || d?.label || '', cost: f.cost || (p?.cost ? Math.round(p.cost.median) : ''), parts: f.parts || (p?.parts || []).filter((x) => x.share >= 0.3).map((x) => x.name).join('، ') }));
      showSuccess(d || p ? 'اتملت من تاريخ التذاكر' : 'مفيش تذاكر كفاية للموديل/الكود ده');
    } catch { showError('معرفتش أجيب التاريخ'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!form.faultCode) { showError('كود العطل مطلوب'); return; }
    const rec = { model: (form.model || '').trim(), faultCode: form.faultCode.trim(), faultDescription: form.faultDescription || '', cost: Number(form.cost) || 0, duration: form.duration || '', parts: String(form.parts || '').split(/[،,]/).map((x) => x.trim()).filter(Boolean), notes: form.notes || '', updatedBy: appUser?.name || '', updatedAt: serverTimestamp() };
    try {
      if (form.id) { await updateDoc(doc(db, 'faultTemplates', form.id), rec); setItems((a) => a.map((x) => (x.id === form.id ? { ...x, ...rec } : x))); }
      else { const r = await addDoc(collection(db, 'faultTemplates'), rec); setItems((a) => [{ id: r.id, ...rec }, ...(a || [])]); }
      setForm(null); showSuccess('اتحفظ القالب');
    } catch { showError('معرفتش أحفظ'); }
  };
  const remove = async (t) => { try { await deleteDoc(doc(db, 'faultTemplates', t.id)); setItems((a) => a.filter((x) => x.id !== t.id)); } catch { showError('معرفتش أحذف'); } };
  const list = (items || []).filter((t) => !search || `${t.model} ${t.faultCode} ${t.faultDescription}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input aria-label="بحث في القوالب" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالموديل أو الكود" className={`${inp} w-60`} />
        <button type="button" onClick={() => setForm({})} className={`${btn} bg-teal-600 text-white`}><Plus size={14} /> قالب جديد</button>
      </div>
      <p className="text-xs text-slate-500">القالب بيظهر للموظف وهو بيفتح تذكرة لنفس الموديل وكود العطل، وبيملى التكلفة والمدة والقطع بضغطة. سيب الموديل فاضي لو القالب لكل الموديلات.</p>
      {form && (
        <div className={`${card} grid sm:grid-cols-2 lg:grid-cols-4 gap-2 anim-fade`}>
          {[['model', 'الموديل (فاضي = كله)'], ['faultCode', 'كود العطل'], ['faultDescription', 'وصف العطل'], ['cost', 'التكلفة المعتادة (ج)'], ['duration', 'المدة المعتادة'], ['parts', 'القطع (افصل بفاصلة)'], ['notes', 'خطوات/ملاحظات للفني']].map(([k, l]) => (
            <F key={k} label={l} className={k === 'notes' ? 'sm:col-span-2' : ''}><input value={Array.isArray(form[k]) ? form[k].join('، ') : (form[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp} /></F>
          ))}
          <div className="flex items-end gap-2 lg:col-span-4">
            <button type="button" onClick={suggest} disabled={busy} className={`${btn} bg-violet-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} املاه من تاريخ التذاكر</button>
            <button type="button" onClick={save} className={`${btn} bg-teal-600 text-white`}><Save size={14} /> حفظ</button>
            <button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button>
          </div>
        </div>
      )}
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-right">
          <thead className="bg-slate-50 dark:bg-slate-900"><tr>{['الموديل', 'الكود', 'العطل', 'التكلفة', 'المدة', 'القطع', ''].map((h) => <th key={h} className="p-2 text-[11px] text-slate-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
            {list.map((t) => (
              <tr key={t.id} className="text-xs">
                <td className="p-2">{t.model || 'كل الموديلات'}</td><td className="p-2 font-bold">{t.faultCode}</td><td className="p-2">{t.faultDescription}</td>
                <td className="p-2">{t.cost ? `${Number(t.cost).toLocaleString()} ج` : '—'}</td><td className="p-2">{t.duration || '—'}</td><td className="p-2">{(t.parts || []).join('، ') || '—'}</td>
                <td className="p-2 flex gap-2"><button type="button" onClick={() => setForm({ ...t, parts: (t.parts || []).join('، ') })} className="text-teal-700 font-bold">تعديل</button><button type="button" aria-label="حذف القالب" onClick={() => remove(t)} className="text-rose-600"><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items && !list.length && <p className="text-xs text-slate-400 p-4">مفيش قوالب لسه.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- (41) تقرير الحضور
function AttendanceTab({ appUser, systemSettings }) {
  const shift = useMemo(() => ({ ...DEFAULT_SHIFT, ...(systemSettings?.attendance || {}) }), [systemSettings]);
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [recs, setRecs] = useState(null);
  const [busy, setBusy] = useState(false);
  const seeAll = appUser?.role === 'admin' || appUser?.permissions?.viewAllWarehouses;
  const load = async () => {
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, 'attendance'), where('date', '>=', from), where('date', '<=', to), orderBy('date', 'desc'), limit(5000)));
      setRecs(snap.docs.map((d) => d.data()).filter((r) => seeAll || r.warehouseId === (appUser?.assignedWarehouseId || 'main')));
    } catch (e) { console.error(e); showError('معرفتش أحمّل الحضور'); }
    finally { setBusy(false); }
  };
  const summary = useMemo(() => (recs ? attendanceSummary(recs, shift) : []), [recs, shift]);
  const hm = (m) => `${Math.floor(m / 60)}س ${m % 60}د`;
  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-end gap-2`}>
        <F label="من"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></F>
        <F label="إلى"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></F>
        <button type="button" onClick={load} disabled={busy} className={`${btn} bg-teal-600 text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} اعرض</button>
        {recs?.length > 0 && <button type="button" onClick={() => exportToExcel(recs.map((r) => { const i = attendanceInfo(r, shift); const tt = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null)?.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) || ''; return { 'الموظف': r.name, 'اليوم': r.date, 'دخول': tt(r.checkIn), 'خروج': tt(r.checkOut), 'تأخير (دقيقة)': i.late, 'ساعات الشغل': i.workedMin ? +(i.workedMin / 60).toFixed(2) : '' }; }), `Attendance_${from}_${to}`, 'الحضور')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>}
        <p className="text-[11px] text-slate-400 mr-auto">الدوام {shift.start} – {shift.end} · سماح {shift.grace} دقيقة (من الإعدادات)</p>
      </div>
      {recs && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900"><tr>{['الموظف', 'أيام حضور', 'أيام تأخير', 'إجمالي التأخير', 'ساعات الشغل', 'نسي يسجّل انصراف'].map((h) => <th key={h} className="p-2 text-[11px] text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
              {summary.map((s) => <tr key={s.userId || s.name}><td className="p-2 font-bold">{s.name}</td><td className="p-2">{s.days}</td><td className={`p-2 ${s.lateDays ? 'text-amber-600 font-bold' : ''}`}>{s.lateDays}</td><td className="p-2">{hm(s.lateMin)}</td><td className="p-2">{hm(s.workedMin)}</td><td className="p-2">{s.missingOut || ''}</td></tr>)}
            </tbody>
          </table>
          {!summary.length && <p className="text-xs text-slate-400 p-4">مفيش تسجيلات في الفترة دي.</p>}
        </div>
      )}
    </div>
  );
}

const TABS = [['visits', 'الزيارات المنزلية', <MapPin size={14} key="i" />], ['templates', 'قوالب الأعطال', <BookOpen size={14} key="i" />], ['attendance', 'الحضور والانصراف', <Clock size={14} key="i" />]];

// 👷 الفنيين والزيارات
export function TechHub({ appUser, systemSettings }) {
  const [tab, setTab] = useState('visits');
  const [prefill, setPrefill] = useState(null);
  useIntent('visit-new', ({ prefill: p }) => { setTab('visits'); setPrefill(p || {}); });
  return (
    <section className="space-y-4" dir="rtl">
      <div className={`${card} shadow-sm flex flex-wrap items-center justify-between gap-3 anim-up`}>
        <h2 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><HardHat size={20} className="text-teal-600" /> الفنيين والزيارات</h2>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>{icon} {label}</button>)}
        </div>
      </div>
      {tab === 'visits' && <VisitsTab appUser={appUser} systemSettings={systemSettings} prefill={prefill} clearPrefill={() => setPrefill(null)} />}
      {tab === 'templates' && <TemplatesTab appUser={appUser} />}
      {tab === 'attendance' && <AttendanceTab appUser={appUser} systemSettings={systemSettings} />}
    </section>
  );
}
