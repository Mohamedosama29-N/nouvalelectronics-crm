// 🔗 صفحة "تابع تذكرتك" من غير Cloud Functions:
// لكل تذكرة توكن عشوائي طويل (trackToken)، ونسخة "عامة" من بياناتها في
// ticketTracking/{token} فيها اللي العميل محتاج يشوفه بس (من غير تليفون/عنوان/ملاحظات داخلية).
// قواعد Firestore: أي حد يقدر يقرا مستند بالتوكن بتاعه (get) لكن مايقدرش يعمل list.
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TICKET_STATUSES, TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { firstName } from '../ai/redact';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function makeTrackToken(len = 24) {
  const bytes = new Uint8Array(len);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join('');
}

const label = (s) => TICKET_STATUSES.find((x) => x.value === s)?.label || s || '';
const iso = (v) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

// المراحل اللي بتظهر للعميل (مبسّطة)
export const PUBLIC_STEPS = [
  { key: 'received', label: 'استلمنا الجهاز', statuses: ['created', 'received_maintenance'] },
  { key: 'diagnosis', label: 'فحص وتشخيص', statuses: ['waiting_customer_approval_cost', 'customer_approved_cost', 'rejected_by_customer'] },
  { key: 'repair', label: 'جاري الإصلاح', statuses: ['maintenance_after_approval', 'waiting_spare_parts', 'spare_parts_unavailable', 'sent_to_factory', 'factory_maintenance_done', 'sent_from_factory', 'factory_rejected', 'shipped_asc', 'waiting_shipping_company'] },
  { key: 'ready', label: 'جاهز للاستلام', statuses: ['maintenance_done', 'financial_reviewed', 'material_reviewed', 'contacted_customer'] },
  { key: 'done', label: 'اتسلّم', statuses: ['delivered_to_customer', 'delivered_asc', 'closed', 'rejected_and_delivered', 'damaged_disposed'] },
];
export const stepIndexOf = (status) => Math.max(0, PUBLIC_STEPS.findIndex((s) => s.statuses.includes(status)));

export function buildPublicView(t, { centerName = '', company = '', companyPhone = '' } = {}) {
  const showMoney = ['waiting_customer_approval_cost', 'contacted_customer', 'customer_approved_cost'].includes(t.status);
  const cost = Number(t.totalCost) || Number(t.estimatedCost) || 0;
  const remaining = Number(t.remaining) || Math.max(0, cost - (Number(t.totalPaid) || 0));
  return {
    ticketNumber: t.ticketNumber || '',
    customerFirstName: firstName(t.customerName),
    device: [t.device, t.deviceModel].filter(Boolean).join(' '),
    status: t.status || 'created',
    statusLabel: label(t.status),
    step: stepIndexOf(t.status),
    closed: TICKET_TERMINAL_STATUSES.includes(t.status),
    history: (t.statusHistory || []).slice(-12).map((h) => ({ status: h.status, label: label(h.status), at: iso(h.timestamp) })),
    estimatedDuration: t.estimatedDuration || '',
    amount: showMoney && cost ? cost : null,
    remaining: showMoney && remaining ? remaining : null,
    warranty: t.warrantyStatus === 'in_warranty',
    centerName, company, companyPhone,
    createdAt: iso(t.createdAt),
    updatedAt: serverTimestamp(),
  };
}

export const trackUrlFor = (token) => `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(token)}`;

// بتتأكد إن للتذكرة توكن، وبتحدّث النسخة العامة. بترجّع التوكن.
export async function syncTracking(ticketId, ticket, opts = {}) {
  if (!ticketId || !ticket) return null;
  let token = ticket.trackToken;
  if (!token) {
    token = makeTrackToken();
    await updateDoc(doc(db, 'tickets', ticketId), { trackToken: token });
  }
  await setDoc(doc(db, 'ticketTracking', token), buildPublicView({ ...ticket, trackToken: token }, opts));
  return token;
}

// تحديث صامت (لو التذكرة عندها توكن بالفعل) — بعد تغيير الحالة مثلًا
export async function refreshTrackingIfAny(ticket, opts = {}) {
  if (!ticket?.trackToken) return;
  try { await setDoc(doc(db, 'ticketTracking', ticket.trackToken), buildPublicView(ticket, opts)); } catch (e) { console.warn('tracking sync failed', e?.code || e); }
}

export async function readTracking(token) {
  const snap = await getDoc(doc(db, 'ticketTracking', token));
  return snap.exists() ? snap.data() : null;
}
