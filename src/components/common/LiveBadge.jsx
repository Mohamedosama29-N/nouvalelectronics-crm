import React, { useEffect, useState } from 'react';

// مؤشر "مباشر": نقطة خضراء بتنبض + وقت آخر تحديث وصل من Firestore.
// بيتحوّل لأصفر لو الاتصال مقطوع أو لسه بيحمّل.
export function LiveBadge({ updatedAt, loading = false, className = '' }) {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const live = online && !loading;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${live ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'} ${className}`}
      title="البيانات بتتحدث لحظياً من قاعدة البيانات"
    >
      <span className="relative flex h-2 w-2">
        {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      </span>
      {!online ? 'غير متصل' : loading ? 'جاري التحميل...' : 'مباشر'}
      {updatedAt && online && !loading && (
        <span className="font-normal opacity-70">· {updatedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      )}
    </span>
  );
}
