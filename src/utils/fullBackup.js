// 💾 (55) نسخة احتياطية كاملة كملف JSON على جهازك (مجاني — من غير Cloud Storage ولا Functions)
// + تذكير للأدمن لو عدّى وقت من غير نسخة.
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, startAfter } from 'firebase/firestore';
import { db } from '../firebase/config';

export const BACKUP_COLLECTIONS = [
  'settings', 'employees', 'warehouses', 'inventory', 'customers', 'transactions', 'tickets', 'returns', 'returnsWarehouse', 'transfers', 'expenses',
  'products', 'models', 'mainFaultCodes', 'subFaultCodes', 'tags', 'suppliers', 'purchaseOrders', 'stockCounts', 'cashShifts',
  'contactLogs', 'homeVisits', 'faultTemplates', 'partRequests', 'defectiveParts', 'warrantyClaims', 'serviceContracts', 'deviceRegistry',
  'centerSettlements', 'attendance', 'knowledgeBase', 'complaints', 'counters',
];

// Timestamps → { __ts: ISO } عشان الاستعادة تقدر ترجّعها تواريخ
export function serialize(v) {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v.toDate === 'function') return { __ts: v.toDate().toISOString() };
  if (v instanceof Date) return { __ts: v.toISOString() };
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === 'object') {
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 2) return { __geo: [v.latitude, v.longitude] };
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialize(x)]));
  }
  return v;
}

async function readAll(name, onPage) {
  const out = []; let last = null;
  for (;;) {
    const parts = [collection(db, name), orderBy('__name__'), limit(1000)];
    if (last) parts.splice(2, 0, startAfter(last));
    const s = await getDocs(query(...parts));
    s.docs.forEach((d) => out.push({ id: d.id, ...serialize(d.data()) }));
    onPage?.(out.length);
    if (s.size < 1000) break;
    last = s.docs[s.docs.length - 1];
  }
  return out;
}

export async function createFullBackup({ user, onProgress } = {}) {
  const data = {}; const counts = {}; const errors = [];
  for (let i = 0; i < BACKUP_COLLECTIONS.length; i += 1) {
    const name = BACKUP_COLLECTIONS[i];
    onProgress?.({ step: i + 1, total: BACKUP_COLLECTIONS.length, name, docs: 0 });
    try {
      data[name] = await readAll(name, (docs) => onProgress?.({ step: i + 1, total: BACKUP_COLLECTIONS.length, name, docs }));
      counts[name] = data[name].length;
    } catch (e) { errors.push({ name, code: e?.code || String(e) }); }
  }
  const at = new Date();
  const payload = { app: 'nouval-erp', version: 1, createdAt: at.toISOString(), createdBy: user?.name || '', counts, errors, data };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `nouval-backup-${at.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  const total = Object.values(counts).reduce((s, x) => s + x, 0);
  await setDoc(doc(db, 'settings', 'general'), { backupInfo: { lastAt: serverTimestamp(), lastBy: user?.name || '', docs: total, sizeKb: Math.round(blob.size / 1024), errors: errors.length } }, { merge: true });
  return { counts, errors, total, sizeKb: Math.round(blob.size / 1024) };
}

// تذكير: بيرجّع عدد الأيام من آخر نسخة لو عدّى الحد (افتراضي 7 أيام)
export function backupDue(systemSettings, now = new Date()) {
  const every = Number(systemSettings?.backupReminderDays) || 7;
  const raw = systemSettings?.backupInfo?.lastAt;
  const last = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
  if (!last || Number.isNaN(last.getTime())) return { due: true, days: null, every };
  const days = Math.floor((now - last) / 86400000);
  return { due: days >= every, days, every, last };
}
