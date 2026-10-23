// ============================
// ADMIN DASHBOARD JS (app UI)
// ============================
const PKG_NAMES = { football: 'كرة القدم', confidence: 'بناء الثقة والكيوكشن', excellence: 'التميز', excellence_loyal: 'التميز (أسرة سلام)', premium: 'المميزة (قديم)' };
const PKG_ICON = { football: '⚽', confidence: '🥋', excellence: '⚡', excellence_loyal: '🏅', premium: '⚡' };
const TITLES = { dashboard: 'لوحة التحكم', review: 'طلبات المراجعة', members: 'الأعضاء', expiring: 'تنتهي قريباً', paused: 'الإيقافات المؤقتة', add: 'إضافة اشتراك', notify: 'إرسال رسالة', finance: 'المالية', telegram: 'بوت تيليجرام' };
const SUBS = { dashboard: 'نظرة سريعة على الأكاديمية اليوم', review: 'راجع النموذج ثم وافق أو ارفض', members: 'ابحث وصفِّ جميع المشتركين', expiring: 'أرسل تذكير التجديد', paused: 'إيقافات الأسبوع الواحد', add: 'تسجيل مباشر بدون نموذج', notify: 'واتساب للمشتركين', finance: 'الدخل والمصاريف والصافي', telegram: 'سجّل المصاريف من هاتفك' };
let allSubscriptions = [];
let notifReady = false;


async function loadAllData() {
  try {
    const snap = await db.collection('subscriptions').orderBy('createdAt', 'desc').get();
    allSubscriptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStats(); renderRecent(); filterSubscriptions(); renderExpiring(); renderPaused(); renderReview();
  } catch (e) { console.error(e); showToast('❌ تعذر تحميل البيانات'); }
}

// ---------- HELPERS ----------
const toD = ts => ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
const fmtDate = ts => { const d = toD(ts); return d ? d.toLocaleDateString('ar-KW') : '--'; };
const isoDate = ts => { const d = toD(ts); return d ? d.toISOString().split('T')[0] : ''; };
function calcDaysLeft(s) { const e = toD(s.subscriptionEnd); return e ? Math.ceil((e - new Date()) / 864e5) : null; }
function isPausedNow(s) { const a = toD(s.pauseStart), b = toD(s.pauseEnd); if (!a || !b) return false; const n = new Date(); return n >= a && n <= b; }
const ST = { active: ['ok', '✅ نشط'], pending_review: ['gold', '📝 مراجعة'], approved: ['info', '💳 بانتظار الدفع'], pending_payment: ['info', '💳 بانتظار الدفع'], rejected: ['bad', '⛔ مرفوض'], expired: ['bad', '❌ منتهي'], cancelled: ['bad', '🚫 ملغي'] };
const cardClass = s => s.status === 'active' ? (isPausedNow(s) ? 's-paused' : 's-active') : s.status === 'pending_review' ? 's-pending' : (s.status === 'approved' || s.status === 'pending_payment') ? 's-approved' : 's-bad';

// ---------- NAV ----------
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  document.querySelectorAll('.tab[data-page]').forEach(t => t.classList.toggle('on', t.dataset.page === page));
  document.getElementById('adminPageTitle').textContent = TITLES[page] || '';
  document.getElementById('headSub').textContent = SUBS[page] || '';
  const fab = document.querySelector('.fab'); if (fab) { fab.textContent = page === 'finance' ? '💸' : '+'; fab.onclick = page === 'finance' ? () => openTx() : () => go('add'); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showAdminSection(n) { go(n === 'subscriptions' ? 'members' : n); }

// ---------- STATS ----------
function renderStats() {
  const now = new Date();
  const active = allSubscriptions.filter(s => s.status === 'active');
  const expiring = active.filter(s => { const d = calcDaysLeft(s); return d !== null && d >= 0 && d <= 7; });
  const pending = allSubscriptions.filter(s => s.status === 'pending_review').length;
  const rev = allSubscriptions.filter(s => { const c = toD(s.createdAt); return c && c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear() && s.status === 'active'; }).reduce((a, s) => a + (+s.amount || 0), 0);
  set('statPending', pending); set('statActive', active.length); set('statExpiring', expiring.length);
  set('statExpired', allSubscriptions.filter(s => s.status === 'expired').length);
  set('statPaused', allSubscriptions.filter(isPausedNow).length); if (typeof finNetNow === 'function') set('statRevenue', finNetNow()); else set('statRevenue', rev.toFixed(0));
  ['reviewBadge', 'tabReviewDot'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = pending; b.style.display = pending ? 'inline-flex' : 'none'; } });
}
function set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

