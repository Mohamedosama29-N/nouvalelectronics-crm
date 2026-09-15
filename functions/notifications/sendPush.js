import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

// ==========================================================================
// 📬 إرسال إشعار لموظف/موظفين معينين بالـ ID، أو لكل من عندهم دور معين
// ==========================================================================
export async function sendPushToEmployees({ employeeIds = [], roles = [], title, body, data = {} }) {
  const db = getFirestore();
  const messaging = getMessaging();

  let targetIds = [...employeeIds];

  if (roles.length > 0) {
    const snap = await db.collection('employees').where('role', 'in', roles).get();
    targetIds.push(...snap.docs.map((d) => d.id));
  }
  targetIds = [...new Set(targetIds)];
  if (targetIds.length === 0) return { sent: 0 };

  // نجيب كل التوكنز بتاعة الموظفين المستهدفين (كل موظف ممكن يكون عنده
  // أكتر من جهاز مسجل - راجع utils/messaging.js في الواجهة)
  const tokenSnaps = await Promise.all(
    targetIds.map((id) => db.collection('fcm_tokens').doc(id).get())
  );

  const tokens = [];
  tokenSnaps.forEach((snap) => {
    if (!snap.exists) return;
    const tokenMap = snap.data().tokens || {};
    tokens.push(...Object.keys(tokenMap));
  });

  if (tokens.length === 0) return { sent: 0 };

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });

  return { sent: response.successCount, failed: response.failureCount };
}
