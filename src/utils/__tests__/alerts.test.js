import { describe, expect, it, vi } from 'vitest';

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn() } }));
const { friendlyMessage } = await import('../alerts');

describe('friendlyMessage (إخفاء رسائل Firebase التقنية)', () => {
  it('بيخفي لينك إنشاء Index ويحافظ على بداية الرسالة العربي', () => {
    const raw = 'فشل جلب التذاكر: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc';
    const out = friendlyMessage(raw);
    expect(out).not.toContain('http');
    expect(out).not.toContain('index. You');
    expect(out.startsWith('فشل جلب التذاكر: ')).toBe(true);
  });
  it('الصلاحيات والاتصال', () => {
    expect(friendlyMessage('Missing or insufficient permissions.')).toContain('صلاحية');
    expect(friendlyMessage('Failed to get document because the client is offline.')).toContain('الاتصال');
  });
  it('رسائل عربي عادية بتفضل زي ما هي، واللينكات بتتشال', () => {
    expect(friendlyMessage('الكمية غير كافية')).toBe('الكمية غير كافية');
    expect(friendlyMessage('تفاصيل https://example.com/x كمان')).toBe('تفاصيل كمان');
  });
  it('إنجليزي تقني طويل بيتحول لرسالة عامة', () => {
    expect(friendlyMessage('FirebaseError: Firebase: Error (auth/internal-error).')).toContain('خطأ غير متوقع');
  });
});
