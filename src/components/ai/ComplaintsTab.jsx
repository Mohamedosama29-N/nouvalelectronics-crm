import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Megaphone, Loader2, Plus, Save, ArrowUpCircle, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react';
import { db } from '../../firebase/config';
import { COMPLAINT_CATEGORIES, C_STATUS, LEVELS, SEVERITY, complaintState, complaintStats, dueFrom, escalationPatch, suggestComplaint } from '../../ai/complaints';
import { normalizePhone } from '../../utils/search';
import { notify } from '../../utils/notifications';
import { requestNavigation } from '../../utils/appEvents';
import { showError, showSuccess } from '../../utils/alerts';
import { exportToExcel } from '../../utils/exportUtils';
import { whatsappLink } from '../../ai/ticketAssist';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';
const catLabel = (v) => COMPLAINT_CATEGORIES.find((c) => c.value === v)?.label || v;
const EMPTY = { phone: '', name: '', ticketNumber: '', ticketId: '', category: 'other', severity: 'medium', description: '' };
const canManage = (u) => u?.role === 'admin' || u?.permissions?.manageComplaints;
const fmtLeft = (h) => (h < 0 ? `متأخرة ${Math.round(-h)} س` : h < 24 ? `باقي ${Math.round(h)} س` : `باقي ${Math.round(h / 24)} يوم`);

// إشعار المستوى المسؤول بعد التصعيد
const notifyLevel = (c, level, systemSettings, from) => {
  const title = `🔺 شكوى متصعّدة (${SEVERITY[c.severity]?.label}): ${c.customerName || c.phone}`;
  const body = `${catLabel(c.category)} — ${String(c.description || '').slice(0, 120)}`;
  if (level >= 3 || !systemSettings?.complaintsSupervisor) return notify({ toRole: 'admin', title, body, view: 'callcenter', from });
  return notify({ toName: systemSettings.complaintsSupervisor, title, body, view: 'callcenter', from });
};

