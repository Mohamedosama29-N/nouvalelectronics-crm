import React, { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { KeyRound, Loader2, X } from 'lucide-react';
import { db } from '../../firebase/config';
import { hashPassword, verifyPassword } from '../../utils/security';
import { authErrorMessage, changeMyPassword } from '../../utils/secureAuth';
import { isRealSession } from '../../utils/authSession';
import { showError, showSuccess } from '../../utils/alerts';
import { logUserActivity } from '../../utils/activityLog';

const inp = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500';

// 🔑 الموظف يغيّر باسوورده بنفسه — بيتغير في السيستم وفي الدخول الآمن (لو متفعّل) مع بعض
export function ChangeMyPassword({ appUser, onClose }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (f.next.length < 6) return showError('الباسورد الجديد لازم يكون 6 حروف على الأقل');
    if (f.next !== f.confirm) return showError('تأكيد الباسورد مش مطابق');
    if (f.next === f.current) return showError('الباسورد الجديد زي القديم');
    setBusy(true);
    try {
      const ref = doc(db, 'employees', appUser.id);
      const snap = await getDoc(ref);
      const stored = snap.data()?.pass;
      const secure = isRealSession();
      if (!secure && !verifyPassword(f.current, stored).valid) { showError('الباسورد الحالي غلط'); setBusy(false); return; }
      if (secure) await changeMyPassword(f.current, f.next);
      await updateDoc(ref, { pass: hashPassword(f.next) });
      await logUserActivity(appUser, 'تغيير كلمة السر', 'غيّر كلمة السر بنفسه');
      showSuccess('اتغيّر الباسورد');
      onClose();
    } catch (err) {
      console.error(err);
      showError(err?.code === 'auth/requires-recent-login' ? 'سجّل خروج ودخول تاني وجرّب' : authErrorMessage(err));
    }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" dir="rtl" role="dialog" aria-modal="true" aria-label="تغيير كلمة السر">
      <form onSubmit={save} className="anim-pop bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-3 shadow-2xl">
        <div className="flex items-center justify-between"><h3 className="font-black flex items-center gap-2 text-slate-800 dark:text-white"><KeyRound size={18} className="text-teal-600" /> تغيير كلمة السر</h3><button type="button" aria-label="إغلاق" onClick={onClose}><X size={18} /></button></div>
        <input type="password" autoComplete="current-password" className={inp} placeholder="الباسورد الحالي" aria-label="الباسورد الحالي" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        <input type="password" autoComplete="new-password" className={inp} placeholder="الباسورد الجديد (6 حروف أو أكتر)" aria-label="الباسورد الجديد" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        <input type="password" autoComplete="new-password" className={inp} placeholder="تأكيد الباسورد الجديد" aria-label="تأكيد الباسورد" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        <button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white font-bold disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} حفظ</button>
      </form>
    </div>
  );
}
