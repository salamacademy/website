// FCM background handler (push when app is closed). Requires FCM_VAPID_KEY + Cloud Function sender.
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyBMv-AIUyCGiLiXzuXEm80HMqaI4gjnnyI",
  authDomain: "salam-5e6f2.firebaseapp.com",
  projectId: "salam-5e6f2",
  storageBucket: "salam-5e6f2.firebasestorage.app",
  messagingSenderId: "482437951824",
  appId: "1:482437951824:web:626e3984b0d212fdf5fc55"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  self.registration.showNotification(p.notification?.title || 'أكاديمية سلام', {
    body: p.notification?.body || '', icon: '/website/images/icon-192.png', badge: '/website/images/icon-192.png', dir: 'rtl', data: { url: p.data?.url || '/website/' }
  });
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/website/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) { if ('focus' in w) { w.navigate(url); return w.focus(); } } return clients.openWindow(url); }));
});
