// ============================
// ADMIN DASHBOARD JS (app UI)
// ============================
const PKG_NAMES = { football: 'كرة القدم', confidence: 'بناء الثقة والكيوكشن', excellence: 'التميز', excellence_loyal: 'التميز (أسرة سلام)', premium: 'المميزة (قديم)' };
const PKG_ICON = { football: '⚽', confidence: '🥋', excellence: '⚡', excellence_loyal: '🏅', premium: '⚡' };
const TITLES = { dashboard: 'لوحة التحكم', review: 'طلبات المراجعة', members: 'الأعضاء', expiring: 'تنتهي قريباً', paused: 'الإيقافات المؤقتة', add: 'إضافة اشتراك', notify: 'إرسال رسالة', finance: 'المالية', telegram: 'بوت تيليجرام' };
const SUBS = { dashboard: 'نظرة سريعة على الأكاديمية اليوم', review: 'راجع النموذج ثم وافق أو ارفض', members: 'ابحث وصفِّ جميع المشتركين', expiring: 'أرسل تذكير التجديد', paused: 'إيقافات اليوم الواحد (3 شهرياً)', add: 'تسجيل مباشر بدون نموذج', notify: 'واتساب للمشتركين', finance: 'الدخل والمصاريف والصافي', telegram: 'سجّل المصاريف من هاتفك' };
let allSubscriptions = [], allPortals = [];
let notifReady = false;


async function loadAllData() {
  try {
    const snap = await db.collection('subscriptions').orderBy('createdAt', 'desc').get();
    allSubscriptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const ps = await db.collection('portal').get(); allPortals = ps.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStats(); renderRecent(); filterSubscriptions(); renderExpiring(); renderPaused(); renderReview(); expiryAlert();
    syncPortalsIfNeeded();
  } catch (e) { console.error(e); showToast('❌ تعذر تحميل البيانات'); }
}

// ---------- HELPERS ----------
const toD = ts => ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
const fmtDate = ts => { const d = toD(ts); return d ? d.toLocaleDateString('ar-KW') : '--'; };
const isoDate = ts => { const d = toD(ts); return d ? d.toISOString().split('T')[0] : ''; };
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };
const tsFromIso = iso => firebase.firestore.Timestamp.fromDate(new Date(iso + 'T00:00:00Z'));
const todayIso = () => new Date().toLocaleDateString('en-CA');
function autoEndDate(startId, endId) { const sv = document.getElementById(startId).value; if (sv) document.getElementById(endId).value = addDaysIso(sv, 30); }
// Firestore writes can hang on a weak connection — never leave a button spinning forever
const withTimeout = (p, ms = 15000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const SLOW_MSG = '❌ الاتصال ضعيف ولم يتأكد الحفظ — تحقق من الإنترنت واضغط حفظ مرة أخرى';
function calcDaysLeft(s) { const e = toD(s.subscriptionEnd); return e ? Math.ceil((e - new Date()) / 864e5) : null; }
const dayKey = d => (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];
const pausesOf = s => Array.isArray(s.pauses) ? s.pauses : (s.pauseStart ? [{ date: dayKey(toD(s.pauseStart)), end: dayKey(toD(s.pauseEnd || s.pauseStart)) }] : []);
function isPausedNow(s) { const t = dayKey(new Date()); return pausesOf(s).some(p => p.date === t || (p.end && t >= p.date && t <= p.end)); }
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
  set('statPaused', allSubscriptions.filter(isPausedNow).length + (pauseRequests().length ? ' +' + pauseRequests().length : '')); if (typeof finNetNow === 'function') set('statRevenue', finNetNow()); else set('statRevenue', rev.toFixed(0));
  ['reviewBadge', 'tabReviewDot'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = pending; b.style.display = pending ? 'inline-flex' : 'none'; } });
}
function set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

