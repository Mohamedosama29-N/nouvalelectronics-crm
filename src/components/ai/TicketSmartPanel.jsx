import React, { useEffect, useMemo, useState } from 'react';
import { wholeCollection } from '../../data/mirror';
import { Brain, Tag, Clock, Wrench, UserCheck, Loader2, Sparkles, Check, Building2, BookOpen } from 'lucide-react';
import { loadOpenTickets, loadRecentTickets } from '../../ai/ticketPool';
import { analyzePool, classifyFaults, predictDuration, predictPartsAndCost, suggestTechnicians } from '../../ai/ticketPredict';
import { centersFromSettings, suggestCenters } from '../../ai/network';
import { matchTemplate } from '../../ai/staff';
import { formatDuration } from '../../ai/repairTime';
import { askJSON, friendlyAIError, isAIFeatureOn } from '../../ai/aiClient';
import { redactText } from '../../ai/redact';
import { showError } from '../../utils/alerts';

const Chip = ({ children, onClick, active, title }) => (
  <button type="button" onClick={onClick} title={title}
    className={`text-right text-xs px-3 py-2 rounded-xl border transition-colors ${active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400 text-slate-700 dark:text-slate-200'}`}>
    {children}
  </button>
);

const Section = ({ icon, title, children }) => (
  <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-700 p-3">
    <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">{icon} {title}</p>
    {children}
  </div>
);

// قوالب الأعطال (كاش 10 دقايق)
let tplCache = { at: 0, list: [] };
const loadTemplates = async () => {
  if (Date.now() - tplCache.at < 600000) return tplCache.list;
  tplCache = { at: Date.now(), list: await wholeCollection('faultTemplates', { max: 5000 }) };
  return tplCache.list;
};

