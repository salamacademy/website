// ============================
// FINANCE (accounting) MODULE
// ============================
const DEF_CATS = {
  expense: ['إيجار', 'رواتب', 'خدمات', 'رسوم الدفع', 'أكل وشرب', 'معدات', 'زي وملابس', 'مواصلات', 'تسويق', 'صيانة', 'رحلات وفعاليات', 'أخرى'],
  income: ['اشتراكات', 'رحلات وفعاليات', 'بيع زي', 'بطولات', 'رعاية', 'أخرى']
};
const CAT_ICON = { 'إيجار': '🏟️', 'رواتب': '👨‍🏫', 'خدمات': '🧹', 'رسوم الدفع': '🏦', 'أكل وشرب': '🍔', 'معدات': '⚽', 'زي وملابس': '👕', 'مواصلات': '🚌', 'تسويق': '📣', 'صيانة': '🔧', 'رحلات وفعاليات': '🎳', 'أخرى': '📦', 'اشتراكات': '💳', 'بيع زي': '👕', 'بطولات': '🏆', 'رعاية': '🤝' };
// settings/finance (admin-controlled): fixedExpenses, categories (custom), hiddenCats, upaymentFees
let finSet = { fixedExpenses: null, categories: { expense: [], income: [] }, hiddenCats: { expense: [], income: [] } };
const catsOf = type => [...DEF_CATS[type].filter(c => !(finSet.hiddenCats[type] || []).includes(c)), ...(finSet.categories[type] || []).map(c => c.name)];
const iconOf = c => CAT_ICON[c] || ([...(finSet.categories.expense || []), ...(finSet.categories.income || [])].find(x => x.name === c) || {}).icon || '📦';
let allTx = [], finCur = new Date(), finType = 'expense', finFilterV = 'all', txType = 'expense', txCat = null;
const KD = n => (+n || 0).toLocaleString('en-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

async function loadFinance() {
  try {
    const snap = await db.collection('transactions').orderBy('date', 'desc').limit(1000).get();
    allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!upFeesLoaded) await loadUpFees();
    renderFinance(); if (typeof renderStats === 'function') renderStats();
  } catch (e) { console.error(e); }
}
// recurring expense paid per subscriber (الكبتن 15 د.ك × active subscribers of perHeadPkgs, e.g. the kyokushin package only)
const activeCount = t => (typeof allSubscriptions !== 'undefined' ? allSubscriptions : []).filter(s => s.status === 'active' && (!(t && t.perHeadPkgs) || t.perHeadPkgs.includes(s.packageType))).length;
function monthTx() { const k = monthKey(finCur); return allTx.filter(t => (t.date || '').startsWith(k)); }
function finNetNow() { const k = monthKey(new Date()); let n = 0; allTx.forEach(t => { if ((t.date || '').startsWith(k)) n += t.type === 'income' ? +t.amount : -t.amount; }); return n.toFixed(0); }
function finMonth(d) { finCur.setMonth(finCur.getMonth() + d); renderFinance(); }
function finFilter(v) { finFilterV = v; document.querySelectorAll('#finSegs .seg').forEach(b => b.classList.toggle('on', b.dataset.v === v)); renderTxList(); }

