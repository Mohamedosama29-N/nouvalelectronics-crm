// 🕓 (56) سجل التعديلات مع التراجع: بنسجّل قيمة كل حقل قبل وبعد، وأي تعديل ممكن يترجع
// بعد التأكد إن الحقل محدش غيّره من ساعتها (لو اتغيّر بنحذّر وما بنكتبش فوقه).
import { addDoc, collection, deleteField, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const SKIP = new Set(['updatedAt', 'createdAt', 'searchKey', 'searchTokens', 'history', 'statusHistory', 'log', 'lastLogin']);

// تحويل أي قيمة لشكل نقدر نخزّنه ونقارنه (Timestamps → ISO، undefined → null)
export function plain(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (v._methodName || v.constructor?.name === 'FieldValue') return '__sentinel__';
  if (Array.isArray(v)) return v.map(plain);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
}
const same = (a, b) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));

export function diffFields(before = {}, patch = {}) {
  return Object.keys(patch)
    .filter((k) => !SKIP.has(k) && plain(patch[k]) !== '__sentinel__' && !same(before?.[k], patch[k]))
    .map((field) => {
      const b = plain(before?.[field]) ?? null; const a = plain(patch[field]) ?? null;
      // القيم الضخمة (زي اللوجو) بنسجّل إنها اتغيرت بس، ومينفعش التراجع عنها
      const big = JSON.stringify(b).length + JSON.stringify(a).length > 6000;
      return { field, before: big ? '[قيمة كبيرة]' : b, after: big ? '[قيمة كبيرة]' : a, big, hadField: before ? Object.prototype.hasOwnProperty.call(before, field) : false };
    });
}

// بتتنادي بعد ما التعديل ينجح — لو مفيش تغيير فعلي مش بتسجّل حاجة
export async function recordAudit({ coll, docId, label = '', before, patch, user }) {
  const changes = diffFields(before, patch);
  if (!changes.length || !docId) return null;
  try {
    const ref = await addDoc(collection(db, 'auditTrail'), {
      coll, docId, label: String(label).slice(0, 140), changes: changes.slice(0, 40),
      by: user?.name || user?.email || '', byId: user?.id || '', at: serverTimestamp(), reverted: false,
    });
    return ref.id;
  } catch (e) { console.warn('audit', e?.code || e); return null; }
}

// بيقارن القيمة الحالية بالقيمة اللي اتكتبت وقت التعديل
export function revertPlan(entry, current = {}) {
  const ok = []; const conflicts = [];
  (entry.changes || []).forEach((c) => {
    if (c.big) { conflicts.push({ ...c, now: '[قيمة كبيرة]', locked: true }); return; }
    if (same(current[c.field], c.after) || (c.after === null && current[c.field] === undefined)) ok.push(c);
    else conflicts.push({ ...c, now: plain(current[c.field]) ?? null });
  });
  return { ok, conflicts };
}

export async function revertAudit(entry, user, { force = false } = {}) {
  const ref = doc(db, entry.coll, entry.docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw Object.assign(new Error('gone'), { code: 'gone' });
  const current = snap.data();
  const plan = revertPlan(entry, current);
  const apply = force ? [...plan.ok, ...plan.conflicts.filter((c) => !c.locked)] : plan.ok;
  if (!apply.length) return { applied: 0, conflicts: plan.conflicts };
  const patch = {};
  apply.forEach((c) => { patch[c.field] = c.hadField ? c.before : deleteField(); });
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  await updateDoc(doc(db, 'auditTrail', entry.id), { reverted: true, revertedBy: user?.name || '', revertedAt: serverTimestamp() });
  await recordAudit({ coll: entry.coll, docId: entry.docId, label: `تراجع عن: ${entry.label || ''}`, before: current, patch: Object.fromEntries(apply.map((c) => [c.field, c.before])), user });
  return { applied: apply.length, conflicts: force ? [] : plan.conflicts };
}

export const COLL_LABELS = { tickets: 'تذكرة', inventory: 'صنف مخزون', customers: 'عميل', employees: 'موظف', settings: 'الإعدادات' };
export const FIELD_LABELS = {
  status: 'الحالة', price: 'السعر', quantity: 'الكمية', cost: 'التكلفة', avgCost: 'متوسط التكلفة', name: 'الاسم', customerName: 'اسم العميل', customerPhone: 'الموبايل',
  phone: 'الموبايل', address: 'العنوان', permissions: 'الصلاحيات', limits: 'الحدود', role: 'الدور', isDisabled: 'موقوف', assignedTechnician: 'الفني', assignedMaintenanceCenter: 'مركز الصيانة',
  estimatedCost: 'التكلفة المتوقعة', totalCost: 'التكلفة', issue: 'المشكلة', priority: 'الأولوية', minStock: 'حد الطلب', category: 'التصنيف', notes: 'ملاحظات', isDeleted: 'محذوف',
  warrantyStatus: 'حالة الضمان', deviceSerial: 'السيريال', device: 'الجهاز', deviceModel: 'الموديل', governorate: 'المحافظة',
};