// 🧠 مساعد التذكرة الجديدة: كود العطل، المدة المتوقعة، القطع والتكلفة، أنسب فني
export function TicketSmartPanel({ draft, mainFaults = [], subFaults = [], selectedMainFaultId, selectedSubFaultId, onPickMainFault, onPickSubFault, technicians = [], onApply, systemSettings }) {
  const [pool, setPool] = useState(null);
  const [open, setOpen] = useState([]);
  const [aiPick, setAiPick] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [templates, setTemplates] = useState([]);
  const aiOn = isAIFeatureOn(systemSettings, 'tickets');
  const ready = String(draft.issue || '').trim().length >= 6 || !!draft.deviceModel;

  useEffect(() => {
    if (!ready || pool) return undefined;
    let cancelled = false;
    Promise.all([loadRecentTickets(), loadOpenTickets().catch(() => [])])
      .then(([p, o]) => { if (!cancelled) { setPool(p); setOpen(o); } })
      .catch((e) => console.warn('ticket pool failed', e?.code || e));
    return () => { cancelled = true; };
  }, [ready, pool]);

  useEffect(() => {
    if (!draft.mainFaultCode) return undefined;
    let cancelled = false;
    loadTemplates().then((l) => { if (!cancelled) setTemplates(l); }).catch(() => {});
    return () => { cancelled = true; };
  }, [draft.mainFaultCode]);
  const template = useMemo(() => matchTemplate(templates, draft), [templates, draft]);

  const analyzed = useMemo(() => (pool ? analyzePool(pool) : []), [pool]);
  const mainSug = useMemo(() => (pool && draft.issue ? classifyFaults(draft, mainFaults, pool, { codeField: 'mainFaultCode' }) : []), [pool, draft, mainFaults]);
  const subSug = useMemo(() => (pool && draft.issue && selectedMainFaultId ? classifyFaults(draft, subFaults, pool, { codeField: 'subFaultCode' }) : []), [pool, draft, subFaults, selectedMainFaultId]);
  const duration = useMemo(() => (analyzed.length ? predictDuration(draft, analyzed) : null), [analyzed, draft]);
  const parts = useMemo(() => (pool ? predictPartsAndCost(draft, pool) : null), [pool, draft]);
  const centerSug = useMemo(() => suggestCenters(draft, centersFromSettings(systemSettings), open), [draft, systemSettings, open]);
  const techs = useMemo(() => (analyzed.length || technicians.length ? suggestTechnicians(draft, analyzed, open, technicians) : []), [analyzed, open, technicians, draft]);

  const classifyAI = async () => {
    if (!mainFaults.length) return;
    setAiBusy(true);
    try {
      const res = await askJSON(systemSettings, {
        system: 'أنت فني استقبال في مركز صيانة. اختار أنسب كود عطل رئيسي من القائمة حسب وصف المشكلة. لو مفيش كود مناسب رجّع id فاضي.',
        prompt: JSON.stringify({ device: [draft.device, draft.deviceModel].filter(Boolean).join(' '), issue: redactText(draft.issue || '').slice(0, 600), codes: mainFaults.map((f) => ({ id: f.id, code: f.code, description: f.description })) }),
        schema: { type: 'object', properties: { id: { type: 'string', enum: ['', ...mainFaults.map((f) => f.id)] }, reason: { type: 'string' } }, required: ['id'] },
        temperature: 0,
      });
      const f = mainFaults.find((x) => x.id === res.id);
      setAiPick(f ? { ...f, reason: res.reason || '' } : { none: true });
    } catch (e) { showError(friendlyAIError(e)); }
    finally { setAiBusy(false); }
  };

  if (!ready) return null;

  return (
    <div className="anim-up rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-gradient-to-br from-teal-50 to-violet-50 dark:from-teal-950/30 dark:to-violet-950/30 p-4 space-y-3">
      <p className="text-sm font-black text-teal-800 dark:text-teal-300 flex items-center gap-2">
        <Brain size={16} /> اقتراحات ذكية من التذاكر السابقة
        {!pool && <Loader2 size={14} className="animate-spin" />}
      </p>

      {template && (
        <div className="anim-pop rounded-xl border border-violet-200 dark:border-violet-900/60 bg-white/90 dark:bg-slate-900/70 p-3 text-xs">
          <p className="font-black text-violet-700 dark:text-violet-300 flex items-center gap-1.5 mb-1"><BookOpen size={13} /> قالب العطل: {template.faultCode} {template.faultDescription ? `— ${template.faultDescription}` : ''}</p>
          <p className="text-slate-600 dark:text-slate-300">{template.cost ? `التكلفة ${Number(template.cost).toLocaleString()} ج · ` : ''}{template.duration ? `المدة ${template.duration} · ` : ''}{(template.parts || []).length ? `القطع: ${template.parts.join('، ')}` : ''}</p>
          {template.notes && <p className="text-slate-500 mt-1">{template.notes}</p>}
          <button type="button" onClick={() => onApply?.({
            ...(template.cost ? { estimatedCost: Number(template.cost) } : {}),
            ...(template.duration ? { estimatedDuration: template.duration } : {}),
            notes: [draft.notes, (template.parts || []).length ? `قطع متوقعة: ${template.parts.join('، ')}` : '', template.notes].filter(Boolean).join('\n'),
          })} className="mt-2 flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline"><Check size={12} /> طبّق القالب</button>
        </div>
      )}

      {pool && (
        <div className="grid md:grid-cols-2 gap-3">
          <Section icon={<Tag size={13} />} title="كود العطل المقترح">
            {!mainFaults.length && <p className="text-xs text-slate-400">اختار المنتج والموديل الأول عشان تظهر الأكواد.</p>}
            {mainFaults.length > 0 && !draft.issue && <p className="text-xs text-slate-400">اكتب وصف المشكلة.</p>}
            <div className="flex flex-wrap gap-2">
              {mainSug.map((f) => (
                <Chip key={f.id} active={selectedMainFaultId === f.id} onClick={() => onPickMainFault?.(f.id)} title={f.reason}>
                  <b>{f.code}</b> {f.description} <span className="opacity-70">({Math.round(f.confidence * 100)}%)</span>
                </Chip>
              ))}
              {mainFaults.length > 0 && draft.issue && mainSug.length === 0 && <p className="text-xs text-slate-400">مفيش كود قريب كفاية.</p>}
            </div>
            {subSug.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-[10px] text-slate-400 w-full">الكود الفرعي:</span>
                {subSug.map((f) => (
                  <Chip key={f.id} active={selectedSubFaultId === f.id} onClick={() => onPickSubFault?.(f.id)} title={f.reason}>
                    <b>{f.code}</b> {f.description} <span className="opacity-70">({Math.round(f.confidence * 100)}%)</span>
                  </Chip>
                ))}
              </div>
            )}
            {aiOn && mainFaults.length > 0 && draft.issue && (
              <div className="mt-2">
                <button type="button" onClick={classifyAI} disabled={aiBusy} className="flex items-center gap-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50">
                  {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} صنّف بالذكاء الاصطناعي
                </button>
                {aiPick && !aiPick.none && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Chip active={selectedMainFaultId === aiPick.id} onClick={() => onPickMainFault?.(aiPick.id)}><b>{aiPick.code}</b> {aiPick.description}</Chip>
                    {aiPick.reason && <span className="text-[10px] text-slate-500">{aiPick.reason}</span>}
                  </div>
                )}
                {aiPick?.none && <p className="text-[11px] text-slate-500 mt-1">الذكاء الاصطناعي ملقاش كود مناسب.</p>}
              </div>
            )}
          </Section>

          <Section icon={<Clock size={13} />} title="المدة المتوقعة للإصلاح">
            {duration ? (
              <>
                <p className="text-lg font-black text-slate-800 dark:text-white">{duration.label}</p>
                <p className="text-[11px] text-slate-500">الأغلب {formatDuration(duration.median)} · بناءً على {duration.count} تذكرة ({duration.basis})</p>
                <button type="button" onClick={() => onApply?.({ estimatedDuration: duration.label })}
                  className="mt-2 flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline"><Check size={12} /> حطها في المدة التقديرية</button>
              </>
            ) : <p className="text-xs text-slate-400">مفيش تذاكر خلصت كفاية للتوقع.</p>}
          </Section>

          <Section icon={<Wrench size={13} />} title="القطع والتكلفة المعتادة">
            {parts ? (
              <>
                {parts.parts.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parts.parts.map((p) => <span key={p.name} className="text-xs px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-bold">{p.name} · {Math.round(p.share * 100)}%</span>)}
                  </div>
                ) : <p className="text-xs text-slate-400">التذاكر المشابهة اتصلحت من غير قطع غيار مسجلة.</p>}
                {parts.cost && (
                  <>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">التكلفة المعتادة: <b>{Math.round(parts.cost.low).toLocaleString()} – {Math.round(parts.cost.high).toLocaleString()} ج</b> (الأغلب {Math.round(parts.cost.median).toLocaleString()} ج)</p>
                    <button type="button" onClick={() => onApply?.({ estimatedCost: Math.round(parts.cost.median) })}
                      className="mt-1 flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline"><Check size={12} /> حطها كتكلفة تقديرية</button>
                  </>
                )}
                <p className="text-[10px] text-slate-400 mt-1">من {parts.basedOn} تذكرة مشابهة</p>
              </>
            ) : <p className="text-xs text-slate-400">مفيش تذاكر مشابهة كفاية.</p>}
          </Section>

          {centerSug.length > 0 && (
            <Section icon={<Building2 size={13} />} title="أنسب مركز صيانة">
              <div className="space-y-1.5">
                {centerSug.map((c, i) => (
                  <button key={c.name} type="button" onClick={() => onApply?.({ assignedMaintenanceCenter: c.name })}
                    className={`w-full text-right rounded-xl border px-3 py-2 text-xs transition-colors ${draft.assignedMaintenanceCenter === c.name ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400'}`}>
                    <b>{i === 0 ? '⭐ ' : ''}{c.name}</b>
                    <span className={`block text-[10px] ${draft.assignedMaintenanceCenter === c.name ? 'text-white/80' : 'text-slate-500'}`}>{c.reasons.join(' · ')}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section icon={<UserCheck size={13} />} title="أنسب فني">
            {techs.length ? (
              <div className="space-y-1.5">
                {techs.map((t, i) => (
                  <button key={t.name} type="button" onClick={() => onApply?.({ assignedTechnician: t.name })}
                    className={`w-full text-right rounded-xl border px-3 py-2 text-xs transition-colors ${draft.assignedTechnician === t.name ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400'}`}>
                    <b>{i === 0 ? '⭐ ' : ''}{t.name}</b>
                    <span className={`block text-[10px] ${draft.assignedTechnician === t.name ? 'text-white/80' : 'text-slate-500'}`}>{t.reasons.join(' · ')}</span>
                  </button>
                ))}
              </div>
            ) : <p className="text-xs text-slate-400">ضيف الفنيين من الإعدادات.</p>}
          </Section>
        </div>
      )}
    </div>
  );
}
