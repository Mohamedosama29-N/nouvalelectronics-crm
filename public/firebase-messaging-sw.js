// public/firebase-messaging-sw.js

// إعطاء service worker صلاحية الوصول لـ Firebase Messaging
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// تهيئة Firebase في service worker
firebase.initializeApp({
  apiKey: "AIzaSyBrRvCAWdC_SOjBqSFPXyav-3ifE80UoLU",
  authDomain: "nouval-system.firebaseapp.com",
  projectId: "nouval-system",
  storageBucket: "nouval-system.firebasestorage.app",
  messagingSenderId: "194279959532",
  appId: "1:194279959532:web:578f5894f58102d4872ec9"
});

const messaging = firebase.messaging();

// معالجة الإشعارات في الخلفية (لما التطبيق مش مفتوح)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // تخصيص الإشعار
  const notificationTitle = payload.notification?.title || 'إشعار جديد';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'لديك إشعار جديد',
    icon: '/logo192.png', // غيرها حسب شعارك
    badge: '/favicon.ico',
    data: payload.data,
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'فتح'
      },
      {
        action: 'close',
        title: 'إغلاق'
      }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// معالجة الضغط على الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  // فتح التطبيق عند الضغط على الإشعار
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});