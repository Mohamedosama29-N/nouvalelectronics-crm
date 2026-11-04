import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Inbox, Loader2, RefreshCw, Ticket, Home, Copy, Save, ExternalLink, Printer } from 'lucide-react';
import { db } from '../../firebase/config';
import { DEFAULT_DEVICES, REQUEST_KINDS, REQUEST_STATUS, bookingUrl, readBookingConfig, saveBookingConfig } from '../../utils/serviceRequests';
import { requestNavigation } from '../../utils/appEvents';
import { whatsappLink } from '../../ai/ticketAssist';
import { showError, showSuccess } from '../../utils/alerts';
import { toDate } from '../../utils/liveStats';
import { QrImage } from '../common/QrImage';

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4';
const inp = 'border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50';

function BookingSettings({ systemSettings }) {
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !cfg) readBookingConfig().then((c) => setCfg({ storeName: systemSettings?.storeName || '', phone: systemSettings?.storePhone || '', devices: DEFAULT_DEVICES, visits: true, note: '', ...c })).catch(() => setCfg({ enabled: false, devices: DEFAULT_DEVICES })); }, [open, cfg, systemSettings]);
  const url = bookingUrl();
  const save = async () => { try { setCfg(await saveBookingConfig(cfg)); showSuccess(cfg.enabled ? 'صفحة الحجز اتفعّلت' : 'اتحفظ'); } catch (e) { console.error(e); showError('معرفتش أحفظ — الأدمن بس يقدر يغيّر الإعدادات دي'); } };
  const copy = async () => { try { await navigator.clipboard.writeText(url); showSuccess('اتنسخ الرابط'); } catch { showError(url); } };
  const printQr = () => {
    const img = document.querySelector('[data-booking-qr] img');
    const w = window.open('', '_blank');
    if (!w || !img) return;
    w.document.write(`<html dir="rtl"><body style="font-family:Tahoma;text-align:center;padding:40px"><h1>اطلب صيانة أونلاين</h1><h2>${cfg?.storeName || ''}</h2><img src="${img.src}" width="320" /><p style="font-size:18px">امسح الكود بالموبايل واكتب طلبك</p>${cfg?.phone ? `<p>أو كلّمنا: ${cfg.phone}</p>` : ''}<script>setTimeout(()=>print(),300)</script></body></html>`);
    w.document.close();
  };
  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-black w-full text-right">⚙️ صفحة الحجز للعملاء (اللينك والـ QR) {open ? '▲' : '▼'}</button>
      {open && (!cfg ? <Loader2 className="animate-spin text-teal-600 mt-2" /> : (
        <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-4">
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> الصفحة شغالة والعملاء يقدروا يبعتوا طلبات</label>
            <div className="grid sm:grid-cols-2 gap-2">
              <input className={inp} placeholder="اسم المحل اللي هيظهر" value={cfg.storeName || ''} onChange={(e) => setCfg({ ...cfg, storeName: e.target.value })} />
              <input className={inp} placeholder="رقم التليفون اللي هيظهر" value={cfg.phone || ''} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} />
            </div>
            <input className={`${inp} w-full`} placeholder="أنواع الأجهزة (افصل بفاصلة)" value={(cfg.devices || []).join('، ')} onChange={(e) => setCfg({ ...cfg, devices: e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })} />
            <input className={`${inp} w-full`} placeholder="ملاحظة للعميل (مثلاً: مواعيد العمل)" value={cfg.note || ''} onChange={(e) => setCfg({ ...cfg, note: e.target.value })} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.visits !== false} onChange={(e) => setCfg({ ...cfg, visits: e.target.checked })} /> نسمح بطلب زيارة في البيت</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={save} className={`${btn} bg-teal-600 text-white`}><Save size={14} /> حفظ</button>
              <button type="button" onClick={copy} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Copy size={14} /> انسخ الرابط</button>
              <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} bg-slate-100 dark:bg-slate-700`}><ExternalLink size={14} /> افتح الصفحة</a>
              <button type="button" onClick={printQr} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Printer size={14} /> اطبع بوستر QR</button>
            </div>
            <p className="text-[11px] text-slate-500 break-all" dir="ltr">{url}</p>
            <p className="text-[11px] text-slate-500">حطه في بايو فيسبوك وواتساب بيزنس، واطبع الـ QR على الفواتير وفي المحل. فيه حماية من السبام، وحد 3 طلبات في اليوم لكل جهاز.</p>
          </div>
          <div data-booking-qr className="text-center"><QrImage text={url} size={150} className="mx-auto rounded-lg border" /></div>
        </div>
      ))}
    </div>
  );
}

// 📥 (9) الطلبات الواردة من صفحة الحجز
export function RequestsTab({ appUser, systemSettings }) {
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('new');
  const [notes, setNotes] = useState({});
  const load = async () => {
    try { const s = await getDocs(query(collection(db, 'serviceRequests'), orderBy('createdAt', 'desc'), limit(300))); setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }
    catch (e) { console.error(e); showError('معرفتش أحمّل الطلبات'); setList([]); }
  };
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);
  const shown = useMemo(() => (list || []).filter((r) => (filter === 'all' ? true : filter === 'new' ? r.status === 'new' : r.status === filter)), [list, filter]);
  const counts = useMemo(() => (list || []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}), [list]);
  const me = appUser?.name || '';
  const mark = async (r, status, extra = {}) => {
    try {
      await updateDoc(doc(db, 'serviceRequests', r.id), { status, handledBy: me, handledAt: serverTimestamp(), note: notes[r.id] || r.note || '', ...extra });
      setList((l) => l.map((x) => (x.id === r.id ? { ...x, status, ...extra } : x)));
    } catch (e) { console.error(e); showError('معرفتش أحدّث الطلب'); }
  };
  const toTicket = (r) => {
    requestNavigation('tickets', { kind: 'ticket-new', prefill: { customerName: r.name, customerPhone: r.phone, governorate: r.governorate || '', city: r.city || '', customerAddress: r.address || '', device: [r.device, r.brand].filter(Boolean).join(' '), issue: r.issue, source: 'حجز أونلاين', notes: `طلب أونلاين ${r.id.slice(0, 6).toUpperCase()}${r.preferredDate ? ` · الميعاد المفضل ${r.preferredDate}` : ''}` } });
    mark(r, 'converted', { convertedTo: 'ticket' });
  };
  const toVisit = (r) => {
    requestNavigation('tech_hub', { kind: 'visit-new', prefill: { customerName: r.name, phone: r.phone, governorate: r.governorate || '', city: r.city || '', address: r.address || '', device: [r.device, r.brand].filter(Boolean).join(' '), notes: r.issue, ...(r.preferredDate ? { date: r.preferredDate } : {}) } });
    mark(r, 'converted', { convertedTo: 'visit' });
  };
  return (
    <div className="space-y-4">
      <BookingSettings systemSettings={systemSettings} />
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {[['new', 'الجديدة'], ['contacted', 'اتكلمنا معاهم'], ['converted', 'اتحوّلت'], ['rejected', 'مرفوضة'], ['all', 'الكل']].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`${btn} ${filter === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>{l}{k !== 'all' && counts[k] ? ` (${counts[k]})` : ''}</button>)}
        <button type="button" onClick={load} aria-label="تحديث" className={`${btn} bg-slate-100 dark:bg-slate-700 mr-auto`}><RefreshCw size={14} /></button>
      </div>
      <div className={`${card} space-y-3`}>
        {!list ? <Loader2 className="animate-spin text-teal-600" /> : shown.length === 0 ? <p className="text-xs text-slate-400 flex items-center gap-2"><Inbox size={14} /> مفيش طلبات هنا</p> : shown.map((r) => {
          const at = toDate(r.createdAt);
          const wa = whatsappLink(r.phone, `أهلاً ${String(r.name).split(/\s+/)[0]}، وصلنا طلب الصيانة بتاعك (${r.device}). ${r.kind === 'visit' ? 'نحددلك ميعاد الزيارة امتى يناسبك؟' : 'تقدر تشرّفنا بالجهاز في المركز، أو نحددلك ميعاد.'}${systemSettings?.storeName ? `\n${systemSettings.storeName}` : ''}`);
          return (
            <div key={r.id} className="border border-slate-100 dark:border-slate-700 rounded-xl p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm">{r.name}</b><a href={`tel:${r.phone}`} className="font-mono text-teal-700" dir="ltr">{r.phone}</a>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold">{REQUEST_KINDS[r.kind] || r.kind}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">{REQUEST_STATUS[r.status] || r.status}</span>
                <span className="text-slate-400">{at ? at.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} · {r.id.slice(0, 6).toUpperCase()}{r.source && r.source !== 'web' ? ` · من ${r.source}` : ''}</span>
              </div>
              <p><b>{[r.device, r.brand].filter(Boolean).join(' ')}</b>: {r.issue}</p>
              <p className="text-slate-500">{[r.governorate, r.city, r.address].filter(Boolean).join(' · ')}{r.preferredDate ? ` · الميعاد المفضل ${r.preferredDate}` : ''}</p>
              {r.status !== 'converted' && r.status !== 'rejected' && (
                <div className="flex flex-wrap gap-2 items-center">
                  <input className={`${inp} flex-1 min-w-40`} placeholder="ملاحظة (اختياري)" aria-label={`ملاحظة ${r.phone}`} value={notes[r.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}>واتساب</a>}
                  {r.status === 'new' && <button type="button" onClick={() => mark(r, 'contacted')} className={`${btn} bg-slate-100 dark:bg-slate-700`}>اتكلمت معاه</button>}
                  <button type="button" onClick={() => toTicket(r)} className={`${btn} bg-teal-600 text-white`}><Ticket size={14} /> حوّلها تذكرة</button>
                  {r.kind === 'visit' && <button type="button" onClick={() => toVisit(r)} className={`${btn} bg-indigo-600 text-white`}><Home size={14} /> حدد زيارة</button>}
                  <button type="button" onClick={() => mark(r, 'rejected')} className={`${btn} text-rose-600`}>رفض / مكرر</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
