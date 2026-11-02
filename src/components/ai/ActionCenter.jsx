import React, { useState } from 'react';
import { ListChecks, ChevronLeft, PartyPopper, AlertOctagon, AlertTriangle, Info, ChevronDown } from 'lucide-react';
import { requestNavigation } from '../../utils/appEvents';

const LEVEL = {
  danger: { icon: <AlertOctagon size={16} />, cls: 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30', badge: 'bg-rose-600 text-white', text: 'text-rose-700 dark:text-rose-300' },
  warn: { icon: <AlertTriangle size={16} />, cls: 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30', badge: 'bg-amber-500 text-white', text: 'text-amber-700 dark:text-amber-300' },
  info: { icon: <Info size={16} />, cls: 'border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/30', badge: 'bg-sky-600 text-white', text: 'text-sky-700 dark:text-sky-300' },
};

// ✅ "محتاج تتصرف فيه النهارده" — كل بند بيوديك للشاشة أو للتذكرة على طول
export function ActionCenter({ items = [], loading = false }) {
  const [expanded, setExpanded] = useState(null);
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <section className="anim-up bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-5" aria-label="مركز المهام" style={{ '--d': '60ms' }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-teal-600 text-white"><ListChecks size={18} /></span>
          محتاج تتصرف فيه النهارده
          {total > 0 && <span key={total} className="anim-pop text-xs font-black px-2 py-0.5 rounded-full bg-rose-600 text-white">{total}</span>}
        </h3>
        <span className="text-[11px] text-slate-400">بيتحدّث لحظيًا</span>
      </div>

      {loading && items.length === 0 && (
        <div className="grid sm:grid-cols-2 gap-3">{[0, 1].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-700/50 animate-pulse" />)}</div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
          <PartyPopper size={22} className="anim-float" />
          <p className="text-sm font-bold">كله تمام! مفيش حاجة متأخرة أو مستنياك دلوقتي.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((it, idx) => {
          const L = LEVEL[it.level];
          const isOpen = expanded === it.id;
          return (
            <div key={it.id} className={`anim-up rounded-xl border ${L.cls} overflow-hidden`} style={{ '--d': `${100 + idx * 50}ms` }}>
              <div className="flex items-center gap-3 p-3">
                <span className={`shrink-0 ${L.text}`}>{L.icon}</span>
                <button type="button" onClick={() => (it.records?.length ? setExpanded(isOpen ? null : it.id) : requestNavigation(it.action.view))}
                  className="flex-1 min-w-0 text-right focus:outline-none" aria-expanded={it.records?.length ? isOpen : undefined}>
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{it.title}</p>
                  {it.hint && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{it.hint}</p>}
                </button>
                <span className={`shrink-0 min-w-[28px] text-center text-xs font-black px-2 py-1 rounded-lg ${L.badge}`}>{it.count}</span>
                {it.records?.length ? (
                  <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                ) : (
                  <button type="button" onClick={() => requestNavigation(it.action.view)} aria-label={`افتح ${it.title}`} className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-teal-600"><ChevronLeft size={16} /></button>
                )}
              </div>
              {isOpen && (
                <div className="anim-fade border-t border-white/60 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-2 space-y-1">
                  {it.records.map((r) => (
                    <button key={r.id} type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: r.id })}
                      className="w-full text-right text-xs px-2 py-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 text-slate-700 dark:text-slate-200 truncate">
                      {r.label}
                    </button>
                  ))}
                  {it.count > it.records.length && (
                    <button type="button" onClick={() => requestNavigation(it.action.view)} className="w-full text-right text-[11px] px-2 py-1 font-bold text-teal-600">
                      كل الـ {it.count} ←
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