// ---------- MEMBER CARD ----------
function memberCard(s, opts = {}) {
  const days = calcDaysLeft(s);
  const st = ST[s.status] || ['copper', s.status];
  const daysChip = s.status !== 'active' || days === null ? '' : days < 0 ? `<span class="chip bad">منتهي</span>` : days <= 7 ? `<span class="chip warn">⏳ ${days} يوم</span>` : `<span class="chip ok">⏳ ${days} يوم</span>`;
  const paused = isPausedNow(s) ? `<span class="chip info">⏸️ حتى ${fmtDate(s.pauseEnd)}</span>` : '';
  const actions = [];
  if (s.status === 'pending_review') actions.push(`<button class="abtn ok" onclick="openApprove('${s.id}')">✅ موافقة</button><button class="abtn bad" onclick="rejectRequest('${s.id}')">⛔ رفض</button>`);
  if (s.status === 'approved' || s.status === 'pending_payment') actions.push(`<button class="abtn ok" onclick="activateSubscription('${s.id}')">▶️ تفعيل</button>`);
  if (s.status === 'active' && days !== null && days <= 7) actions.push(`<button class="abtn wa" onclick="sendWhatsAppReminder('${s.phone}','${s.childName}',${days})">📲 تذكير</button>`);
  if (s.status === 'expired') actions.push(`<button class="abtn ok" onclick="activateSubscription('${s.id}')">🔄 تجديد</button>`);
  actions.push(`<button class="abtn" onclick="viewSurvey('${s.id}')">👁️</button><button class="abtn" onclick="openEditModal('${s.id}')">✏️</button><button class="abtn wa" onclick="window.open('https://wa.me/965${s.phone}','_blank')">💬</button>`);
  if (opts.del) actions.push(`<button class="abtn bad" onclick="deleteSubscription('${s.id}')">🗑️</button>`);
  return `<div class="mcard ${cardClass(s)}">
    <div class="mcard-top">
      <div><div class="mcard-name">${s.childName || '--'}<small>${s.childAge ? s.childAge + ' سنة' : ''}</small></div><div class="mcard-sub">👤 ${s.parentName || '--'} · <a href="https://wa.me/965${s.phone}" target="_blank" dir="ltr" style="color:var(--copper);font-weight:800">${s.phone || '--'}</a></div></div>
      <span class="chip ${st[0]}">${st[1]}</span>
    </div>
    <div class="mcard-meta"><span class="chip copper">${PKG_ICON[s.packageType] || '📦'} ${PKG_NAMES[s.packageType] || s.packageName || '--'} · ${s.amount || '--'} د.ك</span>${daysChip}${paused}${s.loyaltyMember ? '<span class="chip gold">🏅 أسرة سلام</span>' : ''}${s.subscriptionEnd && s.status === 'active' ? `<span class="chip">ينتهي ${fmtDate(s.subscriptionEnd)}</span>` : ''}</div>
    <div class="mcard-actions">${actions.join('')}</div>
  </div>`;
}
const emptyBox = (ico, txt) => `<div class="empty"><b>${ico}</b>${txt}</div>`;

function renderRecent() { document.getElementById('recentList').innerHTML = allSubscriptions.length ? allSubscriptions.slice(0, 5).map(s => memberCard(s)).join('') : emptyBox('📭', 'لا توجد اشتراكات بعد'); }

