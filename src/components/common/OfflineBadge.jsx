import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { onPending, pendingCount } from '../../utils/offlineWrites';

// 📱 عدد التعديلات اللي متسجلة على الجهاز ومستنية النت
export function OfflineBadge({ className = '' }) {
  const [n, setN] = useState(() => pendingCount());
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const off = onPending(setN);
    const on = () => setOnline(true); const down = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', down);
    return () => { off(); window.removeEventListener('online', on); window.removeEventListener('offline', down); };
  }, []);
  if (online && !n) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold ${online ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'} ${className}`}>
      {online ? <RefreshCw size={12} className="animate-spin" /> : <CloudOff size={12} />}
      {online ? `بيتبعت ${n} تعديل…` : n ? `من غير نت · ${n} تعديل متسجل على الجهاز` : 'من غير نت — بتشتغل على آخر بيانات'}
    </span>
  );
}
