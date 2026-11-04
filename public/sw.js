/* 📱 Service Worker بتاع نوڤال: بيخلّي السيستم يفتح حتى من غير نت (الملفات بتتحفظ على الجهاز).
   البيانات نفسها بيحفظها Firestore في الكاش بتاعه — الملف ده للواجهة بس. */
const VERSION = 'nouval-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/logo192.png', '/logo512.png', '/favicon.ico'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('nouval-shell-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase وجوجل: من غير تدخل
  // صفحات التطبيق: من النت الأول، ولو مفيش نت آخر نسخة محفوظة
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); return r; }).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))));
    return;
  }
  // ملفات البناء (أسماءها فيها hash فمبتتغيرش): من الكاش الأول
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })));
  }
});
