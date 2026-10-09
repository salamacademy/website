// ============================
// CLIENT DASHBOARD JS
// ============================

let currentSubscription = null;
const SCHEDULES = {
  football: { name: 'معسكر كرة القدم', days: 'كل سبت', time: '4:00 - 5:00 مساءً', location: 'منطقة الروضة', icon: '⚽' },
  confidence: { name: 'معسكر بناء الثقة والكيوكشن', days: 'الأحد - الثلاثاء - الخميس', time: 'أشبال 4:30-6:00 | رجال 6:00-7:30', location: 'جنوب السرة', icon: '🥋' },
  excellence: { name: 'باقة التميز', days: '4 أيام بالأسبوع', time: 'كرة القدم السبت + الكيوكشن أحد/ثلاثاء/خميس', location: 'جنوب السرة + الروضة', icon: '⚡' },
  excellence_loyal: { name: 'باقة التميز - أسرة سلام', days: '4 أيام بالأسبوع', time: 'كرة القدم السبت + الكيوكشن أحد/ثلاثاء/خميس', location: 'جنوب السرة + الروضة', icon: '🏅' },
  premium: { name: 'الباقة المميزة', days: '6 أيام', time: '--', location: 'الروضة + السلام', icon: '⚡' }
};

// Auth guard
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  await loadClientData(user);
});