// ---------- MEMBER CARD ----------
function memberCard(s, opts = {}) {
  const days = calcDaysLeft(s);
  const st = ST[s.status] || ['copper', s.status];
  const daysChip = s.status !== 'active' || days === null ? '' : days < 0 ? `<span class="chip bad">منتهي</span>` : days <= 7 ? `<span class="chip warn">⏳ ${days} يوم</span>` : `<span class="chip ok">⏳ ${days} يوم</span>`;
  const paused = isPausedNow(s) ? `<span class="chip info">⏸️ متوقف اليوم</span>` : (pausesOf(s).length ? `<span class="chip">⏸️ ${pausesOf(s).length}/3</span>` : '');
  const actions = [];
  if (s.status === 'pending_review') actions.push(`<button class="abtn ok" onclick="openApprove('${s.id}')">✅ موافقة</button><button class="abtn bad" onclick="rejectRequest('${s.id}')">⛔ رفض</button>`);
  if (s.status === 'approved' || s.status === 'pending_payment') actions.push(`<button class="abtn ok" onclick="activateSubscription('${s.id}')">▶️ تفعيل</button>`);
  if (s.status === 'active' && days !== null && days <= 7) actions.push(`<button class="abtn wa" onclick="sendWhatsAppReminder('${s.phone}','${s.childName}',${days})">📲 تذكير</button>`);
  if (s.status === 'expired' || (s.status === 'active' && days !== null && days <= 7)) actions.push(`<button class="abtn primary" onclick="sendRenewalLink('${s.id}')">📲 رابط التجديد</button>`);
  if (s.status === 'expired') actions.push(`<button class="abtn ok" onclick="activateSubscription('${s.id}')">🔄 تجديد يدوي</button>`);
  actions.push(`<button class="abtn" onclick="viewSurvey('${s.id}')">👁️</button><button class="abtn" onclick="openEditModal('${s.id}')">✏️ تعديل</button><button class="abtn wa" onclick="window.open('https://wa.me/965${s.phone}','_blank')">💬</button>`);
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

// 3-day warning: banner on the home page + one notification per day
function expiryAlert() {
  const soon = allSubscriptions.filter(s => s.status === 'active' && (d => d !== null && d >= 0 && d <= 3)(calcDaysLeft(s))).sort((a, b) => calcDaysLeft(a) - calcDaysLeft(b));
  const el = document.getElementById('expAlert'); if (!el) return;
  const left = s => { const d = calcDaysLeft(s); return d === 0 ? 'ينتهي اليوم' : `${d} يوم`; };
  el.innerHTML = soon.length ? `<div class="exp-alert" onclick="go('expiring')"><b>⏳ ${soon.length} اشتراك ينتهي خلال 3 أيام</b><small>${soon.slice(0, 4).map(s => `${s.childName} (${left(s)})`).join('، ')}${soon.length > 4 ? '…' : ''}</small><span>أرسل رابط التجديد ←</span></div>` : '';
  if (!soon.length) return;
  try { const k = 'expAlert-' + todayIso(); if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (_) { return; }
  Notif.show('⏳ اشتراكات تنتهي خلال 3 أيام', soon.map(s => `${s.childName} (${left(s)})`).join('، '), 'dashboard.html');
}

// ---------- PAUSED ----------
function pauseRequests() { const out = []; allPortals.forEach(p => (p.pauseRequests || []).forEach((r, i) => { if (r.status === 'pending') out.push({ ...r, phone: p.id, idx: i, parentName: p.parentName }); })); return out; }
function renderPaused() {
  const reqs = pauseRequests();
  const reqHtml = reqs.length ? `<div class="page-title" style="margin-top:0"><h3>🕒 طلبات إيقاف بانتظار الموافقة</h3><span>${reqs.length}</span></div>` + reqs.map(r => { const s = allSubscriptions.find(x => x.id === r.subId); const used = s ? pausesOf(s).length : 0; return `<div class="mcard s-pending"><div class="mcard-top"><div><div class="mcard-name">${r.childName}</div><div class="mcard-sub">👤 ${r.parentName || ''} · <span dir="ltr">${r.phone}</span></div></div><span class="chip gold">🕒 طلب</span></div><div class="mcard-meta"><span class="chip info">📅 ${r.start}</span><span class="chip">يوم واحد</span><span class="chip ${used >= 3 ? 'bad' : ''}">مستخدم ${used}/3</span>${r.reason ? `<span class="chip">📝 ${r.reason}</span>` : ''}</div><div class="mcard-actions"><button class="abtn ok" style="flex:2" onclick="approvePause('${r.phone}',${r.idx})">✅ موافقة (+1 يوم)</button><button class="abtn bad" onclick="rejectPause('${r.phone}',${r.idx})">⛔ رفض</button><button class="abtn wa" onclick="window.open('https://wa.me/965${r.phone}','_blank')">💬</button></div></div>`; }).join('') + '<div class="page-title"><h3>⏸️ الإيقافات هذا الشهر</h3></div>' : '';
  const list = allSubscriptions.filter(s => pausesOf(s).length).sort((a, b) => pausesOf(b).length - pausesOf(a).length);
  document.getElementById('pausedList').innerHTML = reqHtml + (list.length ? list.map(s => `<div class="mcard ${isPausedNow(s) ? 's-paused' : ''}"><div class="mcard-top"><div><div class="mcard-name">${s.childName}</div><div class="mcard-sub">👤 ${s.parentName} · <span dir="ltr">${s.phone}</span></div></div>${isPausedNow(s) ? '<span class="chip info">⏸️ متوقف اليوم</span>' : `<span class="chip">${pausesOf(s).length}/3</span>`}</div>
      <div class="mcard-meta">${pausesOf(s).map(p => `<span class="chip ${p.date === dayKey(new Date()) ? 'info' : p.date > dayKey(new Date()) ? 'gold' : 'ok'}">📅 ${p.date}${p.reason ? ' · ' + p.reason : ''}</span>`).join('')}<span class="chip copper">${PKG_NAMES[s.packageType] || ''}</span></div>
      <div class="mcard-actions"><button class="abtn primary" onclick="openEditModal('${s.id}',true)">✏️ تعديل الإيقافات</button><button class="abtn wa" onclick="window.open('https://wa.me/965${s.phone}','_blank')">💬 واتساب</button></div></div>`).join('') : emptyBox('⏸️', 'لا توجد إيقافات'));
}
async function approvePause(phone, idx) {
  const p = allPortals.find(x => x.id === phone); const r = p?.pauseRequests?.[idx]; if (!r) return;
  const s = allSubscriptions.find(x => x.id === r.subId); if (!s) return showToast('❌ الاشتراك غير موجود');
  const used = pausesOf(s); if (used.length >= 3) return showToast('❌ استنفد 3 إيقافات هذا الشهر');
  if (!confirm(`الموافقة على إيقاف ${s.childName} يوم ${r.start}؟ سيُمدَّد الاشتراك يوماً واحداً.`)) return;
  const ne = toD(s.subscriptionEnd); if (ne) ne.setDate(ne.getDate() + 1);
  const reqs = p.pauseRequests.slice(); reqs[idx] = { ...r, status: 'approved', decidedAt: new Date().toISOString() };
  try {
    await db.collection('subscriptions').doc(s.id).update({ pauses: [...used, { date: r.start, reason: r.reason || '', approvedAt: new Date().toISOString() }], pauseUsed: used.length + 1 >= 3, ...(ne ? { subscriptionEnd: firebase.firestore.Timestamp.fromDate(ne) } : {}) });
    await db.collection('portal').doc(phone).update({ pauseRequests: reqs }); await PortalSync.syncPhone(db, phone);
    window.open('https://wa.me/965' + phone + '?text=' + encodeURIComponent(`تمت الموافقة على إيقاف اشتراك ${s.childName} يوم ${r.start} ✅\nتم تمديد الاشتراك يوماً واحداً${ne ? ' — ينتهي الآن ' + ne.toLocaleDateString('ar-KW') : ''}.\nالمتبقي من الإيقافات هذا الشهر: ${Math.max(0, 2 - used.length)}\nأكاديمية سلام`), '_blank');
    showToast('✅ تمت الموافقة'); await loadAllData();
  } catch (e) { showToast('❌ ' + e.message); }
}
async function rejectPause(phone, idx) {
  const p = allPortals.find(x => x.id === phone); const r = p?.pauseRequests?.[idx]; if (!r) return;
  const reason = prompt('سبب الرفض (اختياري):', ''); if (reason === null) return;
  const reqs = p.pauseRequests.slice(); reqs[idx] = { ...r, status: 'rejected', decidedAt: new Date().toISOString(), adminNote: reason };
  await db.collection('portal').doc(phone).update({ pauseRequests: reqs });
  if (reason) window.open('https://wa.me/965' + phone + '?text=' + encodeURIComponent(`بخصوص طلب إيقاف اشتراك ${r.childName}: للأسف لا يمكن قبوله حالياً.\n${reason}\nأكاديمية سلام 93000607`), '_blank');
  showToast('تم الرفض'); await loadAllData();
}
async function cancelPause(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return; const used = pausesOf(s); if (!used.length) return;
  const last = used[used.length - 1];
  if (!confirm(`إلغاء إيقاف ${s.childName} يوم ${last.date}؟ سيُرجَع تاريخ الانتهاء يوماً واحداً.`)) return;
  const end = toD(s.subscriptionEnd); if (end) end.setDate(end.getDate() - 1);
  try { await db.collection('subscriptions').doc(id).update({ pauses: used.slice(0, -1), pauseUsed: false, pauseStart: firebase.firestore.FieldValue.delete(), pauseEnd: firebase.firestore.FieldValue.delete(), ...(end ? { subscriptionEnd: firebase.firestore.Timestamp.fromDate(end) } : {}) }); await PortalSync.syncPhone(db, s.phone); showToast('تم إلغاء الإيقاف'); await loadAllData(); } catch (e) { showToast('❌ ' + e.message); }
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
    closeApprove(); await PortalSync.syncPhone(db, s.phone);
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
    await PortalSync.syncPhone(db, s.phone);
    if (reason) window.open('https://wa.me/965' + s.phone + '?text=' + encodeURIComponent(`السلام عليكم ${s.parentName}،\n\nنشكركم على اهتمامكم بأكاديمية سلام. للأسف لا يمكننا قبول طلب تسجيل ${s.childName} حالياً.\n\nالسبب: ${reason}\n\nللاستفسار: 93000607`), '_blank');
    showToast('تم رفض الطلب'); await loadAllData();
  } catch (e) { showToast('❌ ' + e.message); }
}
async function activateSubscription(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  if (!confirm(`تأكيد استلام الدفع وتفعيل اشتراك ${s.childName} لمدة 30 يوماً؟`)) return;
  const start = s.status === 'expired' ? new Date() : (toD(s.plannedStart) || new Date()); const end = new Date(start); end.setDate(end.getDate() + 30);
  try {
    await db.collection('subscriptions').doc(id).update({ status: 'active', subscriptionStart: firebase.firestore.Timestamp.fromDate(start), subscriptionEnd: firebase.firestore.Timestamp.fromDate(end), daysRemaining: 30, paidAt: firebase.firestore.FieldValue.serverTimestamp(), pauseUsed: false, pauses: [], pauseStart: firebase.firestore.FieldValue.delete(), pauseEnd: firebase.firestore.FieldValue.delete() });
    await recordIncomeForSub(s, s.amount); await PortalSync.syncPhone(db, s.phone);
    sendWelcomeWhatsApp(s.phone, s.childName, s.packageName, end); showToast('✅ تم التفعيل'); await loadAllData();
  } catch (e) { showToast('❌ ' + e.message); }
}

// ---------- EDIT ----------
function fillEditPackages(s) {
  const sel = document.getElementById('editPackage');
  sel.innerHTML = [...document.getElementById('newPackage').options].filter(o => o.value).map(o => o.outerHTML).join('');
  if (s.packageType && ![...sel.options].some(o => o.value === s.packageType)) sel.insertAdjacentHTML('beforeend', `<option value="${s.packageType}" data-name="${s.packageName || ''}">${PKG_NAMES[s.packageType] || s.packageName || s.packageType}</option>`);
  sel.value = s.packageType || '';
}
let editPauses = [];
function renderEditPauses() {
  document.getElementById('editPauses').innerHTML = editPauses.length ? editPauses.map((p, i) => `<div class="pause-row"><input type="date" value="${p.date || ''}" onchange="editPauses[${i}].date=this.value"/><input type="text" value="${(p.reason || '').replace(/"/g, '&quot;')}" placeholder="السبب" onchange="editPauses[${i}].reason=this.value"/><button type="button" onclick="removeEditPause(${i})" title="حذف">🗑️</button></div>`).join('') : '<div class="hint">لا توجد إيقافات</div>';
  document.getElementById('editPauseCount').textContent = `${editPauses.length}/3`;
}
function shiftEditEnd(days) { const e = document.getElementById('editEndDate'); if (e.value) e.value = addDaysIso(e.value, days); }
function addEditPause() {
  if (editPauses.length >= 3 && !confirm('استخدم 3 إيقافات هذا الشهر. إضافة إيقاف آخر على أي حال؟')) return;
  editPauses.push({ date: todayIso(), reason: '', approvedAt: new Date().toISOString(), by: 'admin' }); shiftEditEnd(1); renderEditPauses();
  showToast('➕ أُضيف إيقاف — مُدّد الاشتراك يوماً');
}
function removeEditPause(i) { editPauses.splice(i, 1); shiftEditEnd(-1); renderEditPauses(); showToast('🗑️ حُذف الإيقاف — أُرجع تاريخ النهاية يوماً'); }
function openEditModal(id, toPauses) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  const set = (k, val) => document.getElementById(k).value = val ?? '';
  set('editSubId', id); document.getElementById('editName').textContent = `${s.childName} — ${s.packageName || ''}`;
  set('editChildName', s.childName); set('editChildAge', s.childAge); set('editParentName', s.parentName); set('editPhone', s.phone); set('editEmail', s.email);
  fillEditPackages(s); set('editAmount', s.amount);
  set('editStatus', s.status || 'active'); set('editNotes', s.notes);
  set('editStartDate', isoDate(s.subscriptionStart)); set('editEndDate', isoDate(s.subscriptionEnd));
  editPauses = pausesOf(s).map(p => ({ ...p })); renderEditPauses();
  document.getElementById('editModal').classList.add('open');
  const sh = document.querySelector('#editModal .sheet'); if (toPauses) setTimeout(() => document.getElementById('editPauses').scrollIntoView({ block: 'center' }), 50); else sh.scrollTop = 0;
}
function closeEditModal() { document.getElementById('editModal').classList.remove('open'); }
async function saveEdit(btn) {
  const id = v('editSubId'); const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  const phone = v('editPhone').replace(/\D/g, '');
  if (!v('editChildName')) return showToast('❌ اكتب اسم الطفل');
  if (phone.length !== 8) return showToast('❌ رقم الهاتف يجب أن يكون 8 أرقام');
  const sv = v('editStartDate'), ev = v('editEndDate');
  if (sv && ev && ev <= sv) return showToast('❌ تاريخ النهاية يجب أن يكون بعد البداية');
  const o = document.getElementById('editPackage').selectedOptions[0];
  const upd = { childName: v('editChildName'), parentName: v('editParentName'), phone, email: v('editEmail'), amount: +v('editAmount') || 0, status: v('editStatus'), notes: v('editNotes') };
  if (v('editChildAge')) upd.childAge = +v('editChildAge');
  if (o && o.value) { upd.packageType = o.value; upd.packageName = o.dataset.name || s.packageName || ''; }
  if (sv) upd.subscriptionStart = tsFromIso(sv);
  if (ev) { upd.subscriptionEnd = tsFromIso(ev); upd.daysRemaining = Math.max(0, Math.ceil((new Date(ev + 'T00:00:00Z') - new Date()) / 864e5)); }
  const pauses = editPauses.filter(p => p.date).sort((a, b) => a.date.localeCompare(b.date));
  if (JSON.stringify(pauses) !== JSON.stringify(pausesOf(s))) { upd.pauses = pauses; upd.pauseUsed = pauses.length >= 3; upd.pauseStart = firebase.firestore.FieldValue.delete(); upd.pauseEnd = firebase.firestore.FieldValue.delete(); }
  btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
  try {
    await withTimeout(db.collection('subscriptions').doc(id).update(upd));
    closeEditModal(); showToast('✅ تم الحفظ');
    for (const ph of new Set([s.phone, phone])) withTimeout(PortalSync.syncPhone(db, ph)).catch(e => console.warn('sync', e));
    loadAllData();
  } catch (e) { showToast(e.message === 'timeout' ? SLOW_MSG : '❌ ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '💾 حفظ التغييرات'; }
}
async function deleteSubscription(id) {
  if (!confirm('حذف هذا الاشتراك نهائياً؟')) return;
  const sdel = allSubscriptions.find(x => x.id === id);
  try { await db.collection('subscriptions').doc(id).delete(); if (sdel) await PortalSync.syncPhone(db, sdel.phone); showToast('تم الحذف'); await loadAllData(); } catch (e) { showToast('❌ خطأ'); }
}

// ---------- ADD ----------
function updatePackagePrice(selId = 'newPackage', amtId = 'newAmount') { const o = document.getElementById(selId).selectedOptions[0]; if (o && o.dataset.price) document.getElementById(amtId).value = o.dataset.price; }
let pendingAddId = null; // reused when a slow save is retried, so the same subscriber is never added twice
async function saveSubscription(e) {
  e.preventDefault(); const btn = e.target.querySelector('button[type=submit]'); if (btn.disabled) return;
  btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
  try {
    const o = document.getElementById('newPackage').selectedOptions[0];
    const sv = v('newStartDate'), ev = v('newEndDate') || (sv && addDaysIso(sv, 30));
    if (!o || !o.value) throw new Error('اختر الباقة');
    if (!sv) throw new Error('حدد تاريخ البداية');
    if (ev <= sv) throw new Error('تاريخ النهاية يجب أن يكون بعد البداية');
    const end = new Date(ev + 'T00:00:00Z');
    const data = { childName: v('newChildName'), childAge: +v('newChildAge'), parentName: v('newParentName'), phone: v('newPhone').replace(/\D/g, ''), email: v('newEmail'), packageType: o.value, packageName: o.dataset.name, amount: +v('newAmount'), paymentMethod: v('newPaymentMethod'), notes: v('newNotes'), status: 'active', termsAccepted: true, subscriptionStart: tsFromIso(sv), subscriptionEnd: tsFromIso(ev), daysRemaining: Math.max(0, Math.ceil((end - new Date()) / 864e5)), pauseUsed: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin', source: 'admin' };
    const ref = pendingAddId ? db.collection('subscriptions').doc(pendingAddId) : db.collection('subscriptions').doc(); pendingAddId = ref.id;
    await withTimeout(ref.set(data));
    pendingAddId = null;
    withTimeout(recordIncomeForSub({ id: ref.id, ...data }, data.amount, data.paymentMethod, 'inc_' + ref.id)).catch(e => console.warn('income', e));
    withTimeout(PortalSync.syncPhone(db, data.phone)).catch(e => console.warn('sync', e));
    sendWelcomeWhatsApp(data.phone, data.childName, data.packageName, end); showToast('✅ تمت الإضافة — يمكنك تعديله من ✏️ تعديل'); clearAddForm(); loadAllData(); go('members');
  } catch (err) { showToast(err.message === 'timeout' ? SLOW_MSG : '❌ ' + err.message); }
  finally { btn.disabled = false; btn.textContent = '💾 حفظ وتفعيل الاشتراك'; }
}
function v(id) { return (document.getElementById(id).value || '').trim(); }
function clearAddForm() { ['newChildName', 'newChildAge', 'newParentName', 'newPhone', 'newEmail', 'newPackage', 'newAmount', 'newNotes'].forEach(i => document.getElementById(i).value = ''); pendingAddId = null; document.getElementById('newStartDate').value = todayIso(); autoEndDate('newStartDate', 'newEndDate'); }
clearAddForm();

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
    scheduleLoad();
  });
  let prReady = false;
  db.collection('portal').onSnapshot(snap => {
    if (!prReady) { prReady = true; return; }
    let reqChanged = false;
    snap.docChanges().forEach(ch => { if (ch.type !== 'modified') return; const d = ch.doc.data(); const prev = allPortals.find(x => x.id === ch.doc.id); if (JSON.stringify(d.pauseRequests || []) !== JSON.stringify(prev?.pauseRequests || [])) reqChanged = true; const n = (d.pauseRequests || []).filter(r => r.status === 'pending').length, m = (prev?.pauseRequests || []).filter(r => r.status === 'pending').length; if (n > m) { const r = (d.pauseRequests || []).filter(x => x.status === 'pending').pop(); Notif.show('🕒 طلب إيقاف يوم', `${r.childName} — ${r.start} · ${r.reason || ''}`, 'dashboard.html'); } });
    if (reqChanged) scheduleLoad(); // other portal writes are just mirrors of subscriptions — no reload needed
  });
}

