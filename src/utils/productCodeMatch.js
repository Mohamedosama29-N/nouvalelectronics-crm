// منطق مطابقة "كود المنتج" (المربوط بكود العطل) مع أصناف المخزون.
// دوال نقية بدون Firebase عشان تتختبر. القاعدة: مفيش تخمين - لو مش متأكدين من
// صنف واحد بالظبط، بنرجّع "ambiguous" والمستخدم يختار بنفسه.

import { normalizeSearch } from './search';

// صيغ السيريال المحتملة (حالة الأحرف والمسافات)
export const serialVariants = (raw) => {
  const r = String(raw ?? '').trim();
  if (!r) return [];
  return [...new Set([r, r.toUpperCase(), r.toLowerCase(), r.replace(/\s+/g, '')])].filter(Boolean);
};

// كود المنتج ساعات بيبقى "وصف + سيريال" (مثلاً "الفرشة كبيرة -4403A"): نطلع الأجزاء
// اللي شكلها سيريال (فيها أرقام) وطولها 3+ ونجربها كتطابق تام
export const codeLikeTokens = (raw) => {
  const r = String(raw ?? '').trim();
  const found = r.match(/[A-Za-z0-9][A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*|\d[A-Za-z0-9._/-]*/g) || [];
  return [...new Set(found)].filter((t) => t.length >= 3 && t !== r);
};

// اختيار أنسب نسخة من نفس الصنف (نفس السيريال) عبر المخازن:
// مخزن المستخدم وفيه كمية > الرئيسي وفيه كمية > أي مخزن فيه كمية > نفس الترتيب بدون شرط الكمية
export const pickBestStock = (docs, myWarehouse = 'main') => {
  if (!docs || !docs.length) return null;
  const inStock = (d) => Number(d.quantity) > 0;
  return (
    docs.find((d) => d.warehouseId === myWarehouse && inStock(d)) ||
    docs.find((d) => d.warehouseId === 'main' && inStock(d)) ||
    docs.find(inStock) ||
    docs.find((d) => d.warehouseId === myWarehouse) ||
    docs.find((d) => d.warehouseId === 'main') ||
    docs[0]
  );
};

const groupBySerial = (docs) => {
  const m = new Map();
  docs.forEach((d) => {
    const k = d.serialNumber || d.id;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(d);
  });
  return [...m.values()];
};

// نتيجة المطابقة النصية (الاسم/السيريال) على مرشحين جايين من بحث الـ tokens
// - تطابق تام (اسم أو سيريال == الكود) على صنف واحد → exact
// - الكود جزء من اسم/سيريال صنف واحد فقط (والبحث مش مقصوص بالحد) → unique
// - غير كده → ambiguous (فيه مرشحين) أو none
export const classifyTextMatches = (candidates, rawCode, { truncated = false, myWarehouse = 'main' } = {}) => {
  const term = normalizeSearch(rawCode);
  const same = (v) => normalizeSearch(v || '') === term;
  const has = (v) => normalizeSearch(v || '').includes(term);

  const exact = groupBySerial(candidates.filter((d) => same(d.name) || same(d.serialNumber)));
  if (exact.length === 1) return { status: 'exact', item: pickBestStock(exact[0], myWarehouse), candidates: [] };
  if (exact.length > 1) return { status: 'ambiguous', item: null, candidates: exact.map((g) => g[0]) };

  if (term.length >= 4) {
    const containing = groupBySerial(candidates.filter((d) => has(d.name) || has(d.serialNumber)));
    if (containing.length === 1 && !truncated) return { status: 'unique', item: pickBestStock(containing[0], myWarehouse), candidates: [] };
    if (containing.length >= 1) return { status: 'ambiguous', item: null, candidates: containing.map((g) => g[0]) };
  }
  return { status: 'none', item: null, candidates: [] };
};

// نص موحّد لرسالة المستخدم
export const describeMatchResult = (result, code) => {
  if (result.status === 'ambiguous') {
    const names = result.candidates.slice(0, 4).map((c) => `${c.name || '-'} (${c.serialNumber || '-'})`).join('، ');
    return `كود المنتج "${code}" ينطبق على أكتر من صنف: ${names}. ابحث عن القطعة واختارها بنفسك.`;
  }
  return `كود المنتج "${code}" مش مطابق بشكل مؤكد لصنف في المخزون - ابحث عن القطعة يدويًا واختارها بنفسك`;
};
