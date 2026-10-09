// ============================
// CLIENT DASHBOARD JS (app UI)
// ============================
let currentSubscription = null;
const SCHEDULES = {
  football: { name: 'معسكر كرة القدم', icon: '⚽', rows: [['📅', 'كل سبت'], ['⏰', '4:00 – 5:00 مساءً'], ['📍', 'منطقة الروضة']] },
  confidence: { name: 'معسكر بناء الثقة والكيوكشن', icon: '🥋', rows: [['📅', 'الأحد – الثلاثاء – الخميس'], ['⏰', 'أشبال 4:30–6:00 · رجال 6:00–7:30'], ['📍', 'جنوب السرة']] },
  excellence: { name: 'باقة التميز', icon: '⚡', rows: [['📅', '4 أيام بالأسبوع'], ['⚽', 'كرة القدم: السبت · الروضة'], ['🥋', 'الكيوكشن: أحد/ثلاثاء/خميس · جنوب السرة']] },
  excellence_loyal: { name: 'باقة التميز – أسرة سلام', icon: '🏅', rows: [['📅', '4 أيام بالأسبوع'], ['⚽', 'كرة القدم: السبت · الروضة'], ['🥋', 'الكيوكشن: أحد/ثلاثاء/خميس · جنوب السرة']] },
  premium: { name: 'الباقة المميزة', icon: '⚡', rows: [['📅', '6 أيام'], ['📍', 'الروضة + السلام']] }
};
const TITLES = { overview: 'هذا ملخص اشتراك طفلك في أكاديمية سلام', subscription: 'كل تفاصيل الاشتراك', schedule: 'مواعيد وأماكن التدريب', pause: 'إيقاف أسبوع واحد كل شهر', renew: 'ادفع أو جدد اشتراكك' };
const toD = ts => ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
const fmt = ts => { const d = toD(ts); return d ? d.toLocaleDateString('ar-KW') : '--'; };
const $ = id => document.getElementById(id);


async function loadClientData(user) {
  try {
    let snap = { empty: true, docs: [] };
    const phone = user.phoneNumber ? user.phoneNumber.replace('+965', '') : null;
    if (phone) snap = await db.collection('subscriptions').where('phone', '==', phone).get();
    if (snap.empty && user.email) snap = await db.collection('subscriptions').where('email', '==', user.email).get();
    if (snap.empty) { showNoSubscription(); return; }
    const rank = { active: 0, approved: 1, pending_payment: 1, pending_review: 2 };
    const docs = snap.docs.slice().sort((a, b) => { const ra = rank[a.data().status] ?? 5, rb = rank[b.data().status] ?? 5; if (ra !== rb) return ra - rb; return (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0); });
    currentSubscription = { id: docs[0].id, ...docs[0].data() };
    renderDashboard(currentSubscription);
    setupClientNotifications(docs[0].id);
  } catch (e) { console.error(e); $('daysStatusTitle').textContent = 'تعذر تحميل البيانات'; }
}

// ---------- NAV ----------
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  document.querySelectorAll('.tab[data-page]').forEach(t => t.classList.toggle('on', t.dataset.page === page));
  $('pageTitle').textContent = TITLES[page] || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showSection(n) { go(n); }

