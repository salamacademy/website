// ============================
// REGISTRATION SURVEY JS
// ============================
let currentStep = 1;

// Preselect from URL ?pkg=football&loyal=1
(function () {
  const p = new URLSearchParams(location.search);
  const pkg = p.get('pkg');
  if (pkg) { const r = document.querySelector(`input[name="pkg"][value="${pkg}"]`); if (r) r.checked = true; }
  if (p.get('loyal') === '1') document.getElementById('loyal').checked = true;
  if (p.get('parent')) document.getElementById('parentName').value = p.get('parent');
  if (p.get('phone')) document.getElementById('phone').value = p.get('phone');
  if (p.get('email')) document.getElementById('email').value = p.get('email');
  if (p.get('parent') || p.get('phone')) { const h = document.querySelector('.reg-header p'); if (h) h.textContent = '👦 تسجيل طفل آخر لنفس ولي الأمر — بيانات التواصل معبّأة مسبقاً'; }
})();

// Age auto-calc
document.getElementById('birthDate').addEventListener('change', function () {
  const bd = new Date(this.value); if (isNaN(bd)) return;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  document.getElementById('ageDisplay').value = age + ' سنة';
});

function validateStep(n) {
  const sec = document.querySelector(`.reg-step[data-step="${n}"]`);
  const fields = sec.querySelectorAll('input[required], textarea[required]');
  for (const f of fields) {
    if (f.type === 'radio') {
      if (!sec.querySelector(`input[name="${f.name}"]:checked`)) { f.closest('.form-group, .reg-step').scrollIntoView({behavior:'smooth'}); return showError('يرجى اختيار إجابة لـ: ' + f.closest('.form-group').querySelector('label').textContent.replace('*','').trim()); }
    } else if (f.type === 'checkbox') {
      if (!f.checked) { f.scrollIntoView({behavior:'smooth',block:'center'}); return showError('يرجى الموافقة على جميع شروط الأكاديمية'); }
    } else if (!f.value.trim()) {
      f.focus(); return showError('يرجى تعبئة الحقول المطلوبة (*)');
    }
  }
  if (n === 1) {
    const ph = document.getElementById('phone').value.replace(/\D/g, '');
    if (ph.length !== 8) { document.getElementById('phone').focus(); return showError('رقم الهاتف يجب أن يكون 8 أرقام'); }
  }
  return true;
}

function goStep(n) {
  if (n > currentStep && !validateStep(currentStep)) return;
  hideError();
  document.querySelectorAll('.reg-step').forEach(s => s.hidden = s.dataset.step != n);
  document.querySelectorAll('.reg-steps .step').forEach(s => {
    const k = +s.dataset.step;
    s.classList.toggle('active', k === n);
    s.classList.toggle('done', k < n);
  });
  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('regForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!validateStep(3)) return;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...';

  const pkgEl = document.querySelector('input[name="pkg"]:checked');
  const data = {
    childName: v('childName'),
    birthDate: v('birthDate'),
    childAge: parseInt(document.getElementById('ageDisplay').value) || null,
    parentName: v('parentName'),
    phone: v('phone').replace(/\D/g, ''),
    phone2: v('phone2').replace(/\D/g, ''),
    email: v('email'),
    healthIssues: v('healthIssues') || 'لا يوجد',
    allergies: v('allergies') || 'لا يوجد',
    reason: v('reason'),
    tournamentsConsent: document.querySelector('input[name="tournaments"]:checked').value,
    packageType: pkgEl.value,
    packageName: pkgEl.dataset.name,
    amount: parseFloat(pkgEl.dataset.price),
    loyaltyMember: document.getElementById('loyal').checked,
    termsAccepted: true,
    status: 'pending_review',
    source: 'website_survey',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    subscriptionStart: null, subscriptionEnd: null, daysRemaining: 0
  };

  try {
    const ref = await db.collection('subscriptions').add(data);
    document.getElementById('regForm').hidden = true;
    document.querySelector('.reg-steps').style.display = 'none';
    document.getElementById('succPhone').textContent = '+965 ' + data.phone;
    document.getElementById('succId').textContent = ref.id.slice(0, 8).toUpperCase();
    const msg = `السلام عليكم، قمت بتعبئة نموذج التسجيل في أكاديمية سلام 🏆\n\nالطفل: ${data.childName}\nولي الأمر: ${data.parentName}\nالباقة: ${data.packageName}${data.loyaltyMember ? ' (أسرة سلام)' : ''}\nرقم الطلب: ${ref.id.slice(0,8).toUpperCase()}`;
    document.getElementById('succWa').href = 'https://wa.me/96593000607?text=' + encodeURIComponent(msg);
    document.getElementById('successView').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    showError('حدث خطأ أثناء الإرسال. حاول مرة أخرى أو تواصل معنا عبر الواتساب 93000607');
    btn.disabled = false; btn.textContent = '📩 إرسال طلب التسجيل';
  }
});

function v(id) { return (document.getElementById(id).value || '').trim(); }
function showError(m) { const e = document.getElementById('msgBox'); e.textContent = m; e.style.display = 'block'; e.style.background = '#ffebee'; e.style.color = '#c62828'; setTimeout(hideError, 6000); return false; }
function hideError() { document.getElementById('msgBox').style.display = 'none'; }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
