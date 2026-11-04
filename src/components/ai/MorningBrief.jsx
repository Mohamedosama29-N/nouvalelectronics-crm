import React, { useMemo, useState } from 'react';
import { Sun, X, Wand2, Loader2 } from 'lucide-react';
import { morningBrief } from '../../ai/quality';
import { askText, friendlyAIError, isAIFeatureOn } from '../../ai/aiClient';

const KEY = 'erp_brief_hidden';
const todayKey = () => new Date().toISOString().slice(0, 10);
const readHidden = () => { try { return localStorage.getItem(KEY) === todayKey(); } catch { return false; } };

// ☀️ الملخص الصباحي: امبارح حصل إيه، والنهارده محتاج إيه (من نفس بيانات الداشبورد)
export function MorningBrief({ tickets, transactions, overdueCount, atRiskCount, systemSettings, userName }) {
  const [hidden, setHidden] = useState(readHidden);
  const [aiText, setAiText] = useState('');
  const [busy, setBusy] = useState(false);
  const brief = useMemo(() => morningBrief({ tickets, transactions, overdueCount, atRiskCount }), [tickets, transactions, overdueCount, atRiskCount]);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');
  if (hidden) return null;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : hour < 17 ? 'نهارك سعيد' : 'مساء الخير';

  const polish = async () => {
    setBusy(true);
    try {
      const t = await askText(systemSettings, {
        system: 'اكتب ملخص صباحي قصير جدًا (3-4 سطور) لمدير مركز صيانة بالعامية المصرية: ابدأ بأهم حاجة محتاجة تصرف النهارده، وبعدها الأرقام. متخترعش أرقام.',
        prompt: JSON.stringify(brief.stats),
        temperature: 0.4,
      });
      setAiText(String(t).trim());
    } catch (e) { setAiText(`⚠️ ${friendlyAIError(e)}`); }
    finally { setBusy(false); }
  };

  return (
    <section className="anim-up relative rounded-2xl p-5 bg-gradient-to-l from-amber-50 via-white to-teal-50 dark:from-amber-950/30 dark:via-slate-800 dark:to-teal-950/30 border border-amber-100 dark:border-amber-900/40 shadow-sm" aria-label="الملخص الصباحي">
      <button type="button" aria-label="إخفاء لحد بكرة" title="إخفاء لحد بكرة" onClick={() => { try { localStorage.setItem(KEY, todayKey()); } catch { /* ignore */ } setHidden(true); }}
        className="absolute top-3 left-3 p-1 rounded-lg text-slate-400 hover:text-slate-600"><X size={16} /></button>
      <p className="font-black text-slate-800 dark:text-white flex items-center gap-2 mb-2"><Sun size={18} className="text-amber-500 anim-float" /> {greet}{userName ? ` يا ${String(userName).split(' ')[0]}` : ''} — ملخص النهارده</p>
      {aiText ? <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{aiText}</p> : (
        <ul className="space-y-1">
          {brief.lines.map((l) => <li key={l.k} className={`text-sm ${l.level === 'warn' ? 'text-amber-800 dark:text-amber-300 font-bold' : 'text-slate-700 dark:text-slate-200'}`}>• {l.text}</li>)}
        </ul>
      )}
      {aiOn && !aiText && (
        <button type="button" onClick={polish} disabled={busy} className="mt-2 flex items-center gap-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} اكتبهولي كملخص
        </button>
      )}
    </section>
  );
}
