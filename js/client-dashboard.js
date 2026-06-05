// ============================
// CLIENT DASHBOARD JS
// ============================

let currentSubscription = null;
const SCHEDULES = {
  football: {
    name: 'باقة كرة القدم',
    days: 'السبت - الاثنين - الأربعاء',
    time: '4:00 - 5:00 مساءً',
    location: 'منطقة الروضة',
    icon: '⚽'
  },
  confidence: {
    name: 'باقة بناء الثقة والدفاع عن النفس',
    days: 'الأحد - الثلاثاء - الخميس',
    time: 'Class A: 4:30-6:00 | Class B: 6:00-7:30',
    location: 'منطقة السلام',
    icon: '🥋'
  },
  premium: {
    name: 'الباقة المميزة',
    days: 'السبت - الخميس (6 أيام)',
    time: 'كرة القدم 4:00-5:00 + الدفاع عن النفس 4:30-7:30',
    location: 'الروضة + السلام',
    icon: '⚡'
  }
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
    let snap = await db.collection('subscriptions')
      .where('uid', '==', user.uid)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    // Fallback: search by phone
    if (snap.empty && user.phoneNumber) {
      const phone = user.phoneNumber.replace('+965', '');
      snap = await db.collection('subscriptions')
        .where('phone', '==', phone)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
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
  document.getElementById('daysStatusDesc').textContent = 'قم بالاشتراك في أحد باقاتنا للبدء';
  document.getElementById('renewalAlert').style.display = 'flex';
}

async function renewSubscription() {
  if (!currentSubscription) return;
  // Trigger Upayment for renewal
  const msg = `مرحباً، أريد تجديد اشتراكي
  
الباقة: ${currentSubscription.packageName}
اسم الطفل: ${currentSubscription.childName}
المبلغ: ${currentSubscription.amount} د.ك`;

  window.open('https://wa.me/96593000607?text=' + encodeURIComponent(msg), '_blank');
}

function logout() {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}

function showError(msg) {
  console.error(msg);
}
