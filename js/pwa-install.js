// Install prompt handling (Android/Chrome) + iOS hint
let deferredPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const b = document.getElementById('installBanner'); if (b && !isStandalone) b.style.display = 'flex';
});
document.addEventListener('click', async e => {
  if (e.target.id !== 'installBtn') return;
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; document.getElementById('installBanner').style.display = 'none'; }
  else alert('على iPhone: اضغط زر المشاركة (⬆️) في Safari ثم "إضافة إلى الشاشة الرئيسية"');
});
// iOS: show hint banner once
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (isIOS && !isStandalone && !localStorage.getItem('iosHintShown')) {
  window.addEventListener('load', () => {
    const b = document.getElementById('installBanner'); if (!b) return;
    b.style.display = 'flex'; b.querySelector('span').textContent = '📲 اضغط ⬆️ ثم "إضافة إلى الشاشة الرئيسية"';
    b.querySelector('#installBtn').style.display = 'none';
    try { localStorage.setItem('iosHintShown', '1'); } catch (_) {}
  });
}