// ---------- PORTAL SYNC ----------
// The syncPortal Cloud Function refreshes portal/{phone} on every subscription write. Here we only create
// portal docs that are missing. (The old version re-synced every family on every portal change → an endless
// write loop that blocked the admin's own saves.)
let portalSyncing = false;
async function syncPortalsIfNeeded(full) {
  if (portalSyncing) return; portalSyncing = true;
  try {
    const phones = [...new Set(allSubscriptions.map(s => PortalSync.norm(s.phone)).filter(p => p.length === 8 && (full || !allPortals.some(x => x.id === p))))];
    for (const p of phones) await withTimeout(PortalSync.syncPhone(db, p, allSubscriptions));
  } catch (e) { console.warn('portal sync', e); }
  finally { portalSyncing = false; }
}
let loadTimer = null;
function scheduleLoad() { clearTimeout(loadTimer); loadTimer = setTimeout(loadAllData, 800); } // many snapshot events → one reload

// ---------- MISC ----------
function adminLogout() { if (confirm('تسجيل الخروج؟')) auth.signOut().then(() => location.href = 'login.html'); }
function showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; if (msg.includes('❌')) t.style.background = '#C62828'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && auth.currentUser) loadAllData(); }); // iPhone resumes the PWA without reloading

// ---------- AUTH ----------
auth.onAuthStateChanged(async (user) => {
  if (!user) { location.href = 'login.html'; return; }
  const a = await db.collection('admins').doc(user.uid).get();
  if (!a.exists) { await auth.signOut(); location.href = 'login.html'; return; }
  loadAllData();
  setupAdminNotifications(user);
});

