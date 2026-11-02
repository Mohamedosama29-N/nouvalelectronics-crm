import { describe, it, expect } from 'vitest';
import { redactText, firstName, toLatinDigits } from '../../ai/redact';

describe('redact', () => {
  it('removes phones in many formats, emails and national ids', () => {
    const t = 'العميل رقمه 01012345678 و +20 101 234 5678 و ٠١١٢٣٤٥٦٧٨٩ وايميله a.b@x.com ورقمه القومي 29801011234567';
    const r = redactText(t);
    expect(r).not.toMatch(/0101234|1012345678|a\.b@x\.com|29801011234567|0112345/);
    expect(r).toContain('[تليفون]');
    expect(r).toContain('[إيميل]');
    expect(r).toContain('[رقم قومي]');
  });
  it('keeps short numbers like model codes and prices', () => {
    expect(redactText('شاشة 55 بوصة موديل UA55 السعر 1500')).toBe('شاشة 55 بوصة موديل UA55 السعر 1500');
  });
  it('first name only', () => {
    expect(firstName('  محمد أسامة علي ')).toBe('محمد');
    expect(firstName('')).toBe('');
  });
  it('arabic digits to latin', () => {
    expect(toLatinDigits('٢٠٢٦')).toBe('2026');
  });
});
