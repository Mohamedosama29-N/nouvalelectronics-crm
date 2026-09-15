import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Lock, XCircle } from 'lucide-react';
import { resetPasswordWithToken, validateResetToken } from '../../utils/passwordReset';

export function ResetPasswordScreen({ token, onDone }) {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [reason, setReason] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    validateResetToken(token).then((result) => {
      setValid(result.valid);
      setReason(result.reason);
      setChecking(false);
    });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPass.length < 6) {
      setError('كلمة السر لازم تكون 6 حروف/أرقام على الأقل');
      return;
    }
    if (newPass !== confirmPass) {
      setError('كلمتا السر غير متطابقتين');
      return;
    }
    setSubmitting(true);
    try {
      const result = await resetPasswordWithToken(token, newPass);
      if (result.success) {
        setDone(true);
      } else {
        setError('الرابط لم يعد صالحاً، اطلب رابطاً جديداً من شاشة تسجيل الدخول');
      }
    } catch {
      setError('حصل خطأ، حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 p-4 text-right" dir="rtl">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] w-full max-w-md shadow-2xl">
        {checking ? (
          <div className="text-center py-8">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">جاري التحقق من الرابط...</p>
          </div>
        ) : done ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">تم تغيير كلمة السر</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">تقدر تسجل دخولك دلوقتي بكلمة السر الجديدة.</p>
            <button onClick={onDone} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">
              الذهاب لتسجيل الدخول
            </button>
          </div>
        ) : !valid ? (
          <div className="text-center py-4">
            <XCircle className="w-14 h-14 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">
              {reason === 'expired' ? 'الرابط منتهي الصلاحية' : reason === 'used' ? 'الرابط مستخدم من قبل' : 'رابط غير صالح'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
              ارجع لشاشة تسجيل الدخول واطلب رابط استعادة جديد.
            </p>
            <button onClick={onDone} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">
              الذهاب لتسجيل الدخول
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="text-center mb-6">
              <Lock className="w-12 h-12 text-indigo-600 mx-auto mb-3" />
              <h2 className="text-xl font-black text-slate-800 dark:text-white">تحديد كلمة سر جديدة</h2>
            </div>
            {error && (
              <p className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-bold p-3 rounded-xl mb-4 text-center">
                {error}
              </p>
            )}
            <input
              type="password"
              required
              minLength={6}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="كلمة السر الجديدة"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white p-3 rounded-xl text-sm mb-3"
            />
            <input
              type="password"
              required
              minLength={6}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="تأكيد كلمة السر"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white p-3 rounded-xl text-sm mb-5"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : null} حفظ كلمة السر الجديدة
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
