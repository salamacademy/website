// Salam Academy service worker — caches app shell, network-first for pages
const CACHE = 'salam-v2';
const SHELL = ['./css/main.css','./css/portal.css','./css/register.css','./css/app.css','./images/logo-ar.png','./images/logo-en.png','./images/icon-192.png','./images/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // never cache Firebase/Upayment
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { if (ws.length) { const w = ws[0]; if (url) w.navigate(url); return w.focus(); } return clients.openWindow(url || './'); }));
});