// 📣 (29) الشكاوى والتصعيد
export function ComplaintsTab({ appUser, systemSettings, prefill }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState('open');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const me = appUser?.name || appUser?.email || '';

  const load = async () => {
    try {
      const s = await getDocs(query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(500)));
      const items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      const at = new Date();
      // تصعيد تلقائي للي عدّت مهلتها (بيحصل لما أي حد يفتح الشاشة — من غير Cloud Functions)
      const toEsc = items.filter((c) => complaintState(c, at).shouldEscalate);
      for (const c of toEsc) {
        const p = escalationPatch(c, at);
        try {
          await updateDoc(doc(db, 'complaints', c.id), { level: p.level, dueAt: p.dueAt, escalations: p.escalations, log: arrayUnion(p.logEntry), updatedAt: serverTimestamp() });
          Object.assign(c, { level: p.level, dueAt: p.dueAt, escalations: p.escalations, log: [...(c.log || []), p.logEntry] });
          notifyLevel(c, p.level, systemSettings, 'السيستم');
        } catch (e) { console.warn('escalate', e?.code); }
      }
      setNow(at);
      setList(items);
    } catch (e) { console.error(e); showError('معرفتش أحمّل الشكاوى'); setList([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل مرة واحدة
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!prefill) return undefined;
    const t = setTimeout(() => { const sug = suggestComplaint(prefill.description); setForm({ ...EMPTY, ...prefill, ...sug }); }, 0);
    return () => clearTimeout(t);
  }, [prefill]);

  const stats = useMemo(() => complaintStats(list || [], now), [list, now]);
  const shown = useMemo(() => (list || []).filter((c) => {
    const st = complaintState(c, now);
    if (filter === 'open') return st.open;
    if (filter === 'overdue') return st.overdue;
    if (filter === 'mine') return st.open && (c.owner === me || !c.owner);
    return true;
  }).sort((a, b) => complaintState(a, now).hoursLeft - complaintState(b, now).hoursLeft), [list, filter, now, me]);

  const onDesc = (v) => { const sug = suggestComplaint(v); setForm((f) => ({ ...f, description: v, ...(f.touched ? {} : { category: sug.category, severity: sug.severity }) })); };

  const create = async () => {
    const phone = normalizePhone(form.phone);
    if (!form.description.trim() || phone.length < 8) return showError('اكتب رقم العميل ووصف الشكوى');
    setBusy(true);
    try {
      const at = new Date();
      const rec = { phone, customerName: form.name.trim(), ticketNumber: form.ticketNumber || '', ticketId: form.ticketId || '', category: form.category, severity: form.severity, description: form.description.trim(), status: 'open', level: form.severity === 'critical' ? 2 : 1, owner: me, createdBy: me, createdAt: serverTimestamp(), dueAt: dueFrom(at, form.severity), escalations: 0, log: [{ at: at.toISOString(), by: me, action: 'اتسجلت' }] };
      await addDoc(collection(db, 'complaints'), rec);
      if (rec.level >= 2) notifyLevel(rec, rec.level, systemSettings, me);
      showSuccess('اتسجلت الشكوى'); setForm(null); load();
    } catch (e) { console.error(e); showError('معرفتش أسجل الشكوى'); }
    setBusy(false);
  };

  const act = async (c, patch, logAction, note = '') => {
    try {
      await updateDoc(doc(db, 'complaints', c.id), { ...patch, log: arrayUnion({ at: new Date().toISOString(), by: me, action: logAction, note }), updatedAt: serverTimestamp() });
      setNotes((n) => ({ ...n, [c.id]: '' }));
      load();
    } catch (e) { console.error(e); showError('معرفتش أحدّث الشكوى'); }
  };
  const escalate = (c) => { const p = escalationPatch(c, new Date(), me, notes[c.id] || 'تصعيد يدوي'); act(c, { level: p.level, dueAt: p.dueAt, escalations: p.escalations }, p.logEntry.action, p.logEntry.note); notifyLevel(c, p.level, systemSettings, me); };
  const resolve = (c) => { if (!notes[c.id]?.trim()) return showError('اكتب الحل اللي اتعمل في خانة الملاحظة'); return act(c, { status: 'resolved', resolution: notes[c.id].trim(), resolvedAt: serverTimestamp(), resolvedBy: me }, 'اتحلت', notes[c.id].trim()); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
        <div className={card}><b className="block text-2xl">{stats.open}</b>مفتوحة</div>
        <div className={card}><b className={`block text-2xl ${stats.overdue ? 'text-rose-600' : ''}`}>{stats.overdue}</b>عدّت مهلتها</div>
        <div className={card}><b className={`block text-2xl ${stats.critical ? 'text-rose-600' : ''}`}>{stats.critical}</b>حرجة</div>
        <div className={card}><b className="block text-2xl">{stats.avgResolveHours === null ? '—' : `${Math.round(stats.avgResolveHours)} س`}</b>متوسط وقت الحل</div>
        <div className={card}><b className="block text-sm">{stats.byCategory[0] ? catLabel(stats.byCategory[0][0]) : '—'}</b>أكتر سبب</div>
      </div>
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {[['open', 'المفتوحة'], ['overdue', 'المتأخرة'], ['mine', 'بتاعتي'], ['all', 'الكل']].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`${btn} ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}</button>)}
        <button type="button" onClick={() => setForm({ ...EMPTY })} className={`${btn} bg-rose-600 text-white mr-auto`}><Plus size={14} /> شكوى جديدة</button>
        <button type="button" onClick={() => exportToExcel((list || []).map((c) => ({ 'العميل': c.customerName, 'الموبايل': c.phone, 'التذكرة': c.ticketNumber, 'السبب': catLabel(c.category), 'الخطورة': SEVERITY[c.severity]?.label, 'الحالة': C_STATUS[c.status], 'المستوى': LEVELS[c.level], 'الوصف': c.description, 'الحل': c.resolution || '' })), 'Complaints', 'الشكاوى')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>Excel</button>
        <button type="button" onClick={load} aria-label="تحديث" className={`${btn} bg-slate-100 dark:bg-slate-700`}><RefreshCw size={14} /></button>
      </div>

      {form && (
        <div className={`${card} border-rose-300 space-y-2 anim-pop`}>
          <div className="grid md:grid-cols-3 gap-2">
            <input className={inp} dir="ltr" placeholder="موبايل العميل" aria-label="موبايل الشكوى" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={inp} placeholder="اسم العميل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inp} placeholder="رقم التذكرة (لو فيه)" value={form.ticketNumber} onChange={(e) => setForm({ ...form, ticketNumber: e.target.value })} />
          </div>
          <textarea rows={3} className={`${inp} w-full`} aria-label="وصف الشكوى" placeholder="العميل اشتكى من إيه بالظبط…" value={form.description} onChange={(e) => onDesc(e.target.value)} />
          <div className="flex flex-wrap gap-2 items-center">
            <select className={inp} aria-label="سبب الشكوى" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, touched: true })}>{COMPLAINT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
            <select className={inp} aria-label="خطورة الشكوى" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value, touched: true })}>{Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label} (مهلة {v.hours} س)</option>)}</select>
            <span className="text-[11px] text-slate-500">السبب والخطورة بيتقترحوا من كلام العميل. الحرجة بتروح للمشرف على طول.</span>
            <div className="flex gap-2 mr-auto">
              <button type="button" onClick={() => setForm(null)} className={`${btn} bg-slate-100 dark:bg-slate-700`}>إلغاء</button>
              <button type="button" onClick={create} disabled={busy} className={`${btn} bg-rose-600 text-white`}><Save size={14} /> سجّل الشكوى</button>
            </div>
          </div>
        </div>
      )}

      <div className={`${card} space-y-3`}>
        {!list ? <Loader2 className="animate-spin text-teal-600" /> : shown.length === 0 ? <p className="text-xs text-slate-400">مفيش شكاوى هنا 👌</p> : shown.map((c) => {
          const st = complaintState(c, now);
          const wa = whatsappLink(c.phone, `أهلاً${c.customerName ? ` أستاذ/ة ${String(c.customerName).split(/\s+/)[0]}` : ''}، بخصوص الشكوى اللي حضرتك قدّمتها: إحنا متابعينها وهنرجعلك قبل ${st.due.toLocaleString('ar-EG', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.${systemSettings?.storeName ? `\n${systemSettings.storeName}` : ''}`);
          return (
            <div key={c.id} className={`border rounded-xl p-3 text-xs space-y-2 ${st.overdue ? 'border-rose-300 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-100 dark:border-slate-700'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Megaphone size={14} className="text-rose-500" />
                <b>{c.customerName || 'عميل'}</b><span className="font-mono text-slate-500" dir="ltr">{c.phone}</span>
                {c.ticketNumber && <button type="button" onClick={() => (c.ticketId ? requestNavigation('tickets', { kind: 'ticket', id: c.ticketId }) : requestNavigation('tickets', {}))} className="font-mono text-teal-700 hover:underline">{c.ticketNumber}</button>}
                <span className={`px-2 py-0.5 rounded-full font-bold ${SEVERITY[c.severity]?.cls}`}>{SEVERITY[c.severity]?.label}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">{catLabel(c.category)}</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold">عند: {LEVELS[c.level || 1]}</span>
                <span className={`font-bold ${st.overdue ? 'text-rose-600' : 'text-slate-500'}`}>{st.open ? fmtLeft(st.hoursLeft) : C_STATUS[c.status]}</span>
              </div>
              <p className="text-slate-700 dark:text-slate-200">{c.description}</p>
              {c.resolution && <p className="text-emerald-700 dark:text-emerald-300">✅ الحل: {c.resolution}</p>}
              {(c.log || []).length > 1 && <details><summary className="cursor-pointer text-slate-500">السجل ({c.log.length})</summary>{c.log.map((l, i) => <p key={i} className="text-slate-500">{String(l.at).slice(0, 16).replace('T', ' ')} · {l.by} · {l.action}{l.note ? `: ${l.note}` : ''}</p>)}</details>}
              {st.open && (
                <div className="flex flex-wrap gap-2 items-center">
                  <input className={`${inp} flex-1 min-w-48`} placeholder="ملاحظة / الحل اللي اتعمل" aria-label={`ملاحظة ${c.phone}`} value={notes[c.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
                  <button type="button" onClick={() => notes[c.id]?.trim() && act(c, { status: 'investigating' }, 'متابعة', notes[c.id].trim())} className={`${btn} bg-slate-100 dark:bg-slate-700`}>سجّل متابعة</button>
                  {(c.level || 1) < 3 && <button type="button" onClick={() => escalate(c)} className={`${btn} bg-amber-500 text-white`}><ArrowUpCircle size={14} /> صعّد</button>}
                  <button type="button" onClick={() => resolve(c)} className={`${btn} bg-emerald-600 text-white`}><CheckCircle2 size={14} /> اتحلت</button>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-50 text-emerald-700`}><ExternalLink size={12} /> طمّن العميل</a>}
                </div>
              )}
              {c.status === 'resolved' && canManage(appUser) && <button type="button" onClick={() => act(c, { status: 'closed', closedBy: me }, 'اتقفلت')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>اقفل نهائي</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
