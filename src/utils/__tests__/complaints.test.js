import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {} }));
import { suggestComplaint, complaintState, escalationPatch, complaintStats, dueFrom } from '../../ai/complaints';

const now = new Date(2026, 10, 3, 12);
const H = 3600000;
describe('complaints', () => {
  it('suggests category & severity from text', () => {
    expect(suggestComplaint('بقالي أسبوعين مستني الغسالة ده نصب وهشتكي لحماية المستهلك')).toMatchObject({ category: 'delay', severity: 'critical', escalate: true });
    expect(suggestComplaint('الجهاز رجع تاني بنفس العطل')).toMatchObject({ category: 'quality' });
    expect(suggestComplaint('الموظف اتعامل بأسلوب وحش').category).toBe('staff');
  });
  it('overdue → escalate up to manager', () => {
    const c = { status: 'open', severity: 'high', level: 1, createdAt: new Date(now - 30 * H) };
    const st = complaintState(c, now);
    expect(st.overdue).toBe(true);
    expect(st.shouldEscalate).toBe(true);
    const p = escalationPatch(c, now);
    expect(p).toMatchObject({ level: 2, escalations: 1 });
    expect(p.dueAt - now).toBe(12 * H);
    expect(complaintState({ ...c, level: 3 }, now).shouldEscalate).toBe(false);
    expect(complaintState({ ...c, status: 'resolved' }, now).overdue).toBe(false);
    expect(dueFrom(now, 'critical') - now).toBe(4 * H);
  });
  it('stats', () => {
    const s = complaintStats([
      { status: 'open', severity: 'critical', category: 'delay', createdAt: new Date(now - 10 * H) },
      { status: 'resolved', severity: 'low', category: 'delay', createdAt: new Date(now - 10 * H), resolvedAt: new Date(now - 4 * H) },
    ], now);
    expect(s).toMatchObject({ total: 2, open: 1, overdue: 1, critical: 1, avgResolveHours: 6 });
    expect(s.byCategory[0]).toEqual(['delay', 2]);
  });
});
