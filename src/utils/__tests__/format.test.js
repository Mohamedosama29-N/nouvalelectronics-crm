import { describe, it, expect } from 'vitest';
import { formatDate, formatDateOnly, getCurrentTimeHHMM } from '../format';

describe('formatDate', () => {
  it("يرجع '-' للقيمة الفاضية", () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('')).toBe('-');
  });

  it('يتعامل مع كائن Firestore Timestamp (له toDate)', () => {
    const fakeTimestamp = { toDate: () => new Date('2026-01-15T10:30:00') };
    const result = formatDate(fakeTimestamp);
    expect(result).not.toBe('-');
    expect(typeof result).toBe('string');
  });

  it('يتعامل مع كائن Date عادي', () => {
    const result = formatDate(new Date('2026-01-15T10:30:00'));
    expect(result).not.toBe('-');
  });

  it('قيمة مش قابلة للتحويل لتاريخ بترجع "Invalid Date" (مش بترمي استثناء)', () => {
    // ملحوظة: new Date(كائن غريب) في JS مبيرميش خطأ، هو بيرجع كائن
    // "Invalid Date"، و toLocaleString() عليه بترجع النص ده كنص عادي -
    // يعني الـ catch جوه formatDate عمليًا مبيتفعّلش في الحالة دي.
    // ده حاليًا مش بيسبب مشكلة عملية لأن قيم Firestore دايمًا صحيحة، لكنه
    // فرق طفيف عن الرسالة المتوقعة "-" يستاهل مراجعة لو حبيت تشدد التحقق.
    expect(formatDate({ weird: true })).toBe('Invalid Date');
  });
});

describe('formatDateOnly', () => {
  it("يرجع '-' للقيمة الفاضية", () => {
    expect(formatDateOnly(null)).toBe('-');
    expect(formatDateOnly('')).toBe('-');
  });

  it('يفسّر تاريخ YYYY-MM-DD كتاريخ محلي بدون تحويل UTC (بدون وقت وهمي)', () => {
    // نفس التاريخ لازم يطلع بنفس اليوم بغض النظر عن التوقيت المحلي
    // لأن الدالة بتبني التاريخ من أجزاء السنة/الشهر/اليوم مباشرة
    const d = new Date(2026, 0, 15); // 15 يناير 2026 محليًا
    const expected = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    expect(formatDateOnly('2026-01-15')).toBe(expected);
  });
});

describe('getCurrentTimeHHMM', () => {
  it('يرجع نص بصيغة HH:MM', () => {
    const result = getCurrentTimeHHMM();
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});
