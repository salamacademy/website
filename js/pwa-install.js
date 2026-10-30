// Install-to-home-screen: Android gets the native prompt; iPhone gets a step-by-step guide (iOS has no install API)
let deferredPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafari = isIOS && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
const APP_NAME = document.title.includes('إدارة') ? 'لوحة الإدارة' : 'تطبيق أكاديمية سلام';

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; const b = document.getElementById('installBanner'); if (b && !isStandalone) b.style.display = 'flex'; });

function showIOSGuide() {
  if (document.getElementById('iosGuide')) return;
  const w = document.createElement('div'); w.id = 'iosGuide'; w.className = 'sheet-bg open'; w.onclick = e => { if (e.target === w) w.remove(); };
  const share = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1565C0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  const plus = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B5E20" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  w.innerHTML = `<div class="sheet"><div class="sheet-grip"></div><h3>📲 إضافة ${APP_NAME} إلى الشاشة الرئيسية</h3><p class="sub">${isSafari ? 'ثلاث خطوات في Safari:' : 'افتح هذه الصفحة في <strong>Safari</strong> أولاً (لا يعمل من Chrome أو واتساب)، ثم:'}</p>
    <div class="tg-step"><b>1</b><div>اضغط زر <strong>المشاركة</strong> ${share} في شريط Safari بالأسفل</div></div>
    <div class="tg-step"><b>2</b><div>مرّر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية</strong> ${plus}<br/><small style="color:var(--text-light)">Add to Home Screen</small></div></div>
    <div class="tg-step"><b>3</b><div>اضغط <strong>إضافة</strong> أعلى اليمين — ستجد أيقونة ${APP_NAME} بين تطبيقاتك ✅</div></div>
    ${!isSafari ? `<button class="btn primary" style="margin-top:12px" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href);this.textContent='✅ تم نسخ الرابط — الصقه في Safari'">📋 نسخ رابط الصفحة لفتحه في Safari</button>` : ''}
    <button class="btn ghost" style="margin-top:8px" onclick="document.getElementById('iosGuide').remove()">إغلاق</button></div>`;
  document.body.appendChild(w);
}

document.addEventListener('click', async e => {
  if (e.target.id === 'installBtn' || (e.target.closest && e.target.closest('#installBanner') && !e.target.classList.contains('x'))) {
    if (isIOS) return showIOSGuide();
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; document.getElementById('installBanner').style.display = 'none'; }
    else alert('من قائمة المتصفح (⋮) اختر "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق"');
  }
});

if (isIOS && !isStandalone) {
  window.addEventListener('load', () => {
    const b = document.getElementById('installBanner'); if (!b) return;
    b.style.display = 'flex'; b.style.cursor = 'pointer';
    b.querySelector('span').textContent = '📲 أضف التطبيق إلى الشاشة الرئيسية — اضغط هنا للخطوات';
    const btn = b.querySelector('#installBtn'); if (btn) btn.textContent = 'كيف؟';
  });
}

// ---------- App updates ----------
// 🔄 button: fetch the newest app files, then reload
async function refreshApp() {
  if (typeof showToast === 'function') showToast('🔄 جاري تحديث التطبيق...');
  try { const r = await navigator.serviceWorker?.getRegistration(); if (r) await r.update(); } catch (_) {}
  location.reload();
}
if ('serviceWorker' in navigator) {
  // a new sw.js took over → reload once so the new code runs (unless a form is open)
  const hadController = !!navigator.serviceWorker.controller; let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const c = navigator.serviceWorker.controller;
    if (!hadController || reloading || !c || !/\/sw\.js$/.test(c.scriptURL)) return;
    if (document.querySelector('.sheet-bg.open') || document.getElementById('newChildName')?.value) return;
    reloading = true; location.reload();
  });
  // iPhone keeps the PWA in memory for days — check for a new version every time it comes back to the screen
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); });
}
