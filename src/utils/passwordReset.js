import { callFunction } from './authSession';

// 🛠️ كل عمليات استعادة كلمة السر بتتم دلوقتي في Cloud Functions (من غير
// تسجيل دخول): السيرفر هو اللي بيعمل التوكن ويبعت الإيميل ويغيّر الباسورد،
// فمفيش حاجة من employees/password_resets محتاجة تتفتح للزوار.

// بيرجع success:true دايمًا (حتى لو الإيميل مش موجود) عشان محدش يكتشف إيميلات مسجلة.
export async function requestPasswordReset(email, { appBaseUrl } = {}) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return { success: false, reason: 'invalid_email' };
  const baseUrl = appBaseUrl || `${window.location.origin}${window.location.pathname}`;
  return callFunction('requestPasswordReset', { email: normalizedEmail, baseUrl });
}

export async function validateResetToken(token) {
  if (!token) return { valid: false };
  try {
    return await callFunction('validateResetToken', { token });
  } catch {
    return { valid: false };
  }
}

export async function resetPasswordWithToken(token, newPassword) {
  return callFunction('confirmPasswordReset', { token, newPassword });
}