async function recordIncomeForSub(s, amount, method, txId) {
  try {
    const col = db.collection('transactions'), ref = txId ? col.doc(txId) : col.doc(); // fixed id on retries → no double income
    await ref.set({ type: 'income', amount: +amount || 0, category: 'اشتراكات', note: `اشتراك ${s.childName} — ${s.packageName || ''}`, method: method || 'cash', date: new Date().toISOString().split('T')[0], subId: s.id, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' });
    if (typeof loadFinance === 'function') loadFinance();
  } catch (e) { console.warn('income tx', e); }
}

// ---------- RENEWAL LINK (WhatsApp with auto-login + dates) ----------
const SITE_BASE = location.origin + location.pathname.replace(/admin\/.*$/, '');
function sendRenewalLink(id) {
  const s = allSubscriptions.find(x => x.id === id); if (!s) return;
  const days = calcDaysLeft(s); const end = toD(s.subscriptionEnd), start = toD(s.subscriptionStart);
  const newStart = s.status === 'active' && end && end > new Date() ? new Date(end) : new Date(); const newEnd = new Date(newStart); newEnd.setDate(newEnd.getDate() + 30);
  const link = `${SITE_BASE}client/login.html?phone=${s.phone}&go=pay`;
  const msg = `السلام عليكم ${s.parentName} 👋\n\n${s.status === 'expired' || (days !== null && days < 0) ? `انتهى اشتراك ${s.childName} في أكاديمية سلام بتاريخ ${fmtDate(end)}.` : `اشتراك ${s.childName} في أكاديمية سلام ينتهي بعد ${days} يوم (${fmtDate(end)}).`}\n\n📦 الباقة: ${s.packageName || PKG_NAMES[s.packageType] || ''}\n💰 الرسوم: ${s.amount} د.ك / شهر\n📅 الفترة القادمة: من ${newStart.toLocaleDateString('ar-KW')} إلى ${newEnd.toLocaleDateString('ar-KW')}\n\nللتجديد عبر كي نت اضغط الرابط (يفتح حسابك مباشرة):\n${link}\n\nأكاديمية سلام — معاً نحو بناء جيل واثق ومميز 💪\n93000607`;
  window.open('https://wa.me/965' + String(s.phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}
