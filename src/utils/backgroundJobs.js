// ⏱️ مهام خفيفة بتشتغل في الخلفية لما موظف يفتح السيستم (بدل Cloud Functions المدفوعة)
// — كل مهمة ليها فاصل زمني عشان متاكلش من حصة القراءات المجانية.
import { syncRatings, migrateOldRatingLinks } from './ticketRating';

const due = (key, minutes) => {
  try {
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < minutes * 60000) return false;
    localStorage.setItem(key, String(Date.now()));
    return true;
  } catch { return true; }
};

export async function runBackgroundJobs(appUser, systemSettings) {
  if (!appUser) return;
  const out = {};
  if (due('job_syncRatings', 10)) { try { out.ratings = await syncRatings(); } catch (e) { console.warn('syncRatings', e?.code || e); } }
  if (appUser.role === 'admin' && due('job_migrateRatingLinks_v1', 60 * 24 * 365)) {
    try {
      const { loadRecentTickets } = await import('../ai/ticketPool');
      out.migrated = await migrateOldRatingLinks(await loadRecentTickets(800), { company: systemSettings?.storeName || '' });
    } catch (e) { console.warn('migrateRatingLinks', e?.code || e); }
  }
  return out;
}
