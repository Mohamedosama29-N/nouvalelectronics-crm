import CryptoJS from 'crypto-js';

// 🛠️ FIX (أمان): اتشالت القيمة الافتراضية الثابتة للمفتاح. لو
// VITE_ENCRYPTION_KEY مش مضبوط، التطبيق بيرفض يشتغل (يشوف firebase/config.js)
// بدل ما يشفّر بيانات المستخدمين بمفتاح معروف وموجود في السورس كود المنشور.
const SECRET_KEY = import.meta.env.VITE_ENCRYPTION_KEY;
if (!SECRET_KEY) {
  throw new Error('VITE_ENCRYPTION_KEY غير مضبوط في متغيرات البيئة.');
}

export const encrypt = (data) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

export const decrypt = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch {
    return null;
  }
};

export const saveSecurely = (key, data) => {
  localStorage.setItem(key, encrypt(data));
};

export const loadSecurely = (key) => {
  const encrypted = localStorage.getItem(key);
  return encrypted ? decrypt(encrypted) : null;
};

// ==========================================================================
// 🔐 تشفير كلمات المرور (نقطة #1)
// ==========================================================================
// 🛠️ FIX: كلمات المرور كانت متخزنة ومقارنة نص عادي (plain text) في
// مستندات الموظفين على Firestore، يعني أي حد عنده صلاحية عرض المستخدمين
// (أو وصول لـ Firebase Console) يقدر يشوف باسورد أي موظف كتابةً واضحة.
// دلوقتي بنستخدم SHA-256 + "pepper" ثابت قبل التخزين والمقارنة، فمفيش
// أي مكان في النظام بيتعامل مع الباسورد الحقيقي كنص واضح بعد أول حفظ.
// ملحوظة: التجزئة (hashing) في المتصفح مش بديل كامل عن Firebase
// Authentication الحقيقي (تفتقد حماية زي rate-limiting على مستوى
// السيرفر)، لكنها بتمنع فعليًا تسريب الباسوردات الحقيقية من قاعدة
// البيانات نفسها، وهي تحسين جوهري بدون تغيير نظام الدخول بالكامل.

const PASSWORD_PEPPER = 'nouval-erp-pw-v1::';

export const hashPassword = (plainPassword) => {
  return CryptoJS.SHA256(PASSWORD_PEPPER + String(plainPassword)).toString();
};
// تجزئات SHA-256 دايمًا 64 حرف hex؛ بنستخدم الشكل ده للتفرقة بين
// حساب قديم لسه متخزن نص عادي وحساب اتحوّل بالفعل للتجزئة

export const isHashedPassword = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));

// يتحقق من تطابق الباسورد المُدخل مع القيمة المخزنة، مع دعم "ترحيل
// تلقائي": لو الحساب لسه بباسورد قديم نص عادي ونجح تسجيل الدخول، بيرجع
// upgraded:true عشان نقدر نحدّث القيمة المخزنة إلى نسخة مُجزّأة فورًا.

export const verifyPassword = (plainPassword, storedValue) => {
  if (isHashedPassword(storedValue)) {
    return { valid: hashPassword(plainPassword) === storedValue, upgraded: false };
  }
  // حساب قديم لسه بباسورد نص عادي (قبل هذا التحديث)
  const valid = String(storedValue || '') === String(plainPassword);
  return { valid, upgraded: valid };
};

// ==========================================================================
// 🎯 SWEETALERT2 HELPER FUNCTIONS
// ==========================================================================
