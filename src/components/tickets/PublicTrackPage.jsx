import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Phone, ShieldCheck, Wrench } from 'lucide-react';
import { auth } from '../../firebase/config';
import { readTracking, PUBLIC_STEPS } from '../../utils/ticketTracking';

// 📱 صفحة عامة: "تابع تذكرتك" (?track=<token>) — من غير تسجيل دخول
export default function PublicTrackPage({ token }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        try { await auth.authStateReady?.(); } catch { /* ignore */ }
        let data = null;
        for (let i = 0; i < 3 && !data; i++) {
          try { data = await readTracking(token); break; } catch (e) { if (i === 2) throw e; await new Promise((r) => setTimeout(r, 800)); }
        }
        if (!cancelled) setState({ loading: false, data, error: data ? '' : 'الرابط غير صحيح أو انتهى.' });
      } catch { if (!cancelled) setState({ loading: false, data: null, error: 'تعذّر تحميل الحالة. جرّب تاني بعد شوية.' }); }
    };
    run();
    return () => { cancelled = true; };
  }, [token]);

  const d = state.data;
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-teal-50 to-white dark:from-slate-900 dark:to-slate-950 flex items-start justify-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-5 anim-up">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg"><Wrench size={26} /></div>
          <h1 className="text-xl font-black text-slate-800 dark:text-white">{d?.company || 'متابعة الصيانة'}</h1>
          <p className="text-sm text-slate-500">تابع حالة جهازك</p>
        </div>

        {state.loading && <div className="flex justify-center p-10"><Loader2 className="animate-spin text-teal-600" size={32} /></div>}
        {!state.loading && state.error && <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center text-slate-600 dark:text-slate-300 shadow-sm">{state.error}</div>}

        {d && (
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden anim-pop">
            <div className="p-5 bg-gradient-to-l from-teal-600 to-teal-700 text-white">
              <p className="text-xs opacity-80">{d.customerFirstName ? `أهلاً ${d.customerFirstName} — ` : ''}تذكرة رقم</p>
              <p className="text-2xl font-black tracking-wide">{d.ticketNumber}</p>
              <p className="text-sm mt-1 opacity-90">{d.device}</p>
            </div>
            <div className="p-5 space-y-5">
              <div className="text-center">
                <p className="text-xs text-slate-500">الحالة الحالية</p>
                <p className="text-lg font-black text-teal-700 dark:text-teal-300">{d.statusLabel}</p>
                {d.estimatedDuration && !d.closed && <p className="text-xs text-slate-500 mt-1">المدة المتوقعة: {d.estimatedDuration}</p>}
              </div>
              <ol className="relative space-y-4 pr-2">
                {PUBLIC_STEPS.map((s, i) => {
                  const done = i < d.step || (d.closed && i === d.step);
                  const current = i === d.step && !d.closed;
                  return (
                    <li key={s.key} className="flex items-center gap-3 anim-up" style={{ '--d': `${i * 80}ms` }}>
                      {done ? <CheckCircle2 className="text-emerald-500 shrink-0" size={22} /> : current ? <span className="relative flex w-[22px] h-[22px] shrink-0"><span className="animate-ping absolute inset-0 rounded-full bg-teal-400 opacity-60" /><Circle className="relative text-teal-600 fill-teal-100" size={22} /></span> : <Circle className="text-slate-300 shrink-0" size={22} />}
                      <span className={`text-sm ${done ? 'text-slate-700 dark:text-slate-200' : current ? 'font-black text-teal-700 dark:text-teal-300' : 'text-slate-400'}`}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
              {(d.amount || d.remaining) && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
                  {d.amount && <p>تكلفة الإصلاح: <b>{Number(d.amount).toLocaleString()} ج</b></p>}
                  {d.remaining && d.remaining !== d.amount && <p>المتبقي: <b>{Number(d.remaining).toLocaleString()} ج</b></p>}
                </div>
              )}
              {d.warranty && <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"><ShieldCheck size={14} /> الجهاز داخل الضمان</p>}
              {d.history?.length > 0 && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer font-bold">سجل الحالات</summary>
                  <ul className="mt-2 space-y-1">{[...d.history].reverse().map((h, i) => <li key={i}>• {h.label}{h.at ? ` — ${new Date(h.at).toLocaleString('ar-EG')}` : ''}</li>)}</ul>
                </details>
              )}
              {(d.companyPhone || d.centerName) && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4 text-center text-sm">
                  {d.centerName && <p className="text-slate-500">{d.centerName}</p>}
                  {d.companyPhone && <a href={`tel:${d.companyPhone}`} className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold"><Phone size={16} /> اتصل بينا</a>}
                </div>
              )}
            </div>
          </div>
        )}
        <p className="text-center text-[10px] text-slate-400 mt-4">الصفحة دي بتعرض حالة جهازك بس، ومفيهاش أي بيانات شخصية.</p>
      </div>
    </div>
  );
}
