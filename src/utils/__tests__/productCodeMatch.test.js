import { describe, expect, it } from 'vitest';
import { classifyTextMatches, codeLikeTokens, describeMatchResult, pickBestStock, serialVariants } from '../productCodeMatch';

const item = (id, serial, name, wh, qty) => ({ id, serialNumber: serial, name, warehouseId: wh, quantity: qty });

describe('serialVariants / codeLikeTokens', () => {
  it('بيجرّب حالات الأحرف', () => {
    expect(serialVariants('ab-12')).toEqual(['ab-12', 'AB-12']);
    expect(serialVariants('')).toEqual([]);
  });
  it('بيطلع السيريال من وصف + كود', () => {
    expect(codeLikeTokens('الفرشة كبيرة -4403A')).toContain('4403A');
  });
});

describe('pickBestStock', () => {
  const docs = [item('1', 'S', 'x', 'b1', 0), item('2', 'S', 'x', 'main', 5), item('3', 'S', 'x', 'b2', 9)];
  it('يفضّل مخزن المستخدم لو فيه كمية، وإلا الرئيسي، وإلا أي مخزن فيه كمية', () => {
    expect(pickBestStock(docs, 'b2').id).toBe('3');
    expect(pickBestStock(docs, 'b1').id).toBe('2'); // b1 كميته صفر → الرئيسي
    expect(pickBestStock([item('1', 'S', 'x', 'b1', 0), item('3', 'S', 'x', 'b2', 9)], 'b1').id).toBe('3');
  });
  it('لو مفيش كمية في أي مخزن بيرجع نسخة مخزن المستخدم', () => {
    expect(pickBestStock([item('1', 'S', 'x', 'b1', 0), item('2', 'S', 'x', 'main', 0)], 'b1').id).toBe('1');
    expect(pickBestStock([], 'b1')).toBeNull();
  });
});

describe('classifyTextMatches (مفيش تخمين)', () => {
  const a = item('1', 'A-100', 'فرشة كبيرة', 'main', 3);
  const b = item('2', 'B-200', 'فرشة صغيرة', 'main', 3);
  it('تطابق تام بالاسم على صنف واحد', () => {
    expect(classifyTextMatches([a, b], 'فرشة كبيرة').status).toBe('exact');
  });
  it('جزء من الاسم ينطبق على صنفين → ambiguous (مش بيربط أي واحد)', () => {
    const r = classifyTextMatches([a, b], 'فرشة');
    expect(r.status).toBe('ambiguous');
    expect(r.item).toBeNull();
    expect(r.candidates).toHaveLength(2);
  });
  it('جزء من الاسم ينطبق على صنف واحد (والبحث مش مقصوص) → unique', () => {
    expect(classifyTextMatches([a, b], 'كبيرة').status).toBe('unique');
  });
  it('لو البحث اتقصّ بالحد، مفيش ربط تلقائي حتى لو ظاهر صنف واحد', () => {
    expect(classifyTextMatches([a], 'كبيرة', { truncated: true }).status).toBe('ambiguous');
  });
  it('كود قصير جداً مبيتخمّنش، ولا مرشحين → none', () => {
    expect(classifyTextMatches([a, b], 'ف').status).toBe('none');
    expect(classifyTextMatches([a], 'zzzz').status).toBe('none');
  });
  it('نفس الصنف في أكتر من مخزن = صنف واحد (بيختار نسخة فيها كمية)', () => {
    const a2 = item('9', 'A-100', 'فرشة كبيرة', 'b1', 7);
    const r = classifyTextMatches([a, a2], 'A-100', { myWarehouse: 'b1' });
    expect(r.status).toBe('exact');
    expect(r.item.id).toBe('9');
  });
  it('رسالة المرشحين', () => {
    expect(describeMatchResult({ status: 'ambiguous', candidates: [a, b] }, 'فرشة')).toContain('A-100');
  });
});
