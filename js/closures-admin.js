// ============================
// ADMIN — ACADEMY CLOSURE (إيقاف عام): holidays / emergencies
// Every active subscription in the chosen packages gets the closed training days as pauses
// (closure: true — not taken from the parent's quota) and its last class moves forward.
// A day the parent had already paused becomes a closure day, which gives the parent that pause back.
// Undo removes the days again. Parents get a push from the onClosure Cloud Function.
// ============================
let closuresList = [];
const CL_PKGS = ['football', 'confidence', 'excellence', 'excellence_loyal', 'premium'];

function listenClosures() {
  db.collection('closures').onSnapshot(s => { closuresList = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.from).localeCompare(String(a.from))); renderClosures(); }, e => console.warn('closures', e));
}
const clFmt = k => new Date(k + 'T00:00:00Z').toLocaleDateString('ar-KW', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const clRange = c => c.from === c.to ? clFmt(c.from) : `${clFmt(c.from)} ← ${clFmt(c.to)}`;

function renderClosures() {
  const el = document.getElementById('closuresBox'); if (!el) return;
  const today = Classes.today(), list = closuresList.filter(c => c.active !== false);
  const row = c => { const past = c.to < today, now = c.from <= today && !past;
    return `<div class="mcard ${now ? 's-paused' : ''}"><div class="mcard-top"><div><div class="mcard-name">🏖️ ${clEsc(c.reason || 'إغلاق الأكاديمية')}</div><div class="mcard-sub">📅 ${clRange(c)}</div></div><span class="chip ${now ? 'info' : past ? 'ok' : 'gold'}">${now ? 'الآن' : past ? 'انتهى' : 'قادم'}</span></div>
      <div class="mcard-meta"><span class="chip">👥 ${(c.affected || []).length} مشترك</span><span class="chip">🎯 +${(c.affected || []).reduce((n, a) => n + (a.days || 0), 0)} حصة مُرحّلة</span>${(c.packages || []).map(p => `<span class="chip copper">${PKG_NAMES[p] || p}</span>`).join('')}</div>
      <div class="mcard-actions"><button class="abtn bad" onclick="undoClosure('${c.id}',this)">↩️ إلغاء الإيقاف العام</button></div></div>`; };
  el.innerHTML = `<button class="btn primary" style="margin-bottom:10px" onclick="openClosure()">🏖️ إيقاف عام للأكاديمية (عطلة / طارئ)</button>${list.filter(c => c.to >= today).map(row).join('')}`
    + (list.some(c => c.to < today) ? `<details style="margin-bottom:10px"><summary style="font-weight:800;color:var(--text-mid);cursor:pointer;padding:6px 0">🗂️ إيقافات عامة سابقة</summary>${list.filter(c => c.to < today).map(row).join('')}</details>` : '');
}
const clEsc = x => Trips.esc(x);

// ---------- SHEET ----------
function openClosure() {
  const t = Classes.today();
  document.getElementById('clFrom').value = t; document.getElementById('clTo').value = t; document.getElementById('clReason').value = '';
  document.getElementById('clPkgs').innerHTML = CL_PKGS.filter(p => p !== 'premium' || allSubscriptions.some(s => s.packageType === p && s.status === 'active'))
    .map(p => `<label class="chatid" style="cursor:pointer;margin-bottom:6px"><span>${PKG_NAMES[p]}</span><input type="checkbox" value="${p}" checked onchange="previewClosure()" style="width:20px;height:20px;accent-color:var(--green-mid)"/></label>`).join('');
  previewClosure(); document.getElementById('closureModal').classList.add('open'); document.querySelector('#closureModal .sheet').scrollTop = 0;
}
function closeClosure() { document.getElementById('closureModal').classList.remove('open'); }
function closureForm() {
  const from = document.getElementById('clFrom').value, to = document.getElementById('clTo').value || from;
  return { from, to, reason: document.getElementById('clReason').value.trim(), packages: [...document.querySelectorAll('#clPkgs input:checked')].map(i => i.value) };
}
// what the closure does to each active subscription (nothing is written here)
function planClosure(c) {
  const out = [];
  allSubscriptions.filter(s => s.status === 'active' && s.subscriptionEnd && c.packages.includes(s.packageType)).forEach(s => {
    const t = s.packageType, start = Classes.key(s.subscriptionStart) || '0000-00-00', pauses = pausesOf(s).map(p => ({ ...p }));
    let end = Classes.key(s.subscriptionEnd); const days = [], own = [];
    for (let k = c.from, i = 0; k <= c.to && i < 120; k = Classes.add(k, 1), i++) {
      if (!Classes.isTrain(k, t) || k < start || k > end) continue; // end grows as days are added, so later days are still reached
      const p = pauses.find(x => x.date === k);
      if (p) { if (!p.closure) { Object.assign(p, { closure: true, closureId: c.id, wasOwn: true, ownReason: p.reason || '', reason: c.reason || 'إغلاق الأكاديمية' }); own.push(k); } } // parent's pause → refunded, end already moved
      else { pauses.push({ date: k, reason: c.reason || 'إغلاق الأكاديمية', closure: true, closureId: c.id, by: 'academy' }); end = Classes.next(end, t); days.push(k); }
    }
    if (days.length || own.length) out.push({ s, pauses: pauses.sort((a, b) => a.date.localeCompare(b.date)), end, days, own });
  });
  return out;
}
function previewClosure() {
  const c = closureForm(), el = document.getElementById('clPreview'), btn = document.getElementById('clApply');
  if (!c.from || c.to < c.from) { el.innerHTML = '<div class="note">⚠️ تاريخ النهاية قبل البداية</div>'; btn.disabled = true; return; }
  if (!c.packages.length) { el.innerHTML = '<div class="note">اختر باقة واحدة على الأقل</div>'; btn.disabled = true; return; }
  const plan = planClosure({ ...c, id: 'preview' }), n = plan.reduce((x, p) => x + p.days.length, 0);
  btn.disabled = !plan.length;
  el.innerHTML = !plan.length ? '<div class="note">لا توجد حصص لمشتركين نشطين في هذه الفترة</div>'
    : `<div class="note" style="background:#E8F5E9">👥 <b>${plan.length}</b> مشترك · 🎯 <b>${n}</b> حصة تُرحّل إلى نهاية الاشتراك${plan.some(p => p.own.length) ? ` · ↩️ ${plan.reduce((x, p) => x + p.own.length, 0)} إيقاف سابق يُعاد للأهل` : ''}<br/><small>لا تُحسب من إيقافات الأهل المسموحة، ويصل إشعار لأولياء الأمور.</small></div>`
      + `<div style="max-height:220px;overflow:auto;margin-top:8px">${plan.map(p => `<div class="trip-row" style="cursor:default"><div class="m"><b>${clEsc(p.s.childName)}</b><small>${PKG_NAMES[p.s.packageType] || ''} · +${p.days.length} حصة · آخر حصة ${clFmt(Classes.key(p.s.subscriptionEnd))} ← <b style="color:var(--green)">${clFmt(p.end)}</b></small></div></div>`).join('')}</div>`;
  btn.textContent = plan.length ? `🏖️ تطبيق الإيقاف العام على ${plan.length} مشترك` : '🏖️ تطبيق الإيقاف العام';
}
// Firestore batches hold max 500 writes
async function commitChunks(writes) { for (let i = 0; i < writes.length; i += 400) { const b = db.batch(); writes.slice(i, i + 400).forEach(w => w(b)); await withTimeout(b.commit(), 30000); } }

async function applyClosure(btn) {
  const c = closureForm(); if (!c.from || c.to < c.from || !c.packages.length) return;
  const ref = db.collection('closures').doc(), plan = planClosure({ ...c, id: ref.id });
  if (!plan.length) return showToast('لا توجد حصص في هذه الفترة');
  if (!confirm(`إيقاف التدريب ${clRange(c)}${c.reason ? ' — ' + c.reason : ''}\n${plan.length} مشترك · تُرحّل حصصهم إلى نهاية الاشتراك.\nسيصل إشعار لأولياء الأمور. متابعة؟`)) return;
  btn.disabled = true; btn.textContent = '⏳ جاري التطبيق...';
  const TS = firebase.firestore.Timestamp, affected = plan.map(p => ({ subId: p.s.id, phone: p.s.phone || '', childName: p.s.childName || '', days: p.days.length, own: p.own.length }));
  const writes = [b => b.set(ref, { ...c, active: true, affected, createdAt: firebase.firestore.FieldValue.serverTimestamp(), by: auth.currentUser?.email || 'admin' })];
  plan.forEach(p => writes.push(b => b.update(db.collection('subscriptions').doc(p.s.id), { pauses: p.pauses, pauseUsed: Classes.own(p.pauses).length >= Classes.pauses(p.s.packageType), subscriptionEnd: TS.fromDate(Classes.toDate(p.end)), daysRemaining: Math.max(0, Math.ceil((Classes.toDate(p.end) - new Date()) / 864e5)) })));
  try { await commitChunks(writes); closeClosure(); showToast(`✅ تم الإيقاف العام — ${plan.length} مشترك`); loadAllData(); }
  catch (e) { showToast(e.message === 'timeout' ? SLOW_MSG : '❌ ' + e.message); }
  finally { btn.disabled = false; previewClosure(); }
}
async function undoClosure(id, btn) {
  const c = closuresList.find(x => x.id === id); if (!c) return;
  const subs = allSubscriptions.filter(s => pausesOf(s).some(p => p.closureId === id));
  if (!confirm(`إلغاء الإيقاف العام (${clRange(c)})؟\nتُزال أيام الإغلاق من ${subs.length} مشترك وتعود نهاية اشتراكاتهم كما كانت.`)) return;
  btn.disabled = true; btn.textContent = '⏳ ...';
  const writes = subs.map(s => {
    let end = Classes.key(s.subscriptionEnd); const keep = [];
    pausesOf(s).forEach(p => {
      if (p.closureId !== id) return keep.push(p);
      if (p.wasOwn) { const { closure, closureId, wasOwn, ownReason, ...rest } = p; keep.push({ ...rest, reason: ownReason || '' }); } // back to the parent's own pause
      else if (end) end = Classes.prev(end, s.packageType); // one class less at the end
    });
    return b => b.update(db.collection('subscriptions').doc(s.id), { pauses: keep, pauseUsed: Classes.own(keep).length >= Classes.pauses(s.packageType), ...(end ? { subscriptionEnd: firebase.firestore.Timestamp.fromDate(Classes.toDate(end)), daysRemaining: Math.max(0, Math.ceil((Classes.toDate(end) - new Date()) / 864e5)) } : {}) });
  });
  writes.push(b => b.update(db.collection('closures').doc(id), { active: false, undoneAt: firebase.firestore.FieldValue.serverTimestamp() }));
  try { await commitChunks(writes); showToast('↩️ تم إلغاء الإيقاف العام'); loadAllData(); }
  catch (e) { showToast(e.message === 'timeout' ? SLOW_MSG : '❌ ' + e.message); btn.disabled = false; btn.textContent = '↩️ إلغاء الإيقاف العام'; }
}
auth.onAuthStateChanged(u => { if (u) listenClosures(); });
