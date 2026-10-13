import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// ==========================================================================
// 🔐 تسجيل الدخول والعمليات العامة من السيرفر (بدل ما الواجهة تقرا employees
// وتقارن الباسورد بنفسها). نفس نظام الباسورد الحالي (SHA-256 + pepper) عشان
// مفيش موظف يحتاج يغيّر باسورده.
// ==========================================================================
const REGION = 'europe-west1';
// لازم تتطابق مع PASSWORD_PEPPER في src/utils/security.js
const PASSWORD_PEPPER = 'nouval-erp-pw-v1::';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

const db = () => getFirestore();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hashPassword = (plain) => sha256(PASSWORD_PEPPER + String(plain));
const isHashed = (v) => /^[a-f0-9]{64}$/i.test(String(v || ''));
const normEmail = (e) => String(e || '').trim().toLowerCase();

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

const verifyPassword = (plain, stored) => {
  if (isHashed(stored)) return { valid: safeEqual(hashPassword(plain), String(stored).toLowerCase()), upgraded: false };
  const valid = safeEqual(String(stored || ''), String(plain));
  return { valid, upgraded: valid };
};

// ---------------------------------------------------------------------------
// customLogin: email + password → Custom Token بمطالبات (claims) الدور والمخزن
// ---------------------------------------------------------------------------
export const customLogin = onCall({ region: REGION, cors: true }, async (request) => {
  const email = normEmail(request.data?.email);
  const password = String(request.data?.password ?? '');
  if (!email || !password) throw new HttpsError('invalid-argument', 'البريد وكلمة المرور مطلوبين');

  const throttleRef = db().collection('loginThrottle').doc(sha256(email));
  const throttleSnap = await throttleRef.get();
  const throttle = throttleSnap.exists ? throttleSnap.data() : { attempts: 0, lockedUntil: 0 };
  if ((throttle.lockedUntil || 0) > Date.now()) {
    const mins = Math.ceil((throttle.lockedUntil - Date.now()) / 60000);
    throw new HttpsError('resource-exhausted', `تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. حاول بعد ${mins} دقيقة تقريباً`);
  }

  const fail = async () => {
    const attempts = (throttle.attempts || 0) + 1;
    await throttleRef.set({ attempts, lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0, updatedAt: FieldValue.serverTimestamp() });
    throw new HttpsError('unauthenticated', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  };

  const snap = await db().collection('employees').where('email', '==', email).get();
  if (snap.size > 1) {
    throw new HttpsError('failed-precondition', 'فيه أكتر من حساب مسجل بنفس البريد الإلكتروني - تواصل مع مدير النظام لتصحيح المشكلة.');
  }
  if (snap.empty) return fail();

  const doc = snap.docs[0];
  const data = doc.data();
  const { valid, upgraded } = verifyPassword(password, data.pass);
  if (!valid) return fail();
  if (data.isDisabled) throw new HttpsError('permission-denied', 'هذا الحساب موقوف من قبل الإدارة.');

  const updates = { lastLogin: FieldValue.serverTimestamp() };
  if (upgraded) updates.pass = hashPassword(password); // ترحيل هادئ من نص عادي لتجزئة
  await Promise.all([doc.ref.update(updates), throttleRef.delete().catch(() => {})]);

  try {
    // uid = معرّف مستند الموظف، فالـ rules تقدر تقول request.auth.uid == userId
    const perms = data.permissions || {};
    const token = await getAuth().createCustomToken(doc.id, {
      emp: true,
      role: data.role || 'employee',
      wh: data.assignedWarehouseId || 'main',
      // um = يقدر يدير المستخدمين (بيستخدمها firestore.rules.strict)
      um: data.role === 'admin' || !!(perms.manageUsers || perms.addUser || perms.editUser || perms.deleteUser || perms.managePermissions || perms.bulkDeleteUsers)
    });
    return { token };
  } catch (e) {
    console.error('createCustomToken failed', e);
    throw new HttpsError('internal', 'تعذر إنشاء جلسة الدخول. راجع صلاحية Service Account Token Creator (FIREBASE_AUTH_MIGRATION.md).');
  }
});

// ---------------------------------------------------------------------------
// تقييم العميل (صفحة عامة من غير تسجيل دخول) - التحقق بتوكن التذكرة
// ---------------------------------------------------------------------------
async function loadTicketForRating(ticketId, token) {
  if (!ticketId || !token) throw new HttpsError('invalid-argument', 'رابط غير صالح');
  const ref = db().collection('tickets').doc(String(ticketId));
  const snap = await ref.get();
  if (!snap.exists || !snap.data().ratingToken || !safeEqual(snap.data().ratingToken, token)) {
    throw new HttpsError('permission-denied', 'رابط التقييم غير صالح');
  }
  return { ref, data: snap.data() };
}

export const getTicketForRating = onCall({ region: REGION, cors: true }, async (request) => {
  const { data } = await loadTicketForRating(request.data?.ticketId, request.data?.token);
  return { ticketNumber: data.ticketNumber || '', device: data.device || '', alreadyRated: !!data.customerRating?.submittedAt };
});

export const submitTicketRating = onCall({ region: REGION, cors: true }, async (request) => {
  const { ref, data } = await loadTicketForRating(request.data?.ticketId, request.data?.token);
  if (data.customerRating?.submittedAt) throw new HttpsError('already-exists', 'تم التقييم من قبل');
  const r = request.data?.ratings || {};
  const clean = {};
  for (const k of ['accessibility', 'maintenanceTime', 'centerDealing', 'deliveryProcedures']) {
    const n = Number(r[k]);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpsError('invalid-argument', 'التقييم لازم يكون من 1 لـ 5');
    clean[k] = n;
  }
  const repurchase = ['yes', 'no'].includes(request.data?.repurchase) ? request.data.repurchase : '';
  const comment = String(request.data?.comment || '').slice(0, 500);
  await ref.update({ customerRating: { ...clean, repurchase, comment, submittedAt: FieldValue.serverTimestamp() } });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// استعادة كلمة السر (من غير تسجيل دخول)
// ---------------------------------------------------------------------------
export const requestPasswordReset = onCall({ region: REGION, cors: true }, async (request) => {
  const email = normEmail(request.data?.email);
  const baseUrl = String(request.data?.baseUrl || '');
  if (!email) throw new HttpsError('invalid-argument', 'البريد مطلوب');

  const snap = await db().collection('employees').where('email', '==', email).get();
  if (snap.size !== 1) return { success: true }; // نفس الرد دايمًا عشان محدش يكتشف إيميلات مسجلة

  // حد أقصى 3 طلبات في الساعة لنفس البريد
  const recent = await db().collection('password_resets').where('email', '==', email)
    .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 3600000)).get();
  if (recent.size >= 3) return { success: true };

  const token = randomBytes(24).toString('hex');
  await db().collection('password_resets').add({
    token, employeeId: snap.docs[0].id, email, used: false,
    expiresAt: Timestamp.fromMillis(Date.now() + RESET_TTL_MS), createdAt: FieldValue.serverTimestamp()
  });

  const settings = (await db().collection('settings').doc('general').get()).data() || {};
  let emailSent = false;
  if (settings.emailWebhookUrl && /^https?:\/\//.test(baseUrl)) {
    try {
      const link = `${baseUrl}?resetToken=${token}`;
      const res = await fetch(settings.emailWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: 'استعادة كلمة السر', body: `اضغط على الرابط ده لتحديد كلمة سر جديدة (صالح لمدة 30 دقيقة):\n${link}`, attachments: [] })
      });
      emailSent = res.ok;
    } catch (e) { console.error('reset email failed', e); }
  }
  return { success: true, emailSent };
});

async function findValidReset(token) {
  if (!token) return null;
  const snap = await db().collection('password_resets').where('token', '==', String(token)).limit(1).get();
  if (snap.empty) return { valid: false };
  const d = snap.docs[0].data();
  if (d.used) return { valid: false, reason: 'used' };
  if (d.expiresAt.toMillis() < Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, ref: snap.docs[0].ref, employeeId: d.employeeId };
}

export const validateResetToken = onCall({ region: REGION, cors: true }, async (request) => {
  const r = await findValidReset(request.data?.token);
  return { valid: !!r?.valid, reason: r?.reason || null };
});

export const confirmPasswordReset = onCall({ region: REGION, cors: true }, async (request) => {
  const newPassword = String(request.data?.newPassword || '');
  if (newPassword.length < 6) throw new HttpsError('invalid-argument', 'كلمة السر لازم تكون 6 على الأقل');
  const r = await findValidReset(request.data?.token);
  if (!r?.valid) return { success: false, reason: r?.reason || 'invalid' };
  await db().collection('employees').doc(r.employeeId).update({ pass: hashPassword(newPassword) });
  await r.ref.update({ used: true, usedAt: FieldValue.serverTimestamp() });
  return { success: true };
});
