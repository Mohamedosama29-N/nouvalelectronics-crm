// ⭐ (2) تقييم العميل المجاني — من غير Cloud Functions:
// مستند عام ticketRatings/{token} فيه رقم التذكرة والجهاز بس (من غير أي بيانات شخصية).
// العميل يقدر يكتب تقييمه مرة واحدة بس (القواعد بتمنع أي تعديل تاني)، والسيستم بينقل التقييم للتذكرة.
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { notify } from './notifications';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { toDate } from './liveStats';

export const RATING_KEYS = ['accessibility', 'maintenanceTime', 'centerDealing', 'deliveryProcedures'];

export async function ensureRatingDoc(ticket, token, { company = '' } = {}) {
  const ref = doc(db, 'ticketRatings', token);
  const s = await getDoc(ref);
  if (s.exists()) return false;
  await setDoc(ref, {
    ticketId: ticket.id, ticketNumber: ticket.ticketNumber || '', device: [ticket.device, ticket.deviceModel].filter(Boolean).join(' ').slice(0, 80),
    company: String(company || '').slice(0, 80), rated: false, synced: false, createdAt: serverTimestamp(),
  });
  return true;
}

export async function readRatingDoc(token) {
  if (!/^[a-f0-9]{16,64}$/.test(String(token || ''))) return null;
  const s = await getDoc(doc(db, 'ticketRatings', token));
  return s.exists() ? s.data() : null;
}

export const validRatings = (r) => RATING_KEYS.every((k) => Number.isInteger(r?.[k]) && r[k] >= 1 && r[k] <= 5);

export async function submitRating(token, { ratings, repurchase = '', comment = '' }) {
  if (!validRatings(ratings)) throw Object.assign(new Error('invalid'), { code: 'invalid' });
  await updateDoc(doc(db, 'ticketRatings', token), {
    rated: true, ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, ratings[k]])),
    repurchase: ['yes', 'no'].includes(repurchase) ? repurchase : '', comment: String(comment || '').trim().slice(0, 500), ratedAt: serverTimestamp(),
  });
}

export const ratingAverage = (r) => RATING_KEYS.reduce((s, k) => s + (Number(r?.[k]) || 0), 0) / RATING_KEYS.length;

// بينقل التقييمات الجديدة للتذاكر (customerRating) وبينبّه على التقييم الضعيف — بيشتغل وقت ما موظف يكون فاتح السيستم
export async function syncRatings() {
  const s = await getDocs(query(collection(db, 'ticketRatings'), where('rated', '==', true), where('synced', '==', false), limit(100)));
  let n = 0;
  for (const d of s.docs) {
    const r = d.data();
    try {
      await updateDoc(doc(db, 'tickets', r.ticketId), { customerRating: { ...r.ratings, repurchase: r.repurchase || '', comment: r.comment || '', ratedAt: r.ratedAt || serverTimestamp() }, updatedAt: serverTimestamp() });
      await updateDoc(d.ref, { synced: true });
      const avg = ratingAverage(r.ratings);
      if (avg <= 2.5) notify({ toRole: 'admin', title: `⭐ تقييم ضعيف (${avg.toFixed(1)}/5): ${r.ticketNumber}`, body: r.comment || 'العميل ماكتبش تعليق', view: 'tickets', intent: { kind: 'ticket', id: r.ticketId }, from: 'التقييمات' });
      n += 1;
    } catch (e) { console.warn('rating sync', e?.code || e); }
  }
  return n;
}

// مرة واحدة على الجهاز: روابط التقييم اللي اتبعتت قبل التحديث ده (التوكن على التذكرة ومالوش مستند)
export async function migrateOldRatingLinks(tickets = [], { now = new Date(), company = '' } = {}) {
  const cand = tickets.filter((t) => t.ratingToken && !t.customerRating && TICKET_TERMINAL_STATUSES.includes(t.status) && (now - (toDate(t.updatedAt) || now)) / 86400000 <= 60).slice(0, 150);
  let n = 0;
  for (const t of cand) { try { if (await ensureRatingDoc(t, t.ratingToken, { company })) n += 1; } catch { /* نكمّل */ } }
  return n;
}