// ---------- MEMBERS + FILTERS ----------
function setFilter(v) { document.getElementById('filterStatus').value = v; document.querySelectorAll('#statusSegs .seg').forEach(b => b.classList.toggle('on', b.dataset.v === v)); filterSubscriptions(); }
function setPkg(v) { document.getElementById('filterPackage').value = v; document.querySelectorAll('#pkgSegs .seg').forEach(b => b.classList.toggle('on', b.dataset.v === v)); filterSubscriptions(); }
function filterSubscriptions() {
  const st = document.getElementById('filterStatus').value, pk = document.getElementById('filterPackage').value, q = (document.getElementById('searchInput').value || '').toLowerCase();
  let list = allSubscriptions;
  if (st !== 'all') list = list.filter(s => st === 'approved' ? (s.status === 'approved' || s.status === 'pending_payment') : s.status === st);
  if (pk !== 'all') list = list.filter(s => (s.packageType || '').startsWith(pk));
  if (q) list = list.filter(s => (s.childName || '').toLowerCase().includes(q) || (s.parentName || '').toLowerCase().includes(q) || (s.phone || '').includes(q));
  document.getElementById('allSubsList').innerHTML = list.length ? list.map(s => memberCard(s, { del: true })).join('') : emptyBox('🔍', 'لا توجد نتائج');
}

// ---------- EXPIRING ----------
function renderExpiring() {
  const list = allSubscriptions.filter(s => s.status === 'active' && calcDaysLeft(s) !== null && calcDaysLeft(s) >= 0 && calcDaysLeft(s) <= 7).sort((a, b) => calcDaysLeft(a) - calcDaysLeft(b));
  document.getElementById('expiringList').innerHTML = list.length ? list.map(s => memberCard(s)).join('') : emptyBox('✅', 'لا توجد اشتراكات تنتهي قريباً');
}

// ---------- PAUSED ----------
function renderPaused() {
  const list = allSubscriptions.filter(s => s.pauseStart).sort((a, b) => toD(b.pauseStart) - toD(a.pauseStart));
  document.getElementById('pausedList').innerHTML = list.length ? list.map(s => {
    const now = isPausedNow(s), future = toD(s.pauseStart) > new Date();
    const state = now ? '<span class="chip info">⏸️ جارٍ الآن</span>' : future ? '<span class="chip gold">🕒 قادم</span>' : '<span class="chip ok">✔️ انتهى</span>';
    return `<div class="mcard s-paused"><div class="mcard-top"><div><div class="mcard-name">${s.childName}</div><div class="mcard-sub">👤 ${s.parentName} · <span dir="ltr">${s.phone}</span></div></div>${state}</div>
      <div class="mcard-meta"><span class="chip">من ${fmtDate(s.pauseStart)}</span><span class="chip">إلى ${fmtDate(s.pauseEnd)}</span><span class="chip copper">${PKG_NAMES[s.packageType] || ''}</span>${s.pauseReason ? `<span class="chip">📝 ${s.pauseReason}</span>` : ''}</div>
      <div class="mcard-actions">${(now || future) ? `<button class="abtn bad" onclick="cancelPause('${s.id}')">إلغاء الإيقاف</button>` : ''}<button class="abtn wa" onclick="window.open('https://wa.me/965${s.phone}','_blank')">💬 واتساب</button></div></div>`;
  }).join('') : emptyBox('⏸️', 'لا توجد إيقافات');
}
async function cancelPause(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  if (!confirm(`إلغاء الإيقاف المؤقت لـ ${s.childName}؟ سيتم إرجاع تاريخ الانتهاء 7 أيام.`)) return;
  const end = toD(s.subscriptionEnd);
  const upd = { pauseStart: firebase.firestore.FieldValue.delete(), pauseEnd: firebase.firestore.FieldValue.delete(), pauseUsed: false, pauseReason: firebase.firestore.FieldValue.delete() };
  if (end) { end.setDate(end.getDate() - 7); upd.subscriptionEnd = firebase.firestore.Timestamp.fromDate(end); }
  try { await db.collection('subscriptions').doc(id).update(upd); showToast('تم إلغاء الإيقاف'); await loadAllData(); } catch (e) { showToast('❌ ' + e.message); }
}

