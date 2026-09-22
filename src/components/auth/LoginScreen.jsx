import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where, serverTimestamp
} from 'firebase/firestore';
import {
  Package,
  AlertTriangle,
  Lock,
  Loader2,
  Mail,
  LogIn,
  Eye,
  RefreshCcw,
  Cloud,
  EyeOff
} from 'lucide-react';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showError, showSuccess } from '../../utils/alerts';
import { logUserLogin } from '../../utils/network';
import { apiLimiter } from '../../utils/rateLimiter';
import { hashPassword, verifyPassword } from '../../utils/security';
import { saveUserToStorage } from '../../utils/userStorage';
import { requestPasswordReset } from '../../utils/passwordReset';

export function LoginScreen({ fbReady, onLoginSuccess, systemSettings, notify, onRetry, isConnecting, firebaseError }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockRemainingMs, setLockRemainingMs] = useState(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    try {
      await requestPasswordReset(resetEmail, {
        emailWebhookUrl: systemSettings?.emailWebhookUrl,
      });
      // بنعرض نفس الرسالة سواء الإيميل موجود أو لأ (أمان: منمنعش حد يكتشف
      // إيميلات مسجلة في النظام عن طريق تجربة شاشة الاستعادة)
      setResetSent(true);
    } catch (err) {
      showError('حصل خطأ، حاول مرة أخرى أو تواصل مع مدير النظام');
    } finally {
      setResetLoading(false);
    }
  };

  // 🛠️ FIX (نقطة #2): القفل بعد 5 محاولات كان متخزّن في React state بس،
  // فأي Refresh للصفحة كان بيصفّر العداد فورًا ويلغي القفل بالكامل - يعني
  // حماية وهمية بالكامل. دلوقتي بنخزّن القفل في localStorage لكل بريد
  // إلكتروني على حدة، فيفضل يشتغل حتى بعد إعادة تحميل الصفحة.
  // (ملحوظة: ده تحسين حقيقي لكنه لسه من جانب المتصفح فقط - حماية كاملة
  // 100% من هجمات التخمين تحتاج فرض القيد من جانب السيرفر، مثلاً عبر
  // Firestore Security Rules أو Cloud Function، وهو ما لا يمكن عمله من
  // كود العميل وحده.)
  const getLockKey = (em) => `loginLockout:${(em || '').trim().toLowerCase()}`;

  const readLockState = (em) => {
    try {
      const raw = localStorage.getItem(getLockKey(em));
      return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
    } catch {
      return { attempts: 0, lockedUntil: 0 };
    }
  };

  const writeLockState = (em, state) => {
    try {
      localStorage.setItem(getLockKey(em), JSON.stringify(state));
    } catch { /* localStorage غير متاح */ }
  };

  // تحديث حالة القفل بناءً على البريد الحالي (يعمل عند تحميل الشاشة وعند تغيير البريد)
  useEffect(() => {
    const state = readLockState(email);
    const remaining = (state.lockedUntil || 0) - Date.now();
    if (remaining > 0) {
      setIsLocked(true);
      setLockRemainingMs(remaining);
      setLoginAttempts(state.attempts || 5);
    } else {
      setIsLocked(false);
      setLockRemainingMs(0);
      setLoginAttempts(state.attempts || 0);
    }
  }, [email]);

  // عدّاد تنازلي حي لفك القفل تلقائيًا لما الوقت يخلص
  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(() => {
      const state = readLockState(email);
      const remaining = (state.lockedUntil || 0) - Date.now();
      if (remaining <= 0) {
        setIsLocked(false);
        setLockRemainingMs(0);
        setLoginAttempts(0);
        writeLockState(email, { attempts: 0, lockedUntil: 0 });
      } else {
        setLockRemainingMs(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isLocked, email]);

  // تحميل البريد الإلكتروني المحفوظ
  useEffect(() => {
    const savedEmail = localStorage.getItem('last_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const registerFailedAttempt = (em) => {
    const state = readLockState(em);
    const attempts = (state.attempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
    writeLockState(em, { attempts, lockedUntil });
    setLoginAttempts(attempts);
    if (lockedUntil > 0) {
      setIsLocked(true);
      setLockRemainingMs(lockedUntil - Date.now());
    }
  };

  const clearLockState = (em) => {
    writeLockState(em, { attempts: 0, lockedUntil: 0 });
    setLoginAttempts(0);
    setIsLocked(false);
    setLockRemainingMs(0);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (isLocked) {
      const mins = Math.ceil(lockRemainingMs / 60000);
      setError(`تم قفل هذا الحساب مؤقتاً بسبب كثرة المحاولات. حاول بعد ${mins} دقيقة تقريباً`);
      return;
    }

    if (!apiLimiter.check(email)) {
      setError("عدد كبير من المحاولات. انتظر قليلاً");
      return;
    }
    
    setError('');
    
    if (!fbReady) {
      setError("يرجى الانتظار حتى يتم الاتصال بالخادم...");
      return notify("يرجى الانتظار حتى يتم الاتصال بالخادم...", "warn");
    }
    if (!email || !pass) {
      setError("الرجاء إدخال البريد الإلكتروني وكلمة المرور");
      return notify("الرجاء إدخال البريد الإلكتروني وكلمة المرور", "warn");
    }
    
    setLoading(true);
    try {
      const q = query(collection(db, 'employees'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);

      // 🛠️ FIX أمني: لو أكتر من موظف عندهم نفس الإيميل بالظبط، الاستعلام
      // مش بيضمن ترتيب ثابت للنتايج - يعني ممكن يفتح حساب مختلف كل مرة
      // تسجل دخول بنفس البيانات بالظبط (بالظبط المشكلة اللي حصلت مع
      // حساب مكرر بصلاحيات أدمن). بدل ما نختار حساب عشوائي بصمت، بنوقف
      // الدخول ونطلب تصحيح المشكلة يدويًا - أأمن بكتير من فتح حساب غلط.
      if (snap.docs.length > 1) {
        setError("فيه أكتر من حساب مسجل بنفس البريد الإلكتروني - تواصل مع مدير النظام لتصحيح المشكلة قبل تسجيل الدخول.");
        showError("فيه أكتر من حساب مسجل بنفس البريد الإلكتروني - تواصل مع مدير النظام.");
        setLoading(false);
        return;
      }
      
      if (snap.empty) {
        // 🛠️ FIX أمني حرج: كان فيه مسار بيعمل حساب "مدير نظام" تلقائيًا
        // بأي إيميل/باسورد لو كوليكشن employees بدا فاضي وقت السجيل دخول -
        // ده منطقي للحظة إعداد النظام لأول مرة، لكن خطير جدًا لنظام شغال
        // فعليًا بموظفين حقيقيين: أي ظرف عابر (خطأ إملائي، مشكلة اتصال
        // لحظية، أي حاجة) يخلي الفحص يفشل بيمنح صلاحيات مدير كاملة لأي
        // حد كتب أي إيميل وباسورد في اللحظة دي. اتقفل المسار ده تمامًا.
        registerFailedAttempt(email);
        setError("هذا البريد الإلكتروني غير مسجل في النظام.");
        showError("هذا البريد الإلكتروني غير مسجل في النظام.");
      } else {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        if (userData.isDisabled) {
           setError("عذراً، هذا الحساب موقوف من قبل الإدارة.");
           showError("عذراً، هذا الحساب موقوف من قبل الإدارة.");
        } else if (verifyPassword(pass, userData.pass).valid) {
           const { upgraded } = verifyPassword(pass, userData.pass);
           const updates = { lastLogin: serverTimestamp() };
           // 🛠️ FIX (نقطة #1): ترحيل تلقائي هادئ - أول ما حساب قديم بباسورد
           // نص عادي يسجل دخول بنجاح، بنحوّل الباسورد المخزّن لتجزئة SHA-256
           // فورًا، فمع الوقت كل الحسابات النشطة بتتحول تلقائيًا من غير ما
           // نحتاج نطلب من حد يغيّر باسورده يدويًا.
           if (upgraded) {
             updates.pass = hashPassword(pass);
           }
           await updateDoc(doc(db, 'employees', userDoc.id), updates);
           clearLockState(email);
           
           if (rememberMe) {
             localStorage.setItem('last_email', email);
           }
           
           const userWithId = { id: userDoc.id, ...userData, permissions: userData.permissions || {} };
           
           await logUserLogin(userWithId);
           
           saveUserToStorage(userWithId);
           onLoginSuccess(userWithId);
           showSuccess(`أهلاً بك مجدداً يا ${userData.name}`);
           await logUserActivity(userWithId, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
        } else {
           registerFailedAttempt(email);
           setError("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.");
           showError("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.");
        }
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "فشل الاتصال بقاعدة البيانات. تأكد من جودة الإنترنت.";
      
      if (err.code === 'permission-denied') {
        errorMessage = "خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase Console.";
      } else if (err.code === 'unavailable') {
        errorMessage = "خدمة Firebase غير متاحة حالياً. حاول مرة أخرى.";
      } else if (err.code === 'not-found') {
        errorMessage = "لم يتم العثور على قاعدة البيانات. تأكد من إعدادات Firebase.";
      }
      
      setError(errorMessage);
      showError(errorMessage);
    }
    setLoading(false);
  };

  if (isConnecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-4 text-right" dir="rtl">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] w-full max-w-md shadow-2xl text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-lg font-bold text-slate-800 dark:text-white">جاري الاتصال بقاعدة البيانات...</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">يرجى الانتظار</p>
        </div>
      </div>
    );
  }

  if (firebaseError) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-4 text-right" dir="rtl">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] w-full max-w-md shadow-2xl">
          <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-black text-center text-slate-800 dark:text-white mb-2">خطأ في الاتصال</h2>
          <p className="text-center text-slate-600 dark:text-slate-400 mb-6">{firebaseError}</p>
          <div className="space-y-3">
            <button 
              onClick={onRetry}
              className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} /> إعادة المحاولة
            </button>
            <a 
              href="https://console.firebase.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-center"
            >
              فتح Firebase Console
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-4 text-right" dir="rtl">
      <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] w-full max-w-md shadow-2xl relative border-t-[6px] border-teal-600 animate-in fade-in zoom-in-95">
        <div className="flex justify-center mb-6">
           <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-teal-700 text-white rounded-2xl flex items-center justify-center shadow-lg">
             <Package size={40}/>
           </div>
        </div>
        <h1 className="text-2xl font-black text-center text-slate-800 dark:text-white mb-1">{systemSettings?.systemName || 'نوڤال ERP'}</h1>
        <p className="text-center text-slate-500 dark:text-slate-400 text-[10px] mb-8 font-bold uppercase tracking-widest">Enterprise Management Portal</p>
        
        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative font-bold">
            <Mail className="absolute right-4 top-3.5 text-slate-400 dark:text-slate-500" size={18}/>
            <input 
              className="w-full border-2 border-slate-100 dark:border-slate-700 pr-12 p-3 rounded-xl focus:border-teal-500 outline-none text-right bg-slate-50 dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-300 text-sm transition-all" 
              placeholder="البريد الإلكتروني للموظف" 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              type="email" 
              required 
              dir="ltr"
              disabled={loading || isLocked}
            />
          </div>
          <div className="relative font-bold">
            <Lock className="absolute right-4 top-3.5 text-slate-400 dark:text-slate-500" size={18}/>
            <input 
              className="w-full border-2 border-slate-100 dark:border-slate-700 pr-12 p-3 rounded-xl focus:border-teal-500 outline-none text-right bg-slate-50 dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-300 text-sm transition-all" 
              type={showPassword ? "text" : "password"}
              placeholder="كلمة المرور" 
              value={pass} 
              onChange={e=>setPass(e.target.value)} 
              required 
              dir="ltr"
              disabled={loading || isLocked}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 hover:text-teal-600"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">تذكرني</span>
            </label>
            <button 
              type="button"
              onClick={() => { setShowResetModal(true); setResetEmail(email); setResetSent(false); }}
              className="text-xs text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 font-bold"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
          
          <button 
            disabled={loading || !fbReady || isLocked} 
            className="w-full bg-teal-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-teal-700 active:scale-95 flex justify-center items-center gap-2 mt-6 text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
             {loading || !fbReady ? <Loader2 className="animate-spin" size={20}/> : <><LogIn size={20}/> تسجيل الدخول بأمان</>}
          </button>
          
          {isLocked && (
            <p className="text-xs text-rose-600 text-center mt-2">
              تم قفل هذا الحساب مؤقتاً. حاول بعد {Math.ceil(lockRemainingMs / 60000)} دقيقة تقريباً
            </p>
          )}
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            أول مستخدم يسجل الدخول يصبح مديراً للنظام تلقائياً
          </p>
        </div>
      </div>

      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            {!resetSent ? (
              <form onSubmit={handleRequestReset}>
                <h3 className="font-black text-lg text-slate-800 dark:text-white mb-2">استعادة كلمة المرور</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  هنبعتلك رابط لتحديد كلمة سر جديدة على بريدك المسجل بالنظام (صالح 30 دقيقة).
                </p>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="بريدك الإلكتروني"
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white p-3 rounded-xl text-sm mb-4"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowResetModal(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white py-2.5 rounded-xl font-bold text-sm">
                    إلغاء
                  </button>
                  <button type="submit" disabled={resetLoading} className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                    {resetLoading ? <Loader2 size={16} className="animate-spin"/> : null} إرسال الرابط
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center">
                <Mail className="w-12 h-12 text-teal-600 mx-auto mb-3" />
                <h3 className="font-black text-lg text-slate-800 dark:text-white mb-2">تم الإرسال</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                  لو الإيميل ده مسجل عندنا، هتوصلك رسالة فيها رابط استعادة كلمة السر خلال دقايق.
                  لو مفيش رسالة، تواصل مع مدير النظام.
                </p>
                <button onClick={() => setShowResetModal(false)} className="w-full bg-teal-600 text-white py-2.5 rounded-xl font-bold text-sm">
                  حسنًا
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// 🧾 مكون عرض الفاتورة المحسن
// ==========================================================================
// ==========================================================================
// 🧾 مكون عرض الفاتورة المحسن
// ==========================================================================
// ==========================================================================
// 🧾 مكون عرض الفاتورة - نسخة مبسطة (سعر إجمالي واحد)
// ==========================================================================
