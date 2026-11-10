// 🛡️ حماية من حد القراءات اليومي (50,000 في الخطة المجانية):
// 1) «وضع التوفير»: لما الاستهلاك المشترك يعدّي 80% المرايا المحلية بتتحدث كل 10 دقايق بدل كل دقيقة،
//    وبنوقف فحوصات العدد، فيفضل جزء من الحصة للشغل الأساسي (البيع والتذاكر).
// 2) «وضع الحصة خلصت»: لو جوجل رجّع resource-exhausted، القراءات بتتقري من النسخة المحفوظة على الجهاز
//    بدل ما الشاشات تقع، وبنجرب السيرفر تاني كل 15 دقيقة لحد ما الحصة تتجدد (حوالي 10 الصبح بتوقيت مصر).
import { quotaDay } from './readMeter';

const KEY = 'erp_quota_state';
const RETRY_MS = 15 * 60000;
export const ECONOMY_AT = 0.8;

let st = null;
const load = () => {
  if (st && st.day === quotaDay()) return st;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); st = s && s.day === quotaDay() ? s : null; } catch { st = null; }
  if (!st) st = { day: quotaDay(), exhaustedAt: 0, usedPct: 0 };
  return st;
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* */ } };
const emit = () => { try { window.dispatchEvent(new CustomEvent('erp:quota', { detail: quotaStatus() })); } catch { /* */ } };

export const isQuotaError = (e) => e?.code === 'resource-exhausted' || /quota/i.test(String(e?.message || ''));

export function markExhausted() {
  const s = load();
  const first = !s.exhaustedAt;
  s.exhaustedAt = Date.now(); save();
  if (first) emit();
}

// true = متقراش من السيرفر دلوقتي (الحصة خلصت من أقل من ربع ساعة)
export function quotaBlocked() {
  const s = load();
  return !!s.exhaustedAt && Date.now() - s.exhaustedAt < RETRY_MS;
}

export function clearExhausted() { const s = load(); if (s.exhaustedAt) { s.exhaustedAt = 0; save(); emit(); } }

// بيتنده من أي مكان قرا الاستهلاك المشترك (usageDaily)
export function setSharedUsage(pct) {
  const s = load();
  const before = s.usedPct >= ECONOMY_AT;
  s.usedPct = Number(pct) || 0; save();
  if (before !== (s.usedPct >= ECONOMY_AT)) emit();
}

export const economyMode = () => { const s = load(); return !!s.exhaustedAt || s.usedPct >= ECONOMY_AT; };

export function quotaStatus() {
  const s = load();
  return { exhausted: !!s.exhaustedAt, economy: economyMode(), usedPct: s.usedPct };
}
