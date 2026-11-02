// 🔒 إخفاء البيانات الشخصية قبل ما أي نص يتبعت لخدمة الذكاء الاصطناعي.
// الطبقة المجانية من Gemini ممكن جوجل تستخدم بياناتها لتحسين منتجاتها،
// فمبنبعتش أرقام تليفونات أو إيميلات أو أرقام قومية أو أسماء كاملة أبدًا.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toLatinDigits = (s) =>
  String(s ?? '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

export const redactText = (text) => {
  if (!text) return '';
  let s = toLatinDigits(text);
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[إيميل]');
  // رقم قومي مصري (14 رقم) قبل التليفونات عشان ميتقطعش
  s = s.replace(/\b[23]\d{13}\b/g, '[رقم قومي]');
  // تليفونات: موبايل مصري بصيغه المختلفة، أو أي تسلسل 8+ أرقام (مع مسافات/شرط)
  s = s.replace(/(?:\+?20|0020)?\s*0?1[0125][\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[تليفون]');
  s = s.replace(/\b\d[\d\s-]{7,}\d\b/g, (m) => (m.replace(/\D/g, '').length >= 8 ? '[رقم]' : m));
  return s;
};

// الاسم الأول بس (لرسائل العملاء) — من غير اسم العيلة
export const firstName = (fullName) => {
  const n = String(fullName || '').trim().split(/\s+/)[0] || '';
  return n.length > 20 ? n.slice(0, 20) : n;
};
