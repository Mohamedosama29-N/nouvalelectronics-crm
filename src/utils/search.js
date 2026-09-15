export const normalizeSearch = (str) => {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
};

// ==========================================================================
// 🔎 FIX: بحث حقيقي بالكلمات (بدل مقارنة بادئة النص الكاملة اللي كانت
// بتفشل مع أي بحث غير أول كلمة في searchKey، زي السريال أو التصنيف)
// ==========================================================================
// يحوّل نص إلى مصفوفة كلمات فريدة مطبَّعة، تُخزَّن في Firestore كحقل
// searchTokens ويُستعلم عنها بـ array-contains-any بدل range query.

export const buildSearchTokens = (...parts) => {
  const text = normalizeSearch(parts.filter(Boolean).join(' '));
  if (!text) return [];
  return [...new Set(text.split(' ').filter(Boolean))];
};

// يحوّل نص البحث اللي كاتبه المستخدم إلى مصفوفة كلمات (بحد أقصى 10 لأن
// Firestore بيحدد array-contains-any بـ 10 قيم لكل استعلام).

export const buildQueryTokens = (searchText) => {
  const text = normalizeSearch(searchText);
  if (!text) return [];
  return [...new Set(text.split(' ').filter(Boolean))].slice(0, 10);
};

//------------------------------------------//
//دالة البحث  - serial//

export const normalizeSerial = (value) => {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase();
};
//--------------------------------------------//

// ==========================================================================
// 🛠️ FIX: أي قيمة بتتحط كـ Document ID في Firestore (زي serialNumber)
// ممكن تحتوي على "/" لو المستخدم كتب سريال بالشكل ده (مثلاً "14000/14006")،
// و"/" في مسار المستند بتتفسّر كفاصل بين segments، فبيبقى المسار غير صالح
// (لازم عدد الـ segments يكون زوجي) وبيفشل الـ commit بالكامل (كل الدفعة
// اللي هو جواها، مش بس الصنف ده). الحل: استبدال أي حرف مش مسموح بيه في
// Document ID (/ وأيضًا * [ ] وعلامات التحكم) بشرطة "-" قبل استخدامه كـ ID.

export const sanitizeDocId = (value) => {
  return (value || "")
    .toString()
    .trim()
    // eslint-disable-next-line no-control-regex -- إزالة رموز التحكم مقصودة هنا (Firestore document ID)
    .replace(/[/*[\]\x00-\x1F\x7F]/g, '-');
};

// ==========================================================================
// 🔎 FIX: البحث بـ array-contains-any بيقارن العنصر كامل بس (مطابقة تامة)،
// فلو المستخدم كتب جزء من السريال بس (زي "4005" بدل "44005C") مكنش بيلاقي
// حاجة رغم إن الصنف موجود فعليًا. الحل: نولّد كل الأجزاء الفرعية (substrings)
// لرقم السريال ونخزنها في searchTokens، عشان أي جزء يكتبه المستخدم يبقى
// عنصر موجود فعليًا في المصفوفة ويتطابق مع array-contains-any.
// ==========================================================================

export const buildSerialNgrams = (serial) => {
  const s = normalizeSerial(serial);
  if (!s) return [];
  const MIN_LEN = 2; // أقل طول لجزء يتقبل بالبحث (يمنع نتايج عشوائية بحرف واحد)
  const grams = new Set();
  for (let start = 0; start < s.length; start++) {
    for (let len = MIN_LEN; start + len <= s.length; len++) {
      grams.add(s.slice(start, start + len));
    }
  }
  return [...grams];
};

// بيبني مصفوفة searchTokens الكاملة لصنف مخزون: كلمات كاملة للاسم/التصنيف/
// التاجات (زي ما كان)، + كل الأجزاء الفرعية لرقم السريال عشان البحث الجزئي.

export const buildInventorySearchTokens = (name, serialNumber, category, ...tags) => {
  return [...new Set([
    ...buildSearchTokens(name, category, ...tags),
    ...buildSerialNgrams(serialNumber)
  ])];
};

// ✨ ميزة جديدة: توحيد رقم الهاتف قبل أي حفظ أو مطابقة، عشان نفس الرقم
// بصيغ مختلفة (مسافات، +20، 0020) ميتعاملش معاه كأنه أرقام مختلفة
// ويتسبب في عملاء مكررين.

export const normalizePhone = (value) => {
  if (!value) return '';
  let digits = String(value).replace(/\D/g, ''); // إزالة أي حرف غير رقم
  while (digits.startsWith('00')) digits = digits.slice(2); // إزالة بادئة الاتصال الدولي 00
  if (digits.startsWith('20') && digits.length === 12) {
    digits = '0' + digits.slice(2); // 201012345678 -> 01012345678
  }
  return digits;
};
