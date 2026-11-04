// 🔔 إشعارات داخلية (مجانية — من غير Cloud Functions): مستند في notifications
// بيظهر في جرس الهيدر للمستخدم/الفني/الدور/المركز المقصود.
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { buildNotification } from '../ai/staff';

export async function notify(opts) {
  const n = buildNotification(opts);
  if (!n) return;
  try { await addDoc(collection(db, 'notifications'), { ...n, createdAt: serverTimestamp() }); }
  catch (e) { console.warn('notify failed', e?.code || e); }
}
