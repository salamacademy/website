// ============================
// CLIENT DASHBOARD JS (app UI)
// ============================
let currentSubscription = null, kids = [], kidIdx = 0, kidUnsub = null;
const SCHEDULES = {
  football: { name: 'معسكر كرة القدم', icon: '⚽', rows: [['📅', 'كل سبت'], ['⏰', '4:00 – 5:00 مساءً'], ['📍', 'منطقة الروضة']] },
  confidence: { name: 'معسكر بناء الثقة والكيوكشن', icon: '🥋', rows: [['📅', 'الأحد – الثلاثاء – الخميس'], ['⏰', 'أشبال 4:30–6:00 · رجال 6:00–7:30'], ['📍', 'جنوب السرة']] },
  excellence: { name: 'باقة التميز', icon: '⚡', rows: [['📅', '4 أيام بالأسبوع'], ['⚽', 'كرة القدم: السبت · الروضة'], ['🥋', 'الكيوكشن: أحد/ثلاثاء/خميس · جنوب السرة']] },
  excellence_loyal: { name: 'باقة التميز – أسرة سلام', icon: '🏅', rows: [['📅', '4 أيام بالأسبوع'], ['⚽', 'كرة القدم: السبت · الروضة'], ['🥋', 'الكيوكشن: أحد/ثلاثاء/خميس · جنوب السرة']] },
  premium: { name: 'الباقة المميزة', icon: '⚡', rows: [['📅', '6 أيام'], ['📍', 'الروضة + السلام']] }
};
const TITLES = { overview: 'هذا ملخص اشتراك طفلك في أكاديمية سلام', subscription: 'كل تفاصيل الاشتراك', schedule: 'مواعيد وأماكن التدريب', pause: '3 أيام إيقاف كل شهر', renew: 'ادفع أو جدد اشتراكك' };
const toD = ts => ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
const fmt = ts => { const d = toD(ts); return d ? d.toLocaleDateString('ar-KW') : '--'; };
const $ = id => document.getElementById(id);


const PHONE = localStorage.getItem('salamPhone') || '';
if (!/^\d{8}$/.test(PHONE)) location.replace('login.html');
let portalDoc = null, portalUnsub = null;

function loadClientData() {
  document.getElementById('topPhone') && (document.getElementById('topPhone').textContent = PHONE);
  portalUnsub = db.collection('portal').doc(PHONE).onSnapshot(doc => {
    if (!doc.exists) { portalDoc = null; kids = []; showNoSubscription(); return; }
    portalDoc = doc.data();
    const rank = { active: 0, approved: 1, pending_payment: 1, pending_review: 2 };
    const best = (a, b) => { const ra = rank[a.status] ?? 5, rb = rank[b.status] ?? 5; if (ra !== rb) return ra - rb; return (toD(b.createdAt)?.getTime() || 0) - (toD(a.createdAt)?.getTime() || 0); };
    const byKid = {};
    (portalDoc.kids || []).forEach(k => { const s = { ...k, id: k.subId }; const key = (s.childName || '').trim().replace(/\s+/g, ' '); (byKid[key] = byKid[key] || []).push(s); });
    const prevId = kids[kidIdx]?.id;
    kids = Object.values(byKid).map(l => l.sort(best)[0]).sort(best);
    const idx = Math.max(0, kids.findIndex(k => k.id === prevId));
    const prevStatus = currentSubscription?.status;
    selectKid(idx, true);
    if (location.hash === '#pay' && !window.__wentPay) { window.__wentPay = true; setTimeout(() => go('renew'), 300); }
    const d = currentSubscription;
    if (d && prevStatus && d.status !== prevStatus) {
      if (d.status === 'approved') Notif.show('🎉 تمت الموافقة على طلبك', `${d.childName} — ${d.amount} د.ك · ادفع الآن`, 'dashboard.html');
      if (d.status === 'active') Notif.show('✅ تم تفعيل الاشتراك', `${d.childName} — ${d.packageName}`, 'dashboard.html');
    }
  }, err => { console.error(err); status('تعذر تحميل البيانات', 'تحقق من الاتصال أو تواصل معنا'); });
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
  ringIcon('0', '#A07050', 0); status('لا توجد بيانات لهذا الرقم بعد', 'إذا سجّلت للتو فستظهر بياناتك بعد مراجعة الإدارة. أو عبّئ نموذج التسجيل.');
  $('welcomeName').textContent = 'بك'; $('childNameDisplay').textContent = '--'; $('packageLabel').textContent = '--'; $('amountDisplay').textContent = '--';
  $('welcomeName').textContent = 'بك'; alertSet('لا يوجد اشتراك', 'سجّل الآن عبر النموذج', '📝 التسجيل');
}
function alertAction() {
  const s = currentSubscription;
  if (!s) return location.href = 'register.html';
  go('renew');
}

