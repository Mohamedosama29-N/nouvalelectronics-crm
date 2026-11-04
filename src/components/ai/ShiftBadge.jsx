import React from 'react';
import { Wallet } from 'lucide-react';
import { useMyShift } from '../../hooks/useMyShift';
import { requestNavigation } from '../../utils/appEvents';
import { toDate } from '../../utils/liveStats';

// 💵 حالة الوردية فوق الكاشير — تفكير بفتح/قفل الوردية
export function ShiftBadge({ appUser }) {
  const [shift] = useMyShift(appUser);
  if (shift === undefined) return null;
  const open = !!shift;
  const since = open ? toDate(shift.openedAt) : null;
  return (
    <button type="button" onClick={() => requestNavigation('accounts_hub', { kind: 'shift' })}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold anim-fade ${open ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
      <Wallet size={14} /> {open ? `ورديتك مفتوحة${since ? ` من ${since.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'مفيش وردية مفتوحة — افتح وردية'}
    </button>
  );
}
