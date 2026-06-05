// ============================
// ADMIN DASHBOARD JS
// ============================

let allSubscriptions = [];

// Auth guard - admin only
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  // Verify admin role
  const adminDoc = await db.collection('admins').doc(user.uid).get();
  if (!adminDoc.exists) {
    await auth.signOut();
    window.location.href = 'login.html';
    return;
  }
  loadAllData();
});

async function loadAllData() {
  try {
    const snap = await db.collection('subscriptions')
      .orderBy('createdAt', 'desc')
      .get();

    allSubscriptions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderDashboardStats();
    renderRecentTable(allSubscriptions.slice(0, 10));
    renderAllSubs(allSubscriptions);
    renderExpiring();
  } catch (err) {
    console.error(err);
  }
}

function calcDaysLeft(sub) {
  if (!sub.subscriptionEnd) return null;
  const end = sub.subscriptionEnd.toDate ? sub.subscriptionEnd.toDate() : new Date(sub.subscriptionEnd);
  const diff = end - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renderDashboardStats() {
  const now = new Date();
  const active = allSubscriptions.filter(s => s.status === 'active');
  const expired = allSubscriptions.filter(s => s.status === 'expired');
  const expiring = active.filter(s => {
    const d = calcDaysLeft(s);
    return d !== null && d >= 0 && d <= 7;
  });

  // Monthly revenue (current month)
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthRevenue = allSubscriptions
    .filter(s => {
      if (!s.createdAt) return false;
      const created = s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      return created.getMonth() === currentMonth && created.getFullYear() === currentYear && s.status === 'active';
    })
    .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statExpiring').textContent = expiring.length;
  document.getElementById('statExpired').textContent = expired.length;
  document.getElementById('statRevenue').textContent = monthRevenue.toFixed(0);
}

function renderRow(sub, cols) {
  const days = calcDaysLeft(sub);
  const daysDisplay = days === null ? '--' :
    days < 0 ? `<span style="color:#c62828">منتهي</span>` :
    days <= 7 ? `<span style="color:#e65100;font-weight:700">${days} يوم ⚠️</span>` :
    `<span style="color:#2e7d32">${days} يوم</span>`;

  const statusBadge = `<span class="status-badge ${sub.status === 'active' ? 'status-active' : sub.status === 'pending_payment' ? 'status-pending' : 'status-inactive'}">
    ${sub.status === 'active' ? '✅ نشط' : sub.status === 'pending_payment' ? '⏳ انتظار' : '❌ منتهي'}
  </span>`;

  const startDate = sub.subscriptionStart ? (sub.subscriptionStart.toDate ? sub.subscriptionStart.toDate() : new Date(sub.subscriptionStart)).toLocaleDateString('ar-KW') : '--';
  const endDate = sub.subscriptionEnd ? (sub.subscriptionEnd.toDate ? sub.subscriptionEnd.toDate() : new Date(sub.subscriptionEnd)).toLocaleDateString('ar-KW') : '--';

  const packageNames = { football: 'كرة القدم', confidence: 'بناء الثقة', premium: 'المميزة' };

  if (cols === 'recent') {
    return `<tr>
      <td>${sub.childName || '--'}</td>
      <td>${sub.parentName || '--'}</td>
      <td>${packageNames[sub.packageType] || sub.packageName || '--'}</td>
      <td>${daysDisplay}</td>
      <td>${statusBadge}</td>
      <td>
        <button onclick="openEditModal('${sub.id}')" class="btn-table-edit">✏️ تعديل</button>
        <button onclick="sendWhatsAppReminder('${sub.phone}','${sub.childName}',${days})" class="btn-table-wa">📲</button>
      </td>
    </tr>`;
  }

  return `<tr>
    <td>${sub.childName || '--'}</td>
    <td>${sub.parentName || '--'}</td>
    <td>${sub.phone || '--'}</td>
    <td>${packageNames[sub.packageType] || sub.packageName || '--'}</td>
    <td>${startDate}</td>
    <td>${endDate}</td>
    <td>${daysDisplay}</td>
    <td>${statusBadge}</td>
    <td>
      <button onclick="openEditModal('${sub.id}')" class="btn-table-edit">✏️</button>
      <button onclick="sendWhatsAppReminder('${sub.phone}','${sub.childName}',${days})" class="btn-table-wa">📲</button>
      <button onclick="deleteSubscription('${sub.id}')" class="btn-table-del">🗑️</button>
    </td>
  </tr>`;
}

function renderRecentTable(subs) {
  const tbody = document.getElementById('recentTableBody');
  tbody.innerHTML = subs.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999">لا توجد اشتراكات</td></tr>'
    : subs.map(s => renderRow(s, 'recent')).join('');
}

function renderAllSubs(subs) {
  const tbody = document.getElementById('allSubsTableBody');
  tbody.innerHTML = subs.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:20px;color:#999">لا توجد اشتراكات</td></tr>'
    : subs.map(s => renderRow(s, 'all')).join('');
}

function renderExpiring() {
  const expiring = allSubscriptions.filter(s => {
    const d = calcDaysLeft(s);
    return d !== null && d >= 0 && d <= 7 && s.status === 'active';
  }).sort((a, b) => calcDaysLeft(a) - calcDaysLeft(b));

  const tbody = document.getElementById('expiringTableBody');
  const packageNames = { football: 'كرة القدم', confidence: 'بناء الثقة', premium: 'المميزة' };

  tbody.innerHTML = expiring.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:#4caf50">✅ لا توجد اشتراكات تنتهي قريباً</td></tr>'
    : expiring.map(s => {
        const days = calcDaysLeft(s);
        return `<tr>
          <td>${s.childName || '--'}</td>
          <td>${s.parentName || '--'}</td>
          <td>${s.phone || '--'}</td>
          <td>${packageNames[s.packageType] || '--'}</td>
          <td><span style="color:${days <= 3 ? '#c62828' : '#e65100'};font-weight:700">${days} يوم</span></td>
          <td><button onclick="sendWhatsAppReminder('${s.phone}','${s.childName}',${days})" class="btn-whatsapp-admin">📲 إرسال تذكير</button></td>
        </tr>`;
      }).join('');
}

function filterSubscriptions() {
  const status = document.getElementById('filterStatus').value;
  const pkg = document.getElementById('filterPackage').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  let filtered = allSubscriptions;
  if (status !== 'all') filtered = filtered.filter(s => s.status === status);
  if (pkg !== 'all') filtered = filtered.filter(s => s.packageType === pkg);
  if (search) {
    filtered = filtered.filter(s =>
      (s.childName || '').toLowerCase().includes(search) ||
      (s.parentName || '').toLowerCase().includes(search) ||
      (s.phone || '').includes(search)
    );
  }
  renderAllSubs(filtered);
}

// ========== EDIT MODAL ==========
function openEditModal(id) {
  const sub = allSubscriptions.find(s => s.id === id);
  if (!sub) return;

  document.getElementById('editSubId').value = id;
  document.getElementById('editStatus').value = sub.status || 'active';
  document.getElementById('editNotes').value = sub.notes || '';

  if (sub.subscriptionStart) {
    const d = sub.subscriptionStart.toDate ? sub.subscriptionStart.toDate() : new Date(sub.subscriptionStart);
    document.getElementById('editStartDate').value = d.toISOString().split('T')[0];
  }
  if (sub.subscriptionEnd) {
    const d = sub.subscriptionEnd.toDate ? sub.subscriptionEnd.toDate() : new Date(sub.subscriptionEnd);
    document.getElementById('editEndDate').value = d.toISOString().split('T')[0];
  }

  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

async function saveEdit() {
  const id = document.getElementById('editSubId').value;
  const status = document.getElementById('editStatus').value;
  const startVal = document.getElementById('editStartDate').value;
  const endVal = document.getElementById('editEndDate').value;
  const notes = document.getElementById('editNotes').value;

  const updates = { status, notes };

  if (startVal) {
    updates.subscriptionStart = firebase.firestore.Timestamp.fromDate(new Date(startVal));
  }
  if (endVal) {
    updates.subscriptionEnd = firebase.firestore.Timestamp.fromDate(new Date(endVal));
    // Calculate days
    const end = new Date(endVal);
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    updates.daysRemaining = daysLeft;
  }

  try {
    await db.collection('subscriptions').doc(id).update(updates);
    closeEditModal();
    showToast('✅ تم حفظ التغييرات');
    await loadAllData();
  } catch (err) {
    showToast('❌ حدث خطأ: ' + err.message);
  }
}

// ========== ADD SUBSCRIPTION ==========
function updatePackagePrice() {
  const sel = document.getElementById('newPackage');
  const opt = sel.options[sel.selectedIndex];
  const price = opt.dataset.price;
  if (price) document.getElementById('newAmount').value = price;
}

async function saveSubscription(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  const packageSel = document.getElementById('newPackage');
  const packageOpt = packageSel.options[packageSel.selectedIndex];
  const startDate = new Date(document.getElementById('newStartDate').value);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);

  const data = {
    childName: document.getElementById('newChildName').value.trim(),
    childAge: parseInt(document.getElementById('newChildAge').value),
    parentName: document.getElementById('newParentName').value.trim(),
    phone: document.getElementById('newPhone').value.trim(),
    email: document.getElementById('newEmail').value.trim(),
    packageType: packageSel.value,
    packageName: packageOpt.dataset.name || packageOpt.text,
    amount: parseFloat(document.getElementById('newAmount').value),
    paymentMethod: document.getElementById('newPaymentMethod').value,
    notes: document.getElementById('newNotes').value.trim(),
    status: 'active',
    subscriptionStart: firebase.firestore.Timestamp.fromDate(startDate),
    subscriptionEnd: firebase.firestore.Timestamp.fromDate(endDate),
    daysRemaining: 30,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: 'admin'
  };

  try {
    const docRef = await db.collection('subscriptions').add(data);

    // Create user account if email provided
    if (data.email) {
      // Admin creates account via Cloud Function or manually
      // Store email for reference
      await db.collection('subscriptions').doc(docRef.id).update({ emailLinked: true });
    }

    // Send WhatsApp welcome
    sendWelcomeWhatsApp(data.phone, data.childName, data.packageName, endDate);

    showToast('✅ تم إضافة الاشتراك بنجاح');
    clearAddForm();
    await loadAllData();
  } catch (err) {
    showToast('❌ حدث خطأ: ' + err.message);
  }

  btn.disabled = false;
  btn.textContent = '💾 حفظ الاشتراك';
}

function clearAddForm() {
  document.getElementById('newChildName').value = '';
  document.getElementById('newChildAge').value = '';
  document.getElementById('newParentName').value = '';
  document.getElementById('newPhone').value = '';
  document.getElementById('newEmail').value = '';
  document.getElementById('newPackage').value = '';
  document.getElementById('newAmount').value = '';
  document.getElementById('newNotes').value = '';
  document.getElementById('newStartDate').value = '';
}

async function deleteSubscription(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الاشتراك؟')) return;
  try {
    await db.collection('subscriptions').doc(id).delete();
    showToast('✅ تم الحذف');
    await loadAllData();
  } catch (err) {
    showToast('❌ حدث خطأ');
  }
}

// ========== WHATSAPP ==========
function sendWhatsAppReminder(phone, childName, daysLeft) {
  const msg = `مرحباً 👋
  
نود تذكيركم بأن اشتراك ${childName} في أكاديمية سلام ${daysLeft <= 0 ? 'قد انتهى' : `سينتهي خلال ${daysLeft} يوم`}.

للتجديد يرجى التواصل معنا أو زيارة الموقع.

أكاديمية سلام 🏆
93000607`;

  window.open('https://wa.me/965' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}

function sendWelcomeWhatsApp(phone, childName, packageName, endDate) {
  const msg = `مرحباً 👋

يسعدنا انضمام ${childName} إلى أكاديمية سلام! 🏆

الباقة: ${packageName}
تاريخ الانتهاء: ${endDate.toLocaleDateString('ar-KW')}

يمكنكم متابعة تفاصيل الاشتراك من خلال بوابة الأعضاء.

أكاديمية سلام - معاً نحو بناء جيل واثق ومميز 💪`;

  window.open('https://wa.me/965' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}

function sendBulkWhatsApp() {
  const expiring = allSubscriptions.filter(s => {
    const d = calcDaysLeft(s);
    return d !== null && d >= 0 && d <= 7 && s.status === 'active';
  });

  if (expiring.length === 0) {
    showToast('لا توجد اشتراكات تنتهي قريباً');
    return;
  }

  if (!confirm(`سيتم فتح ${expiring.length} نافذة واتساب. تأكد من السماح بالنوافذ المنبثقة.`)) return;

  expiring.forEach((sub, i) => {
    setTimeout(() => {
      sendWhatsAppReminder(sub.phone, sub.childName, calcDaysLeft(sub));
    }, i * 1500);
  });
}

function sendCustomWhatsApp() {
  const phone = document.getElementById('customPhone').value.trim();
  const msg = document.getElementById('customMsg').value.trim();
  if (!phone || !msg) { showToast('يرجى إدخال الهاتف والرسالة'); return; }
  window.open('https://wa.me/965' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}

// ========== NAVIGATION ==========
function showAdminSection(name) {
  document.querySelectorAll('.dashboard-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(name + '-section').style.display = 'block';
  const titles = {
    dashboard: 'لوحة التحكم', subscriptions: 'الاشتراكات',
    expiring: 'تنتهي قريباً', add: 'إضافة اشتراك', notifications: 'الإشعارات'
  };
  document.getElementById('adminPageTitle').textContent = titles[name] || '';
  event.target.classList.add('active');
  document.querySelector('.client-sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.querySelector('.client-sidebar').classList.toggle('open');
}

function adminLogout() {
  auth.signOut().then(() => window.location.href = 'login.html');
}

function showToast(msg) {
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed;top:20px;right:20px;
    background:${msg.includes('❌') ? '#c62828' : '#2e7d32'};
    color:white;padding:14px 22px;border-radius:12px;
    font-family:Tajawal,sans-serif;font-size:1rem;font-weight:600;
    z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.25);direction:rtl;
  `;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
