import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signInAnonymously, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, functions } from '../firebase/config';

// الوضع الصارم: لما يتفعّل (VITE_REQUIRE_REAL_AUTH=true) مفيش دخول مجهول خالص،
// ولازم أي جلسة تكون من تسجيل دخول حقيقي عن طريق customLogin. يتفعّل بعد ما
// تتأكد إن الدخول الجديد شغال (وقبل نشر firestore.rules.strict).
export const REQUIRE_REAL_AUTH = import.meta.env.VITE_REQUIRE_REAL_AUTH === 'true';

export const callFunction = async (name, data) => (await httpsCallable(functions, name)(data)).data;

export const isRealSession = () => !!auth.currentUser && !auth.currentUser.isAnonymous;

// بيستنى Firebase يرجّع الجلسة المحفوظة قبل أي حاجة. 🛠️ مهم: signInAnonymously
// لو اتنادت وفي مستخدم حقيقي مسجّل بتبدّله بمستخدم مجهول، فلازم نتأكد الأول.
export async function initFirebaseAuth() {
  await auth.authStateReady();
  if (!auth.currentUser && !REQUIRE_REAL_AUTH) {
    await signInAnonymously(auth);
  }
}

// تسجيل دخول حقيقي: السيرفر بيتحقق من الباسورد ويرجّع Custom Token، والواجهة
// بتقرا مستند الموظف الخاص بيها (uid = معرّف المستند) بنفس الشكل القديم.
export async function loginWithServer(email, password) {
  const { token } = await callFunction('customLogin', { email, password });
  const cred = await signInWithCustomToken(auth, token);
  const snap = await getDoc(doc(db, 'employees', cred.user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    throw Object.assign(new Error('بيانات الموظف غير موجودة'), { code: 'employee-missing' });
  }
  const data = snap.data();
  return { id: snap.id, ...data, permissions: data.permissions || {} };
}

// أخطاء "الدالة مش منشورة/مش شغالة": في الوضع غير الصارم بس بنسمح بالرجوع
// للدخول القديم عشان محدش يتقفل برّه النظام أثناء الانتقال.
export const shouldUseLegacyFallback = (err) =>
  !REQUIRE_REAL_AUTH && ['functions/not-found', 'functions/unavailable', 'functions/internal', 'functions/unknown'].includes(err?.code);

export async function endSession() {
  try { await signOut(auth); } catch { /* مفيش جلسة */ }
  if (!REQUIRE_REAL_AUTH) {
    try { await signInAnonymously(auth); } catch { /* هنحاول عند الدخول التالي */ }
  }
}
