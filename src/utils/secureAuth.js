// 🔐 (54) الدخول الآمن المجاني: Firebase Authentication بالإيميل والباسورد (مجاني على Spark)
// + App Check (reCAPTCHA v3 مجاني). كله **مقفول افتراضيًا** ومش بيغيّر أي حاجة لحد ما
// تضبط متغيرات البيئة:
//   VITE_AUTH_MODE = legacy (الافتراضي) | migrate (ترحيل هادي وقت الدخول) | firebase (دخول آمن بس)
//   VITE_APPCHECK_SITE_KEY = مفتاح reCAPTCHA v3 (اختياري)
// الخطوات كاملة في SECURE_LOGIN.md
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db, firebaseApp } from '../firebase/config';

const env = (k) => { try { return import.meta.env?.[k]; } catch { return undefined; } };
export const AUTH_MODE = ['migrate', 'firebase'].includes(env('VITE_AUTH_MODE')) ? env('VITE_AUTH_MODE') : 'legacy';
export const USE_LOGIN_FUNCTION = env('VITE_USE_LOGIN_FUNCTION') === 'true';
export const APPCHECK_KEY = env('VITE_APPCHECK_SITE_KEY') || '';

// أخطاء Firebase Auth بالعربي
export function authErrorMessage(e) {
  const c = e?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(c)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (c === 'auth/too-many-requests') return 'محاولات كتير غلط. الحساب اتقفل مؤقتًا — استنى شوية أو غيّر الباسورد من "نسيت كلمة المرور".';
  if (c === 'auth/user-disabled') return 'الحساب ده موقوف.';
  if (c === 'auth/network-request-failed') return 'مفيش اتصال بالإنترنت.';
  if (c === 'auth/operation-not-allowed') return 'تسجيل الدخول بالإيميل مش متفعّل في Firebase Console ← Authentication ← Sign-in method.';
  if (c === 'employee-missing') return 'الإيميل ده مش مربوط بأي موظف في السيستم.';
  if (c === 'employee-disabled') return 'عذراً، هذا الحساب موقوف من قبل الإدارة.';
  if (c === 'employee-duplicate') return 'فيه أكتر من موظف بنفس الإيميل — كلّم مدير النظام.';
  return 'فشل تسجيل الدخول. حاول تاني.';
}

const findEmployeeByEmail = async (email) => {
  const s = await getDocs(query(collection(db, 'employees'), where('email', '==', email), limit(2)));
  if (s.size > 1) throw Object.assign(new Error('dup'), { code: 'employee-duplicate' });
  if (s.empty) throw Object.assign(new Error('missing'), { code: 'employee-missing' });
  return s.docs[0];
};

// الربط: authLinks/{uid} → الموظف (القواعد الآمنة بتعتمد عليه)
const linkEmployee = async (uid, empDoc, email) => {
  await setDoc(doc(db, 'authLinks', uid), { employeeId: empDoc.id, email, linkedAt: serverTimestamp() }, { merge: true });
  if (empDoc.data().authUid !== uid) await updateDoc(doc(db, 'employees', empDoc.id), { authUid: uid, authLinkedAt: serverTimestamp() });
};

// وضع firebase: الدخول كله عن طريق Firebase Auth
export async function firebaseEmailLogin(email, password) {
  const em = String(email).trim().toLowerCase();
  const cred = await signInWithEmailAndPassword(auth, em, password);
  const empDoc = await findEmployeeByEmail(em);
  const data = empDoc.data();
  if (data.isDisabled) { await auth.signOut(); throw Object.assign(new Error('disabled'), { code: 'employee-disabled' }); }
  await linkEmployee(cred.user.uid, empDoc, em);
  return { id: empDoc.id, ...data, authUid: cred.user.uid, permissions: data.permissions || {} };
}

