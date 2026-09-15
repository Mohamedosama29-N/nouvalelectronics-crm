import {
  doc, serverTimestamp, setDoc
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, messaging } from '../firebase/config';
import { getUserAgent } from './network';

// 🛠️ FIX: كانت التوكنز بتتخزن تحت auth.currentUser.uid، وهو الـ UID بتاع
// تسجيل الدخول المجهول (signInAnonymously) لأي زائر، مش هوية الموظف الفعلي
// في نظام تسجيل الدخول المخصص بتاع التطبيق. ده معناه إنه مستحيل نستهدف
// إشعار لموظف/دور معين لاحقًا (كل التوكنز مجمّعة تحت UIDs عشوائية مالهاش
// علاقة بالأدوار). دلوقتي بتتخزن تحت employeeId الحقيقي بتاع الموظف.
export const requestNotificationPermission = async (employeeId) => {
  if (!employeeId) return null;
  try {
    if (!('Notification' in window) || !messaging) return null;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_VAPID_KEY || ''
      });

      if (token) {
        await setDoc(doc(db, 'fcm_tokens', employeeId), {
          tokens: { [token]: { device: getUserAgent(), updatedAt: serverTimestamp() } },
        }, { merge: true });
      }

      return token;
    }
  } catch (error) {
    console.error('Notification permission error:', error);
  }
  return null;
};

export const onMessageListener = () => 
  new Promise((resolve) => {
    if (messaging) {
      onMessage(messaging, (payload) => {
        resolve(payload);
      });
    }
  });

// ==========================================================================
// 🎹 اختصارات لوحة المفاتيح
// ==========================================================================
