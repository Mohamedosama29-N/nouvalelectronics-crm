// 📱 (8) الكتابة وقت ما النت ضعيف/مقطوع: Firestore بيحفظ التعديل على الجهاز فورًا، بس الـ Promise
// مابيخلصش غير لما السيرفر يستلم. بدل ما الشاشة تفضل "بتحمّل"، بنستنى ثواني وبعدها بنعتبره "متسجل على الجهاز".
const pending = new Set();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(pending.size); } catch { /* */ } });
export const pendingCount = () => pending.size;
export const onPending = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function writeOrQueue(promise, { waitMs = 4000 } = {}) {
  const token = {};
  pending.add(token); emit();
  promise.finally(() => { pending.delete(token); emit(); }).catch(() => {});
  return Promise.race([
    promise.then(() => ({ queued: false })),
    new Promise((resolve) => { setTimeout(() => resolve({ queued: true }), typeof navigator !== 'undefined' && navigator.onLine === false ? 300 : waitMs); }),
  ]);
}
