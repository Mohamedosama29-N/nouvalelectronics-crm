// 📝 (9) طلبات الصيانة من العملاء (صفحة حجز عامة — مجانية): العميل بيكتب طلبه، والكول سنتر بيحوّله تذكرة أو زيارة.
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizePhone } from './search';

export const REQUEST_KINDS = { center: 'هوديه المركز', visit: 'زيارة في البيت', inquiry: 'استفسار' };
export const REQUEST_STATUS = { new: 'جديد', contacted: 'اتكلمنا معاه', converted: 'اتحوّل', rejected: 'اترفض / مكرر' };
export const DEFAULT_DEVICES = ['غسالة', 'ثلاجة', 'تكييف', 'شاشة', 'بوتاجاز', 'سخان', 'ميكروويف', 'مكنسة', 'أخرى'];
const LIMIT_KEY = 'erp_booking_sent';

export function validateRequest(f) {
  const errors = [];
  const phone = normalizePhone(f.phone);
  if (String(f.name || '').trim().length < 2) errors.push('اكتب اسمك');
  if (!/^01[0125]\d{8}$/.test(phone)) errors.push('رقم الموبايل لازم يكون مصري 11 رقم (01xxxxxxxxx)');
  if (!f.device) errors.push('اختار نوع الجهاز');
  if (String(f.issue || '').trim().length < 5) errors.push('اوصف المشكلة في كلمتين');
  if (f.kind === 'visit' && String(f.address || '').trim().length < 5) errors.push('اكتب العنوان عشان الزيارة');
  return { ok: !errors.length, errors, phone };
}

// حماية بسيطة من السبام من غير أي خدمة مدفوعة: خانة مخفية + وقت ملء الفورم + حد في اليوم على الجهاز
export function spamCheck(f, startedAt, now = Date.now()) {
  if (f.website) return 'bot';
  if (now - startedAt < 3000) return 'too-fast';
  try {
    const s = JSON.parse(localStorage.getItem(LIMIT_KEY) || '[]').filter((t) => now - t < 86400000);
    if (s.length >= 3) return 'limit';
  } catch { /* */ }
  return null;
}
const markSent = () => { try { const s = JSON.parse(localStorage.getItem(LIMIT_KEY) || '[]'); s.push(Date.now()); localStorage.setItem(LIMIT_KEY, JSON.stringify(s.slice(-10))); } catch { /* */ } };

export async function submitServiceRequest(f) {
  const v = validateRequest(f);
  if (!v.ok) throw Object.assign(new Error('invalid'), { code: 'invalid', errors: v.errors });
  const clip = (x, n) => String(x || '').trim().slice(0, n);
  const ref = await addDoc(collection(db, 'serviceRequests'), {
    name: clip(f.name, 80), phone: v.phone, governorate: clip(f.governorate, 40), city: clip(f.city, 60), address: clip(f.address, 200),
    device: clip(f.device, 40), brand: clip(f.brand, 40), issue: clip(f.issue, 600), kind: ['center', 'visit', 'inquiry'].includes(f.kind) ? f.kind : 'center',
    preferredDate: /^\d{4}-\d{2}-\d{2}$/.test(f.preferredDate || '') ? f.preferredDate : '', source: clip(f.source, 30) || 'web',
    status: 'new', createdAt: serverTimestamp(),
  });
  markSent();
  return { id: ref.id, code: ref.id.slice(0, 6).toUpperCase() };
}

// إعدادات الصفحة العامة (مستند عام: ممنوع فيه أي بيانات حساسة)
export async function readBookingConfig() {
  const s = await getDoc(doc(db, 'publicConfig', 'booking'));
  return s.exists() ? s.data() : { enabled: false };
}
export async function saveBookingConfig(cfg) {
  const clean = { enabled: !!cfg.enabled, storeName: String(cfg.storeName || '').slice(0, 80), phone: String(cfg.phone || '').slice(0, 30), devices: (cfg.devices || DEFAULT_DEVICES).slice(0, 20), visits: cfg.visits !== false, note: String(cfg.note || '').slice(0, 300), updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'publicConfig', 'booking'), clean, { merge: true });
  return clean;
}
export const bookingUrl = (source = '') => `${typeof window !== 'undefined' ? window.location.origin : ''}/?book=1${source ? `&src=${encodeURIComponent(source)}` : ''}`;
