import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, TrendingUp, TrendingDown, Minus, Cpu, Lightbulb, RotateCcw } from 'lucide-react';
import { understandQuestion, explainAnswer } from '../../ai/aiServices';
import { executeIntent, friendlyQueryError } from '../../ai/askExecutor';
import { formatAnswer, METRICS, PERIODS, SUGGESTED_QUESTIONS } from '../../ai/askIntent';
import { isAIFeatureOn, friendlyAIError } from '../../ai/aiClient';
import { formatDuration } from '../../ai/repairTime';
import { onAsk } from '../../utils/appEvents';

const Change = ({ c }) => {
  if (!c) return null;
  const Icon = c.dir === 'up' ? TrendingUp : c.dir === 'down' ? TrendingDown : Minus;
  const tone = c.tone || (c.dir === 'up' ? 'good' : c.dir === 'down' ? 'bad' : 'neutral');
  const cls = tone === 'good' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : tone === 'bad' ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-800';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${cls}`}>
      <Icon size={13} /> {c.pct === null ? 'مفيش أساس للمقارنة' : `${c.pct > 0 ? '+' : ''}${c.pct}%`} <span className="font-normal opacity-80">(قبلها: {c.previous})</span>
    </span>
  );
};

function AnswerCard({ item, onExplain }) {
  if (item.error) {
    return <div className="anim-pop rounded-2xl p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-sm">{item.error}</div>;
  }
  const a = item.answer;
  return (
    <div className="anim-pop rounded-2xl p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{a.title}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${item.intent.source === 'ai' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
          <Cpu size={10} /> {item.intent.source === 'ai' ? 'فهم Gemini' : item.intent.source === 'followup' ? 'متابعة للسؤال اللي فات' : 'فهم محلي'}
        </span>
      </div>
      {a.list ? (
        <ol className="space-y-1.5">
          {a.list.length === 0 && <li className="text-sm text-slate-400">{a.headline}</li>}
          {a.list.map((p) => (
            <li key={p.rank} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 shrink-0 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 text-xs font-black flex items-center justify-center">{p.rank}</span>
                <span className="font-bold text-slate-800 dark:text-white truncate">{p.name}</span>
              </span>
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300 shrink-0">{p.right}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{a.headline}</p>
      )}
      <Change c={a.change} />
      {a.details.length > 0 && <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">{a.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      <p className="text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-2">
        {a.scope}{a.range ? ` · ${a.range}` : ''}{item.intent.scoped ? ' · (حسب صلاحياتك على مخزنك)' : ''} — الرقم محسوب مباشرة من قاعدة البيانات
      </p>
      {item.note && <p className="text-[10px] text-amber-600">{item.note}</p>}
      {item.explanation && <div className="anim-fade whitespace-pre-wrap text-xs leading-6 text-slate-700 dark:text-slate-200 bg-violet-50 dark:bg-violet-950/40 rounded-xl p-3">{item.explanation}</div>}
      {onExplain && !item.explanation && (
        <button type="button" onClick={() => onExplain(item)} disabled={item.explaining}
          className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50">
          {item.explaining ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />} اشرحلي واقترح أعمل إيه
        </button>
      )}
    </div>
  );
}

export function AskAssistant({ appUser, warehouses = [], systemSettings, hideLauncher = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const idRef = useRef(0);
  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const aiOn = isAIFeatureOn(systemSettings, 'ask');

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items, busy]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  const allowed = appUser && (appUser.role === 'admin' || appUser.permissions?.viewReports);

  const whList = warehouses.map((w) => ({ id: w.id, name: w.name }));
  const whName = (id) => (id === 'all' ? 'كل الفروع' : (whList.find((w) => w.id === id)?.name || (id === 'main' ? 'الرئيسي' : id)));

  const ask = async (text) => {
    const question = String(text || q).trim();
    if (!question || busy) return;
    setQ('');
    setBusy(true);
    idRef.current += 1;
    const id = idRef.current;
    try {
      const previous = [...itemsRef.current].reverse().find((x) => x.intent)?.intent || null;
      const { intent, note } = await understandQuestion(question, { systemSettings, user: appUser, warehouses: whList, previous });
      if (!intent || intent.metric === 'unsupported') {
        setItems((p) => [...p, { id, question, error: `مش قادر أجاوب على ده لسه. أقدر أجاوب عن: ${Object.values(METRICS).join('، ')}.` }]);
        return;
      }
      try {
        const result = await executeIntent(intent, new Date(), { slaHours: systemSettings?.ticketSLA, warehouses: whList });
        setItems((p) => [...p, { id, question, intent, note, answer: formatAnswer(intent, result, { warehouseName: whName(intent.warehouseId), formatDuration }) }]);
      } catch (e) {
        console.error(e);
        setItems((p) => [...p, { id, question, error: friendlyQueryError(e) }]);
      }
    } finally { setBusy(false); }
  };

  const explain = async (item) => {
    setItems((p) => p.map((x) => (x.id === item.id ? { ...x, explaining: true } : x)));
    try {
      const text = await explainAnswer(systemSettings, item.intent, item.answer);
      setItems((p) => p.map((x) => (x.id === item.id ? { ...x, explaining: false, explanation: text } : x)));
    } catch (e) {
      setItems((p) => p.map((x) => (x.id === item.id ? { ...x, explaining: false, explanation: `⚠️ ${friendlyAIError(e)}` } : x)));
    }
  };

  // سؤال جاي من البحث السريع (Ctrl+K)
  const askRef = useRef(null);
  useEffect(() => { askRef.current = ask; });
  useEffect(() => onAsk((question) => {
    setOpen(true);
    setTimeout(() => askRef.current?.(question), 0);
  }), []);

  if (!allowed) return null;

  return (
    <>
{(!hideLauncher || open) && (
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="اسأل السيستم"
        className="fixed bottom-5 left-5 z-[90] group flex items-center gap-2 pl-4 pr-3 py-3 rounded-full text-white font-black text-sm shadow-xl bg-gradient-to-l from-teal-600 to-violet-600 hover:shadow-2xl hover:scale-[1.03] active:scale-95 transition-transform print:hidden">
        <span className="relative flex">
          <Sparkles size={20} />
          {!open && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping" />}
        </span>
        <span className="hidden sm:inline">{open ? 'إغلاق' : 'اسأل السيستم'}</span>
      </button>
      )}

      {open && (
        <div role="dialog" aria-modal="false" aria-label="اسأل السيستم" dir="rtl"
          className="anim-pop fixed z-[95] bottom-20 left-3 right-3 sm:right-auto sm:left-5 sm:w-[420px] max-h-[75vh] flex flex-col rounded-3xl bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden print:hidden">
          <div className="px-4 py-3 bg-gradient-to-l from-teal-600 to-violet-600 text-white flex items-center justify-between">
            <div>
              <p className="font-black flex items-center gap-2"><Sparkles size={16} /> اسأل السيستم</p>
              <p className="text-[11px] text-white/80">{aiOn ? 'Gemini بيفهم السؤال، والأرقام من بياناتك' : 'فهم محلي مجاني — فعّل Gemini من الإعدادات لفهم أدق'}</p>
            </div>
            <div className="flex items-center gap-1">
              {items.length > 0 && <button type="button" aria-label="محادثة جديدة" title="محادثة جديدة" onClick={() => setItems([])} className="p-1.5 rounded-lg hover:bg-white/20"><RotateCcw size={16} /></button>}
              <button type="button" aria-label="إغلاق" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            {items.length === 0 && (
              <div className="anim-fade space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">جرّب تسأل:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((s, i) => (
                    <button key={s} type="button" onClick={() => ask(s)} style={{ '--d': `${i * 40}ms` }}
                      className="anim-up text-xs font-bold px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-400 hover:text-teal-700 transition-colors">{s}</button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 pt-2">الفترات المدعومة: {Object.values(PERIODS).slice(0, -1).join('، ')}.</p>
              </div>
            )}
            {items.map((it) => (
              <div key={it.id} className="space-y-2">
                <div className="flex justify-start"><p className="anim-fade max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-teal-600 text-white text-sm">{it.question}</p></div>
                <AnswerCard item={it} onExplain={aiOn && it.answer ? explain : null} />
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500 anim-fade">
                <Loader2 size={14} className="animate-spin" /> بحسب...
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="p-3 border-t border-slate-200 dark:border-slate-700 flex gap-2 bg-white/70 dark:bg-slate-900/70">
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً: مبيعات فرع 1 الشهر ده؟" aria-label="سؤالك" maxLength={300}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <button type="submit" disabled={busy || !q.trim()} aria-label="إرسال"
              className="px-3 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 active:scale-95 transition-transform"><Send size={18} className="-scale-x-100" /></button>
          </form>
        </div>
      )}
    </>
  );
}
