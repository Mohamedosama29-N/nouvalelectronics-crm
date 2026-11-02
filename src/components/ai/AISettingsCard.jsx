import React, { useState } from 'react';
import { Sparkles, Loader2, ShieldCheck } from 'lucide-react';
import { askText, DEFAULT_AI_MODEL, friendlyAIError, getAISettings } from '../../ai/aiClient';

const Toggle = ({ checked, onChange, label, hint, isAdmin }) => (
  <label className={`flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 ${isAdmin ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : 'opacity-60'}`}>
    <input type="checkbox" className="mt-1 w-4 h-4 accent-violet-600" checked={checked} disabled={!isAdmin} onChange={(e) => onChange(e.target.checked)} />
    <span><span className="block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>{hint && <span className="block text-[11px] text-slate-400">{hint}</span>}</span>
  </label>
);


// 🤖 إعدادات الذكاء الاصطناعي (جوه شاشة الإعدادات)
export function AISettingsCard({ settings, setLocalSettings, isAdmin }) {
  const ai = settings.ai || {};
  const eff = getAISettings(settings);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const set = (patch) => setLocalSettings({ ...settings, ai: { ...ai, ...patch } });
  const setFeature = (k, v) => set({ features: { ...(ai.features || {}), [k]: v } });

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const txt = await askText({ ...settings, ai: { ...ai, enabled: true } }, { prompt: 'رد بكلمة واحدة: تمام', temperature: 0 });
      setResult({ ok: true, msg: `الاتصال شغال ✅ (الرد: ${String(txt).trim().slice(0, 30)})` });
    } catch (e) {
      setResult({ ok: false, msg: friendlyAIError(e) });
    } finally { setTesting(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-violet-200 dark:border-violet-900/60 shadow-sm space-y-4">
      <div>
        <label className="block text-xs font-bold text-violet-600 dark:text-violet-400 mb-1 flex items-center gap-1.5"><Sparkles size={14} /> الذكاء الاصطناعي (Gemini المجاني عن طريق Firebase)</label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          توقع نفاد المخزون والتذاكر المشابهة والرسائل الجاهزة شغالين دايمًا ومجانًا من غير أي تفعيل. التفعيل هنا بيضيف: فهم أدق للأسئلة، اقتراح التشخيص، تحسين صياغة الرسائل، والملخصات.
        </p>
      </div>

      <Toggle isAdmin={isAdmin} checked={eff.enabled} onChange={(v) => set({ enabled: v })} label="تفعيل Gemini"
        hint="لازم الأول: Firebase Console ← AI Logic ← Get started ← Gemini Developer API (مجاني من غير بطاقة دفع)." />

      <div className="grid sm:grid-cols-3 gap-2">
        <Toggle isAdmin={isAdmin} checked={eff.features.ask} onChange={(v) => setFeature('ask', v)} label="اسأل السيستم" />
        <Toggle isAdmin={isAdmin} checked={eff.features.tickets} onChange={(v) => setFeature('tickets', v)} label="تشخيص وملخص التذاكر" />
        <Toggle isAdmin={isAdmin} checked={eff.features.messages} onChange={(v) => setFeature('messages', v)} label="تحسين رسائل العملاء" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs font-bold text-slate-500">اسم الموديل
          <input dir="ltr" disabled={!isAdmin} value={ai.model ?? ''} placeholder={DEFAULT_AI_MODEL} onChange={(e) => set({ model: e.target.value })}
            className="mt-1 w-full border-2 border-slate-100 dark:border-slate-700 p-2.5 rounded-xl font-mono text-sm bg-slate-50 dark:bg-slate-900 focus:outline-none focus:border-violet-500" />
          <span className="block mt-1 font-normal text-[11px] text-slate-400">سيبه فاضي للافتراضي. لو جوجل غيّرت الموديلات، اكتب اسم موديل متاح في الطبقة المجانية.</span>
        </label>
        <label className="block text-xs font-bold text-slate-500">الحد اليومي لكل جهاز
          <input type="number" min="1" disabled={!isAdmin} value={ai.dailyLimit ?? 150} onChange={(e) => set({ dailyLimit: Number(e.target.value) || 150 })}
            className="mt-1 w-full border-2 border-slate-100 dark:border-slate-700 p-2.5 rounded-xl font-bold text-sm bg-slate-50 dark:bg-slate-900 focus:outline-none focus:border-violet-500" />
          <span className="block mt-1 font-normal text-[11px] text-slate-400">بيحمي الحصة المجانية من الاستهلاك.</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={test} disabled={testing || !isAdmin}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50">
          {testing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} اختبار الاتصال
        </button>
        {result && <span className={`text-xs font-bold ${result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{result.msg}</span>}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-emerald-600" />
        الخصوصية: الطبقة المجانية من جوجل ممكن تستخدم النصوص المبعوتة لتحسين منتجاتها، فالسيستم مش بيبعت أرقام تليفونات أو إيميلات أو أرقام قومية أو أسماء كاملة (الاسم الأول بس في الرسائل). الأرقام المالية بتتحسب جوه السيستم ومش بتتبعت.
      </p>
    </div>
  );
}
