// 🔒 قفل الفترات المحاسبية: أي سجل تاريخه قبل (أو في) تاريخ القفل مينفعش يتعدّل/يتحذف.
// تاريخ القفل بيتحدد في الإعدادات (accountingLockDate بصيغة YYYY-MM-DD).
// ملحوظة: ده حماية على مستوى الواجهة؛ الحماية على مستوى قواعد Firestore بتتفعّل مع الـ Auth migration.
import { toDate } from './liveStats';

export const parseLockDate = (lockDate) => {
  if (!lockDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(lockDate));
  if (!m) return null;
  // نهاية يوم القفل بالتوقيت المحلي
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const isDateLocked = (recordDate, lockDate) => {
  const lock = parseLockDate(lockDate);
  if (!lock) return false;
  const d = toDate(recordDate);
  if (!d) return false; // سجل بدون تاريخ مقروء (مثلاً serverTimestamp لسه معلّق) مش مقفول
  return d.getTime() <= lock.getTime();
};

export const LOCKED_MESSAGE = (lockDate) =>
  `الفترة المحاسبية مقفولة حتى ${lockDate}. لا يمكن تعديل أو حذف سجلات هذه الفترة.`;
