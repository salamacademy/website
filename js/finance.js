// ============================
// FINANCE (accounting) MODULE
// ============================
const CATS = {
  expense: ['إيجار', 'رواتب', 'أكل وشرب', 'معدات', 'زي وملابس', 'مواصلات', 'تسويق', 'صيانة', 'رحلات وفعاليات', 'أخرى'],
  income: ['اشتراكات', 'رحلات وفعاليات', 'بيع زي', 'بطولات', 'رعاية', 'أخرى']
};
const CAT_ICON = { 'إيجار': '🏟️', 'رواتب': '👨‍🏫', 'أكل وشرب': '🍔', 'معدات': '⚽', 'زي وملابس': '👕', 'مواصلات': '🚌', 'تسويق': '📣', 'صيانة': '🔧', 'رحلات وفعاليات': '🎳', 'أخرى': '📦', 'اشتراكات': '💳', 'بيع زي': '👕', 'بطولات': '🏆', 'رعاية': '🤝' };
let allTx = [], finCur = new Date(), finType = 'expense', finFilterV = 'all', txType = 'expense', txCat = null;
const KD = n => (+n || 0).toLocaleString('en-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

async function loadFinance() {
  try {
    const snap = await db.collection('transactions').orderBy('date', 'desc').limit(1000).get();
    allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFinance(); if (typeof renderStats === 'function') renderStats();
  } catch (e) { console.error(e); }
}
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
  el.innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => { const p = total ? Math.round(v / total * 100) : 0; return `<div class="bar ${isIn ? 'in' : ''}"><div class="t"><span>${CAT_ICON[c] || '📦'} ${c}</span><span>${KD(v)} <small>د.ك · ${p}%</small></span></div><div class="b"><i style="width:${p}%"></i></div></div>`; }).join('');
}
function renderTxList() {
  let tx = monthTx(); if (finFilterV !== 'all') tx = tx.filter(t => t.type === finFilterV);
  const el = document.getElementById('txList');
  if (!tx.length) { el.innerHTML = '<div class="empty"><b>🧾</b>لا توجد عمليات</div>'; return; }
  const byDay = {}; tx.forEach(t => (byDay[t.date] = byDay[t.date] || []).push(t));
  el.innerHTML = Object.keys(byDay).sort().reverse().map(day => {
    const d = new Date(day); const lbl = isNaN(d) ? day : d.toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'long' });
    return `<div style="font-size:0.75rem;font-weight:800;color:var(--text-light);margin:10px 4px 6px">${lbl}</div>` + byDay[day].map(t => `<div class="tx ${t.type === 'income' ? 'in' : ''}" onclick="openTx('${t.id}')"><div class="ic">${CAT_ICON[t.category] || '📦'}</div><div class="m"><b>${t.note || t.category || '--'}</b><small>${t.category || ''}${t.createdBy === 'telegram' ? ' · 🤖' : ''}${t.recurring ? ' · 🔁' : ''}${t.method === 'knet' ? ' · كي نت' : t.method === 'upayment' ? ' · Upayment' : ''}</small></div><div class="a">${KD(t.amount)}</div><button class="more">›</button></div>`).join('');
  }).join('');
}
function renderRecurring() {
  const rec = allTx.filter(t => t.recurring && t.type === 'expense');
  const seen = {}; rec.forEach(t => { const k = (t.category || '') + '|' + (t.note || ''); if (!seen[k] || t.date > seen[k].date) seen[k] = t; });
  const list = Object.values(seen);
  document.getElementById('recurringList').innerHTML = list.length ? list.map(t => { const posted = monthTx().some(x => x.category === t.category && x.note === t.note && x.type === 'expense'); return `<div class="chatid" style="${posted ? 'opacity:.6' : ''}"><span>${CAT_ICON[t.category] || '📦'} ${t.note || t.category} — <b>${KD(t.amount)}</b> د.ك ${posted ? '<span class="chip ok" style="margin-right:6px">✓ مسجّل</span>' : ''}</span></div>`; }).join('') : '<div class="empty" style="padding:14px">لا توجد مصاريف ثابتة — فعّل "تكرار شهري" عند إضافة مصروف</div>';
}
async function postRecurring() {
  const rec = allTx.filter(t => t.recurring && t.type === 'expense'); const seen = {}; rec.forEach(t => { const k = (t.category || '') + '|' + (t.note || ''); if (!seen[k] || t.date > seen[k].date) seen[k] = t; });
  const todo = Object.values(seen).filter(t => !monthTx().some(x => x.category === t.category && x.note === t.note && x.type === 'expense'));
  if (!todo.length) return showToast('كل المصاريف الثابتة مسجّلة لهذا الشهر');
  if (!confirm(`تسجيل ${todo.length} مصروف ثابت لشهر ${AR_MONTHS[finCur.getMonth()]}؟`)) return;
  const date = monthKey(finCur) + '-01'; const batch = db.batch();
  todo.forEach(t => batch.set(db.collection('transactions').doc(), { type: 'expense', amount: +t.amount, category: t.category, note: t.note || '', method: t.method || 'cash', date, recurring: true, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' }));
  await batch.commit(); showToast('✅ تم التسجيل'); loadFinance();
}

// ---------- ADD / EDIT ----------
function setTxType(t) { txType = t; document.getElementById('tgOut').classList.toggle('on', t === 'expense'); document.getElementById('tgIn').classList.toggle('on', t === 'income'); txCat = null; renderCats(); }
function renderCats() { document.getElementById('txCats').innerHTML = CATS[txType].map(c => `<button type="button" class="cat ${txCat === c ? 'on' : ''}" onclick="txCat='${c}';renderCats()">${CAT_ICON[c] || ''} ${c}</button>`).join(''); }
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

// realtime: transactions added from Telegram appear instantly
let txReady = false;
auth.onAuthStateChanged(u => { if (!u) return; loadFinance(); loadTelegram();
  db.collection('transactions').onSnapshot(() => { if (!txReady) { txReady = true; return; } loadFinance(); });
});