async function loadClientData(user) {
  try {
    // Find subscription by phone or email (linked via UID after login)
    let snap = { empty: true, docs: [] };
    const phone = user.phoneNumber ? user.phoneNumber.replace('+965', '') : null;
    if (phone) {
      snap = await db.collection('subscriptions').where('phone', '==', phone).get();
    }
    if (snap.empty && user.email) {
      snap = await db.collection('subscriptions').where('email', '==', user.email).get();
    }
    if (!snap.empty) {
      // Prefer active, then approved, then pending, then newest
      const rank = { active: 0, approved: 1, pending_review: 2, pending_payment: 1 };
      const docs = snap.docs.slice().sort((a, b) => {
        const ra = rank[a.data().status] ?? 5, rb = rank[b.data().status] ?? 5;
        if (ra !== rb) return ra - rb;
        const ta = a.data().createdAt?.toMillis?.() || 0, tb = b.data().createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
      snap = { empty: false, docs: [docs[0]] };
    }

    if (snap.empty) {
      showNoSubscription();
      return;
    }

    const doc = snap.docs[0];
    currentSubscription = { id: doc.id, ...doc.data() };
    renderDashboard(currentSubscription);

  } catch (err) {
    console.error(err);
    showError('حدث خطأ في تحميل البيانات');
  }
}

function renderDashboard(sub) {
  if (sub.status !== 'active' && sub.status !== 'expired') { renderRequestState(sub); return; }
  // Update header
  document.getElementById('topbarName').textContent = sub.parentName || 'العضو';
  document.getElementById('welcomeName').textContent = sub.childName || sub.parentName;
  document.getElementById('childNameDisplay').textContent = sub.childName || '--';
  document.getElementById('packageLabel').textContent = SCHEDULES[sub.packageType]?.name || sub.packageName;
  document.getElementById('amountDisplay').textContent = sub.amount + ' د.ك';

  // Calculate days
  const now = new Date();
  const endDate = sub.subscriptionEnd ? sub.subscriptionEnd.toDate() : null;
  const startDate = sub.subscriptionStart ? sub.subscriptionStart.toDate() : null;

  let daysLeft = 0;
  let totalDays = 30;

  if (endDate) {
    const diff = endDate - now;
    daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    if (startDate) {
      totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    }
  }

  // Update days display
  document.getElementById('daysRemaining').textContent = daysLeft;

  // Circle animation
  const circumference = 339.3;
  const progress = totalDays > 0 ? daysLeft / totalDays : 0;
  const offset = circumference * (1 - progress);
  const circle = document.getElementById('daysCircle');
  if (circle) {
    circle.style.setProperty('--circle-offset', offset);
    document.getElementById('daysCard').style.setProperty('--circle-offset', offset + 'px');
    circle.style.strokeDashoffset = offset;
    // Color based on urgency
    if (daysLeft <= 5) circle.setAttribute('stroke', '#f44336');
    else if (daysLeft <= 10) circle.setAttribute('stroke', '#FF9800');
    else circle.setAttribute('stroke', '#2E7D32');
  }

  // Status text
  let statusTitle = '';
  let statusDesc = '';
  if (daysLeft <= 0) {
    statusTitle = 'انتهى الاشتراك';
    statusDesc = 'يرجى التجديد للاستمرار في التدريب';
  } else if (daysLeft <= 5) {
    statusTitle = '⚠️ اشتراكك على وشك الانتهاء';
    statusDesc = 'جدد اشتراكك الآن لتجنب الانقطاع';
    document.getElementById('renewalAlert').style.display = 'flex';
  } else if (daysLeft <= 10) {
    statusTitle = 'اشتراك نشط';
    statusDesc = 'ينتهي قريباً، فكر في التجديد المبكر';
    document.getElementById('renewalAlert').style.display = 'flex';
  } else {
    statusTitle = '✅ اشتراك نشط';
    statusDesc = 'استمتع بجلسات التدريب!';
  }

  document.getElementById('daysStatusTitle').textContent = statusTitle;
  document.getElementById('daysStatusDesc').textContent = statusDesc;

  // Dates
  if (startDate) {
    document.getElementById('startDate').textContent = startDate.toLocaleDateString('ar-KW');
  }
  if (endDate) {
    document.getElementById('endDate').textContent = endDate.toLocaleDateString('ar-KW');
  }

  // Renewal section
  document.getElementById('renewPackageName').textContent = sub.packageName;
  document.getElementById('renewAmount').textContent = sub.amount + ' د.ك';

  // Subscription details
  renderSubscriptionDetails(sub);

  // Schedule
  renderSchedule(sub.packageType);
}

function renderSubscriptionDetails(sub) {
  const container = document.getElementById('subscriptionDetails');
  const sched = SCHEDULES[sub.packageType] || {};
  container.innerHTML = `
    <div class="detail-row"><span class="detail-label">اسم الطفل</span><strong>${sub.childName || '--'}</strong></div>
    <div class="detail-row"><span class="detail-label">اسم ولي الأمر</span><strong>${sub.parentName || '--'}</strong></div>
    <div class="detail-row"><span class="detail-label">رقم الهاتف</span><strong>${sub.phone || '--'}</strong></div>
    <div class="detail-row"><span class="detail-label">الباقة</span><strong>${sub.packageName || '--'}</strong></div>
    <div class="detail-row"><span class="detail-label">المبلغ الشهري</span><strong>${sub.amount || '--'} د.ك</strong></div>
    <div class="detail-row"><span class="detail-label">حالة الاشتراك</span>
      <span class="status-badge ${sub.status === 'active' ? 'status-active' : 'status-inactive'}">
        ${sub.status === 'active' ? '✅ نشط' : '❌ منتهي'}
      </span>
    </div>
  `;
}

function renderSchedule(packageType) {
  const container = document.getElementById('scheduleDisplay');
  const sched = SCHEDULES[packageType] || {};

  if (packageType === 'premium') {
    container.innerHTML = `
      <div class="schedule-card">
        <div class="sched-icon">⚽</div>
        <h4>كرة القدم</h4>
        <div class="sched-row"><span>📅</span><span>السبت - الاثنين - الأربعاء</span></div>
        <div class="sched-row"><span>⏰</span><span>4:00 - 5:00 مساءً</span></div>
        <div class="sched-row"><span>📍</span><span>منطقة الروضة</span></div>
      </div>
      <div class="schedule-card">
        <div class="sched-icon">🥋</div>
        <h4>بناء الثقة والدفاع</h4>
        <div class="sched-row"><span>📅</span><span>الأحد - الثلاثاء - الخميس</span></div>
        <div class="sched-row"><span>⏰</span><span>4:30-6:00 أو 6:00-7:30</span></div>
        <div class="sched-row"><span>📍</span><span>منطقة السلام</span></div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="schedule-card">
        <div class="sched-icon">${sched.icon || '🏅'}</div>
        <h4>${sched.name || 'جدول التدريب'}</h4>
        <div class="sched-row"><span>📅</span><span>${sched.days || '--'}</span></div>
        <div class="sched-row"><span>⏰</span><span>${sched.time || '--'}</span></div>
        <div class="sched-row"><span>📍</span><span>${sched.location || '--'}</span></div>
      </div>
    `;
  }
}

function showSection(name) {
  document.querySelectorAll('.dashboard-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(name + '-section').style.display = 'block';
  document.getElementById('pageTitle').textContent = {
    overview: 'نظرة عامة',
    subscription: 'اشتراكي',
    schedule: 'الجدول',
    renew: 'تجديد الاشتراك'
  }[name];
  const activeLink = document.querySelector(`.sidebar-link[href="#${name}"]`);
  if (activeLink) activeLink.classList.add('active');
  // Close mobile sidebar
  document.querySelector('.client-sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.querySelector('.client-sidebar').classList.toggle('open');
}

function showNoSubscription() {
  document.getElementById('daysRemaining').textContent = '0';
  document.getElementById('daysStatusTitle').textContent = 'لا يوجد اشتراك نشط';
  document.getElementById('daysStatusDesc').textContent = 'لم نجد طلب تسجيل مرتبط برقمك. قم بتعبئة نموذج التسجيل للبدء.';
  const a = document.getElementById('renewalAlert'); a.style.display = 'flex';
  a.querySelector('strong').textContent = 'لا يوجد طلب تسجيل'; a.querySelector('p').textContent = 'سجّل الآن عبر النموذج';
  const b = a.querySelector('.alert-btn'); b.textContent = '📝 نموذج التسجيل'; b.onclick = () => location.href = 'register.html';
}

function logout() {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}

function showError(msg) {
  console.error(msg);
}


// ========== REQUEST STATE (before active) ==========
function renderRequestState(sub) {
  document.getElementById('topbarName').textContent = sub.parentName || 'العضو';
  document.getElementById('welcomeName').textContent = sub.childName || sub.parentName;
  document.getElementById('childNameDisplay').textContent = sub.childName || '--';
  document.getElementById('packageLabel').textContent = sub.packageName || SCHEDULES[sub.packageType]?.name || '--';
  document.getElementById('amountDisplay').textContent = sub.amount + ' د.ك';
  document.getElementById('renewPackageName').textContent = sub.packageName;
  document.getElementById('renewAmount').textContent = sub.amount + ' د.ك';
  renderSubscriptionDetails(sub);
  renderSchedule(sub.packageType);

  const card = document.getElementById('daysCard');
  const circle = document.getElementById('daysCircle');
  const alert = document.getElementById('renewalAlert');
  const s = sub.status;

  if (s === 'pending_review') {
    document.getElementById('daysRemaining').textContent = '⏳';
    circle.setAttribute('stroke', '#D4920A'); circle.style.strokeDashoffset = 170;
    document.getElementById('daysStatusTitle').textContent = '📝 طلبك قيد المراجعة';
    document.getElementById('daysStatusDesc').textContent = 'تقوم الإدارة بمراجعة نموذج التسجيل. سنتواصل معك عبر الواتساب خلال 24 ساعة.';
    document.getElementById('startDate').textContent = '--'; document.getElementById('endDate').textContent = '--';
  } else if (s === 'approved' || s === 'pending_payment') {
    document.getElementById('daysRemaining').textContent = '✅';
    circle.setAttribute('stroke', '#2e7d32'); circle.style.strokeDashoffset = 0;
    document.getElementById('daysStatusTitle').textContent = '🎉 تمت الموافقة على طلبك!';
    document.getElementById('daysStatusDesc').textContent = (sub.adminNote ? sub.adminNote + ' · ' : '') + 'يرجى سداد الرسوم لتفعيل الاشتراك.';
    const ps = sub.plannedStart ? sub.plannedStart.toDate() : null, pe = sub.plannedEnd ? sub.plannedEnd.toDate() : null;
    document.getElementById('startDate').textContent = ps ? ps.toLocaleDateString('ar-KW') : '--';
    document.getElementById('endDate').textContent = pe ? pe.toLocaleDateString('ar-KW') : '--';
    alert.style.display = 'flex';
    alert.querySelector('strong').textContent = 'ادفع الآن لتفعيل اشتراك ' + sub.childName;
    alert.querySelector('p').textContent = sub.amount + ' د.ك — عبر Upayment أو تواصل معنا للدفع النقدي / التحويل';
    alert.querySelector('.alert-btn').textContent = '💳 الدفع الآن';
    document.getElementById('pageTitle').textContent = 'بانتظار الدفع';
  } else if (s === 'rejected') {
    document.getElementById('daysRemaining').textContent = '✕';
    circle.setAttribute('stroke', '#c62828'); circle.style.strokeDashoffset = 0;
    document.getElementById('daysStatusTitle').textContent = 'لم يتم قبول الطلب';
    document.getElementById('daysStatusDesc').textContent = sub.adminNote || 'للاستفسار يرجى التواصل مع الإدارة.';
  }
  const ds = document.getElementById('daysRemaining'); ds.style.fontSize = '2rem';
  document.querySelector('.days-label').textContent = '';
}

function renewSubscription() {
  if (!currentSubscription) return;
  payNow(currentSubscription, currentSubscription.status === 'active' ? 'تجديد' : 'تفعيل');
}

async function payNow(sub, kind) {
  // Try Upayment (requires server-side proxy in production); fall back to WhatsApp
  try {
    const res = await fetch('https://sandboxapi.upayments.com/api/v1/charge', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + UPAYMENT_CONFIG.apiKey },
      body: JSON.stringify({ totalPrice: sub.amount, currency: 'KWD', customerName: sub.parentName, customerEmail: sub.email || 'noemail@salam.kw', customerMobileNumber: '+965' + sub.phone, title: sub.packageName + ' — أكاديمية سلام', orderId: sub.id, returnUrl: location.origin + '/client/payment-success.html?id=' + sub.id, cancelUrl: location.href, language: 'ar' })
    });
    const r = await res.json();
    if (r.status === true && r.data?.link) { location.href = r.data.link; return; }
    throw new Error('no link');
  } catch (e) {
    const msg = `مرحباً، أريد ${kind} اشتراك ${sub.childName} 🏆\nالباقة: ${sub.packageName}\nالمبلغ: ${sub.amount} د.ك\nيرجى تزويدي بطريقة الدفع.`;
    window.open('https://wa.me/96593000607?text=' + encodeURIComponent(msg), '_blank');
  }
}

// Renewal alert button → pay / renew
document.querySelector('#renewalAlert .alert-btn')?.addEventListener('click', function (e) {
  if (currentSubscription && currentSubscription.status !== 'active') { e.stopPropagation(); payNow(currentSubscription, 'تفعيل'); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
