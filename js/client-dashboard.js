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
const TITLES = { overview: 'هذا ملخص اشتراك ابنك في أكاديمية سلام', subscription: 'كل تفاصيل الاشتراك', schedule: 'مواعيد وأماكن التدريب', pause: 'إيقاف حصص من اشتراكك', trips: 'رحلات ترفيهية وتربوية بإشراف الأكاديمية', renew: 'ادفع أو جدد اشتراكك' };
const toD = ts => ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
const fmt = ts => { const d = toD(ts); return d ? d.toLocaleDateString('ar-KW') : '--'; };
const $ = id => document.getElementById(id);


const PHONE = localStorage.getItem('salamPhone') || '';
if (!/^\d{8}$/.test(PHONE)) location.replace('login.html');
let portalDoc = null, portalUnsub = null;

function loadClientData() {
  document.getElementById('topPhone') && (document.getElementById('topPhone').textContent = PHONE);
  portalUnsub = db.collection('portal').doc(PHONE).onSnapshot(doc => {
    if (!doc.exists) {
      // number not registered → back to login with a message (wait for the server answer, not an empty offline cache)
      if (!doc.metadata.fromCache) { localStorage.removeItem('salamPhone'); return location.replace('login.html?unreg=' + PHONE); }
      portalDoc = null; kids = []; showNoSubscription(); return;
    }
    portalDoc = doc.data(); renderPayments();
    const rank = { active: 0, approved: 1, pending_payment: 1, pending_review: 2 };
    const best = (a, b) => { const ra = rank[a.status] ?? 5, rb = rank[b.status] ?? 5; if (ra !== rb) return ra - rb; return (toD(b.createdAt)?.getTime() || 0) - (toD(a.createdAt)?.getTime() || 0); };
    const byKid = {};
    (portalDoc.kids || []).forEach(k => { const s = { ...k, id: k.subId }; const key = (s.childName || '').trim().replace(/\s+/g, ' '); (byKid[key] = byKid[key] || []).push(s); });
    const prevId = kids[kidIdx]?.id;
    kids = Object.values(byKid).map(l => l.sort(best)[0]).sort(best);
    const idx = Math.max(0, kids.findIndex(k => k.id === prevId));
    const prevStatus = currentSubscription?.status;
    selectKid(idx, true);
    if (typeof renderTripsClient === 'function') renderTripsClient();
    if (location.hash === '#pay' && !window.__wentPay) { window.__wentPay = true; setTimeout(() => go('renew'), 300); }
    if (location.hash === '#trips' && !window.__wentTrips) { window.__wentTrips = true; setTimeout(() => go('trips'), 300); }
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
  // countdown in classes (football 4 · confidence 12 · excellence 16 per month), not calendar days
  const days = end ? Classes.left(sub) : 0, total = Classes.perMonth(sub.packageType), cls = n => n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n <= 10 ? n + ' حصص' : n + ' حصة';
  setRing(days, days / total, days <= 2 ? '#C62828' : days <= 4 ? '#E65100' : '#2E7D32');
  $('startDate').textContent = fmt(start); $('endDate').textContent = fmt(end);
  const alert = $('renewalAlert'); alert.classList.remove('show');
  if (days <= 0 || sub.status === 'expired') { status('انتهى الاشتراك', 'يرجى التجديد للاستمرار في التدريب'); alertSet('انتهى الاشتراك', 'جدد الآن للعودة للتدريب', '🔄 تجديد'); }
  else if (days <= 2) { status('⚠️ اشتراكك على وشك الانتهاء', 'جدد الآن لتجنب الانقطاع'); alertSet('اشتراكك على وشك الانتهاء!', `متبقٍ ${cls(days)} فقط`, 'جدد الآن'); }
  else if (days <= 4) { status('اشتراك نشط', 'ينتهي قريباً، فكر في التجديد المبكر'); alertSet('ينتهي قريباً', `متبقٍ ${cls(days)}`, 'جدد الآن'); }
  else status('✅ اشتراك نشط', 'استمتع بجلسات التدريب!');
  renderPause(sub);
}
function setRing(num, ratio, color) { $('daysRemaining').textContent = num; $('daysRemaining').style.fontSize = ''; $('daysCircle').setAttribute('stroke', color); $('daysCircle').style.strokeDashoffset = 326.7 * (1 - Math.max(0, Math.min(1, ratio))); document.querySelector('.days-label').textContent = 'حصة متبقية'; }
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
  $('subscriptionDetails').innerHTML = row('اسم المشترك', sub.childName) + row('ولي الأمر', sub.parentName) + row('الهاتف', `<span dir="ltr">${sub.phone || ''}</span>`) + row('الباقة', sub.packageName) + row('الرسوم الشهرية', (sub.amount || '--') + ' د.ك') + row('الحالة', `<span class="chip ${ST[0]}">${ST[1]}</span>`) + (sub.subscriptionStart ? row('بداية الاشتراك', fmt(sub.subscriptionStart)) + row('نهاية الاشتراك', fmt(sub.subscriptionEnd)) : '') + (sub.loyaltyMember ? row('العضوية', '<span class="chip gold">🏅 أسرة سلام</span>') : '');
}
function renderPayments() { // last 5 online payments of the family (kept in portal/{phone}.payments by the server)
  const esc = x => String(x || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ps = portalDoc?.payments || [];
  $('paymentsList').innerHTML = ps.length ? ps.map(p => `<div class="sched"><span style="width:auto;color:var(--text-light);font-size:0.8rem;min-width:80px">${fmt(p.paidAt)}</span><div style="flex:1"><b>${(+p.amount).toFixed(3)} د.ك</b><div style="font-size:0.78rem;color:var(--text-light)">${esc((p.items || []).join('، '))}${p.childName ? ' — ' + esc(p.childName) : ''}</div></div><span class="chip ok">✅ مدفوع</span></div>`).join('') : '<div class="empty">لا توجد مدفوعات إلكترونية بعد</div>';
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
let payItems = [], cart = {}, customAmt = {}, customFor = {}, customNote = {};
// open amount must say what it is for: a package renewal (+30 days) or something else
const PURPOSES = [['football', '⚽ تجديد كرة القدم'], ['confidence', '🥋 تجديد بناء الثقة والكيوكشن'], ['excellence', '⚡ تجديد باقة التميز'], ['excellence_loyal', '🏅 تجديد التميز – أسرة سلام'], ['other', '📦 أخرى (ليس تجديد اشتراك)']];
const itemPrice = i => i.customAmount ? (+customAmt[i.id] || 0) : +i.price;
async function loadPayItems() {
  try { const snap = await db.collection('payItems').where('active', '==', true).get(); payItems = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); }
  catch (e) { console.warn('payItems', e); payItems = []; }
  renderPayGrid();
}
function suggestedItem(sub) { if (!sub) return null; return payItems.find(i => i.packageType && sub.packageType && i.packageType === sub.packageType) || null; }
// Payment only after the admin approves the registration (approved / active / expired renewals)
const PAY_OK = ['approved', 'pending_payment', 'active', 'expired'];
function payLock(sub) {
  if (!sub) return '📝 لا يوجد طلب تسجيل لهذا الرقم. يرجى تعبئة نموذج التسجيل والموافقة على الشروط أولاً، وبعد موافقة الإدارة يمكنك الدفع.';
  if (sub.status === 'pending_review') return '⏳ طلبك قيد المراجعة من الإدارة. سيظهر الدفع هنا بعد الموافقة على الطلب.';
  if (!PAY_OK.includes(sub.status)) return '⛔ الطلب غير مقبول حالياً. يرجى التواصل مع الإدارة عبر الواتساب 93000607.';
  return '';
}
function renderPayGrid() {
  const sub = currentSubscription; const sug = suggestedItem(sub);
  const lock = payLock(sub);
  if (lock) { cart = {}; $('payKid').textContent = sub ? '👦 ' + (sub.childName || '').split(' ')[0] : ''; $('payGrid').innerHTML = `<div class="empty" style="grid-column:1/-1;line-height:1.8"><b>🔒</b>${lock}</div>`; updateTotal(); return; }
  if (sub && Object.keys(cart).length === 0 && sug) cart[sug.id] = 1;
  $('payKid').textContent = sub ? '👦 ' + (sub.childName || '').split(' ')[0] : '';
  const g = $('payGrid');
  if (!payItems.length) { g.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>🛒</b>لا توجد منتجات متاحة حالياً</div>'; updateTotal(); return; }
  g.innerHTML = payItems.map(i => { const q = cart[i.id] || 0; return `<div class="pay-item ${q ? 'on' : ''} ${i.customAmount ? 'wide' : ''} ${sug && sug.id === i.id ? 'sug' : ''}" onclick="toggleItem('${i.id}')"><span class="tick">✓</span><div class="pi">${i.icon || '🏷️'}</div><div class="pn">${i.name}</div>${i.customAmount ? `<div class="pp">✍️ <small>اكتب المبلغ</small></div><div class="amt" onclick="event.stopPropagation()"><input type="number" inputmode="decimal" min="0.5" max="2000" step="0.5" placeholder="0.000" value="${customAmt[i.id] || ''}" oninput="setAmt('${i.id}',this.value)"/><small>د.ك</small></div>${purposeBox(i)}` : `<div class="pp">${(+i.price).toFixed(3)} <small>د.ك</small></div>`}${i.allowQty ? `<div class="qty" onclick="event.stopPropagation()"><button onclick="setQty('${i.id}',-1)">−</button><b>${q}</b><button onclick="setQty('${i.id}',1)">+</button></div>` : ''}</div>`; }).join('');
  updateTotal();
}
function toggleItem(id) { if (cart[id]) delete cart[id]; else cart[id] = 1; renderPayGrid(); const inp = cart[id] && document.querySelector(`.pay-item.on .amt input[oninput*="${id}"]`); if (inp) inp.focus(); }
function purposeBox(i) {
  const cur = currentSubscription?.packageType, v = customFor[i.id] || '';
  const opts = [...PURPOSES].sort((a, b) => (b[0] === cur) - (a[0] === cur)).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}${k === cur ? ' (باقتك الحالية)' : ''}</option>`).join('');
  return `<div class="purpose" onclick="event.stopPropagation()"><label>لماذا تدفع؟ <b style="color:#C62828">*</b></label><select onchange="setFor('${i.id}',this.value)" class="${v ? '' : 'need'}"><option value="">— اختر —</option>${opts}</select>
    ${v === 'other' ? `<input type="text" maxlength="80" placeholder="اكتب الغرض (مثال: زي، بطولة...)" value="${(customNote[i.id] || '').replace(/"/g, '&quot;')}" oninput="customNote['${i.id}']=this.value"/>` : ''}
    ${v && v !== 'other' ? `<small class="ok">✅ سيُجدَّد اشتراك ${(currentSubscription?.childName || '').split(' ')[0]} ${Classes.perMonth(v)} حصة بعد الدفع</small>` : ''}</div>`;
}
// ---------- TERMS (must be accepted before every payment) ----------
let termsOk = false, termsShown = '';
const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const countAr = (n, one, many) => n === 1 ? one + ' واحدة' : n === 2 ? (one === 'حصة' ? 'حصتان' : one + 'ان') : n + ' ' + (n <= 10 ? many : one);
function cartPackages() {
  return [...new Set(Object.keys(cart).map(id => { const i = payItems.find(x => x.id === id); return i && (i.packageType || (i.customAmount && Classes.TRAIN_DAYS[customFor[id]] && customFor[id])); }).filter(Boolean))];
}
function termsLines() {
  const pk = cartPackages();
  if (!pk.length) return ['أؤكد أن المبلغ والغرض من الدفع صحيحان.'];
  return [...pk.map(t => { const w = Classes.TRAIN_DAYS[t].slice().sort((a, b) => ((a + 1) % 7) - ((b + 1) % 7)); return `${(SCHEDULES[t] || {}).name || t}: <b>${Classes.perMonth(t)} حصة متتالية</b> (${countAr(w.length, 'حصة', 'حصص')} أسبوعياً: ${w.map(d => DAY_AR[d]).join(' – ')})، ويحق لك إيقاف <b>${countAr(Classes.pauses(t), 'حصة', 'حصص')} فقط</b>.`; }),
    'الحصص متتالية <b>بدون انقطاع</b>، وتبدأ من أول حصة بعد نهاية الاشتراك الحالي (أو من اليوم إذا كان الاشتراك منتهياً).',
    'الغياب بدون إيقاف لا يُعوَّض. الإيقاف من صفحة «إيقاف» في التطبيق، وكل حصة موقوفة تُضاف في نهاية الاشتراك.'];
}
function renderTerms() {
  const box = $('payTerms'); if (!box) return;
  if (!Object.keys(cart).length || payLock(currentSubscription)) { box.style.display = 'none'; return; }
  const lines = termsLines(), txt = lines.join('|');
  box.style.display = 'block';
  if (txt === termsShown) return; // keep the checkbox as it is while typing the amount
  termsShown = txt; termsOk = false; // terms changed → accept again
  box.innerHTML = `<b>📋 قبل الدفع — شروط الاشتراك</b><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul><label><input type="checkbox" id="termsChk" onchange="termsOk=this.checked;updateTotal()"/> <span>قرأت الشروط وأوافق عليها</span></label>`;
}
function setFor(id, val) { customFor[id] = val; if (!cart[id]) cart[id] = 1; renderPayGrid(); }
function setAmt(id, val) { customAmt[id] = val; if (!cart[id]) cart[id] = 1; updateTotal(); } // no re-render → keyboard stays open
function setQty(id, d) { cart[id] = Math.max(0, (cart[id] || 0) + d); if (!cart[id]) delete cart[id]; renderPayGrid(); }
function cartTotal() { return Object.entries(cart).reduce((a, [id, q]) => { const i = payItems.find(x => x.id === id); return a + (i ? itemPrice(i) * q : 0); }, 0); }
const badCustom = () => Object.keys(cart).some(id => { const i = payItems.find(x => x.id === id); return i && i.customAmount && (!(itemPrice(i) >= 0.5 && itemPrice(i) <= 2000) || !customFor[id]); });
function updateTotal() { renderTerms(); const t = cartTotal(), off = t <= 0 || badCustom() || !!payLock(currentSubscription) || !termsOk; $('payTotal').textContent = t.toFixed(3); const b = $('payBtn'); b.disabled = off; b.style.opacity = off ? '.6' : '1'; }
function renewSubscription() { go('renew'); }
async function startPayment() {
  const sub = currentSubscription; const items = Object.entries(cart).map(([id, qty]) => { const i = payItems.find(x => x.id === id); return i && i.customAmount ? { id, qty: 1, amount: itemPrice(i), purpose: customFor[id], note: (customNote[id] || '').trim() } : { id, qty }; }); if (!items.length || badCustom() || payLock(sub)) return;
  if (!termsOk) return alert('يرجى قراءة الشروط والموافقة عليها قبل الدفع');
  const btn = $('payBtn'); btn.disabled = true; btn.innerHTML = '⏳ جاري تحويلك إلى UPayment...';
  try {
    if (typeof PAYMENT_API_URL === 'undefined' || !PAYMENT_API_URL || PAYMENT_API_URL.includes('YOUR_')) throw new Error('not-configured');
    const r = await fetch(PAYMENT_API_URL + '/createPayment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: PHONE, subId: sub ? sub.id : null, childName: sub ? sub.childName : '', parentName: sub ? sub.parentName : (portalDoc?.parentName || ''), email: sub ? sub.email : '', items, termsAccepted: true, termsText: termsLines().join(' | ').replace(/<[^>]+>/g, ''), returnBase: location.origin + location.pathname.replace(/[^/]*$/, '') }) });
    const j = await r.json(); if (j.code === 'not_approved') { alert(j.error); btn.disabled = false; btn.innerHTML = '<img src="../images/upayment.svg" class="upay-ic" alt=""/> <span>الدفع عبر <span class="upay-word">UPayment</span></span>'; return; }
    if (!j.ok || !j.link) throw new Error(j.error || 'فشل إنشاء الدفع');
    location.href = j.link;
  } catch (e) {
    const list = items.map(({ id, qty }) => { const i = payItems.find(x => x.id === id); return `• ${i.name}${qty > 1 ? ' ×' + qty : ''} — ${(itemPrice(i) * qty).toFixed(3)} د.ك`; }).join('\n');
    window.open('https://wa.me/96593000607?text=' + encodeURIComponent(`مرحباً، أريد الدفع${sub ? ' لـ ' + sub.childName : ''}:\n${list}\nالإجمالي: ${cartTotal().toFixed(3)} د.ك\nيرجى إرسال رابط الدفع.`), '_blank');
    btn.disabled = false; btn.innerHTML = '<img src="../images/upayment.svg" class="upay-ic" alt=""/> <span>الدفع عبر <span class="upay-word">UPayment</span></span>';
    if (e.message !== 'not-configured') alert('تعذر إنشاء رابط الدفع: ' + e.message + '\nتم تحويلك للواتساب');
  }
}

// ---------- PAUSE: one-day pauses per subscription month (football 1, other packages 3) ----------
const pauseMax = sub => sub ? Classes.pauses(sub.packageType) : 3;
const dayKey = d => (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];
function pausesOf(s) { return Array.isArray(s.pauses) ? s.pauses : (s.pauseStart ? [{ date: dayKey(toD(s.pauseStart)) }] : []); }
function isPausedNow(s) { const t = dayKey(new Date()); return pausesOf(s).some(p => p.date === t); }
function pendingPausesFor(subId) { return (portalDoc?.pauseRequests || []).filter(r => r.subId === subId && r.status === 'pending' && r.type !== 'cancel'); }
const pendingCancels = subId => (portalDoc?.pauseRequests || []).filter(r => r.subId === subId && r.status === 'pending' && r.type === 'cancel').map(r => r.start);
// training weekdays per package (0 = Sunday … 6 = Saturday) — only these days can be paused
const TRAIN_DAYS = Classes.TRAIN_DAYS;
const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']; // Kuwait week starts Saturday
const localToday = () => new Date().toLocaleDateString('en-CA');
const dLabel = k => new Date(k + 'T00:00:00Z').toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
let calMonth = null, calSubId = null, pickDays = new Set();
function renderPause(sub) {
  ['pauseInfo', 'pauseActive', 'pauseUsed'].forEach(i => $(i).style.display = 'none'); $('pausedBanner').style.display = 'none';
  const used = Classes.own(pausesOf(sub)), pend = pendingPausesFor(sub.id), left = pauseMax(sub) - used.length - pend.length;
  const quota = $('pauseQuota'); if (quota) quota.innerHTML = Array.from({ length: pauseMax(sub) }, (_, i) => `<span class="chip ${i < used.length ? 'info' : i < used.length + pend.length ? 'gold' : 'ok'}">${i < used.length ? '⏸️ ' + used[i].date : i < used.length + pend.length ? '🕒 ' + pend[i - used.length].start : '○ متاح'}</span>`).join('');
  if (sub.status !== 'active') {
    $('pauseUsed').style.display = 'block'; $('pauseUsed').querySelector('div').textContent = 'ℹ️'; $('pauseUsed').querySelector('p').textContent = 'الإيقاف المؤقت متاح للاشتراكات النشطة فقط.'; return;
  }
  if (isPausedNow(sub)) {
    $('pauseActive').style.display = 'block'; $('pauseFrom').textContent = new Date().toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long' });
    const cl = pausesOf(sub).find(p => p.closure && p.date === dayKey(new Date()));
    $('pausedBanner').style.display = 'flex'; $('pausedUntil').textContent = ''; status(cl ? '🏖️ لا تدريب اليوم — الأكاديمية مغلقة' : '⏸️ الاشتراك متوقف اليوم', cl ? (cl.reason || '') + ' · الحصة أُضيفت لنهاية الاشتراك' : 'يستأنف التدريب غداً');
    $('pauseHistory').innerHTML = `<small style="color:var(--text-light);font-weight:800">المتبقي: ${Math.max(0, left)} من ${pauseMax(sub)} هذا الشهر</small>`;
  }
  $('pauseInfo').style.display = 'block';
  $('pauseRule').innerHTML = `اشتراكك <strong>${Classes.perMonth(sub.packageType)} حصة متتالية</strong>، ويمكنك إيقاف <strong>${pauseMax(sub) === 1 ? 'حصة واحدة' : pauseMax(sub) + ' حصص'}</strong> فقط${pauseMax(sub) > 1 ? ' — اخترها معاً أو كل حصة على حدة' : ''}.`
    + closureNote(sub);
  if (calSubId !== sub.id) { calSubId = sub.id; calMonth = null; pickDays = new Set(); }
  renderPauseCal(sub);
}
// upcoming academy closures (admin "إيقاف عام") — shown so parents know those classes moved to the end
function closureNote(sub) {
  const t = dayKey(new Date()), cl = pausesOf(sub).filter(p => p.closure && p.date >= t); if (!cl.length) return '';
  return `<div class="note" style="margin-top:8px;background:#FFF3E0">🏖️ <b>الأكاديمية مغلقة</b> ${cl.map(p => dLabel(p.date)).join('، ')}${cl[0].reason ? ' — ' + cl[0].reason : ''}<br/><small>أُضيفت ${cl.length === 1 ? 'الحصة' : cl.length === 2 ? 'حصتان' : cl.length + ' حصص'} إلى نهاية الاشتراك ولا تُحسب من إيقافاتك ✅</small></div>`;
}
function calMove(n) { const [y, m] = calMonth.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); calMonth = d.toISOString().slice(0, 7); renderPauseCal(currentSubscription); }
function renderPauseCal(sub) {
  const today = localToday(), start = sub.subscriptionStart ? dayKey(toD(sub.subscriptionStart)) : today, end = sub.subscriptionEnd ? dayKey(toD(sub.subscriptionEnd)) : null;
  const train = TRAIN_DAYS[sub.packageType] || [6, 0, 1, 2, 3, 4];
  const used = Classes.own(pausesOf(sub)).map(p => p.date), closed = pausesOf(sub).filter(p => p.closure).map(p => p.date), pend = pendingPausesFor(sub.id).map(r => r.start), pendCancel = pendingCancels(sub.id);
  const left = pauseMax(sub) - used.length - pend.length;
  pickDays = new Set([...pickDays].filter(k => !used.includes(k) && !pend.includes(k) && k >= today && (!end || k <= end)));
  if (!calMonth) calMonth = (today >= start ? today : start).slice(0, 7);
  const [y, m] = calMonth.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 1) % 7;
  let cells = WEEK.map(w => `<div class="cal-h">${w.replace('ال', '').slice(0, 3)}</div>`).join('') + '<div class="cal-d empty"></div>'.repeat(offset);
  for (let d = 1; d <= n; d++) {
    const k = `${calMonth}-${String(d).padStart(2, '0')}`, dow = new Date(k + 'T00:00:00Z').getUTCDay();
    const inSub = k >= start && (!end || k <= end), isTrain = train.includes(dow) && inSub;
    let cls = 'off', act = '';
    if (closed.includes(k)) cls = 'closed'; // academy closure — not the parent's pause
    else if (pendCancel.includes(k) || pend.includes(k)) cls = 'pending';
    else if (used.includes(k)) { cls = 'paused'; if (k >= today) act = `onclick="cancelPause('${k}')"`; }
    else if (pickDays.has(k)) { cls = 'picked'; act = `onclick="togglePick('${k}')"`; }
    else if (isTrain && k >= today) { cls = 'train'; act = `onclick="togglePick('${k}')"`; }
    else if (isTrain) cls = 'train past';
    cells += `<div class="cal-d ${cls}${k === today ? ' today' : ''}" ${act}>${d}</div>`;
  }
  const prevOk = calMonth > start.slice(0, 7), nextOk = !end || calMonth < end.slice(0, 7);
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ar-KW', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('pauseCal').innerHTML = `<div class="cal-nav"><button ${prevOk ? '' : 'disabled'} onclick="calMove(-1)" aria-label="الشهر السابق">›</button><b>${monthName}</b><button ${nextOk ? '' : 'disabled'} onclick="calMove(1)" aria-label="الشهر التالي">‹</button></div><div class="cal-grid">${cells}</div>
    <div class="cal-legend"><span><i class="train"></i>أيام تدريب باقتك</span><span><i class="picked"></i>اخترته</span><span><i class="pending"></i>جاري التأكيد</span><span><i class="paused"></i>موقوف (اضغط للإلغاء)</span>${closed.length ? '<span><i class="closed"></i>إغلاق الأكاديمية</span>' : ''}</div>`;
  const picked = [...pickDays].sort(), dayAgo = new Date(Date.now() - 864e5).toISOString();
  const refused = (portalDoc?.pauseRequests || []).filter(r => r.subId === sub.id && r.status === 'rejected' && r.auto && r.decidedAt > dayAgo);
  $('pausePicked').innerHTML = refused.map(r => `<div style="color:#C62828;font-weight:800;margin-bottom:6px">⚠️ لم يتم ${r.type === 'cancel' ? 'إلغاء' : 'إيقاف'} ${dLabel(r.start)}: ${r.adminNote || ''}</div>`).join('') + (picked.length ? `الأيام المختارة: <strong>${picked.map(dLabel).join('، ')}</strong>${end ? `<br/>آخر حصة بعد الإيقاف: <strong>${dLabel(picked.reduce(k => Classes.next(k, sub.packageType), end))}</strong>` : ''}`
    : (left > 0 ? `اضغط على أيام التدريب الملونة لاختيار حتى <strong>${left}</strong> ${left === 1 ? 'حصة' : 'حصص'}` : 'استخدمت الإيقافات المسموحة — اضغط على يوم <b>موقوف</b> لإلغائه واختيار يوم آخر'));
  const btn = $('pauseBtn'); btn.disabled = !picked.length; btn.style.opacity = picked.length ? '1' : '.6';
  btn.textContent = picked.length ? `⏸️ إيقاف ${picked.length} ${picked.length === 1 ? 'حصة' : 'حصص'} (متبقٍ ${left})` : `⏸️ اختر الحصص من التقويم (متبقٍ ${Math.max(0, left)})`;
}
function togglePick(k) {
  const sub = currentSubscription; if (!sub) return;
  if (pickDays.has(k)) pickDays.delete(k);
  else { const left = pauseMax(sub) - Classes.own(pausesOf(sub)).length - pendingPausesFor(sub.id).length; if (pickDays.size >= left) return alert(left <= 0 ? (pauseMax(sub) === 1 ? 'استخدمت الإيقاف المسموح لهذا الشهر' : 'استخدمت الإيقافات الثلاثة لهذا الشهر') : `يمكنك اختيار ${left} ${left === 1 ? 'حصة' : 'حصص'} فقط`); pickDays.add(k); }
  renderPauseCal(sub);
}
// pauses are approved automatically by the server (Cloud Function) within seconds — no admin step
async function cancelPause(k) {
  const sub = currentSubscription; if (!sub || !confirm(`إلغاء إيقاف يوم ${dLabel(k)}؟\nستُحذف الحصة المضافة في نهاية الاشتراك ويمكنك اختيار يوم آخر.`)) return;
  try { await db.collection('portal').doc(PHONE).update({ pauseRequests: firebase.firestore.FieldValue.arrayUnion({ subId: sub.id, childName: sub.childName, start: k, end: k, type: 'cancel', status: 'pending', requestedAt: new Date().toISOString() }) }); }
  catch (err) { alert('تعذر الإلغاء: ' + err.message); }
}
async function requestPause() {
  const sub = currentSubscription; if (!sub || sub.status !== 'active') return;
  const picked = [...pickDays].sort(); if (!picked.length) return alert('اختر يوم الإيقاف من التقويم');
  if (Classes.own(pausesOf(sub)).length + pendingPausesFor(sub.id).length + picked.length > pauseMax(sub)) return alert(`تجاوزت عدد الإيقافات المسموح (${pauseMax(sub)} شهرياً)`);
  if (!confirm(`إيقاف اشتراك ${sub.childName}:\n${picked.map(dLabel).join('\n')}\n\nستُضاف ${picked.length === 1 ? 'حصة' : picked.length + ' حصص'} في نهاية الاشتراك بدلاً منها.`)) return;
  const btn = $('pauseBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الإيقاف...';
  const reason = $('pauseReason').value.trim(), at = new Date().toISOString();
  try {
    await db.collection('portal').doc(PHONE).update({ pauseRequests: firebase.firestore.FieldValue.arrayUnion(...picked.map(k => ({ subId: sub.id, childName: sub.childName, start: k, end: k, days: 1, reason, status: 'pending', requestedAt: at }))) });
    pickDays = new Set(); $('pauseReason').value = ''; renderPauseCal(sub);
  } catch (err) { alert('تعذر الإيقاف: ' + err.message); renderPauseCal(sub); }
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
  kids.forEach(s => { if (s.status === 'active' && s.subscriptionEnd) { const days = Classes.left(s), key = 'expNotif-' + s.id + '-' + new Date().toDateString(); if (days <= 2 && days >= 1 && !localStorage.getItem(key)) { localStorage.setItem(key, '1'); Notif.show('⏳ اشتراك ينتهي قريباً', `${s.childName} — متبقٍ ${days === 1 ? 'حصة واحدة' : 'حصتان'} · جدد الآن`, 'dashboard.html'); } } });
}

function logout() { if (confirm('تسجيل الخروج؟')) { localStorage.removeItem('salamPhone'); location.href = 'login.html'; } }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
loadClientData(); loadPayItems();


// ---------- MULTI-KID (one parent, several children) ----------
function kidDot(s) { if (s.status === 'active') { const d = Classes.left(s); return d <= 2 ? 'bad' : d <= 4 ? 'warn' : 'ok'; } if (s.status === 'approved' || s.status === 'pending_payment') return 'warn'; if (s.status === 'pending_review') return 'gold'; return 'bad'; }
function renderKidSwitch() {
  const el = $('kidSwitch'); if (!el) return;
  const p = kids[0] || {}; const addHref = 'register.html?' + new URLSearchParams({ parent: p.parentName || portalDoc?.parentName || '', phone: PHONE, email: p.email || '' }).toString();
  const link = $('addKidLink'); if (link) link.href = addHref;
  if (kids.length < 2) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = kids.map((s, i) => `<button class="kid ${i === kidIdx ? 'on' : ''}" onclick="selectKid(${i})"><span class="av">👦</span>${(s.childName || '').split(' ')[0]}<span class="st ${kidDot(s)}"></span></button>`).join('') + `<a class="kid add" href="${addHref}"><span class="av">➕</span>مشترك آخر</a>`;
}
function selectKid(i, first) {
  kidIdx = i; const s = kids[i]; if (!s) return;
  currentSubscription = s; renderDashboard(s); renderKidSwitch(); cart = {}; customFor = {}; customNote = {}; termsShown = ''; termsOk = false; renderPayGrid();
  setupClientNotifications();
  if (!first) go('overview');
}
