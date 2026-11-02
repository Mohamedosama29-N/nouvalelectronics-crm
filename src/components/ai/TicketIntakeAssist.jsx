import React, { useState } from 'react';
import { ClipboardPaste, Wand2, Loader2, Check, Sparkles, ChevronDown } from 'lucide-react';
import { extractTicketFromMessage, textForAI, mergeIntake, INTAKE_SCHEMA } from '../../ai/ticketIntake';
import { askJSON, isAIFeatureOn, friendlyAIError } from '../../ai/aiClient';
import { EGYPT_GOVERNORATES } from '../../constants/misc';
import { showError, showSuccess } from '../../utils/alerts';

const LABELS = {
  customerName: 'اسم العميل', customerPhone: 'الموبايل', secondPhone: 'رقم تاني', governorate: 'المحافظة',
  device: 'الجهاز', deviceModel: 'الموديل', issue: 'المشكلة', priority: 'الأولوية',
};
const PRIORITY = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

// 📋 لزق رسالة العميل → السيستم يملأ بيانات التذكرة
export function TicketIntakeAssist({ systemSettings, onApply }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');

  const extract = async (useAI) => {
    const local = extractTicketFromMessage(text, { governorates: EGYPT_GOVERNORATES });
    if (!local) { showError('الصق رسالة العميل الأول'); return; }
    if (!useAI) { setResult({ ...local, source: 'local' }); return; }
    setBusy(true);
    try {
      const ai = await askJSON(systemSettings, {
        system: 'أنت موظف استقبال في مركز صيانة أجهزة في مصر. من رسالة العميل استخرج نوع الجهاز والماركة والموديل ووصف مختصر ومهني للمشكلة (بالعربي) والأولوية (high لو فيه خطر أمان زي شرار/غاز/كهربا أو العميل مستعجل جدًا، low لو قال مش مستعجل، غير كده medium). متخترعش معلومات مش موجودة.',
        prompt: textForAI(text, local),
        schema: INTAKE_SCHEMA,
        temperature: 0,
      });
      setResult({ ...mergeIntake(local, ai), source: 'ai' });
    } catch (e) {
      showError(`${friendlyAIError(e)} — استخدمت الاستخراج المحلي.`);
      setResult({ ...local, source: 'local' });
    } finally { setBusy(false); }
  };

  const apply = () => {
    if (!result) return;
    const prefill = {};
    Object.keys(LABELS).forEach((k) => { if (result[k]) prefill[k] = result[k]; });
    onApply?.(prefill);
    showSuccess('اتملت البيانات — راجعها قبل الحفظ');
    setOpen(false); setText(''); setResult(null);
  };

  return (
    <div className="rounded-2xl border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-2xl">
        <span className="flex items-center gap-2 text-sm font-black text-violet-700 dark:text-violet-300">
          <ClipboardPaste size={16} /> الصق رسالة العميل والسيستم يملأ البيانات
        </span>
        <ChevronDown size={16} className={`text-violet-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 anim-fade">
          <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={4} aria-label="رسالة العميل"
            placeholder="مثال: السلام عليكم أنا محمد، عندي شاشة سامسونج 55 بوصة مش بتنور والصوت شغال، رقمي 010..."
            className="w-full rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => extract(false)} disabled={!text.trim() || busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50">
              <Wand2 size={14} /> استخرج البيانات
            </button>
            {aiOn && (
              <button type="button" onClick={() => extract(true)} disabled={!text.trim() || busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} استخراج ذكي
              </button>
            )}
          </div>
          {result && (
            <div className="anim-pop bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-3 space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                {Object.entries(LABELS).map(([k, label]) => (
                  <div key={k} className={`text-xs rounded-lg p-2 ${result[k] ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-slate-50 dark:bg-slate-900/40 opacity-60'} ${k === 'issue' ? 'sm:col-span-2' : ''}`}>
                    <span className="block text-[10px] font-bold text-slate-500">{label}</span>
                    <span className="font-bold text-slate-800 dark:text-white break-words">{k === 'priority' ? PRIORITY[result[k]] : (result[k] || '—')}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">{result.source === 'ai' ? 'الجهاز والوصف بـ Gemini، والاسم والتليفون اتطلعوا محليًا ومتبعتوش' : 'استخراج محلي — مفيش أي بيانات اتبعتت برّه السيستم'}</span>
                <button type="button" onClick={apply} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 active:scale-95 transition-transform">
                  <Check size={14} /> املأ الفورم
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
