import { describe, it, expect, vi } from 'vitest';
vi.mock('../../firebase/config', () => ({ db: {}, firebaseApp: {} }));
import { attendanceInfo, attendanceSummary, groupVisitsByDay, mapsLink, visitConflicts, matchTemplate, buildNotification, isUnread, ymd } from '../../ai/staff';

const at = (h, m) => new Date(2026, 10, 3, h, m);
describe('staff', () => {
  it('attendance late (after grace) and worked minutes', () => {
    expect(attendanceInfo({ checkIn: at(9, 10), checkOut: at(17, 0) })).toMatchObject({ late: 0, workedMin: 470, open: false });
    expect(attendanceInfo({ checkIn: at(9, 40) }).late).toBe(40);
    expect(attendanceInfo({ checkIn: at(9, 40) }).open).toBe(true);
    const s = attendanceSummary([{ userId: 'a', name: 'سامي', checkIn: at(9, 40), checkOut: at(17, 0) }, { userId: 'a', name: 'سامي', checkIn: at(8, 55) }, { userId: 'b', name: 'علي', checkIn: at(9, 0), checkOut: at(13, 0) }]);
    expect(s[0]).toMatchObject({ name: 'سامي', days: 2, lateDays: 1, lateMin: 40, missingOut: 1 });
  });
  it('visits by day, maps link and conflicts', () => {
    const from = new Date(2026, 10, 3);
    const v = [{ id: '1', date: '2026-11-03', slot: '3-6 العصر', technician: 'سامي' }, { id: '2', date: '2026-11-03', slot: '9-12 الصبح', technician: 'سامي' }, { id: '3', date: '2026-11-04', status: 'cancelled' }];
    const g = groupVisitsByDay(v, { days: 2, from });
    expect(g[0].visits.map((x) => x.id)).toEqual(['2', '1']);
    expect(g[1].visits).toEqual([]);
    expect(mapsLink({ address: 'شارع التحرير', city: 'الدقي' })).toContain('google.com/maps');
    expect(mapsLink({})).toBeNull();
    expect(visitConflicts(v, { id: 'x', date: '2026-11-03', slot: '3-6 العصر', technician: 'سامي' }).length).toBe(1);
  });
  it('fault template matching: model+code first, then generic', () => {
    const t = [{ model: '', faultCode: 'F1', cost: 300 }, { model: 'UA55', faultCode: 'F1', cost: 500 }, { model: 'UA65', faultCode: 'F2', cost: 1 }];
    expect(matchTemplate(t, { deviceModel: 'UA55', mainFaultCode: 'F1' }).cost).toBe(500);
    expect(matchTemplate(t, { deviceModel: 'X', mainFaultCode: 'F1' }).cost).toBe(300);
    expect(matchTemplate(t, { deviceModel: 'UA55', mainFaultCode: 'F9' })).toBeNull();
  });
  it('notifications', () => {
    expect(buildNotification({ title: 'x' })).toBeNull();
    const n = buildNotification({ toName: 'سامي', title: 'تذكرة جديدة', view: 'my_tickets' });
    expect(n.link).toEqual({ view: 'my_tickets', intent: null });
    expect(isUnread(n, 'u1')).toBe(true);
    expect(isUnread({ readBy: ['u1'] }, 'u1')).toBe(false);
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