// وضع migrate: بعد ما الدخول القديم ينجح بالباسورد الصح، بنعمل/نربط حساب Firebase Auth بنفس الباسورد
// (من غير ما الموظف يحس بحاجة). لو فشل لأي سبب الدخول القديم بيكمل عادي.
export async function migrateAfterLegacyLogin(email, password, empDoc) {
  if (AUTH_MODE !== 'migrate' || !password || String(password).length < 6) return { migrated: false, reason: 'skip' };
  const em = String(email).trim().toLowerCase();
  try {
    let cred;
    try { cred = await signInWithEmailAndPassword(auth, em, password); }
    catch (e) {
      if (!['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(e?.code)) throw e;
      cred = await createUserWithEmailAndPassword(auth, em, password);
    }
    await linkEmployee(cred.user.uid, empDoc, em);
    return { migrated: true };
  } catch (e) {
    console.warn('secure-auth migrate', e?.code || e);
    return { migrated: false, reason: e?.code || 'error' };
  }
}

export const sendResetLink = (email) => sendPasswordResetEmail(auth, String(email).trim().toLowerCase());

// App Check (reCAPTCHA v3) — بيتفعّل بس لو المفتاح موجود
let appCheckStarted = false;
export async function initAppCheck() {
  if (!APPCHECK_KEY || appCheckStarted || typeof window === 'undefined') return false;
  appCheckStarted = true;
  try {
    const m = await import('firebase/app-check');
    m.initializeAppCheck(firebaseApp, { provider: new m.ReCaptchaV3Provider(APPCHECK_KEY), isTokenAutoRefreshEnabled: true });
    return true;
  } catch (e) { console.warn('app-check', e); appCheckStarted = false; return false; }
}

export function secureAuthStatus(employees = []) {
  const active = employees.filter((e) => !e.isDisabled);
  const linked = active.filter((e) => e.authUid);
  return { mode: AUTH_MODE, appCheck: !!APPCHECK_KEY, total: active.length, linked: linked.length, pending: active.filter((e) => !e.authUid) };
}

// ================================================================ إدارة الحسابات الآمنة من جوه السيستم
// بنستخدم نسخة Firebase تانية (secondary app) عشان نعمل حساب الموظف الجديد من غير ما
// جلسة الأدمن الحالية تتقفل — مجاني وما محتاجش Admin SDK ولا Cloud Functions.
let provisioner = null;
async function getProvisioner() {
  if (provisioner) return provisioner;
  const [{ initializeApp, getApps }, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const existing = getApps().find((a) => a.name === 'provisioner');
  const app = existing || initializeApp(firebaseApp.options, 'provisioner');
  const pAuth = authMod.getAuth(app);
  await authMod.setPersistence(pAuth, authMod.inMemoryPersistence).catch(() => {});
  provisioner = { auth: pAuth, db: fsMod.getFirestore(app), authMod, fsMod };
  return provisioner;
}

export const secureAccountsEnabled = () => AUTH_MODE !== 'legacy';

// بيعمل حساب Firebase Auth للموظف (بعد ما مستند الموظف يتعمل) ويربطه — الحساب الجديد هو اللي بيكتب الربط بنفسه
export async function provisionEmployeeAccount({ employeeId, email, password }) {
  if (!secureAccountsEnabled()) return { created: false, reason: 'legacy' };
  const em = String(email).trim().toLowerCase();
  const p = await getProvisioner();
  try {
    let cred;
    try { cred = await p.authMod.createUserWithEmailAndPassword(p.auth, em, password); }
    catch (e) {
      if (e?.code !== 'auth/email-already-in-use') throw e;
      // الحساب موجود (مثلاً موظف اتمسح ورجع) — بنجرب الباسورد، وإلا بنبعتله رابط تعيين
      try { cred = await p.authMod.signInWithEmailAndPassword(p.auth, em, password); }
      catch { await sendPasswordResetEmail(auth, em).catch(() => {}); return { created: false, reason: 'exists-reset-sent' }; }
    }
    const uid = cred.user.uid;
    await p.fsMod.setDoc(p.fsMod.doc(p.db, 'authLinks', uid), { employeeId, email: em, linkedAt: p.fsMod.serverTimestamp() }, { merge: true });
    await updateDoc(doc(db, 'employees', employeeId), { authUid: uid, authLinkedAt: serverTimestamp() });
    return { created: true, uid };
  } finally {
    await p.authMod.signOut(p.auth).catch(() => {});
  }
}

// الأدمن مايقدرش يغيّر باسورد Firebase لموظف تاني من المتصفح (ده محتاج سيرفر مدفوع)،
// فبنبعت للموظف رابط تعيين باسورد على إيميله (مجاني من Firebase).
export async function adminPasswordChanged(email) {
  if (!secureAccountsEnabled()) return { sent: false };
  try { await sendPasswordResetEmail(auth, String(email).trim().toLowerCase()); return { sent: true }; }
  catch (e) { return { sent: false, reason: e?.code }; }
}

// الموظف يغيّر باسوورده بنفسه (لازم الباسورد الحالي — Firebase بيطلب تأكيد الهوية)
export async function changeMyPassword(currentPassword, newPassword) {
  const m = await import('firebase/auth');
  const u = auth.currentUser;
  if (!u || u.isAnonymous || !u.email) throw Object.assign(new Error('no-session'), { code: 'no-session' });
  await m.reauthenticateWithCredential(u, m.EmailAuthProvider.credential(u.email, currentPassword));
  await m.updatePassword(u, newPassword);
  return true;
}
