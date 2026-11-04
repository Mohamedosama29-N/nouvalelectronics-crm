import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { ShieldCheck, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { db } from '../../firebase/config';
import { qualityCheck } from '../../ai/ticketPredict';
import { normalizePhone } from '../../utils/search';
import { requestNavigation } from '../../utils/appEvents';

const ICON = { error: <AlertOctagon size={14} className="text-rose-600 shrink-0" />, warn: <AlertTriangle size={14} className="text-amber-500 shrink-0" />, info: <Info size={14} className="text-sky-500 shrink-0" /> };

// ✅ مراجعة التذكرة قبل الحفظ (مش بتمنع الحفظ — بتنبّه بس)
export function TicketQualityCheck({ draft }) {
  const [openForPhone, setOpenForPhone] = useState({ phone: '', list: [] });
  const phone = normalizePhone(draft.customerPhone || '');

  useEffect(() => {
    if (!/^01\d{9}$/.test(phone) || openForPhone.phone === phone) return undefined;
    const t = setTimeout(async () => {
      try {
        const snap = await getDocs(query(collection(db, 'tickets'), where('customerPhone', '==', phone), limit(10)));
        setOpenForPhone({ phone, list: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      } catch { setOpenForPhone({ phone, list: [] }); }
    }, 500);
    return () => clearTimeout(t);
  }, [phone, openForPhone.phone]);

  const issues = useMemo(() => qualityCheck(draft, { openForPhone: openForPhone.phone === phone ? openForPhone.list : [] }), [draft, openForPhone, phone]);

  if (!issues.length) {
    return <p className="flex items-center gap-2 text-xs font-bold text-emerald-600"><ShieldCheck size={14} /> البيانات كاملة ومفيش ملاحظات</p>;
  }
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 space-y-1.5" role="status">
      <p className="text-[11px] font-black text-amber-800 dark:text-amber-300">مراجعة قبل الحفظ</p>
      {issues.map((x, i) => (
        <p key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
          {ICON[x.level]} <span>{x.text}</span>
          {x.ticketId && <button type="button" onClick={() => requestNavigation('tickets', { kind: 'ticket', id: x.ticketId })} className="mr-auto shrink-0 text-[11px] font-bold text-teal-700 hover:underline">افتحها</button>}
        </p>
      ))}
    </div>
  );
}
