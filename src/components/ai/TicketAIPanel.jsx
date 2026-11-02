import React, { useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Sparkles, Search, MessageCircle, FileText, Copy, ExternalLink, Loader2, Wand2, ChevronDown } from 'lucide-react';
import { db } from '../../firebase/config';
import { findSimilarTickets, summarizeMatches, templateMessage, whatsappLink, localTicketSummary, statusLabel } from '../../ai/ticketAssist';
import { isAIFeatureOn, friendlyAIError } from '../../ai/aiClient';
import { suggestDiagnosis, polishCustomerMessage, summarizeTicketAI } from '../../ai/aiServices';
import { showError, showSuccess } from '../../utils/alerts';

// كاش للتذاكر الحديثة (لمقارنة التشابه) — بيتحمّل مرة كل 10 دقايق بس عند الطلب
let poolCache = { at: 0, list: [] };
const loadPool = async () => {
  if (Date.now() - poolCache.at < 10 * 60 * 1000 && poolCache.list.length) return poolCache.list;
  const snap = await getDocs(query(collection(db, 'tickets'), orderBy('updatedAt', 'desc'), limit(400)));
  poolCache = { at: Date.now(), list: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  return poolCache.list;
};

const Tab = ({ active, onClick, icon, children }) => (
  <button type="button" onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? 'bg-violet-600 text-white shadow-sm' : 'bg-white/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'}`}>
    {icon} {children}
  </button>
);

const AIBadge = ({ on }) => (
  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${on ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
    {on ? 'Gemini متفعّل' : 'وضع محلي (مجاني بالكامل)'}
  </span>
);

export function TicketAIPanel({ ticket, systemSettings }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('diagnose');
  const [busy, setBusy] = useState('');
  const [matches, setMatches] = useState(null);
  const [diag, setDiag] = useState(null);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState('');
  const company = systemSettings?.storeName || '';
  const aiTickets = isAIFeatureOn(systemSettings, 'tickets');
  const aiMessages = isAIFeatureOn(systemSettings, 'messages');

  if (!ticket) return null;

  const runSimilar = async () => {
    setBusy('similar');
    try {
      const pool = await loadPool();
      const m = findSimilarTickets(ticket, pool, { limit: 5 });
      setMatches(m);
      return m;
    } catch (e) {
      showError('معرفتش أجيب التذاكر القديمة للمقارنة.');
      console.error(e);
      return [];
    } finally { setBusy(''); }
  };

  const runDiagnosis = async () => {
    const m = matches || await runSimilar();
    setBusy('diag');
    try { setDiag(await suggestDiagnosis(systemSettings, ticket, m || [])); }
    catch (e) { showError(friendlyAIError(e)); }
    finally { setBusy(''); }
  };

  const makeMessage = () => setMessage(templateMessage(ticket, { companyName: company }));
  const polish = async () => {
    const base = message || templateMessage(ticket, { companyName: company });
    setBusy('polish');
    try { setMessage(await polishCustomerMessage(systemSettings, ticket, base, { companyName: company })); }
    catch (e) { showError(friendlyAIError(e)); }
    finally { setBusy(''); }
  };

  const runSummary = async (useAI) => {
    if (!useAI) { setSummary(localTicketSummary(ticket)); return; }
    setBusy('summary');
    try { setSummary(await summarizeTicketAI(systemSettings, ticket)); }
    catch (e) { showError(friendlyAIError(e)); setSummary(localTicketSummary(ticket)); }
    finally { setBusy(''); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); showSuccess('اتنسخ'); } catch { showError('النسخ مش مدعوم في المتصفح ده'); }
  };

  const wa = message ? whatsappLink(ticket.customerPhone, message) : null;
  const summ = matches ? summarizeMatches(matches) : null;

  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-gradient-to-br from-violet-50 via-white to-teal-50 dark:from-violet-950/40 dark:via-slate-900 dark:to-teal-950/30 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
        <span className="flex items-center gap-2 font-black text-slate-800 dark:text-white">
          <span className="p-1.5 rounded-lg bg-violet-600 text-white"><Sparkles size={16} /></span>
          المساعد الذكي
          <AIBadge on={aiTickets || aiMessages} />
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 anim-fade">
          <div className="flex flex-wrap gap-2">
            <Tab active={tab === 'diagnose'} onClick={() => setTab('diagnose')} icon={<Search size={14} />}>تشخيص وتذاكر مشابهة</Tab>
            <Tab active={tab === 'message'} onClick={() => { setTab('message'); if (!message) makeMessage(); }} icon={<MessageCircle size={14} />}>رسالة للعميل</Tab>
            <Tab active={tab === 'summary'} onClick={() => { setTab('summary'); if (!summary) runSummary(false); }} icon={<FileText size={14} />}>ملخص التذكرة</Tab>
          </div>

          {tab === 'diagnose' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={runSimilar} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50">
                  {busy === 'similar' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} دوّر على تذاكر مشابهة
                </button>
                {aiTickets && (
                  <button type="button" onClick={runDiagnosis} disabled={!!busy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                    {busy === 'diag' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} اقترح تشخيص
                  </button>
                )}
              </div>

              {matches && matches.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">مفيش تذاكر قديمة مشابهة في آخر 400 تذكرة.</p>
              )}
              {summ && (summ.faults.length > 0 || summ.parts.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-2 anim-up">
                  {summ.faults.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                      <p className="text-[11px] font-bold text-slate-500 mb-1">أعطال متكررة في الحالات المشابهة</p>
                      {summ.faults.map((f) => <p key={f.name} className="text-sm font-bold text-slate-800 dark:text-white">{f.name} <span className="text-xs text-slate-400">×{f.n}</span></p>)}
                    </div>
                  )}
                  {summ.parts.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                      <p className="text-[11px] font-bold text-slate-500 mb-1">قطع غيار اتغيّرت قبل كده</p>
                      <div className="flex flex-wrap gap-1">
                        {summ.parts.map((p) => <span key={p.name} className="text-xs font-bold px-2 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">{p.name} ×{p.n}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {matches && matches.length > 0 && (
                <div className="space-y-1.5">
                  {matches.map((m, i) => (
                    <div key={m.id} className="anim-up bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-100 dark:border-slate-700 text-xs" style={{ '--d': `${i * 50}ms` }}>
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-slate-700 dark:text-slate-200">#{m.ticketNumber} · {m.device}</span>
                        <span className="text-violet-600 dark:text-violet-300 font-bold">{Math.round(m.score * 100)}%</span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{m.issue}</p>
                      {m.fault && <p className="mt-1 text-slate-700 dark:text-slate-300">العطل: <b>{m.fault}</b></p>}
                      <p className="mt-1 text-[10px] text-slate-400">{statusLabel(m.status)}</p>
                    </div>
                  ))}
                </div>
              )}

              {diag && (
                <div className="anim-pop bg-white dark:bg-slate-800 rounded-xl p-4 border border-violet-200 dark:border-violet-800 space-y-2">
                  <p className="text-[11px] font-bold text-violet-600 dark:text-violet-300 flex items-center gap-1"><Sparkles size={12} /> اقتراح الذكاء الاصطناعي — القرار للفني</p>
                  {diag.likelyFaults.map((f, i) => (
                    <div key={i}><p className="font-bold text-sm text-slate-800 dark:text-white">{i + 1}. {f.fault}</p><p className="text-xs text-slate-500 dark:text-slate-400">{f.reason}</p></div>
                  ))}
                  {diag.suggestedParts.length > 0 && <p className="text-xs"><b>قطع محتملة:</b> {diag.suggestedParts.join('، ')}</p>}
                  {diag.checks.length > 0 && (
                    <ul className="text-xs list-disc pr-5 space-y-0.5 text-slate-600 dark:text-slate-300">{diag.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  )}
                  {diag.note && <p className="text-[11px] text-amber-600 dark:text-amber-400">{diag.note}</p>}
                </div>
              )}
              {!aiTickets && <p className="text-[11px] text-slate-400">اقتراح التشخيص بالذكاء الاصطناعي بيظهر لما الأدمن يفعّله من الإعدادات. البحث عن التذاكر المشابهة شغال دايمًا ومجاني.</p>}
            </div>
          )}

          {tab === 'message' && (
            <div className="space-y-2">
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} aria-label="نص الرسالة"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={makeMessage} className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200">رسالة جاهزة حسب الحالة</button>
                {aiMessages && (
                  <button type="button" onClick={polish} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                    {busy === 'polish' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} حسّن الصياغة
                  </button>
                )}
                <button type="button" onClick={() => copy(message)} disabled={!message} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 disabled:opacity-50"><Copy size={14} /> نسخ</button>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"><ExternalLink size={14} /> فتح واتساب</a>
                )}
              </div>
              <p className="text-[10px] text-slate-400">الرسالة مش بتتبعت لوحدها — بتفتح واتساب وانت اللي بتضغط إرسال.</p>
            </div>
          )}

          {tab === 'summary' && (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap font-sans text-sm bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200">{summary}</pre>
              <div className="flex flex-wrap gap-2">
                {aiTickets && (
                  <button type="button" onClick={() => runSummary(true)} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                    {busy === 'summary' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} ملخص بالذكاء الاصطناعي
                  </button>
                )}
                <button type="button" onClick={() => copy(summary)} disabled={!summary} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 disabled:opacity-50"><Copy size={14} /> نسخ</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