// ---------- REVIEW ----------
function surveyBody(s) {
  return `<div class="kv">
    <div><label>📱 الهاتف</label><a href="https://wa.me/965${s.phone}" target="_blank" dir="ltr">${s.phone || '--'}</a>${s.phone2 ? ` · <a href="https://wa.me/965${s.phone2}" target="_blank" dir="ltr">${s.phone2}</a>` : ''}</div>
    <div><label>📧 البريد</label>${s.email || '--'}</div>
    <div><label>🎂 الميلاد</label><span dir="ltr">${s.birthDate || '--'}</span>${s.childAge ? ` (${s.childAge} سنة)` : ''}</div>
    <div><label>🏆 البطولات</label>${s.tournamentsConsent || '--'}</div>
    <div class="w"><label>🩺 مشاكل صحية</label>${s.healthIssues || '--'}</div>
    <div class="w"><label>🤧 حساسية</label>${s.allergies || '--'}</div>
    <div class="w"><label>🎯 سبب التسجيل</label>${s.reason || '--'}</div>
    ${s.notes ? `<div class="w"><label>📝 ملاحظات</label>${s.notes}</div>` : ''}${s.adminNote ? `<div class="w"><label>🗒️ ملاحظة الإدارة</label>${s.adminNote}</div>` : ''}
  </div>`;
}
function renderReview() {
  const list = allSubscriptions.filter(s => s.status === 'pending_review');
  set('reviewCount', list.length ? list.length + ' طلب' : '');
  document.getElementById('reviewList').innerHTML = list.length ? list.map(s => `<div class="mcard s-pending">
    <div class="mcard-top"><div><div class="mcard-name">${s.childName}<small>${s.childAge ? s.childAge + ' سنة' : ''}</small></div><div class="mcard-sub">👤 ${s.parentName} · ${fmtDate(s.createdAt)}</div></div><span class="chip gold">📝 جديد</span></div>
    <div class="mcard-meta"><span class="chip copper">${PKG_ICON[s.packageType] || ''} ${s.packageName || ''} · ${s.amount} د.ك</span>${s.loyaltyMember ? '<span class="chip gold">🏅 أسرة سلام</span>' : ''}</div>
    ${surveyBody(s)}
    <div class="mcard-actions"><button class="abtn ok" style="flex:2" onclick="openApprove('${s.id}')">✅ موافقة</button><button class="abtn bad" onclick="rejectRequest('${s.id}')">⛔ رفض</button><button class="abtn wa" onclick="window.open('https://wa.me/965${s.phone}?text=${encodeURIComponent('مرحباً ' + s.parentName + '، بخصوص طلب تسجيل ' + s.childName + ' في أكاديمية سلام')}','_blank')">💬</button></div>
  </div>`).join('') : emptyBox('🎉', 'لا توجد طلبات بانتظار المراجعة');
}
function viewSurvey(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  const st = ST[s.status] || ['copper', s.status];
  document.getElementById('detailBody').innerHTML = `<h3>${s.childName}</h3><p class="sub">👤 ${s.parentName} · <span class="chip ${st[0]}">${st[1]}</span></p>
    <div class="mcard-meta" style="margin:0 0 6px"><span class="chip copper">${s.packageName || ''} · ${s.amount} د.ك</span>${s.subscriptionStart ? `<span class="chip">من ${fmtDate(s.subscriptionStart)}</span><span class="chip">إلى ${fmtDate(s.subscriptionEnd)}</span>` : ''}</div>
    ${surveyBody(s)}<button class="btn ghost" style="margin-top:14px" onclick="document.getElementById('detailModal').classList.remove('open')">إغلاق</button>`;
  document.getElementById('detailModal').classList.add('open');
}
function openApprove(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  document.getElementById('apId').value = id; document.getElementById('apName').textContent = `${s.childName} — ${s.packageName}`;
  document.getElementById('apAmount').value = s.loyaltyMember && s.packageType === 'excellence' ? 100 : (s.amount || '');
  document.getElementById('apStart').value = new Date().toISOString().split('T')[0]; document.getElementById('apNote').value = '';
  document.getElementById('approveModal').classList.add('open');
}
function closeApprove() { document.getElementById('approveModal').classList.remove('open'); }
async function confirmApprove() {
  const id = document.getElementById('apId').value; const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  const amount = parseFloat(document.getElementById('apAmount').value) || s.amount, note = document.getElementById('apNote').value.trim();
  const start = new Date(document.getElementById('apStart').value); const end = new Date(start); end.setDate(end.getDate() + 30);
  try {
    await db.collection('subscriptions').doc(id).update({ status: 'approved', amount, adminNote: note, approvedAt: firebase.firestore.FieldValue.serverTimestamp(), plannedStart: firebase.firestore.Timestamp.fromDate(start), plannedEnd: firebase.firestore.Timestamp.fromDate(end) });
    closeApprove();
    const msg = `السلام عليكم ${s.parentName} 👋\n\nيسعدنا إبلاغكم بالموافقة على تسجيل ${s.childName} في أكاديمية سلام 🏆\n\nالباقة: ${s.packageName}\nالرسوم الشهرية: ${amount} د.ك\nبداية الاشتراك: ${start.toLocaleDateString('ar-KW')}${note ? '\n' + note : ''}\n\nلإتمام التسجيل يرجى سداد الرسوم عبر بوابة الأعضاء أو التحويل، وسيتم تفعيل الاشتراك فور استلام الدفع.\n\nأكاديمية سلام — معاً نحو بناء جيل واثق ومميز 💪\n93000607`;
    window.open('https://wa.me/965' + s.phone + '?text=' + encodeURIComponent(msg), '_blank');
    showToast('✅ تمت الموافقة'); await loadAllData();
  } catch (e) { showToast('❌ ' + e.message); }
}
async function rejectRequest(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  const reason = prompt('سبب الرفض (يُرسل للأهل عبر واتساب، اتركه فارغاً لعدم الإرسال):', ''); if (reason === null) return;
  try {
    await db.collection('subscriptions').doc(id).update({ status: 'rejected', adminNote: reason, rejectedAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (reason) window.open('https://wa.me/965' + s.phone + '?text=' + encodeURIComponent(`السلام عليكم ${s.parentName}،\n\nنشكركم على اهتمامكم بأكاديمية سلام. للأسف لا يمكننا قبول طلب تسجيل ${s.childName} حالياً.\n\nالسبب: ${reason}\n\nللاستفسار: 93000607`), '_blank');
    showToast('تم رفض الطلب'); await loadAllData();
  } catch (e) { showToast('❌ ' + e.message); }
}
async function activateSubscription(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  if (!confirm(`تأكيد استلام الدفع وتفعيل اشتراك ${s.childName} لمدة 30 يوماً؟`)) return;
  const start = s.status === 'expired' ? new Date() : (toD(s.plannedStart) || new Date()); const end = new Date(start); end.setDate(end.getDate() + 30);
  try {
    await db.collection('subscriptions').doc(id).update({ status: 'active', subscriptionStart: firebase.firestore.Timestamp.fromDate(start), subscriptionEnd: firebase.firestore.Timestamp.fromDate(end), daysRemaining: 30, paidAt: firebase.firestore.FieldValue.serverTimestamp(), pauseUsed: false, pauseStart: firebase.firestore.FieldValue.delete(), pauseEnd: firebase.firestore.FieldValue.delete() });
    await recordIncomeForSub(s, s.amount);
    sendWelcomeWhatsApp(s.phone, s.childName, s.packageName, end); showToast('✅ تم التفعيل'); await loadAllData();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ---------- EDIT ----------
function openEditModal(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  document.getElementById('editSubId').value = id; document.getElementById('editName').textContent = `${s.childName} — ${s.packageName || ''}`;
  document.getElementById('editStatus').value = s.status || 'active'; document.getElementById('editNotes').value = s.notes || '';
  document.getElementById('editStartDate').value = isoDate(s.subscriptionStart); document.getElementById('editEndDate').value = isoDate(s.subscriptionEnd);
  document.getElementById('editModal').classList.add('open');
}
function closeEditModal() { document.getElementById('editModal').classList.remove('open'); }
async function saveEdit() {
  const id = document.getElementById('editSubId').value;
  const upd = { status: document.getElementById('editStatus').value, notes: document.getElementById('editNotes').value };
  const sv = document.getElementById('editStartDate').value, ev = document.getElementById('editEndDate').value;
  if (sv) upd.subscriptionStart = firebase.firestore.Timestamp.fromDate(new Date(sv));
  if (ev) { upd.subscriptionEnd = firebase.firestore.Timestamp.fromDate(new Date(ev)); upd.daysRemaining = Math.max(0, Math.ceil((new Date(ev) - new Date()) / 864e5)); }
  try { await db.collection('subscriptions').doc(id).update(upd); closeEditModal(); showToast('✅ تم الحفظ'); await loadAllData(); } catch (e) { showToast('❌ ' + e.message); }
}
async function deleteSubscription(id) {
  if (!confirm('حذف هذا الاشتراك نهائياً؟')) return;
  try { await db.collection('subscriptions').doc(id).delete(); showToast('تم الحذف'); await loadAllData(); } catch (e) { showToast('❌ خطأ'); }
}

// ---------- ADD ----------
function updatePackagePrice() { const o = document.getElementById('newPackage').selectedOptions[0]; if (o && o.dataset.price) document.getElementById('newAmount').value = o.dataset.price; }
async function saveSubscription(e) {
  e.preventDefault(); const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
  const o = document.getElementById('newPackage').selectedOptions[0];
  const start = new Date(document.getElementById('newStartDate').value); const end = new Date(start); end.setDate(end.getDate() + 30);
  const data = { childName: v('newChildName'), childAge: +v('newChildAge'), parentName: v('newParentName'), phone: v('newPhone').replace(/\D/g, ''), email: v('newEmail'), packageType: o.value, packageName: o.dataset.name, amount: +document.getElementById('newAmount').value, paymentMethod: v('newPaymentMethod'), notes: v('newNotes'), status: 'active', termsAccepted: true, subscriptionStart: firebase.firestore.Timestamp.fromDate(start), subscriptionEnd: firebase.firestore.Timestamp.fromDate(end), daysRemaining: 30, pauseUsed: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin', source: 'admin' };
  try { const ref = await db.collection('subscriptions').add(data); await recordIncomeForSub({ id: ref.id, ...data }, data.amount, data.paymentMethod); sendWelcomeWhatsApp(data.phone, data.childName, data.packageName, end); showToast('✅ تمت الإضافة'); clearAddForm(); await loadAllData(); go('members'); }
  catch (err) { showToast('❌ ' + err.message); }
  btn.disabled = false; btn.textContent = '💾 حفظ وتفعيل الاشتراك';
}
function v(id) { return (document.getElementById(id).value || '').trim(); }
function clearAddForm() { ['newChildName', 'newChildAge', 'newParentName', 'newPhone', 'newEmail', 'newPackage', 'newAmount', 'newNotes', 'newStartDate'].forEach(i => document.getElementById(i).value = ''); }

// ---------- WHATSAPP ----------
function sendWhatsAppReminder(phone, child, days) {
  const msg = `مرحباً 👋\n\nنود تذكيركم بأن اشتراك ${child} في أكاديمية سلام ${days <= 0 ? 'قد انتهى' : `سينتهي خلال ${days} يوم`}.\n\nللتجديد يرجى التواصل معنا أو الدفع عبر بوابة الأعضاء.\n\nأكاديمية سلام 🏆\n93000607`;
  window.open('https://wa.me/965' + String(phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}
function sendWelcomeWhatsApp(phone, child, pkg, end) {
  const msg = `مرحباً 👋\n\nيسعدنا انضمام ${child} إلى أكاديمية سلام! 🏆\n\nالباقة: ${pkg}\nتاريخ الانتهاء: ${end.toLocaleDateString('ar-KW')}\n\nتابع تفاصيل الاشتراك من بوابة الأعضاء.\n\nأكاديمية سلام — معاً نحو بناء جيل واثق ومميز 💪`;
  window.open('https://wa.me/965' + String(phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}
function sendBulkWhatsApp() {
  const list = allSubscriptions.filter(s => s.status === 'active' && calcDaysLeft(s) !== null && calcDaysLeft(s) >= 0 && calcDaysLeft(s) <= 7);
  if (!list.length) return showToast('لا توجد اشتراكات تنتهي قريباً');
  if (!confirm(`سيتم فتح ${list.length} نافذة واتساب. اسمح بالنوافذ المنبثقة.`)) return;
  list.forEach((s, i) => setTimeout(() => sendWhatsAppReminder(s.phone, s.childName, calcDaysLeft(s)), i * 1500));
}
function sendCustomWhatsApp() {
  const p = v('customPhone'), m = v('customMsg'); if (!p || !m) return showToast('أدخل الهاتف والرسالة');
  window.open('https://wa.me/965' + p.replace(/\D/g, '') + '?text=' + encodeURIComponent(m), '_blank');
}

// ---------- NOTIFICATIONS ----------
function setupAdminNotifications(user) {
  const saveToken = t => db.collection('admins').doc(user.uid).set({ fcmTokens: firebase.firestore.FieldValue.arrayUnion(t) }, { merge: true });
  if (window.Notification && Notification.permission === 'default') {
    const b = document.createElement('div'); b.className = 'banner notif';
    b.innerHTML = `<span>🔔 فعّل الإشعارات لتصلك الطلبات والإيقافات فوراً</span><button id="notifOn">تفعيل</button><button class="x" onclick="this.parentElement.remove()">✕</button>`;
    document.querySelector('.app-head').insertAdjacentElement('afterend', b);
    b.querySelector('#notifOn').onclick = async () => { const ok = await Notif.ask(); b.remove(); if (ok) { Notif.show('تم تفعيل الإشعارات ✅', 'ستصلك تنبيهات لوحة الإدارة هنا'); Notif.registerPush(saveToken); } };
  }
  if (Notif.granted()) Notif.registerPush(saveToken);
  db.collection('subscriptions').onSnapshot(snap => {
    if (!notifReady) { notifReady = true; return; }
    snap.docChanges().forEach(ch => {
      const d = ch.doc.data();
      if (ch.type === 'added' && d.status === 'pending_review') Notif.show('📝 طلب تسجيل جديد', `${d.childName} — ${d.packageName}`, 'dashboard.html');
      if (ch.type === 'modified' && d.pauseStart) { const prev = allSubscriptions.find(x => x.id === ch.doc.id); if (prev && !prev.pauseStart) Notif.show('⏸️ إيقاف مؤقت جديد', `${d.childName} — من ${fmtDate(d.pauseStart)}`, 'dashboard.html'); }
    });
    loadAllData();
  });
}

// ---------- MISC ----------
function adminLogout() { if (confirm('تسجيل الخروج؟')) auth.signOut().then(() => location.href = 'login.html'); }
function showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; if (msg.includes('❌')) t.style.background = '#C62828'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});

// ---------- AUTH ----------
auth.onAuthStateChanged(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  const a = await db.collection('admins').doc(user.uid).get();
  if (!a.exists) { await auth.signOut(); location.href = 'login.html'; return; }
  loadAllData();
  setupAdminNotifications(user);
});

async function recordIncomeForSub(s, amount, method) {
  try {
    await db.collection('transactions').add({ type: 'income', amount: +amount || 0, category: 'اشتراكات', note: `اشتراك ${s.childName} — ${s.packageName || ''}`, method: method || 'cash', date: new Date().toISOString().split('T')[0], subId: s.id, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' });
    if (typeof loadFinance === 'function') loadFinance();
  } catch (e) { console.warn('income tx', e); }
}
