import { describe, it, expect } from 'vitest';
import {
  normalizeSearch,
  buildSearchTokens,
  buildQueryTokens,
  normalizeSerial,
  sanitizeDocId,
  buildSerialNgrams,
  buildInventorySearchTokens,
  normalizePhone,
} from '../search';

describe('normalizeSearch', () => {
  it('يرجع نص فاضي لو المدخل فاضي', () => {
    expect(normalizeSearch('')).toBe('');
    expect(normalizeSearch(null)).toBe('');
    expect(normalizeSearch(undefined)).toBe('');
  });

  it('يحوّل لحروف صغيرة ويشيل المسافات الزيادة', () => {
    expect(normalizeSearch('  Hello   World  ')).toBe('hello world');
  });
});

describe('buildSearchTokens', () => {
  it('يبني كلمات فريدة من أكتر من جزء نص', () => {
    const tokens = buildSearchTokens('Samsung Galaxy', 'موبايلات', 'samsung');
    expect(tokens).toContain('samsung');
    expect(tokens).toContain('galaxy');
    expect(tokens).toContain('موبايلات');
    // مفيش تكرار لكلمة samsung حتى لو اتكررت في أكتر من جزء
    expect(tokens.filter((t) => t === 'samsung')).toHaveLength(1);
  });

  it('يتجاهل الأجزاء الفاضية/undefined', () => {
    expect(buildSearchTokens('', null, undefined)).toEqual([]);
  });
});

describe('buildQueryTokens', () => {
  it('محدود بحد أقصى 10 كلمات (حد Firestore array-contains-any)', () => {
    const longText = Array.from({ length: 15 }, (_, i) => `word${i}`).join(' ');
    expect(buildQueryTokens(longText)).toHaveLength(10);
  });
});

describe('normalizeSerial', () => {
  it('يشيل المسافات ويحوّل لحروف صغيرة', () => {
    expect(normalizeSerial('  ABC123  ')).toBe('abc123');
  });
  it('يرجع نص فاضي للقيم الفاضية', () => {
    expect(normalizeSerial(null)).toBe('');
  });
});

describe('sanitizeDocId', () => {
  it('يستبدل الرموز غير المسموحة في Firestore document ID بشرطة', () => {
    expect(sanitizeDocId('14000/14006')).toBe('14000-14006');
    expect(sanitizeDocId('a*b[c]d')).toBe('a-b-c-d');
  });
  it('من غير الرموز الممنوعة، النص يفضل زي ما هو', () => {
    expect(sanitizeDocId('ABC123')).toBe('ABC123');
  });
});

describe('buildSerialNgrams', () => {
  it('يبني كل الأجزاء الفرعية بطول 2 فأكتر', () => {
    const grams = buildSerialNgrams('abc');
    // ab, bc, abc (مفيش أجزاء بطول 1)
    expect(grams).toEqual(expect.arrayContaining(['ab', 'bc', 'abc']));
    expect(grams).not.toContain('a');
    expect(grams).not.toContain('b');
  });
  it('يرجع مصفوفة فاضية لسريال فاضي', () => {
    expect(buildSerialNgrams('')).toEqual([]);
  });
});

describe('buildInventorySearchTokens', () => {
  it('يدمج كلمات الاسم/التصنيف/التاجات مع أجزاء السريال', () => {
    const tokens = buildInventorySearchTokens('Samsung TV', '44005C', 'الكترونيات', 'جديد');
    expect(tokens).toContain('samsung');
    expect(tokens).toContain('الكترونيات');
    expect(tokens).toContain('جديد');
    expect(tokens).toContain('44'); // جزء من السريال
  });
});

describe('normalizePhone', () => {
  it('يشيل أي حرف مش رقم', () => {
    expect(normalizePhone('010 123 4567')).toBe('0101234567');
  });
  it('يشيل بادئة 00 الدولية', () => {
    expect(normalizePhone('0020101234567')).toBe(normalizePhone('20101234567'));
  });
  it('يحوّل صيغة 20xxxxxxxxxx لصفر محلي', () => {
    expect(normalizePhone('201012345678')).toBe('01012345678');
  });
  it('يرجع نص فاضي للقيمة الفاضية', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});