// ---------- RENDER ----------
function renderDashboard(sub) {
  const sch = SCHEDULES[sub.packageType] || {};
  $('welcomeName').textContent = sub.parentName || 'العضو';
  $('childNameDisplay').textContent = sub.childName || '--';
  $('packageLabel').textContent = sch.name || sub.packageName || '--';
  $('amountDisplay').textContent = (sub.amount || '--') + ' د.ك';
  $('renewPackageName').textContent = sub.packageName || sch.name || '--';
  $('renewAmount').textContent = (sub.amount || '--') + ' د.ك';
  renderDetails(sub); renderSchedule(sub.packageType);
  if (sub.status !== 'active' && sub.status !== 'expired') { renderRequestState(sub); return; }

  const end = toD(sub.subscriptionEnd), start = toD(sub.subscriptionStart);
  let days = 0, total = 30;
  if (end) { days = Math.max(0, Math.ceil((end - new Date()) / 864e5)); if (start) total = Math.max(1, Math.ceil((end - start) / 864e5)); }
  setRing(days, days / total, days <= 5 ? '#C62828' : days <= 10 ? '#E65100' : '#2E7D32');
  $('startDate').textContent = fmt(start); $('endDate').textContent = fmt(end);
  const alert = $('renewalAlert'); alert.classList.remove('show');
  if (days <= 0 || sub.status === 'expired') { status('انتهى الاشتراك', 'يرجى التجديد للاستمرار في التدريب'); alertSet('انتهى الاشتراك', 'جدد الآن للعودة للتدريب', '🔄 تجديد'); }
  else if (days <= 5) { status('⚠️ اشتراكك على وشك الانتهاء', 'جدد الآن لتجنب الانقطاع'); alertSet('اشتراكك على وشك الانتهاء!', `متبقٍ ${days} أيام فقط`, 'جدد الآن'); }
  else if (days <= 10) { status('اشتراك نشط', 'ينتهي قريباً، فكر في التجديد المبكر'); alertSet('ينتهي قريباً', `متبقٍ ${days} يوم`, 'جدد الآن'); }
  else status('✅ اشتراك نشط', 'استمتع بجلسات التدريب!');
  renderPause(sub);
}
function setRing(num, ratio, color) { $('daysRemaining').textContent = num; $('daysRemaining').style.fontSize = ''; $('daysCircle').setAttribute('stroke', color); $('daysCircle').style.strokeDashoffset = 326.7 * (1 - Math.max(0, Math.min(1, ratio))); document.querySelector('.days-label').textContent = 'يوم متبقي'; }
function status(t, d) { $('daysStatusTitle').textContent = t; $('daysStatusDesc').textContent = d; }
function alertSet(t, d, btn) { const a = $('renewalAlert'); a.classList.add('show'); a.querySelector('strong').textContent = t; a.querySelector('p').textContent = d; a.querySelector('button').textContent = btn; }

function renderRequestState(sub) {
  const s = sub.status;
  $('startDate').textContent = '--'; $('endDate').textContent = '--'; $('renewalAlert').classList.remove('show');
  if (s === 'pending_review') { ringIcon('⏳', '#D4920A', .5); status('📝 طلبك قيد المراجعة', 'الإدارة تراجع نموذج التسجيل وستتواصل معك عبر الواتساب خلال 24 ساعة.'); }
  else if (s === 'approved' || s === 'pending_payment') {
    ringIcon('✅', '#2E7D32', 1); status('🎉 تمت الموافقة على طلبك!', (sub.adminNote ? sub.adminNote + ' · ' : '') + 'يرجى سداد الرسوم لتفعيل الاشتراك.');
    $('startDate').textContent = fmt(sub.plannedStart); $('endDate').textContent = fmt(sub.plannedEnd);
    alertSet('ادفع الآن لتفعيل الاشتراك', `${sub.amount} د.ك — Upayment أو نقدي / تحويل`, '💳 الدفع');
  }
  else if (s === 'rejected') { ringIcon('✕', '#C62828', 1); status('لم يتم قبول الطلب', sub.adminNote || 'للاستفسار يرجى التواصل مع الإدارة.'); }
  else { ringIcon('•', '#A07050', 0); status('حالة غير معروفة', s); }
  ['pauseInfo', 'pauseActive', 'pauseUsed'].forEach(i => $(i).style.display = 'none'); $('pauseUsed').style.display = 'block'; $('pauseUsed').querySelector('p').textContent = 'الإيقاف المؤقت متاح بعد تفعيل الاشتراك.';
}
function ringIcon(ch, color, ratio) { $('daysRemaining').textContent = ch; $('daysRemaining').style.fontSize = '1.8rem'; $('daysCircle').setAttribute('stroke', color); $('daysCircle').style.strokeDashoffset = 326.7 * (1 - ratio); document.querySelector('.days-label').textContent = ''; }

