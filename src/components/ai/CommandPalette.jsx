import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, Ticket, User, Package, Receipt, Sparkles, ArrowLeft, Loader2, Command } from 'lucide-react';
import { matchCommands, looksLikeQuestion } from '../../ai/commandPalette';
import { searchEverywhere } from '../../ai/globalSearch';
import { requestNavigation, askAssistant } from '../../utils/appEvents';

const KIND = {
  command: { icon: <ArrowLeft size={16} />, label: 'أوامر', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  ask: { icon: <Sparkles size={16} />, label: 'اسأل المساعد', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  ticket: { icon: <Ticket size={16} />, label: 'تذاكر', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  customer: { icon: <User size={16} />, label: 'عملاء', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  item: { icon: <Package size={16} />, label: 'أصناف', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  invoice: { icon: <Receipt size={16} />, label: 'فواتير', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
};
const ORDER = ['ask', 'command', 'ticket', 'customer', 'item', 'invoice'];

export function CommandPalette({ appUser, warehouses = [] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [remote, setRemote] = useState({ q: '', items: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const reqRef = useRef(0);

  // Ctrl+K / Cmd+K في أي مكان، و"/" لو مش جوه حقل كتابة
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target?.tagName) || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('erp:open-palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('erp:open-palette', onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // بحث في قاعدة البيانات بعد ما المستخدم يوقف كتابة 300ms
  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 2) return undefined;
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const items = await searchEverywhere(q, appUser).catch(() => []);
      if (id === reqRef.current) { setRemote({ q, items }); setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [text, open, appUser]);

  const results = useMemo(() => {
    const q = text.trim();
    const out = [];
    if (q && looksLikeQuestion(q, warehouses) && (appUser?.role === 'admin' || appUser?.permissions?.viewReports)) {
      out.push({ kind: 'ask', id: 'ask', title: `اسأل: «${q}»`, subtitle: 'الرقم هيتحسب من بياناتك' });
    }
    matchCommands(q, appUser, q ? 5 : 8).forEach((c) => out.push({ kind: 'command', id: c.id, title: c.label, cmd: c }));
    if (remote.q === q) out.push(...remote.items);
    return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }, [text, remote, appUser, warehouses]);

  const close = () => { setOpen(false); setText(''); setRemote({ q: '', items: [] }); setActive(0); };

  const run = (r) => {
    if (!r) return;
    if (r.kind === 'command') requestNavigation(r.cmd.view, r.cmd.intent || null);
    else if (r.kind === 'ask') askAssistant(text.trim());
    else if (r.kind === 'ticket') requestNavigation('tickets', { kind: 'ticket', id: r.id });
    else if (r.kind === 'customer') requestNavigation('customers', { kind: 'customer', id: r.id, data: r.data });
    else if (r.kind === 'item') requestNavigation('inventory', { kind: 'inventory-search', text: r.text });
    else if (r.kind === 'invoice') requestNavigation('invoices', { kind: 'invoice-search', text: r.text });
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[Math.min(active, results.length - 1)]); }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="anim-fade fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[10vh] print:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} dir="rtl">
      <div role="dialog" aria-modal="true" aria-label="بحث وأوامر سريعة" className="anim-pop w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-slate-100 dark:border-slate-800">
          {loading && text.trim().length >= 2 ? <Loader2 size={20} className="text-teal-600 animate-spin" /> : <Search size={20} className="text-slate-400" />}
          <input ref={inputRef} value={text} onChange={(e) => { setText(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
            placeholder="دوّر على تذكرة، عميل، صنف، فاتورة… أو اكتب أمر أو سؤال" aria-label="بحث"
            className="flex-1 py-4 bg-transparent outline-none text-base text-slate-800 dark:text-white placeholder:text-slate-400" />
          <kbd className="hidden sm:inline text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto custom-scrollbar p-2">
          {results.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">{text.trim().length < 2 ? 'اكتب حرفين على الأقل' : loading ? 'بدوّر…' : 'مفيش نتايج'}</p>
          )}
          {results.map((r, i) => {
            const k = KIND[r.kind];
            const header = (i === 0 || results[i - 1].kind !== r.kind) ? <p className="px-3 pt-3 pb-1 text-[10px] font-black text-slate-400">{k.label}</p> : null;
            return (
              <React.Fragment key={`${r.kind}:${r.id}`}>
                {header}
                <button type="button" data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => run(r)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors ${i === active ? 'bg-teal-50 dark:bg-teal-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${k.cls}`}>{k.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-slate-800 dark:text-white truncate">{r.title}</span>
                    {r.subtitle && <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.subtitle}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="text-teal-600 shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="border rounded px-1">↑↓</kbd> تنقّل</span>
          <span className="flex items-center gap-1"><kbd className="border rounded px-1">Enter</kbd> فتح</span>
          <span className="flex items-center gap-1 mr-auto"><Command size={10} /> Ctrl+K في أي وقت</span>
        </div>
      </div>
    </div>
  );
}