function renderFinance() {
  document.getElementById('finMonthLabel').textContent = AR_MONTHS[finCur.getMonth()] + ' ' + finCur.getFullYear();
  const tx = monthTx();
  const inc = tx.filter(t => t.type === 'income'), exp = tx.filter(t => t.type === 'expense');
  const sumIn = inc.reduce((a, t) => a + (+t.amount || 0), 0), sumOut = exp.reduce((a, t) => a + (+t.amount || 0), 0), net = sumIn - sumOut;
  document.getElementById('finIn').innerHTML = KD(sumIn) + ' <small>د.ك</small>';
  document.getElementById('finOut').innerHTML = KD(sumOut) + ' <small>د.ك</small>';
  document.getElementById('finNet').innerHTML = (net < 0 ? '−' : '') + KD(Math.abs(net)) + ' <small>د.ك</small>';
  document.getElementById('finNetTile').classList.toggle('neg', net < 0);
  document.getElementById('finOutCount').textContent = exp.length ? exp.length + ' عملية' : '';
  document.getElementById('finInCount').textContent = inc.length ? inc.length + ' عملية' : '';
  renderBars('finOutBars', exp, sumOut, false); renderBars('finInBars', inc, sumIn, true);
  renderRecurring(); renderTxList();
}
function renderBars(id, list, total, isIn) {
  const el = document.getElementById(id);
  if (!list.length) { el.innerHTML = `<div class="empty" style="padding:14px">${isIn ? 'لا يوجد دخل' : 'لا توجد مصاريف'} هذا الشهر</div>`; return; }
  const by = {}; list.forEach(t => by[t.category || 'أخرى'] = (by[t.category || 'أخرى'] || 0) + (+t.amount || 0));
  el.innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => { const p = total ? Math.round(v / total * 100) : 0; return `<div class="bar ${isIn ? 'in' : ''}" style="cursor:pointer" onclick="filterCat(${JSON.stringify(c).replace(/"/g, '&quot;')})"><div class="t"><span>${iconOf(c)} ${c}</span><span>${KD(v)} <small>د.ك · ${p}%</small></span></div><div class="b"><i style="width:${p}%"></i></div></div>`; }).join('');
}
// transactions list: type segments + category + search (note / category / amount)
let finCatV = '';
function filterCat(c) { finCatV = finCatV === c ? '' : c; renderTxList(); document.getElementById('txList').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function renderTxList() {
  let tx = monthTx(); if (finFilterV !== 'all') tx = tx.filter(t => t.type === finFilterV);
  const q = (document.getElementById('txSearch')?.value || '').trim();
  if (finCatV) tx = tx.filter(t => (t.category || 'أخرى') === finCatV);
  if (q) tx = tx.filter(t => `${t.note || ''} ${t.category || ''} ${t.amount}`.includes(q));
  const sel = document.getElementById('txCatSel');
  if (sel) sel.innerHTML = `<option value="">كل الفئات</option>` + [...new Set([...monthTx().map(t => t.category || 'أخرى'), ...(finCatV ? [finCatV] : [])])].map(c => `<option ${c === finCatV ? 'selected' : ''}>${c}</option>`).join('');
  const sum = tx.reduce((a, t) => a + (t.type === 'income' ? 1 : -1) * (+t.amount || 0), 0), info = document.getElementById('txFilterInfo');
  if (info) info.textContent = finCatV || q ? `${tx.length} عملية · ${sum < 0 ? '−' : ''}${KD(Math.abs(sum))} د.ك` : '';
  const el = document.getElementById('txList');
  if (!tx.length) { el.innerHTML = '<div class="empty"><b>🧾</b>لا توجد عمليات</div>'; return; }
  const byDay = {}; tx.forEach(t => (byDay[t.date] = byDay[t.date] || []).push(t));
  el.innerHTML = Object.keys(byDay).sort().reverse().map(day => {
    const d = new Date(day); const lbl = isNaN(d) ? day : d.toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long' });
    return `<div style="font-size:0.75rem;font-weight:800;color:var(--text-light);margin:10px 4px 6px">${lbl}</div>` + byDay[day].map(t => `<div class="tx ${t.type === 'income' ? 'in' : ''}" onclick="openTx('${t.id}')"><div class="ic">${iconOf(t.category)}</div><div class="m"><b>${t.note || t.category || '--'}</b><small>${t.category || ''}${t.createdBy === 'telegram' ? ' · 🤖' : ''}${t.recurring ? ' · 🔁' : ''}${t.method === 'knet' ? ' · كي نت' : t.method === 'upayment' ? ' · UPayment' : ''}</small></div><div class="a">${KD(t.amount)}</div><button class="more">›</button></div>`).join('');
  }).join('');
}
// ---------- FIXED MONTHLY EXPENSES (settings/finance.fixedExpenses — editable; posted each month, automatically on the 1st) ----------
// item: { id, name, category, amount } or per subscriber { perHead, perHeadPkgs: ['confidence'] }; active: false = paused
const FX_PKGS = { confidence: '🥋 بناء الثقة', football: '⚽ كرة القدم', excellence: '⚡ التميز', excellence_loyal: '🏅 أسرة سلام' };
function legacyFixed() { // before the list existed: latest recurring transaction per category + note
  const seen = {}; allTx.filter(t => t.recurring && t.type === 'expense').forEach(t => { const k = (t.category || '') + '|' + (t.note || ''); if (!seen[k] || t.date > seen[k].date) seen[k] = t; });
  return Object.values(seen).map((t, i) => ({ id: 'fx' + (i + 1), name: t.note || t.category, category: t.category, amount: +t.amount, ...(t.perHead ? { perHead: +t.perHead, perHeadPkgs: t.perHeadPkgs || null } : {}), active: true }));
}
const fixedList = () => finSet.fixedExpenses || legacyFixed();
const fxAmount = f => f.perHead ? +(f.perHead * activeCount(f)).toFixed(3) : +f.amount || 0;
const fxPosted = f => monthTx().find(x => x.type === 'expense' && (x.fixedId === f.id || (!x.fixedId && x.recurring && x.category === f.category && x.note === f.name)));
function renderRecurring() {
  const list = fixedList(), el = document.getElementById('recurringList'); if (!el) return;
  const total = list.filter(f => f.active !== false).reduce((a, f) => a + fxAmount(f), 0);
  el.innerHTML = (list.length ? list.map(f => { const p = fxPosted(f), off = f.active === false;
    return `<div class="tx" style="${off ? 'opacity:.5' : ''}" onclick="openFixed('${f.id}')"><div class="ic">${iconOf(f.category)}</div><div class="m"><b>${f.name}</b><small>${f.category}${f.perHead ? ` · ${KD(f.perHead)} × ${activeCount(f)} مشترك${f.perHeadPkgs ? ' (' + f.perHeadPkgs.map(k => FX_PKGS[k] || k).join('، ') + ')' : ''}` : ''}${off ? ' · ⏸️ متوقف' : p ? ' · ✓ مسجّل هذا الشهر' : ''}</small></div><div class="a">${KD(fxAmount(f))}</div><button class="more">›</button></div>`; }).join('')
    + `<div style="display:flex;justify-content:space-between;font-weight:900;padding:8px 6px 0"><span>الإجمالي الشهري</span><span>${KD(total)} د.ك</span></div>`
    : '<div class="empty" style="padding:14px">لا توجد مصاريف ثابتة — أضف أول مصروف</div>');
}
async function saveFixedList(list) { await db.collection('settings').doc('finance').set({ fixedExpenses: list }, { merge: true }); finSet.fixedExpenses = list; renderRecurring(); }
function openFixed(id) {
  const f = id ? fixedList().find(x => x.id === id) : null;
  document.getElementById('fxId').value = id || ''; document.getElementById('fxTitle').textContent = f ? '✏️ مصروف ثابت' : '➕ مصروف ثابت جديد';
  document.getElementById('fxName').value = f ? f.name : ''; document.getElementById('fxCat').innerHTML = catsOf('expense').map(c => `<option ${f && f.category === c ? 'selected' : ''}>${c}</option>`).join('');
  document.getElementById('fxAmount').value = f && !f.perHead ? f.amount : ''; document.getElementById('fxPerHead').value = f && f.perHead ? f.perHead : '';
  document.getElementById('fxPkgs').innerHTML = Object.entries(FX_PKGS).map(([k, n]) => `<label class="chatid" style="cursor:pointer;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:10px"><span>${n}</span><input type="checkbox" value="${k}" ${!f || !f.perHeadPkgs || f.perHeadPkgs.includes(k) ? 'checked' : ''} onchange="fxPreview()" style="flex:0 0 20px;width:20px;height:20px;margin:0;accent-color:var(--green-mid)"/></label>`).join('');
  document.getElementById('fxActive').checked = !f || f.active !== false; setFxMode(f && f.perHead ? 'head' : 'fixed');
  const p = f && fxPosted(f), pn = document.getElementById('fxPostedNote'); pn.style.display = p ? '' : 'none'; pn.innerHTML = p ? `✓ مسجّل لشهر ${AR_MONTHS[finCur.getMonth()]} (${KD(p.amount)} د.ك) — <button class="link" type="button" onclick="closeFixed();openTx('${p.id}')">تعديل عملية هذا الشهر</button>` : '';
  document.getElementById('fxDel').style.display = f ? 'flex' : 'none'; document.getElementById('fixedModal').classList.add('open');
}
function closeFixed() { document.getElementById('fixedModal').classList.remove('open'); }
let fxMode = 'fixed';
function setFxMode(m) { fxMode = m; document.getElementById('fxModeFixed').classList.toggle('on', m === 'fixed'); document.getElementById('fxModeHead').classList.toggle('on', m === 'head'); document.getElementById('fxFixedBox').style.display = m === 'fixed' ? '' : 'none'; document.getElementById('fxHeadBox').style.display = m === 'head' ? '' : 'none'; fxPreview(); }
function fxForm() {
  const pk = [...document.querySelectorAll('#fxPkgs input:checked')].map(i => i.value);
  return { name: document.getElementById('fxName').value.trim(), category: document.getElementById('fxCat').value, active: document.getElementById('fxActive').checked,
    ...(fxMode === 'head' ? { perHead: +document.getElementById('fxPerHead').value || 0, perHeadPkgs: pk.length === Object.keys(FX_PKGS).length ? null : pk, amount: 0 } : { amount: +document.getElementById('fxAmount').value || 0 }) };
}
function fxPreview() { const el = document.getElementById('fxHeadPreview'); if (!el) return; const f = fxForm(); el.textContent = fxMode === 'head' ? `${KD(f.perHead)} × ${activeCount(f)} مشترك نشط = ${KD(fxAmount(f))} د.ك هذا الشهر` : ''; }
async function saveFixed(btn) {
  const id = document.getElementById('fxId').value, f = fxForm();
  if (!f.name) return showToast('❌ اكتب اسم المصروف'); if (fxMode === 'fixed' ? !f.amount : !f.perHead) return showToast('❌ أدخل المبلغ');
  if (fxMode === 'head' && f.perHeadPkgs && !f.perHeadPkgs.length) return showToast('❌ اختر باقة واحدة على الأقل');
  const list = fixedList().map(x => ({ ...x })), i = list.findIndex(x => x.id === id);
  if (i >= 0) { list[i] = { ...list[i], ...f }; if (fxMode === 'fixed') { delete list[i].perHead; delete list[i].perHeadPkgs; } } else list.push({ id: 'fx' + Date.now().toString(36), ...f });
  btn.disabled = true;
  try { await saveFixedList(list); closeFixed(); showToast('✅ حُفظ — يُطبّق من التسجيل القادم'); } catch (e) { showToast('❌ ' + e.message); } finally { btn.disabled = false; }
}
async function deleteFixed() {
  const id = document.getElementById('fxId').value; if (!id || !confirm('حذف هذا المصروف الثابت؟ (العمليات المسجّلة سابقاً تبقى كما هي)')) return;
  try { await saveFixedList(fixedList().filter(x => x.id !== id)); closeFixed(); showToast('🗑️ حُذف'); } catch (e) { showToast('❌ ' + e.message); }
}
async function postRecurring() {
  const todo = fixedList().filter(f => f.active !== false && !fxPosted(f));
  if (!todo.length) return showToast('كل المصاريف الثابتة مسجّلة لهذا الشهر');
  const total = todo.reduce((a, f) => a + fxAmount(f), 0);
  if (!confirm(`تسجيل ${todo.length} مصروف ثابت لشهر ${AR_MONTHS[finCur.getMonth()]}؟
الإجمالي: ${KD(total)} د.ك`)) return;
  const month = monthKey(finCur), batch = db.batch();
  todo.forEach(f => batch.set(db.collection('transactions').doc(`rec_${month}_${f.id}`), { type: 'expense', amount: fxAmount(f), category: f.category, note: f.name, method: 'cash', date: month + '-01', recurring: true, fixedId: f.id, ...(f.perHead ? { perHead: +f.perHead, heads: activeCount(f), ...(f.perHeadPkgs ? { perHeadPkgs: f.perHeadPkgs } : {}) } : {}), createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' }));
  try { await batch.commit(); showToast('✅ تم التسجيل'); loadFinance(); } catch (e) { showToast('❌ ' + e.message); }
}

// ---------- UPAYMENT FEES (settings/finance.upaymentFees — the Cloud Function records one per payment) ----------
let upFees = null, upFeesLoaded = false;
async function loadUpFees() { // the whole settings/finance doc: fees, fixed expenses, categories
  upFeesLoaded = true;
  try { const d = (await db.collection('settings').doc('finance').get()).data() || {}; upFees = d.upaymentFees || null;
    finSet = { fixedExpenses: d.fixedExpenses || null, categories: { expense: [], income: [], ...(d.categories || {}) }, hiddenCats: { expense: [], income: [], ...(d.hiddenCats || {}) } };
  } catch (e) { console.warn('finance settings', e); }
  renderUpFees();
}
function renderUpFees() {
  [['knet', 'fixed'], ['knet', 'pct'], ['card', 'fixed'], ['card', 'pct']].forEach(([a, b]) => { const el = document.getElementById(`fee_${a}_${b}`); if (el) el.value = upFees && upFees[a] && upFees[a][b] ? upFees[a][b] : ''; });
  const st = document.getElementById('feeState'); if (st) { st.textContent = upFees ? '✓ مفعّلة' : 'غير محددة'; st.className = 'chip ' + (upFees ? 'ok' : 'gold'); }
}
async function saveUpFees(btn) {
  const g = id => +document.getElementById(id).value || 0;
  const f = { knet: { fixed: g('fee_knet_fixed'), pct: g('fee_knet_pct') }, card: { fixed: g('fee_card_fixed'), pct: g('fee_card_pct') } };
  btn.disabled = true;
  try { await db.collection('settings').doc('finance').set({ upaymentFees: f }, { merge: true }); upFees = f; renderUpFees(); showToast('✅ حُفظت رسوم UPayment'); }
  catch (e) { showToast('❌ ' + e.message); } finally { btn.disabled = false; }
}
// same rule as the Cloud Function: KNET / Apple Pay (KNET) vs card
function upFeeFor(p) {
  if (!upFees) return null; const gw = p.gateway || {}, t = (gw.raw && gw.raw.data && gw.raw.data.transaction) || {};
  const card = t.is_paid_from_cc === true || (!/knet/i.test(gw.payment_type || t.payment_type || '') && t.is_paid_from_knet !== true);
  const r = upFees[card ? 'card' : 'knet'] || {}, fee = +((+r.fixed || 0) + (+p.amount || 0) * (+r.pct || 0) / 100).toFixed(3);
  return fee > 0 ? { amount: fee, label: card ? 'بطاقة' : 'كي نت' } : null;
}
async function backfillUpFees(btn) {
  if (!upFees) return showToast('حدد الرسوم واحفظها أولاً');
  const k = monthKey(finCur), pays = (await db.collection('payments').where('status', '==', 'paid').get()).docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.paidAt && p.paidAt.toDate && new Date(p.paidAt.toDate().getTime() + 3 * 3600e3).toISOString().startsWith(k) && !allTx.some(t => t.id === 'fee_' + p.id));
  const rows = pays.map(p => ({ p, f: upFeeFor(p) })).filter(x => x.f);
  if (!rows.length) return showToast('لا توجد دفعات بدون رسوم في هذا الشهر');
  const total = rows.reduce((a, x) => a + x.f.amount, 0);
  if (!confirm(`تسجيل رسوم UPayment لـ ${rows.length} دفعة في ${AR_MONTHS[finCur.getMonth()]}؟\nالإجمالي: ${KD(total)} د.ك`)) return;
  btn.disabled = true; const b = db.batch();
  rows.forEach(({ p, f }) => b.set(db.collection('transactions').doc('fee_' + p.id), { type: 'expense', amount: f.amount, category: 'رسوم الدفع', note: `رسوم UPayment (${f.label}) — ${p.childName || p.phone}`, method: 'upayment', date: new Date(p.paidAt.toDate().getTime() + 3 * 3600e3).toISOString().slice(0, 10), paymentId: p.id, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' }));
  try { await b.commit(); showToast(`✅ سُجّلت ${rows.length} رسوم`); loadFinance(); } catch (e) { showToast('❌ ' + e.message); } finally { btn.disabled = false; }
}

// ---------- MONTHLY REPORT (built by the monthlyReportNow Cloud Function for the month shown) ----------
async function openMonthReport(btn, send) {
  const month = monthKey(finCur);
  if (send && !confirm(`إرسال تقرير ${AR_MONTHS[finCur.getMonth()]} إلى تيليجرام؟`)) return;
  const label = btn.textContent; btn.disabled = true; btn.textContent = '⏳ جاري التجهيز...';
  try {
    const r = await fetch(PAYMENT_API_URL + '/monthlyReportNow', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await auth.currentUser.getIdToken() }, body: JSON.stringify({ month, send }) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'تعذر إنشاء التقرير');
    document.getElementById('reportFrame').srcdoc = j.html; document.getElementById('reportModal').classList.add('open');
    if (send) showToast('✅ أُرسل التقرير إلى تيليجرام');
  } catch (e) { showToast('❌ ' + e.message); } finally { btn.disabled = false; btn.textContent = label; }
}

// ---------- CATEGORIES (settings/finance.categories = custom, hiddenCats = defaults hidden from the picker) ----------
let catTab = 'expense';
function openCats() { document.getElementById('catModal').classList.add('open'); renderCatManager(); }
function closeCats() { document.getElementById('catModal').classList.remove('open'); if (document.getElementById('txModal').classList.contains('open')) renderCats(); }
function setCatTab(t) { catTab = t; renderCatManager(); }
function renderCatManager() {
  document.getElementById('catTabOut').classList.toggle('on', catTab === 'expense'); document.getElementById('catTabIn').classList.toggle('on', catTab === 'income');
  const hid = finSet.hiddenCats[catTab] || [], custom = finSet.categories[catTab] || [];
  document.getElementById('catList').innerHTML = DEF_CATS[catTab].map(c => `<label class="chatid" style="cursor:pointer;margin-bottom:6px;${hid.includes(c) ? 'opacity:.5' : ''}"><span>${iconOf(c)} ${c}</span><input type="checkbox" ${hid.includes(c) ? '' : 'checked'} data-c="${c}" onchange="toggleCat(this.dataset.c,this.checked)" style="width:20px;height:20px;accent-color:var(--green-mid)"/></label>`).join('')
    + custom.map(c => `<div class="chatid" style="margin-bottom:6px"><span>${c.icon || '📦'} ${c.name} <small style="color:var(--text-light)">(مضافة)</small></span><button class="abtn bad" style="flex:0 0 auto;padding:6px 10px" data-c="${c.name.replace(/"/g, '&quot;')}" onclick="removeCat(this.dataset.c)">🗑️</button></div>`).join('');
}
async function saveCatSettings() { await db.collection('settings').doc('finance').set({ categories: finSet.categories, hiddenCats: finSet.hiddenCats }, { merge: true }); }
async function toggleCat(c, on) { const h = new Set(finSet.hiddenCats[catTab] || []); on ? h.delete(c) : h.add(c); finSet.hiddenCats[catTab] = [...h]; renderCatManager(); try { await saveCatSettings(); } catch (e) { showToast('❌ ' + e.message); } }
async function addCat() {
  const name = document.getElementById('catName').value.trim(), icon = document.getElementById('catIcon').value.trim() || '📦'; if (!name) return showToast('❌ اكتب اسم الفئة');
  if (catsOf(catTab).includes(name) || DEF_CATS[catTab].includes(name)) return showToast('هذه الفئة موجودة');
  finSet.categories[catTab] = [...(finSet.categories[catTab] || []), { name, icon }]; document.getElementById('catName').value = ''; document.getElementById('catIcon').value = '';
  renderCatManager(); try { await saveCatSettings(); showToast('✅ أُضيفت الفئة'); } catch (e) { showToast('❌ ' + e.message); }
}
async function removeCat(name) {
  if (!confirm(`حذف فئة "${name}"؟ العمليات المسجّلة بها تبقى كما هي.`)) return;
  finSet.categories[catTab] = (finSet.categories[catTab] || []).filter(c => c.name !== name); renderCatManager(); try { await saveCatSettings(); } catch (e) { showToast('❌ ' + e.message); }
}

// ---------- ADD / EDIT ----------
function setTxType(t) { txType = t; document.getElementById('tgOut').classList.toggle('on', t === 'expense'); document.getElementById('tgIn').classList.toggle('on', t === 'income'); txCat = null; renderCats(); }
function renderCats() {
  const list = catsOf(txType); if (txCat && !list.includes(txCat)) list.push(txCat); // keep an old / hidden category when editing
  document.getElementById('txCats').innerHTML = list.map(c => `<button type="button" class="cat ${txCat === c ? 'on' : ''}" data-c="${c.replace(/"/g, '&quot;')}" onclick="txCat=this.dataset.c;renderCats()">${iconOf(c)} ${c}</button>`).join('')
    + `<button type="button" class="cat" onclick="openCats()">⚙️ الفئات</button>`;
}
function openTx(id) {
  const t = id ? allTx.find(x => x.id === id) : null;
  document.getElementById('txId').value = id || ''; document.getElementById('txTitle').textContent = t ? '✏️ تعديل العملية' : '➕ عملية جديدة';
  setTxType(t ? t.type : 'expense'); txCat = t ? t.category : null; renderCats();
  document.getElementById('txAmount').value = t ? t.amount : ''; document.getElementById('txDate').value = t ? t.date : new Date().toISOString().split('T')[0];
  document.getElementById('txMethod').value = t ? (t.method || 'cash') : 'cash'; document.getElementById('txNote').value = t ? (t.note || '') : ''; document.getElementById('txRecurring').checked = !!(t && t.recurring);
  document.getElementById('txDelBtn').style.display = t ? 'flex' : 'none';
  document.getElementById('txModal').classList.add('open'); if (!t) setTimeout(() => document.getElementById('txAmount').focus(), 300);
}
function closeTx() { document.getElementById('txModal').classList.remove('open'); }
async function saveTx() {
  const amount = parseFloat(document.getElementById('txAmount').value); if (!amount || amount <= 0) return showToast('❌ أدخل المبلغ');
  if (!txCat) return showToast('❌ اختر الفئة');
  const data = { type: txType, amount, category: txCat, note: document.getElementById('txNote').value.trim(), method: document.getElementById('txMethod').value, date: document.getElementById('txDate').value || new Date().toISOString().split('T')[0], recurring: txType === 'expense' && document.getElementById('txRecurring').checked, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  const id = document.getElementById('txId').value;
  try {
    if (id) await db.collection('transactions').doc(id).update(data);
    else await db.collection('transactions').add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' });
    const fxName = data.note || data.category; // 🔁 → becomes a fixed monthly expense (if not already in the list)
    if (data.recurring && !fixedList().some(f => f.name === fxName && f.category === data.category)) await saveFixedList([...fixedList(), { id: 'fx' + Date.now().toString(36), name: fxName, category: data.category, amount, active: true }]);
    closeTx(); showToast('✅ تم الحفظ'); loadFinance();
  } catch (e) { showToast('❌ ' + e.message); }
}
async function deleteTx() { const id = document.getElementById('txId').value; if (!id || !confirm('حذف هذه العملية؟')) return; await db.collection('transactions').doc(id).delete(); closeTx(); showToast('تم الحذف'); loadFinance(); }
function exportCSV() {
  const tx = monthTx(); if (!tx.length) return showToast('لا توجد عمليات');
  const rows = [['التاريخ', 'النوع', 'الفئة', 'المبلغ', 'الطريقة', 'ملاحظة', 'المصدر'], ...tx.map(t => [t.date, t.type === 'income' ? 'دخل' : 'مصروف', t.category, t.amount, t.method || '', (t.note || '').replace(/"/g, '""'), t.createdBy || ''])];
  const csv = '\ufeff' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `salam-finance-${monthKey(finCur)}.csv`; a.click();
}

// ---------- TELEGRAM SETTINGS ----------
async function loadTelegram() {
  try { const d = await db.collection('settings').doc('telegram').get(); renderChatIds(d.exists ? (d.data().chatIds || []) : []); } catch (e) { renderChatIds([]); }
}
function renderChatIds(ids) { document.getElementById('chatIdList').innerHTML = ids.length ? ids.map(c => `<div class="chatid"><span dir="ltr">🤖 ${c.id}${c.name ? ' — ' + c.name : ''}</span><button onclick="removeChatId('${c.id}')">حذف</button></div>`).join('') : '<div class="empty" style="padding:12px">لا توجد أجهزة متصلة بعد</div>'; }
async function addChatId() {
  const id = document.getElementById('newChatId').value.trim(); if (!/^-?\d{5,}$/.test(id)) return showToast('❌ Chat ID غير صحيح');
  const name = prompt('اسم صاحب الجهاز (اختياري):', '') || '';
  await db.collection('settings').doc('telegram').set({ chatIds: firebase.firestore.FieldValue.arrayUnion({ id, name }) }, { merge: true });
  document.getElementById('newChatId').value = ''; showToast('✅ تمت الإضافة'); loadTelegram();
}
async function removeChatId(id) {
  const d = await db.collection('settings').doc('telegram').get(); const ids = (d.data()?.chatIds || []).filter(c => c.id !== id);
  await db.collection('settings').doc('telegram').set({ chatIds: ids }, { merge: true }); loadTelegram();
}



// ---------- PAY ITEMS (catalog shown to parents) ----------
let payItemsAdmin = [];
const DEFAULT_ITEMS = [
  { icon: '⚽', name: 'اشتراك كرة القدم (شهر)', price: 25, packageType: 'football', category: 'اشتراكات', order: 1, active: true },
  { icon: '🥋', name: 'اشتراك بناء الثقة والكيوكشن (شهر)', price: 70, packageType: 'confidence', category: 'اشتراكات', order: 2, active: true },
  { icon: '⚡', name: 'باقة التميز — كرة القدم + الكيوكشن (4 أيام)', price: 80, packageType: 'excellence', category: 'اشتراكات', order: 3, active: true },
  { icon: '👕', name: 'تيشيرت الأكاديمية', price: 5, category: 'بيع زي', order: 10, active: true, allowQty: true },
  { icon: '🥊', name: 'معدات تدريب — واقي + قفازات', price: 30, category: 'بيع زي', order: 11, active: true }
];
async function loadPayItems() {
  let snap;
  try { snap = await db.collection('payItems').get(); }
  catch (e) { const el = document.getElementById('payItemsList'); if (el) el.innerHTML = `<div class="empty" style="padding:14px;color:var(--bad)">❌ تعذر تحميل المنتجات<br/><small>${e.code === 'permission-denied' ? 'لم يتم نشر قواعد Firestore بعد — نفّذ: firebase deploy --only firestore:rules' : e.message}</small></div>`; return; }
  payItemsAdmin = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const el = document.getElementById('payItemsList'); if (!el) return;
  el.innerHTML = payItemsAdmin.length ? payItemsAdmin.map(i => `<div class="pay-row ${i.active ? '' : 'off'}" onclick="openPayItem('${i.id}')"><div class="pi">${i.icon || '🏷️'}</div><div class="m"><b>${i.name}</b><small>${i.packageType ? '🔁 يفعّل باقة ' + (PKG_NAMES[i.packageType] || i.packageType) + ' · ' : ''}${i.category || ''}${i.allowQty ? ' · كمية' : ''}${i.customAmount ? ' · ✍️ مبلغ مفتوح' : ''}${i.active ? '' : ' · مخفي'}</small></div><div class="pp">${i.customAmount ? '✍️' : `${(+i.price).toFixed(3)} <small style="font-size:.65rem;color:var(--text-light)">د.ك</small>`}</div></div>`).join('')
    : `<div class="empty" style="padding:14px">لا توجد منتجات بعد<br/><button class="link" style="margin-top:10px" onclick="seedPayItems()">✨ إنشاء القائمة الافتراضية</button></div>`;
}
async function seedPayItems() { try { const b = db.batch(); DEFAULT_ITEMS.forEach(i => b.set(db.collection('payItems').doc(), { ...i, createdAt: firebase.firestore.FieldValue.serverTimestamp() })); await b.commit(); showToast('✅ تم الإنشاء'); loadPayItems(); } catch (e) { showToast('❌ ' + (e.code === 'permission-denied' ? 'غير مصرح — انشر قواعد Firestore أولاً' : e.message)); } }
function openPayItem(id) {
  const i = id ? payItemsAdmin.find(x => x.id === id) : null;
  document.getElementById('piId').value = id || ''; document.getElementById('piTitle').textContent = i ? '✏️ تعديل المنتج' : '➕ منتج دفع';
  document.getElementById('piIcon').value = i ? (i.icon || '') : ''; document.getElementById('piPrice').value = i ? i.price : ''; document.getElementById('piName').value = i ? i.name : '';
  document.getElementById('piPkg').value = i ? (i.packageType || '') : ''; document.getElementById('piOrder').value = i ? (i.order || 10) : (payItemsAdmin.length + 1); document.getElementById('piCat').value = i ? (i.category || 'أخرى') : 'اشتراكات';
  document.getElementById('piQty').checked = !!(i && i.allowQty); document.getElementById('piCustom').checked = !!(i && i.customAmount); document.getElementById('piActive').checked = i ? i.active !== false : true;
  document.getElementById('piDel').style.display = i ? 'flex' : 'none'; document.getElementById('payItemModal').classList.add('open'); document.querySelector('#payItemModal .sheet').scrollTop = 0;
}
function closePayItem() { document.getElementById('payItemModal').classList.remove('open'); }
async function savePayItem(btn) {
  const custom = document.getElementById('piCustom').checked;
  const name = document.getElementById('piName').value.trim(), price = parseFloat(document.getElementById('piPrice').value) || 0;
  if (!name) return showToast('❌ اكتب اسم المنتج');
  if (!custom && !(price > 0)) return showToast('❌ أدخل السعر (أو فعّل: ولي الأمر يكتب المبلغ)');
  const data = { name, price, customAmount: custom, icon: document.getElementById('piIcon').value.trim() || '🏷️', packageType: document.getElementById('piPkg').value || null, category: document.getElementById('piCat').value, order: +document.getElementById('piOrder').value || 10, allowQty: document.getElementById('piQty').checked, active: document.getElementById('piActive').checked, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  if (custom) { data.allowQty = false; data.packageType = null; } // open amount = one payment, never activates a package
  const id = document.getElementById('piId').value || (document.getElementById('piId').value = db.collection('payItems').doc().id); // fixed id → retry never duplicates
  const isNew = !payItemsAdmin.some(x => x.id === id);
  btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
  try {
    await withTimeout(db.collection('payItems').doc(id).set(isNew ? { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() } : data, { merge: true }));
    closePayItem(); showToast('✅ تم الحفظ'); loadPayItems();
  } catch (e) { showToast(e.message === 'timeout' ? SLOW_MSG : '❌ ' + (e.code === 'permission-denied' ? 'غير مصرح — انشر قواعد Firestore أولاً' : e.message)); }
  finally { btn.disabled = false; btn.textContent = '💾 حفظ'; }
}
async function deletePayItem() { const id = document.getElementById('piId').value; if (!id || !confirm('حذف هذا المنتج؟')) return; await db.collection('payItems').doc(id).delete(); closePayItem(); showToast('تم الحذف'); loadPayItems(); }

// ---------- UPAYMENT PAYMENTS LOG ----------
async function loadPayments() {
  try {
    const snap = await db.collection('payments').orderBy('createdAt', 'desc').limit(30).get();
    const el = document.getElementById('paymentsList'); if (!el) return;
    document.getElementById('payCount').textContent = snap.size ? 'آخر ' + snap.size : '';
    const ST = { paid: ['ok', '✅ مدفوع'], pending: ['gold', '⏳ معلّق'], failed: ['bad', '❌ فشل'] };
    el.innerHTML = snap.empty ? '<div class="empty" style="padding:14px">لا توجد مدفوعات بعد</div>' : snap.docs.map(d => { const p = d.data(); const st = ST[p.status] || ['copper', p.status]; return `<div class="pay-row"><div class="pi">💳</div><div class="m"><b>${p.childName || p.parentName || p.phone}</b><small>${(p.items || []).map(i => i.name).join('، ')} · ${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('ar-KW') : ''}${p.paymentType ? ' · ' + p.paymentType : ''}</small></div><div style="text-align:left"><div class="pp">${(+p.amount).toFixed(3)}</div><span class="chip ${st[0]}" style="font-size:.65rem">${st[1]}</span></div></div>`; }).join('');
  } catch (e) { console.warn('payments', e); }
}

// ---------- BOOT ----------
let txReady = false;
auth.onAuthStateChanged(u => { if (!u) return; loadFinance(); loadTelegram(); loadPayItems(); loadPayments();
  db.collection('transactions').onSnapshot(() => { if (!txReady) { txReady = true; return; } loadFinance(); });
  db.collection('payments').onSnapshot(() => loadPayments());
});
