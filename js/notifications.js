// ============================
// NOTIFICATIONS (local + FCM push)
// ============================
// Layer 1: local notifications via Firestore realtime listeners (works now, app must be open or in background tab)
// Layer 2: FCM push (works when app is closed) — needs FCM_VAPID_KEY in firebase-config.js + Cloud Function (see SETUP.md)

const Notif = {
  supported: 'Notification' in window,
  granted: () => Notif.supported && Notification.permission === 'granted',

  async ask() {
    if (!Notif.supported) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const r = await Notification.requestPermission();
    return r === 'granted';
  },

  async show(title, body, url) {
    if (!Notif.granted()) return;
    const opts = { body, icon: '../images/icon-192.png', badge: '../images/icon-192.png', dir: 'rtl', lang: 'ar', data: { url }, vibrate: [100, 50, 100] };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) return reg.showNotification(title, opts);
    } catch (_) {}
    try { const n = new Notification(title, opts); n.onclick = () => { if (url) location.href = url; n.close(); }; } catch (_) {}
  },

  // Save FCM token for push (optional layer 2)
  async registerPush(saveTokenFn) {
    try {
      if (!firebase.messaging || !window.FCM_VAPID_KEY || !FCM_VAPID_KEY.startsWith('B')) return null;
      const reg = await navigator.serviceWorker.register('../firebase-messaging-sw.js');
      const messaging = firebase.messaging();
      const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
      if (token && saveTokenFn) await saveTokenFn(token);
      messaging.onMessage(p => Notif.show(p.notification?.title || 'أكاديمية سلام', p.notification?.body || '', p.data?.url));
      return token;
    } catch (e) { console.warn('FCM:', e.message); return null; }
  },

  // Banner UI to request permission
  banner(text) {
    if (!Notif.supported || Notification.permission !== 'default') return;
    if (document.getElementById('notifBanner')) return;
    const b = document.createElement('div');
    b.id = 'notifBanner'; b.className = 'install-banner'; b.style.background = 'linear-gradient(135deg,#1565c0,#1e88e5)';
    b.innerHTML = `<span>🔔 ${text}</span><button id="notifOn">تفعيل</button><button class="ib-close" onclick="this.parentElement.remove()">✕</button>`;
    const main = document.querySelector('.client-main'); main.insertBefore(b, main.firstChild);
    document.getElementById('notifOn').onclick = async () => { const ok = await Notif.ask(); b.remove(); if (ok) { Notif.show('تم تفعيل الإشعارات ✅', 'ستصلك تنبيهات أكاديمية سلام هنا'); window.dispatchEvent(new Event('notif-granted')); } };
  }
};
window.Notif = Notif;
