import React, { useEffect, useMemo, useRef, useState } from 'react';
import { arrayUnion, collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { Bell, CheckCheck } from 'lucide-react';
import { db } from '../../firebase/config';
import { isUnread } from '../../ai/staff';
import { requestNavigation } from '../../utils/appEvents';
import { toDate } from '../../utils/liveStats';

const ago = (d) => {
  if (!d) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return 'دلوقتي';
  if (m < 60) return `من ${m} دقيقة`;
  const h = Math.round(m / 60);
  return h < 24 ? `من ${h} ساعة` : `من ${Math.round(h / 24)} يوم`;
};

// 🔔 جرس الإشعارات الداخلية: ليّا باسمي، أو لدوري، أو لمركزي
export function NotificationBell({ appUser }) {
  const [byKey, setByKey] = useState({});
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const me = appUser?.id;

  useEffect(() => {
    if (!appUser) return undefined;
    const targets = [['toUserId', appUser.id], ['toName', appUser.name], ['toRole', appUser.role], ['toCenter', appUser.maintenanceCenter]].filter(([, v]) => v);
    const unsubs = targets.map(([field, value]) => onSnapshot(
      query(collection(db, 'notifications'), where(field, '==', value), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => setByKey((s) => ({ ...s, [field]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
      (err) => console.warn('notifications listener', field, err?.code || err),
    ));
    return () => unsubs.forEach((u) => u());
  }, [appUser]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = useMemo(() => {
    const m = new Map();
    Object.values(byKey).flat().forEach((n) => m.set(n.id, n));
    return [...m.values()].sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).slice(0, 30);
  }, [byKey]);
  const unread = items.filter((n) => isUnread(n, me)).length;

  const markRead = (n) => { if (isUnread(n, me)) updateDoc(doc(db, 'notifications', n.id), { readBy: arrayUnion(me) }).catch(() => {}); };
  const openItem = (n) => { markRead(n); setOpen(false); if (n.link?.view) requestNavigation(n.link.view, n.link.intent || null); };

  if (!appUser) return null;
  return (
    <div className="relative print:hidden" ref={boxRef}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`الإشعارات${unread ? ` (${unread} جديدة)` : ''}`} className="relative p-2 rounded-xl text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800">
        <Bell size={18} />
        {unread > 0 && <span key={unread} className="anim-pop absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="anim-pop absolute left-0 mt-2 w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl z-[120]" dir="rtl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="font-black text-sm">الإشعارات</p>
            {unread > 0 && <button type="button" onClick={() => items.forEach(markRead)} className="text-[11px] font-bold text-teal-700 flex items-center gap-1"><CheckCheck size={12} /> قريتهم كلهم</button>}
          </div>
          {!items.length && <p className="p-6 text-center text-xs text-slate-400">مفيش إشعارات.</p>}
          {items.map((n) => (
            <button key={n.id} type="button" onClick={() => openItem(n)} className={`w-full text-right px-4 py-3 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 ${isUnread(n, me) ? 'bg-teal-50/60 dark:bg-teal-950/20' : ''}`}>
              <p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">{isUnread(n, me) && <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />}{n.title}</p>
              {n.body && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.body}</p>}
              <p className="text-[10px] text-slate-400 mt-1">{ago(toDate(n.createdAt))}{n.from ? ` · ${n.from}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
