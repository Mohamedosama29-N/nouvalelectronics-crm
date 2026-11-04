import React, { useEffect, useState } from 'react';
import { Gauge, HardDriveDownload } from 'lucide-react';
import { FREE_LIMITS, readUsageToday, usageLevel } from '../../utils/readMeter';
import { backupDue } from '../../utils/fullBackup';

// 🔔 شريط تذكير النسخة الاحتياطية للأدمن (بيظهر فوق الصفحات)
export function BackupReminder({ appUser, systemSettings, onOpen }) {
  const [now] = useState(() => new Date());
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('backupReminderHidden') === '1'; } catch { return false; } });
  if (appUser?.role !== 'admin' || hidden || !systemSettings) return null;
  const d = backupDue(systemSettings, now);
  if (!d.due) return null;
  return (
    <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex flex-wrap items-center gap-2 print:hidden">
      <HardDriveDownload size={16} /> {d.days === null ? 'لسه معملتش نسخة احتياطية كاملة للبيانات.' : `آخر نسخة احتياطية من ${d.days} يوم.`}
      <button type="button" onClick={onOpen} className="px-3 py-1 rounded-lg bg-amber-600 text-white">اعمل نسخة دلوقتي</button>
      <button type="button" onClick={() => { setHidden(true); try { sessionStorage.setItem('backupReminderHidden', '1'); } catch { /* مش مهم */ } }} className="mr-auto text-amber-600">فكّرني بعدين</button>
    </div>
  );
}

// ⚠️ تنبيه للأدمن لو الاستهلاك قرّب من حد الخطة المجانية (بيقرا مستند واحد كل نص ساعة)
let usageCache = { at: 0, data: null };
export function UsageWarning({ appUser, onOpen }) {
  const [u, setU] = useState(usageCache.data);
  useEffect(() => {
    if (appUser?.role !== 'admin') return undefined;
    if (Date.now() - usageCache.at < 30 * 60000) return undefined;
    let alive = true;
    readUsageToday().then((d) => { usageCache = { at: Date.now(), data: d }; if (alive) setU(d); }).catch(() => {});
    return () => { alive = false; };
  }, [appUser]);
  if (appUser?.role !== 'admin' || !u) return null;
  const r = usageLevel(u.reads || 0, FREE_LIMITS.reads); const w = usageLevel(u.writes || 0, FREE_LIMITS.writes);
  const worst = r.pct >= w.pct ? { ...r, kind: 'القراءات' } : { ...w, kind: 'الكتابات' };
  if (worst.level === 'ok') return null;
  return (
    <div className={`mb-4 p-3 rounded-xl border text-xs font-bold flex flex-wrap items-center gap-2 print:hidden ${worst.level === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'}`}>
      <Gauge size={16} /> استهلاك {worst.kind} النهارده وصل {Math.round(worst.pct * 100)}% من الحد المجاني. قلّل التقارير الكبيرة لحد ما الحصة تتجدد (حوالي 10 الصبح).
      <button type="button" onClick={onOpen} className="px-3 py-1 rounded-lg bg-white/70 dark:bg-slate-800">التفاصيل</button>
    </div>
  );
}