// ---------- PAY (catalog → UPayment) ----------
let payItems = [], cart = {}, customAmt = {};
const itemPrice = i => i.customAmount ? (+customAmt[i.id] || 0) : +i.price;
async function loadPayItems() {
  try { const snap = await db.collection('payItems').where('active', '==', true).get(); payItems = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); }
  catch (e) { console.warn('payItems', e); payItems = []; }
  renderPayGrid();
}
function suggestedItem(sub) { if (!sub) return null; return payItems.find(i => i.packageType && sub.packageType && i.packageType === sub.packageType) || null; }
function renderPayGrid() {
  const sub = currentSubscription; const sug = suggestedItem(sub);
  if (sub && Object.keys(cart).length === 0 && sug) cart[sug.id] = 1;
  $('payKid').textContent = sub ? '👦 ' + (sub.childName || '').split(' ')[0] : '';
  const g = $('payGrid');
  if (!payItems.length) { g.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>🛒</b>لا توجد منتجات متاحة حالياً</div>'; updateTotal(); return; }
  g.innerHTML = payItems.map(i => { const q = cart[i.id] || 0; return `<div class="pay-item ${q ? 'on' : ''} ${sug && sug.id === i.id ? 'sug' : ''}" onclick="toggleItem('${i.id}')"><span class="tick">✓</span><div class="pi">${i.icon || '🏷️'}</div><div class="pn">${i.name}</div>${i.customAmount ? `<div class="pp">✍️ <small>اكتب المبلغ</small></div><div class="amt" onclick="event.stopPropagation()"><input type="number" inputmode="decimal" min="0.5" max="2000" step="0.5" placeholder="0.000" value="${customAmt[i.id] || ''}" oninput="setAmt('${i.id}',this.value)"/><small>د.ك</small></div>` : `<div class="pp">${(+i.price).toFixed(3)} <small>د.ك</small></div>`}${i.allowQty ? `<div class="qty" onclick="event.stopPropagation()"><button onclick="setQty('${i.id}',-1)">−</button><b>${q}</b><button onclick="setQty('${i.id}',1)">+</button></div>` : ''}</div>`; }).join('');
  updateTotal();
}
function toggleItem(id) { if (cart[id]) delete cart[id]; else cart[id] = 1; renderPayGrid(); const inp = cart[id] && document.querySelector(`.pay-item.on .amt input[oninput*="${id}"]`); if (inp) inp.focus(); }
function setAmt(id, val) { customAmt[id] = val; if (!cart[id]) cart[id] = 1; updateTotal(); } // no re-render → keyboard stays open
function setQty(id, d) { cart[id] = Math.max(0, (cart[id] || 0) + d); if (!cart[id]) delete cart[id]; renderPayGrid(); }
function cartTotal() { return Object.entries(cart).reduce((a, [id, q]) => { const i = payItems.find(x => x.id === id); return a + (i ? itemPrice(i) * q : 0); }, 0); }
const badCustom = () => Object.keys(cart).some(id => { const i = payItems.find(x => x.id === id); return i && i.customAmount && !(itemPrice(i) >= 0.5 && itemPrice(i) <= 2000); });
function updateTotal() { const t = cartTotal(), off = t <= 0 || badCustom(); $('payTotal').textContent = t.toFixed(3); const b = $('payBtn'); b.disabled = off; b.style.opacity = off ? '.6' : '1'; }
function renewSubscription() { go('renew'); }
async function startPayment() {
  const sub = currentSubscription; const items = Object.entries(cart).map(([id, qty]) => { const i = payItems.find(x => x.id === id); return i && i.customAmount ? { id, qty: 1, amount: itemPrice(i) } : { id, qty }; }); if (!items.length || badCustom()) return;
  const btn = $('payBtn'); btn.disabled = true; btn.innerHTML = '⏳ جاري تحويلك إلى UPayment...';
  try {
    if (typeof PAYMENT_API_URL === 'undefined' || !PAYMENT_API_URL || PAYMENT_API_URL.includes('YOUR_')) throw new Error('not-configured');
    const r = await fetch(PAYMENT_API_URL + '/createPayment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: PHONE, subId: sub ? sub.id : null, childName: sub ? sub.childName : '', parentName: sub ? sub.parentName : (portalDoc?.parentName || ''), email: sub ? sub.email : '', items, returnBase: location.origin + location.pathname.replace(/[^/]*$/, '') }) });
    const j = await r.json(); if (!j.ok || !j.link) throw new Error(j.error || 'فشل إنشاء الدفع');
    location.href = j.link;
  } catch (e) {
    const list = items.map(({ id, qty }) => { const i = payItems.find(x => x.id === id); return `• ${i.name}${qty > 1 ? ' ×' + qty : ''} — ${(itemPrice(i) * qty).toFixed(3)} د.ك`; }).join('\n');
    window.open('https://wa.me/96593000607?text=' + encodeURIComponent(`مرحباً، أريد الدفع${sub ? ' لـ ' + sub.childName : ''}:\n${list}\nالإجمالي: ${cartTotal().toFixed(3)} د.ك\nيرجى إرسال رابط الدفع.`), '_blank');
    btn.disabled = false; btn.innerHTML = '<img src="../images/upayment.svg" class="upay-ic" alt=""/> <span>الدفع عبر <span class="upay-word">UPayment</span></span>';
    if (e.message !== 'not-configured') alert('تعذر إنشاء رابط الدفع: ' + e.message + '\nتم تحويلك للواتساب');
  }
}

// ---------- PAUSE: 3 × one-day pauses per subscription month (request → admin approves) ----------
const PAUSE_MAX = 3;
const dayKey = d => (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];
function pausesOf(s) { return Array.isArray(s.pauses) ? s.pauses : (s.pauseStart ? [{ date: dayKey(toD(s.pauseStart)) }] : []); }
function isPausedNow(s) { const t = dayKey(new Date()); return pausesOf(s).some(p => p.date === t); }
function pendingPausesFor(subId) { return (portalDoc?.pauseRequests || []).filter(r => r.subId === subId && r.status === 'pending'); }
function renderPause(sub) {
  ['pauseInfo', 'pauseActive', 'pauseUsed'].forEach(i => $(i).style.display = 'none'); $('pausedBanner').style.display = 'none';
  const used = pausesOf(sub), pend = pendingPausesFor(sub.id), left = PAUSE_MAX - used.length - pend.length;
  const quota = $('pauseQuota'); if (quota) quota.innerHTML = Array.from({ length: PAUSE_MAX }, (_, i) => `<span class="chip ${i < used.length ? 'info' : i < used.length + pend.length ? 'gold' : 'ok'}">${i < used.length ? '⏸️ ' + used[i].date : i < used.length + pend.length ? '🕒 ' + pend[i - used.length].start : '○ متاح'}</span>`).join('');
  if (isPausedNow(sub)) {
    $('pauseActive').style.display = 'block'; $('pauseFrom').textContent = new Date().toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long' });
    $('pausedBanner').style.display = 'flex'; $('pausedUntil').textContent = ''; status('⏸️ الاشتراك متوقف اليوم', 'يستأنف التدريب غداً');
    $('pauseHistory').innerHTML = `<small style="color:var(--text-light);font-weight:800">المتبقي: ${Math.max(0, left)} من ${PAUSE_MAX} هذا الشهر</small>`;
  } else if (sub.status !== 'active') {
    $('pauseUsed').style.display = 'block'; $('pauseUsed').querySelector('div').textContent = 'ℹ️'; $('pauseUsed').querySelector('p').textContent = 'الإيقاف المؤقت متاح للاشتراكات النشطة فقط.';
  } else if (left <= 0) {
    $('pauseUsed').style.display = 'block'; $('pauseUsed').querySelector('div').textContent = '✅';
    $('pauseUsed').querySelector('p').innerHTML = pend.length ? `لديك ${pend.length} طلب إيقاف <b>بانتظار موافقة الإدارة</b> (${pend.map(r => r.start).join('، ')}).` : 'تم استخدام الإيقافات الثلاثة لهذا الشهر.<br/>ستتاح مجدداً مع التجديد القادم.';
  } else {
    $('pauseInfo').style.display = 'block';
    const inp = $('pauseStartInput'), today = dayKey(new Date());
    inp.min = today; if (!inp.value || inp.value < today) inp.value = today; const e = toD(sub.subscriptionEnd); if (e) inp.max = dayKey(e);
    inp.oninput = () => previewPause(sub); previewPause(sub);
    $('pauseBtn').textContent = `⏸️ طلب إيقاف هذا اليوم (متبقٍ ${left})`;
  }
}
function previewPause(sub) {
  const v = $('pauseStartInput').value; if (!v) return;
  $('pauseEndPreview').textContent = new Date(v).toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long' });
  const ne = toD(sub.subscriptionEnd); if (ne) { ne.setDate(ne.getDate() + 1); $('newEndPreview').textContent = ne.toLocaleDateString('ar-KW'); }
}
async function requestPause() {
  const sub = currentSubscription; if (!sub || sub.status !== 'active') return;
  const v = $('pauseStartInput').value; if (!v) return alert('اختر يوم الإيقاف');
  if (pausesOf(sub).some(p => p.date === v) || pendingPausesFor(sub.id).some(r => r.start === v)) return alert('هذا اليوم مطلوب أو موقوف مسبقاً');
  const used = pausesOf(sub).length + pendingPausesFor(sub.id).length; if (used >= PAUSE_MAX) return alert('استنفدت الإيقافات الثلاثة لهذا الشهر');
  const dLabel = new Date(v).toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long' });
  if (!confirm(`طلب إيقاف اشتراك ${sub.childName} يوم ${dLabel}؟`)) return;
  const btn = $('pauseBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...';
  const reason = $('pauseReason').value.trim();
  try {
    await db.collection('portal').doc(PHONE).update({ pauseRequests: firebase.firestore.FieldValue.arrayUnion({ subId: sub.id, childName: sub.childName, start: v, end: v, days: 1, reason, status: 'pending', requestedAt: new Date().toISOString() }) });
    window.open('https://wa.me/96593000607?text=' + encodeURIComponent(`مرحباً، أطلب إيقاف اشتراك ${sub.childName} يوم ${dLabel}${reason ? '\nالسبب: ' + reason : ''}`), '_blank');
    $('pauseReason').value = ''; go('overview');
  } catch (err) { alert('تعذر إرسال الطلب: ' + err.message); btn.disabled = false; btn.textContent = '⏸️ طلب إيقاف هذا اليوم'; }
}

// ---------- NOTIFICATIONS ----------
let notifSetup = false;
function setupClientNotifications() {
  if (notifSetup) return; notifSetup = true;
  const saveToken = t => db.collection('portal').doc(PHONE).update({ fcmTokens: firebase.firestore.FieldValue.arrayUnion(t) }).catch(() => {});
  if (window.Notification && Notification.permission === 'default' && !document.querySelector('.banner.notif')) {
    const b = document.createElement('div'); b.className = 'banner notif';
    b.innerHTML = `<span>🔔 فعّل الإشعارات لتصلك الموافقة وتذكير التجديد</span><button id="notifOn">تفعيل</button><button class="x" onclick="this.parentElement.remove()">✕</button>`;
    document.querySelector('.app-head').insertAdjacentElement('afterend', b);
    b.querySelector('#notifOn').onclick = async () => { const ok = await Notif.ask(); b.remove(); if (ok) { Notif.show('تم تفعيل الإشعارات ✅', 'ستصلك تنبيهات أكاديمية سلام هنا'); Notif.registerPush(saveToken); } };
  }
  if (Notif.granted()) Notif.registerPush(saveToken);
  kids.forEach(s => { if (s.status === 'active' && s.subscriptionEnd) { const days = Math.ceil((toD(s.subscriptionEnd) - new Date()) / 864e5), key = 'expNotif-' + s.id + '-' + new Date().toDateString(); if (days <= 3 && days >= 0 && !localStorage.getItem(key)) { localStorage.setItem(key, '1'); Notif.show('⏳ اشتراك ينتهي قريباً', `${s.childName} — متبقٍ ${days} يوم · جدد الآن`, 'dashboard.html'); } } });
}

function logout() { if (confirm('تسجيل الخروج؟')) { localStorage.removeItem('salamPhone'); location.href = 'login.html'; } }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
loadClientData(); loadPayItems();


// ---------- MULTI-KID (one parent, several children) ----------
function kidDot(s) { if (s.status === 'active') { const d = Math.ceil((toD(s.subscriptionEnd) - new Date()) / 864e5); return d <= 5 ? 'bad' : d <= 10 ? 'warn' : 'ok'; } if (s.status === 'approved' || s.status === 'pending_payment') return 'warn'; if (s.status === 'pending_review') return 'gold'; return 'bad'; }
function renderKidSwitch() {
  const el = $('kidSwitch'); if (!el) return;
  const p = kids[0] || {}; const addHref = 'register.html?' + new URLSearchParams({ parent: p.parentName || portalDoc?.parentName || '', phone: PHONE, email: p.email || '' }).toString();
  const link = $('addKidLink'); if (link) link.href = addHref;
  if (kids.length < 2) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = kids.map((s, i) => `<button class="kid ${i === kidIdx ? 'on' : ''}" onclick="selectKid(${i})"><span class="av">👦</span>${(s.childName || '').split(' ')[0]}<span class="st ${kidDot(s)}"></span></button>`).join('') + `<a class="kid add" href="${addHref}"><span class="av">➕</span>طفل آخر</a>`;
}
function selectKid(i, first) {
  kidIdx = i; const s = kids[i]; if (!s) return;
  currentSubscription = s; renderDashboard(s); renderKidSwitch(); cart = {}; renderPayGrid();
  setupClientNotifications();
  if (!first) go('overview');
}
