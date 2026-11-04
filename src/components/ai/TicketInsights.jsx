import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Brain, BookOpen, Camera, ShieldAlert, Smile, Loader2, Save, ChevronDown, Sparkles } from 'lucide-react';
import { db } from '../../firebase/config';
import { loadRecentTickets } from '../../ai/ticketPool';
import { invalidateKb, loadKbArticles, loadWarrantySources } from '../../ai/kbStore';
import { articleFromTicket, buildWarrantyMaps, customerMood, FRAUD_LEVELS, fraudSignals, kbText, MOODS, semanticSearch } from '../../ai/insights';
import { ticketText } from '../../ai/ticketAssist';
import { isAIFeatureOn, friendlyAIError } from '../../ai/aiClient';
import { assessDamagePhoto, draftKbArticle } from '../../ai/aiServices';
import { fileToResizedBase64 } from '../../utils/imageTools';
import { showError, showSuccess } from '../../utils/alerts';
import { TICKET_TERMINAL_STATUSES } from '../../constants/tickets';

const box = 'rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 space-y-2';
const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50';
const isW = (t) => t.warrantyStatus === 'in_warranty' || t.ticketType === 'warranty';

// 🧠 جوه التذكرة: حلول من قاعدة المعرفة (6) + تحليل صور التلف (8) + مؤشرات الضمان (11) + مزاج العميل (9)
export function TicketInsights({ ticket, systemSettings, appUser, onTicketPatched }) {
  const [open, setOpen] = useState(false);
  const [kb, setKb] = useState(null);
  const [pool, setPool] = useState(null);
  const [wsrc, setWsrc] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadKbArticles().then((a) => alive && setKb(a)).catch(() => alive && setKb([]));
    loadRecentTickets(800).then((p) => alive && setPool(p)).catch(() => alive && setPool([]));
    if (isW(ticket)) loadWarrantySources().then((w) => alive && setWsrc(w));
    if (ticket.customerPhone) getDocs(query(collection(db, 'contactLogs'), where('customerPhone', '==', ticket.customerPhone), limit(30))).then((s) => alive && setLogs(s.docs.map((d) => d.data()))).catch(() => {});
    return () => { alive = false; };
  }, [open, ticket]);

  const kbHits = useMemo(() => (kb ? semanticSearch(ticketText(ticket), kb, { textOf: kbText, limit: 3, minScore: 0.08 }) : []), [kb, ticket]);
  const fraud = useMemo(() => {
    if (!isW(ticket) || !pool || !wsrc) return null;
    return fraudSignals(ticket, { pool, ...buildWarrantyMaps(wsrc.sales, wsrc.registry) });
  }, [ticket, pool, wsrc]);
  const mood = useMemo(() => (pool ? customerMood({ logs, tickets: pool.filter((t) => t.customerPhone && t.customerPhone === ticket.customerPhone).concat(pool.some((t) => t.id === ticket.id) ? [] : [ticket]) }) : null), [pool, logs, ticket]);

  const analyze = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy('photo');
    try {
      const img = await fileToResizedBase64(file, { max: 1024 });
      const r = await assessDamagePhoto(systemSettings, { ...img, device: [ticket.device, ticket.deviceModel].filter(Boolean).join(' '), issue: ticket.issue });
      const rec = { ...r, at: new Date().toISOString(), by: appUser?.name || '' };
      await updateDoc(doc(db, 'tickets', ticket.id), { aiDamage: arrayUnion(rec), updatedAt: serverTimestamp() });
      onTicketPatched?.({ aiDamage: [...(ticket.aiDamage || []), rec] });
      showSuccess('اتحفظ تحليل الصورة في التذكرة');
    } catch (err) { console.error(err); showError(err?.code === 'not-image' ? 'اختار صورة' : friendlyAIError(err)); }
    setBusy('');
  };

  const saveToKb = async (useAI) => {
    setBusy('kb');
    try {
      let a = articleFromTicket(ticket);
      if (useAI) { try { a = await draftKbArticle(systemSettings, a); } catch (err) { showError(`${friendlyAIError(err)} — هحفظه من غير صياغة.`); } }
      await addDoc(collection(db, 'knowledgeBase'), { ...a, createdAt: serverTimestamp(), createdBy: appUser?.name || '', ticketId: ticket.id, helpful: 0 });
      invalidateKb(); setKb(null); loadKbArticles().then(setKb).catch(() => {});
      showSuccess('اتحفظ الحل في قاعدة المعرفة');
    } catch (err) { console.error(err); showError('معرفتش أحفظ'); }
    setBusy('');
  };

  if (!ticket?.id) return null;
  const solved = TICKET_TERMINAL_STATUSES.includes(ticket.status) && (ticket.mainFaultDescription || (ticket.spareParts || []).length || ticket.notes);
  const m = mood ? MOODS[mood.label] : null;
  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-right rounded-2xl">
        <span className="flex items-center gap-2 text-sm font-black text-indigo-700 dark:text-indigo-300"><Brain size={16} /> رؤى ذكية: حلول سابقة · صور التلف · الضمان · مزاج العميل</span>
        <span className="flex items-center gap-2">
          {(ticket.aiDamage || []).some((d) => d.physicalDamage) && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">تلف خارجي</span>}
          <ChevronDown size={16} className={`text-indigo-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid md:grid-cols-2 gap-3 anim-fade">
          <div className={box}>
            <p className="text-xs font-black flex items-center gap-1.5"><BookOpen size={14} className="text-indigo-600" /> حلول من قاعدة المعرفة</p>
            {!kb ? <Loader2 size={14} className="animate-spin text-indigo-500" /> : kbHits.length === 0 ? <p className="text-[11px] text-slate-400">مفيش مقال قريب من العطل ده لسه.</p> : kbHits.map(({ doc: a, score }) => (
              <details key={a.id} className="text-xs border-t border-slate-100 dark:border-slate-700 pt-1">
                <summary className="cursor-pointer font-bold">{a.title} <span className="text-[10px] text-slate-400">({Math.round(score * 100)}%)</span></summary>
                {a.cause && <p className="text-slate-600 dark:text-slate-300 mt-1">السبب: {a.cause}</p>}
                {(a.steps || []).length > 0 && <ol className="list-decimal pr-5 mt-1 space-y-0.5">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
                {(a.parts || []).length > 0 && <p className="mt-1 text-slate-500">القطع: {a.parts.join('، ')}</p>}
                {a.typicalCost > 0 && <p className="text-slate-500">التكلفة المعتادة: {Math.round(a.typicalCost)} ج</p>}
              </details>
            ))}
            {solved && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" disabled={busy === 'kb'} onClick={() => saveToKb(false)} className={`${btn} bg-slate-100 dark:bg-slate-700`}><Save size={14} /> احفظ حل التذكرة دي</button>
                {aiOn && <button type="button" disabled={busy === 'kb'} onClick={() => saveToKb(true)} className={`${btn} bg-indigo-600 text-white`}>{busy === 'kb' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} احفظ بصياغة ذكية</button>}
              </div>
            )}
          </div>

          <div className={box}>
            <p className="text-xs font-black flex items-center gap-1.5"><Camera size={14} className="text-indigo-600" /> تحليل صور العطل/التلف</p>
            {(ticket.aiDamage || []).map((d, i) => (
              <div key={i} className={`text-xs rounded-lg p-2 ${d.physicalDamage ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-slate-50 dark:bg-slate-900/40'}`}>
                <b>{d.physicalDamage ? '⚠️ تلف خارجي: ' : ''}{d.summary}</b>
                {(d.damages || []).length > 0 && <p className="text-slate-500">{d.damages.map((x) => `${x.part}: ${x.issue}${x.severity ? ` (${x.severity})` : ''}`).join(' · ')}</p>}
                {d.warrantyNote && <p className="text-slate-500">الضمان: {d.warrantyNote}</p>}
                <p className="text-[10px] text-slate-400">{d.by} · {String(d.at || '').slice(0, 10)} · ثقة {Math.round((d.confidence || 0) * 100)}%</p>
              </div>
            ))}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={analyze} aria-label="صورة التلف" />
            {aiOn ? <button type="button" disabled={busy === 'photo'} onClick={() => fileRef.current?.click()} className={`${btn} bg-indigo-600 text-white`}>{busy === 'photo' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} صوّر الجهاز وحلّل</button>
              : <p className="text-[11px] text-slate-400">محتاج تفعيل الذكاء الاصطناعي من الإعدادات.</p>}
            <p className="text-[10px] text-slate-400">الصورة نفسها مش بتتحفظ، التحليل بس.</p>
          </div>

          {isW(ticket) && (
            <div className={box}>
              <p className="text-xs font-black flex items-center gap-1.5"><ShieldAlert size={14} className="text-indigo-600" /> فحص صحة الضمان</p>
              {!fraud ? <Loader2 size={14} className="animate-spin text-indigo-500" /> : (
                <>
                  <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-bold ${FRAUD_LEVELS[fraud.level].cls}`}>{FRAUD_LEVELS[fraud.level].label} · {fraud.score}/100</span>
                  {fraud.signals.length === 0 ? <p className="text-[11px] text-slate-500">مفيش أي مؤشر غريب ✅</p> : <ul className="text-xs list-disc pr-5 space-y-0.5">{fraud.signals.map((s, i) => <li key={i}>{s.label}</li>)}</ul>}
                  <p className="text-[10px] text-slate-400">مؤشرات للمراجعة بس، مش حكم نهائي.</p>
                </>
              )}
            </div>
          )}

          <div className={box}>
            <p className="text-xs font-black flex items-center gap-1.5"><Smile size={14} className="text-indigo-600" /> مزاج العميل</p>
            {!mood ? <Loader2 size={14} className="animate-spin text-indigo-500" /> : (
              <>
                <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-bold ${m.cls}`}>{m.emoji} {m.label}{mood.escalate ? ' · بيهدد بتصعيد' : ''}</span>
                {mood.reasons.length > 0 && <ul className="text-xs list-disc pr-5 space-y-0.5">{mood.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                {(mood.label === 'angry' || mood.label === 'unhappy') && <p className="text-[11px] text-amber-700">💡 كلّمه بنفسك قبل ما يكلّمك، واديله ميعاد واضح.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
