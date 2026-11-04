import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Phone, Wrench } from 'lucide-react';
import { auth } from '../../firebase/config';
import { DEFAULT_DEVICES, readBookingConfig, spamCheck, submitServiceRequest, validateRequest } from '../../utils/serviceRequests';
import { EGYPT_GOVERNORATES } from '../../constants/misc';

const inp = 'w-full border border-slate-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';

// 📝 صفحة عامة: "اطلب صيانة" (?book=1) — من غير تسجيل دخول
export default function PublicBookingPage({ source = '' }) {
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({ name: '', phone: '', governorate: '', city: '', address: '', device: '', brand: '', issue: '', kind: 'center', preferredDate: '', website: '' });
  const [startedAt] = useState(() => Date.now());
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => { try { await auth.authStateReady?.(); } catch { /* */ } try { const c = await readBookingConfig(); if (alive) setCfg(c); } catch { if (alive) setCfg({ enabled: false, error: true }); } })();
    return () => { alive = false; };
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    const v = validateRequest(f);
    if (!v.ok) { setErrors(v.errors); return; }
    const spam = spamCheck(f, startedAt);
    if (spam === 'limit') { setErrors(['اتبعت أكتر من طلب النهارده من الجهاز ده — هنكلمك قريب، أو كلّمنا على الرقم اللي تحت.']); return; }
    if (spam) { setErrors(['حصلت مشكلة، جرّب تاني بعد ثواني.']); return; }
    setBusy(true); setErrors([]);
    try { setDone(await submitServiceRequest({ ...f, source })); }
    catch (err) { console.error(err); setErrors(err?.errors || ['معرفناش نبعت الطلب — اتأكد من النت وجرّب تاني.']); }
    setBusy(false);
  };
  const shell = (children) => (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6 space-y-4">{children}</div>
    </div>
  );
  if (!cfg) return shell(<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-teal-600" /></div>);
  if (!cfg.enabled) return shell(<p className="text-center font-bold text-slate-600 py-8">{cfg.error ? 'تعذّر تحميل الصفحة، جرّب تاني بعد شوية.' : 'الحجز أونلاين مش متاح دلوقتي.'}{cfg.phone ? ` كلّمنا على ${cfg.phone}` : ''}</p>);
  if (done) return shell(
    <div className="text-center py-6 space-y-2 anim-pop">
      <CheckCircle2 className="mx-auto text-emerald-500" size={52} />
      <p className="font-black text-lg text-slate-800">طلبك وصل ✅</p>
      <p className="text-sm text-slate-600">رقم الطلب: <b className="font-mono">{done.code}</b></p>
      <p className="text-sm text-slate-500">هنكلمك على رقمك في أقرب وقت عشان نأكد الميعاد.</p>
      {cfg.phone && <a href={`tel:${cfg.phone}`} className="inline-flex items-center gap-1 text-teal-700 font-bold text-sm"><Phone size={14} /> {cfg.phone}</a>}
    </div>
  );
  const devices = cfg.devices?.length ? cfg.devices : DEFAULT_DEVICES;
  return shell(
    <form onSubmit={submit} className="space-y-3">
      <div className="text-center">
        <Wrench className="mx-auto text-teal-600 mb-1" size={32} />
        <h1 className="font-black text-xl text-slate-800">اطلب صيانة{cfg.storeName ? ` — ${cfg.storeName}` : ''}</h1>
        {cfg.note && <p className="text-xs text-slate-500 mt-1">{cfg.note}</p>}
      </div>
      <input className={inp} placeholder="الاسم" aria-label="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={inp} placeholder="رقم الموبايل" aria-label="رقم الموبايل" inputMode="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className={inp} aria-label="نوع الجهاز" value={f.device} onChange={(e) => setF({ ...f, device: e.target.value })}><option value="">نوع الجهاز</option>{devices.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <input className={inp} placeholder="الماركة (اختياري)" aria-label="الماركة" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
      </div>
      <textarea rows={3} className={inp} placeholder="المشكلة إيه؟ (مثلاً: الغسالة مش بتعصر)" aria-label="المشكلة" value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} />
      <div className="flex gap-2">
        {[['center', 'هوديه المركز'], ...(cfg.visits !== false ? [['visit', 'زيارة في البيت']] : []), ['inquiry', 'استفسار بس']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`flex-1 py-2 rounded-xl text-xs font-bold border ${f.kind === k ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={inp} aria-label="المحافظة" value={f.governorate} onChange={(e) => setF({ ...f, governorate: e.target.value })}><option value="">المحافظة</option>{EGYPT_GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <input className={inp} placeholder="المنطقة" aria-label="المنطقة" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </div>
      {f.kind === 'visit' && <input className={inp} placeholder="العنوان بالتفصيل" aria-label="العنوان" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}
      {f.kind !== 'inquiry' && <label className="block text-xs text-slate-500">الميعاد اللي يناسبك (اختياري)<input type="date" className={inp} aria-label="الميعاد المفضل" value={f.preferredDate} onChange={(e) => setF({ ...f, preferredDate: e.target.value })} /></label>}
      {/* خانة مخفية للبرامج الأوتوماتيك (السبام) */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="website" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      {errors.length > 0 && <div className="rounded-xl bg-rose-50 text-rose-700 text-xs p-3 space-y-0.5">{errors.map((x) => <p key={x}>• {x}</p>)}</div>}
      <button type="submit" disabled={busy} className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 size={16} className="animate-spin" />} ابعت الطلب</button>
      <p className="text-[11px] text-slate-400 text-center">بياناتك بتستخدم بس عشان نتواصل معاك بخصوص الصيانة.</p>
    </form>
  );
}
