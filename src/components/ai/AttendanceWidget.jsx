import React, { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Clock, LogIn, LogOut, Loader2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { attendanceInfo, DEFAULT_SHIFT, ymd } from '../../ai/staff';
import { showError, showSuccess } from '../../utils/alerts';

const t = (v) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'; };

// 🕘 تسجيل الحضور والانصراف (مستند واحد لكل موظف في اليوم)
export function AttendanceWidget({ appUser, systemSettings }) {
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const shift = { ...DEFAULT_SHIFT, ...(systemSettings?.attendance || {}) };
  const id = appUser?.id ? `${appUser.id}_${ymd()}` : null;

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    getDoc(doc(db, 'attendance', id)).then((s) => { if (!cancelled) setRec(s.exists() ? s.data() : {}); }).catch(() => { if (!cancelled) setRec({}); });
    return () => { cancelled = true; };
  }, [id]);

  const mark = async (kind) => {
    setBusy(true);
    try {
      const base = { userId: appUser.id, name: appUser.name || '', role: appUser.role || '', warehouseId: appUser.assignedWarehouseId || 'main', date: ymd() };
      const patch = kind === 'in' ? { ...base, checkIn: serverTimestamp() } : { ...base, checkOut: serverTimestamp() };
      await setDoc(doc(db, 'attendance', id), patch, { merge: true });
      setRec((r) => ({ ...r, ...base, [kind === 'in' ? 'checkIn' : 'checkOut']: new Date() }));
      showSuccess(kind === 'in' ? 'اتسجل الحضور' : 'اتسجل الانصراف');
    } catch (e) { console.error(e); showError('معرفتش أسجل'); }
    finally { setBusy(false); }
  };

  if (!id) return null;
  const info = rec ? attendanceInfo(rec, shift) : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
      <Clock size={18} className="text-teal-600" />
      <div className="text-xs flex-1 min-w-[150px]">
        <p className="font-bold text-slate-700 dark:text-slate-200">حضور النهارده</p>
        <p className="text-slate-500">دخول {t(rec?.checkIn)} · خروج {t(rec?.checkOut)}{info?.late ? <b className="text-amber-600"> · متأخر {info.late} دقيقة</b> : ''}</p>
      </div>
      {!rec ? <Loader2 size={16} className="animate-spin text-slate-400" /> : !rec.checkIn ? (
        <button type="button" onClick={() => mark('in')} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black active:scale-95 transition"><LogIn size={16} /> حضور</button>
      ) : !rec.checkOut ? (
        <button type="button" onClick={() => mark('out')} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-black active:scale-95 transition"><LogOut size={16} /> انصراف</button>
      ) : <span className="text-xs font-bold text-emerald-600">✓ خلّصت يومك</span>}
    </div>
  );
}