function renderDetails(sub) {
  const ST = { active: ['ok', '✅ نشط'], pending_review: ['gold', '📝 قيد المراجعة'], approved: ['info', '💳 بانتظار الدفع'], pending_payment: ['info', '💳 بانتظار الدفع'], rejected: ['bad', '⛔ مرفوض'], expired: ['bad', '❌ منتهي'] }[sub.status] || ['copper', sub.status];
  const row = (k, v) => `<div class="sched"><span style="width:auto;color:var(--text-light);font-size:0.8rem;min-width:90px">${k}</span><b>${v || '--'}</b></div>`;
  $('subscriptionDetails').innerHTML = row('اسم الطفل', sub.childName) + row('ولي الأمر', sub.parentName) + row('الهاتف', `<span dir="ltr">${sub.phone || ''}</span>`) + row('الباقة', sub.packageName) + row('الرسوم الشهرية', (sub.amount || '--') + ' د.ك') + row('الحالة', `<span class="chip ${ST[0]}">${ST[1]}</span>`) + (sub.subscriptionStart ? row('بداية الاشتراك', fmt(sub.subscriptionStart)) + row('نهاية الاشتراك', fmt(sub.subscriptionEnd)) : '') + (sub.loyaltyMember ? row('العضوية', '<span class="chip gold">🏅 أسرة سلام</span>') : '');
}
function renderSchedule(type) {
  const s = SCHEDULES[type]; if (!s) { $('scheduleDisplay').innerHTML = '<div class="empty">لا يوجد جدول</div>'; $('scheduleMini').innerHTML = ''; return; }
  const rows = s.rows.map(r => `<div class="sched"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
  $('scheduleDisplay').innerHTML = `<div class="card"><div class="card-h"><h4>${s.icon} ${s.name}</h4></div>${rows}</div>`;
  $('scheduleMini').innerHTML = rows;
}
function showNoSubscription() {
  ringIcon('0', '#A07050', 0); status('لا يوجد طلب تسجيل', 'لم نجد طلباً مرتبطاً برقمك. عبّئ نموذج التسجيل للبدء.');
  $('welcomeName').textContent = 'بك'; alertSet('لا يوجد اشتراك', 'سجّل الآن عبر النموذج', '📝 التسجيل');
}
function alertAction() {
  const s = currentSubscription;
  if (!s) return location.href = 'register.html';
  if (s.status === 'active' || s.status === 'expired') return go('renew');
  payNow(s, 'تفعيل');
}

// ---------- PAY ----------
function renewSubscription() { if (!currentSubscription) return location.href = 'register.html'; payNow(currentSubscription, currentSubscription.status === 'active' ? 'تجديد' : 'تفعيل'); }
async function payNow(sub, kind) {
  try {
    const res = await fetch('https://sandboxapi.upayments.com/api/v1/charge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + UPAYMENT_CONFIG.apiKey }, body: JSON.stringify({ totalPrice: sub.amount, currency: 'KWD', customerName: sub.parentName, customerEmail: sub.email || 'noemail@salam.kw', customerMobileNumber: '+965' + sub.phone, title: sub.packageName + ' — أكاديمية سلام', orderId: sub.id, returnUrl: location.origin + '/client/payment-success.html?id=' + sub.id, cancelUrl: location.href, language: 'ar' }) });
    const r = await res.json(); if (r.status === true && r.data?.link) { location.href = r.data.link; return; } throw 0;
  } catch (_) {
    window.open('https://wa.me/96593000607?text=' + encodeURIComponent(`مرحباً، أريد ${kind} اشتراك ${sub.childName} 🏆\nالباقة: ${sub.packageName}\nالمبلغ: ${sub.amount} د.ك\nيرجى تزويدي بطريقة الدفع.`), '_blank');
  }
}

// ---------- PAUSE ----------
function isPausedNow(s) { const a = toD(s.pauseStart), b = toD(s.pauseEnd); if (!a || !b) return false; const n = new Date(); return n >= a && n <= b; }
function renderPause(sub) {
  ['pauseInfo', 'pauseActive', 'pauseUsed'].forEach(i => $(i).style.display = 'none'); $('pausedBanner').style.display = 'none';
  if (isPausedNow(sub)) {
    $('pauseActive').style.display = 'block'; $('pauseFrom').textContent = fmt(sub.pauseStart); $('pauseTo').textContent = fmt(sub.pauseEnd);
    $('pausedBanner').style.display = 'flex'; $('pausedUntil').textContent = fmt(sub.pauseEnd);
    status('⏸️ الاشتراك متوقف مؤقتاً', 'يستأنف التدريب في ' + fmt(sub.pauseEnd));
  } else if (sub.pauseUsed || sub.pauseEnd || sub.status !== 'active') {
    $('pauseUsed').style.display = 'block'; if (sub.status !== 'active') $('pauseUsed').querySelector('p').textContent = 'الإيقاف المؤقت متاح للاشتراكات النشطة فقط.';
  } else {
    $('pauseInfo').style.display = 'block';
    const inp = $('pauseStartInput'), today = new Date().toISOString().split('T')[0];
    inp.min = today; if (!inp.value) inp.value = today; const e = toD(sub.subscriptionEnd); if (e) inp.max = e.toISOString().split('T')[0];
    inp.oninput = () => previewPause(sub); previewPause(sub);
  }
}
function previewPause(sub) {
  const v = $('pauseStartInput').value; if (!v) return;
  const s = new Date(v), e = new Date(s); e.setDate(e.getDate() + 7); $('pauseEndPreview').textContent = e.toLocaleDateString('ar-KW');
  const ne = toD(sub.subscriptionEnd); if (ne) { ne.setDate(ne.getDate() + 7); $('newEndPreview').textContent = ne.toLocaleDateString('ar-KW'); }
}
async function requestPause() {
  const sub = currentSubscription; if (!sub || sub.status !== 'active') return;
  const v = $('pauseStartInput').value; if (!v) return alert('اختر تاريخ بداية الإيقاف');
  const s = new Date(v); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(e.getDate() + 7);
  if (!confirm(`إيقاف اشتراك ${sub.childName} من ${s.toLocaleDateString('ar-KW')} لمدة 7 أيام؟`)) return;
  const btn = $('pauseBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
  const ne = toD(sub.subscriptionEnd); ne.setDate(ne.getDate() + 7);
  try {
    await db.collection('subscriptions').doc(sub.id).update({ pauseStart: firebase.firestore.Timestamp.fromDate(s), pauseEnd: firebase.firestore.Timestamp.fromDate(e), pauseUsed: true, pauseReason: $('pauseReason').value.trim(), pauseRequestedAt: firebase.firestore.FieldValue.serverTimestamp(), subscriptionEnd: firebase.firestore.Timestamp.fromDate(ne) });
    window.open('https://wa.me/96593000607?text=' + encodeURIComponent(`مرحباً، قمت بإيقاف اشتراك ${sub.childName} مؤقتاً لمدة أسبوع\nمن: ${s.toLocaleDateString('ar-KW')}\nإلى: ${e.toLocaleDateString('ar-KW')}${$('pauseReason').value ? '\nالسبب: ' + $('pauseReason').value : ''}`), '_blank');
    go('overview');
  } catch (err) { alert('تعذر حفظ الإيقاف: ' + err.message); btn.disabled = false; btn.textContent = '⏸️ تأكيد الإيقاف لمدة أسبوع'; }
}

// ---------- NOTIFICATIONS ----------
function setupClientNotifications(id) {
  const saveToken = t => db.collection('subscriptions').doc(id).update({ fcmTokens: firebase.firestore.FieldValue.arrayUnion(t) });
  if (window.Notification && Notification.permission === 'default') {
    const b = document.createElement('div'); b.className = 'banner notif';
    b.innerHTML = `<span>🔔 فعّل الإشعارات لتصلك الموافقة وتذكير التجديد</span><button id="notifOn">تفعيل</button><button class="x" onclick="this.parentElement.remove()">✕</button>`;
    document.querySelector('.app-head').insertAdjacentElement('afterend', b);
    b.querySelector('#notifOn').onclick = async () => { const ok = await Notif.ask(); b.remove(); if (ok) { Notif.show('تم تفعيل الإشعارات ✅', 'ستصلك تنبيهات أكاديمية سلام هنا'); Notif.registerPush(saveToken); } };
  }
  if (Notif.granted()) Notif.registerPush(saveToken);
  let prev = currentSubscription?.status;
  db.collection('subscriptions').doc(id).onSnapshot(doc => {
    if (!doc.exists) return; const d = { id: doc.id, ...doc.data() };
    if (prev && d.status !== prev) {
      if (d.status === 'approved') Notif.show('🎉 تمت الموافقة على طلبك', `${d.childName} — ${d.amount} د.ك · ادفع الآن لتفعيل الاشتراك`, 'dashboard.html');
      if (d.status === 'active') Notif.show('✅ تم تفعيل الاشتراك', `${d.childName} — ${d.packageName}`, 'dashboard.html');
      if (d.status === 'rejected') Notif.show('طلب التسجيل', d.adminNote || 'لم يتم قبول الطلب، تواصل مع الإدارة', 'dashboard.html');
    }
    prev = d.status; currentSubscription = d; renderDashboard(d);
  });
  const s = currentSubscription;
  if (s && s.status === 'active' && s.subscriptionEnd) {
    const days = Math.ceil((toD(s.subscriptionEnd) - new Date()) / 864e5), key = 'expNotif-' + id + '-' + new Date().toDateString();
    if (days <= 3 && days >= 0 && !localStorage.getItem(key)) { localStorage.setItem(key, '1'); Notif.show('⏳ اشتراكك ينتهي قريباً', `${s.childName} — متبقٍ ${days} يوم · جدد الآن`, 'dashboard.html'); }
  }
}

function logout() { if (confirm('تسجيل الخروج؟')) auth.signOut().then(() => location.href = 'login.html'); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});

// ---------- AUTH + LOAD ----------
auth.onAuthStateChanged(async user => { if (!user) { location.href = 'login.html'; return; } await loadClientData(user); });
