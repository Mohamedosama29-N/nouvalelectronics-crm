import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where, Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { hashPassword } from './security';
import { sendEmail } from './communications';

const RESET_TOKEN_TTL_MINUTES = 30;

function generateToken() {
  // 32 حرف عشوائي - كافي كتوكن مؤقت لصلاحية 30 دقيقة، مش للاستخدام كمفتاح تشفير
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================================================
// 📧 طلب استعادة كلمة السر: بيتأكد إن الإيميل موجود، يعمل توكن، ويبعت رابط
// ==========================================================================
// ⚠️ الإرسال بيعتمد على webhook البريد المضبوط في الإعدادات (نفس اللي
// بيستخدمه sendEmail في باقي التطبيق). لو مش مضبوط، الدالة بترجع false
// والواجهة لازم توضح للمستخدم إنه يتواصل مع الأدمن يدويًا بدل كده.
export async function requestPasswordReset(email, { appBaseUrl, emailWebhookUrl } = {}) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return { success: false, reason: 'invalid_email' };

  const snap = await getDocs(query(collection(db, 'employees'), where('email', '==', normalizedEmail)));
  if (snap.empty) {
    // ملحوظة أمان: بنرجع "success" حتى لو الإيميل مش موجود، عشان محدش
    // يقدر يستخدم شاشة الاستعادة لمعرفة أي إيميلات مسجلة فعليًا في النظام.
    return { success: true };
  }

  const employeeDoc = snap.docs[0];
  const token = generateToken();
  const expiresAt = Timestamp.fromMillis(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await addDoc(collection(db, 'password_resets'), {
    token,
    employeeId: employeeDoc.id,
    email: normalizedEmail,
    used: false,
    expiresAt,
    createdAt: serverTimestamp(),
  });

  const resetLink = `${appBaseUrl || window.location.origin}${window.location.pathname}?resetToken=${token}`;
  const sent = await sendEmail(
    normalizedEmail,
    'استعادة كلمة السر',
    `اضغط على الرابط ده لتحديد كلمة سر جديدة (صالح لمدة ${RESET_TOKEN_TTL_MINUTES} دقيقة):\n${resetLink}`,
    [],
    emailWebhookUrl
  );

  return { success: true, emailSent: sent };
}

// ==========================================================================
// 🔎 التحقق من صلاحية التوكن (يتنادى أول ما شاشة إعادة التعيين تفتح)
// ==========================================================================
export async function validateResetToken(token) {
  if (!token) return { valid: false };
  const snap = await getDocs(query(collection(db, 'password_resets'), where('token', '==', token)));
  if (snap.empty) return { valid: false };

  const resetDoc = snap.docs[0];
  const data = resetDoc.data();
  if (data.used) return { valid: false, reason: 'used' };
  if (data.expiresAt.toMillis() < Date.now()) return { valid: false, reason: 'expired' };

  return { valid: true, resetDocId: resetDoc.id, employeeId: data.employeeId, email: data.email };
}

// ==========================================================================
// 🔑 تعيين كلمة سر جديدة باستخدام توكن صالح
// ==========================================================================
export async function resetPasswordWithToken(token, newPassword) {
  const validation = await validateResetToken(token);
  if (!validation.valid) {
    return { success: false, reason: validation.reason || 'invalid' };
  }

  await updateDoc(doc(db, 'employees', validation.employeeId), {
    pass: hashPassword(newPassword),
  });
  await updateDoc(doc(db, 'password_resets', validation.resetDocId), {
    used: true,
    usedAt: serverTimestamp(),
  });

  return { success: true };
}
