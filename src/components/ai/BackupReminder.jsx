import React, { useState } from 'react';
import { HardDriveDownload } from 'lucide-react';
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
