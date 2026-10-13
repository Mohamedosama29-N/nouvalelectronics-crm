import React, { useEffect, useState } from 'react';
import { Star, CheckCircle2, Loader2 } from 'lucide-react';
import { callFunction } from '../../utils/authSession';

const CRITERIA = [
  { key: 'accessibility', label: 'سهولة الوصول لمركز الصيانة' },
  { key: 'maintenanceTime', label: 'سرعة إنجاز الصيانة' },
  { key: 'centerDealing', label: 'التعامل بالمركز' },
  { key: 'deliveryProcedures', label: 'إجراءات تسليم الجهاز' }
];

// صفحة عامة (من غير تسجيل دخول موظف) بيفتحها العميل من الرابط اللي بيتبعتله بعد
// تسليم/إغلاق التذكرة. بتحفظ تقييمه في `customerRating` على التذكرة.
export default function PublicRatingPage({ ticketId, token }) {
  const [state, setState] = useState('loading'); // loading | ready | done | invalid | already | error
  const [ticket, setTicket] = useState(null);
  const [ratings, setRatings] = useState({ accessibility: 0, maintenanceTime: 0, centerDealing: 0, deliveryProcedures: 0 });
  const [repurchase, setRepurchase] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await callFunction('getTicketForRating', { ticketId, token });
        setTicket(info);
        setState(info.alreadyRated ? 'already' : 'ready');
      } catch (e) {
        console.error(e);
        setState(e?.code === 'functions/permission-denied' ? 'invalid' : 'error');
      }
    })();
  }, [ticketId, token]);

  const submit = async () => {
    if (Object.values(ratings).some(v => !v)) return;
    setSaving(true);
    try {
      await callFunction('submitTicketRating', { ticketId, token, ratings, repurchase, comment: comment.trim().slice(0, 500) });
      setState('done');
    } catch (e) {
      console.error(e);
      setState(e?.code === 'functions/already-exists' ? 'already' : 'error');
    }
    setSaving(false);
  };

  const shell = (children) => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 text-right">{children}</div>
    </div>
  );

  if (state === 'loading') return shell(<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-teal-600"/></div>);
  if (state === 'invalid') return shell(<p className="text-center font-bold text-slate-600 py-8">رابط التقييم غير صالح أو منتهي.</p>);
  if (state === 'error') return shell(<p className="text-center font-bold text-rose-600 py-8">حصلت مشكلة، حاول مرة تانية بعد شوية.</p>);
  if (state === 'already') return shell(<p className="text-center font-bold text-slate-600 py-8">تم تسجيل تقييمك لهذه التذكرة من قبل. شكرًا لك.</p>);
  if (state === 'done') return shell(
    <div className="text-center py-8">
      <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48}/>
      <p className="font-black text-lg text-slate-800">شكرًا لتقييمك!</p>
      <p className="text-sm text-slate-500 mt-1">رأيك بيساعدنا نحسّن الخدمة.</p>
    </div>
  );

  return shell(
    <>
      <h1 className="font-black text-xl text-slate-800 mb-1">قيّم تجربتك مع Nouval</h1>
      <p className="text-xs text-slate-500 mb-5">تذكرة {ticket?.ticketNumber}{ticket?.device ? ` - ${ticket.device}` : ''}</p>
      <div className="space-y-4">
        {CRITERIA.map(c => (
          <div key={c.key}>
            <p className="text-sm font-bold text-slate-700 mb-1">{c.label}</p>
            <div className="flex gap-1" dir="ltr">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => setRatings(r => ({ ...r, [c.key]: n }))} aria-label={`${n}`}>
                  <Star size={30} className={n <= ratings[c.key] ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <p className="text-sm font-bold text-slate-700 mb-1">هل هتشتري من Nouval مرة تانية؟</p>
          <div className="flex gap-2">
            {[['yes', 'نعم'], ['no', 'لا']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setRepurchase(v)} className={`flex-1 py-2 rounded-xl font-bold text-sm border ${repurchase === v ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
            ))}
          </div>
        </div>
        <textarea rows="3" maxLength={500} className="w-full border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:border-teal-500" placeholder="ملاحظات إضافية (اختياري)" value={comment} onChange={e => setComment(e.target.value)} />
        <button type="button" disabled={saving || Object.values(ratings).some(v => !v)} onClick={submit} className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold disabled:opacity-40">
          {saving ? 'جاري الإرسال...' : 'إرسال التقييم'}
        </button>
      </div>
    </>
  );
}
