// ============================
// ADMIN — TRIPS (الرحلات): create/edit trips, see & manage bookings
// Paid bookings come from Cloud Functions (UPayment); the admin can add cash bookings or remove one.
// ============================
let tripsAdmin = [], tripBookings = [], tripImg = null, tripOpenId = null;

function listenTrips() {
  db.collection('trips').onSnapshot(s => { tripsAdmin = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); renderTrips(); }, e => console.warn('trips', e));
  db.collection('tripBookings').onSnapshot(s => { tripBookings = s.docs.map(d => ({ id: d.id, ...d.data() })); renderTrips(); }, e => console.warn('tripBookings', e));
}
const bookingsOf = id => tripBookings.filter(b => b.tripId === id).sort((a, b) => (a.childName || '').localeCompare(b.childName || '', 'ar'));

function renderTrips() {
  const el = document.getElementById('tripsList'); if (!el) return;
  const up = tripsAdmin.filter(t => !t.date || t.date >= Trips.today()).reverse(), past = tripsAdmin.filter(t => t.date && t.date < Trips.today());
  const row = t => { const st = Trips.state(t); return `<div class="trip-row" onclick="openTripDetail('${t.id}')">${t.image ? `<img class="th" src="${t.image}" alt=""/>` : '<div class="th">🚌</div>'}<div class="m"><b>${Trips.esc(t.title)}${t.hidden ? ' · 👁️‍🗨️ مخفية' : ''}</b><small>${Trips.date(t.date)} · ${(+t.price || 0).toFixed(3)} د.ك</small>${Trips.seats(t).replace('class="seats', 'style="margin:4px 0 0" class="seats')}</div><span class="chip ${st[0]}" style="font-size:.65rem">${st[1]}</span></div>`; };
  el.innerHTML = (up.length ? up.map(row).join('') : '<div class="empty">لا توجد رحلات قادمة<br/><button class="link" style="margin-top:10px" onclick="openTrip()">➕ أضف رحلة</button></div>')
    + (past.length ? `<div class="page-title" style="margin-top:14px"><h3>🗂️ رحلات سابقة</h3></div>${past.map(row).join('')}` : '');
  if (tripOpenId && document.getElementById('tripDetailModal').classList.contains('open')) renderTripDetail();
}

// ---------- EDIT SHEET ----------
const TF = ['title', 'value', 'date', 'place', 'meetTime', 'departTime', 'returnTime', 'price', 'capacity', 'notes'];
const tf = k => document.getElementById('tr_' + k);
function openTrip(id) {
  const t = id ? tripsAdmin.find(x => x.id === id) : null;
  document.getElementById('trId').value = id || '';
  document.getElementById('trTitle').textContent = t ? '✏️ تعديل الرحلة' : '➕ رحلة جديدة';
  const def = { place: 'أكاديمية سلام', meetTime: '09:00', departTime: '09:15', returnTime: '12:30', capacity: 20 };
  TF.forEach(k => tf(k).value = t ? (t[k] ?? '') : (def[k] ?? ''));
  document.getElementById('trOpen').checked = t ? t.status === 'open' : true;
  document.getElementById('trHidden').checked = !!(t && t.hidden);
  tripImg = t ? (t.image || null) : null; renderTripImg();
  document.getElementById('trDel').style.display = t ? 'flex' : 'none';
  document.getElementById('tripDetailModal').classList.remove('open');
  document.getElementById('tripModal').classList.add('open'); document.querySelector('#tripModal .sheet').scrollTop = 0;
}
function closeTrip() { document.getElementById('tripModal').classList.remove('open'); }
function renderTripImg() {
  document.getElementById('trImgBox').innerHTML = tripImg ? `<img src="${tripImg}" alt=""/><button type="button" class="abtn bad" onclick="tripImg=null;renderTripImg()">🗑️ إزالة الصورة</button>` : '<div style="font-size:2rem">🖼️</div><div style="font-size:.8rem;color:var(--text-light);font-weight:700;margin:4px 0 8px">صورة إعلان الرحلة (اختياري)</div>';
}
// shrink the poster in the browser so it fits in the trip document (Firestore 1 MB limit)
function pickTripImg(input) {
  const f = input.files && input.files[0]; input.value = ''; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    let w = img.naturalWidth, h = img.naturalHeight; const max = 1000; if (w > max) { h = Math.round(h * max / w); w = max; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    let q = 0.8, out = c.toDataURL('image/jpeg', q); while (out.length > 600000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
    URL.revokeObjectURL(url); if (out.length > 800000) return showToast('❌ الصورة كبيرة جداً — جرّب صورة أصغر');
    tripImg = out; renderTripImg();
  };
  img.onerror = () => showToast('❌ تعذر قراءة الصورة');
  img.src = url;
}
async function saveTrip(btn) {
  const v = Object.fromEntries(TF.map(k => [k, tf(k).value.trim()]));
  if (!v.title) return showToast('❌ اكتب اسم الرحلة');
  if (!v.date) return showToast('❌ اختر تاريخ الرحلة');
  const price = Math.round(parseFloat(v.price) * 1000) / 1000, capacity = parseInt(v.capacity);
  if (!(price > 0)) return showToast('❌ أدخل سعر الرحلة');
  if (!(capacity > 0)) return showToast('❌ أدخل عدد المقاعد');
  const id = document.getElementById('trId').value || (document.getElementById('trId').value = db.collection('trips').doc().id); // fixed id → retry never duplicates
  const old = tripsAdmin.find(x => x.id === id), booked = old ? (+old.booked || 0) : 0;
  const open = document.getElementById('trOpen').checked;
  const data = { ...v, price, capacity, image: tripImg || null, hidden: document.getElementById('trHidden').checked, status: open ? 'open' : 'closed', closedReason: open ? null : 'admin', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  if (open && booked >= capacity) { data.status = 'closed'; data.closedReason = 'full'; }
  if (!old) Object.assign(data, { booked: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
  try {
    await withTimeout(db.collection('trips').doc(id).set(data, { merge: true }), 25000);
    closeTrip(); showToast(open && booked >= capacity ? '✅ تم الحفظ — العدد مكتمل فبقي التسجيل مغلقاً' : '✅ تم حفظ الرحلة');
  } catch (e) { showToast(e.message === 'timeout' ? SLOW_MSG : '❌ ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '💾 حفظ الرحلة'; }
}
async function deleteTrip() {
  const id = document.getElementById('trId').value; if (!id) return;
  const n = bookingsOf(id).length;
  if (!confirm(n ? `في هذه الرحلة ${n} حجز. حذف الرحلة وكل حجوزاتها؟\n(المبالغ المدفوعة لا تُسترجع تلقائياً)` : 'حذف هذه الرحلة؟')) return;
  const list = bookingsOf(id), b = db.batch(); list.forEach(x => b.delete(db.collection('tripBookings').doc(x.id))); b.delete(db.collection('trips').doc(id));
  await b.commit(); closeTrip(); showToast('تم حذف الرحلة');
  [...new Set(list.map(x => x.phone))].forEach(p => PortalSync.syncPhone(db, p).catch(() => {}));
}

// ---------- DETAIL SHEET (bookings) ----------
function openTripDetail(id) { tripOpenId = id; renderTripDetail(); document.getElementById('tripDetailModal').classList.add('open'); document.querySelector('#tripDetailModal .sheet').scrollTop = 0; }
function closeTripDetail() { document.getElementById('tripDetailModal').classList.remove('open'); tripOpenId = null; }
function renderTripDetail() {
  const t = tripsAdmin.find(x => x.id === tripOpenId); if (!t) return closeTripDetail();
  const bs = bookingsOf(t.id), st = Trips.state(t), paid = bs.reduce((a, b) => a + (+b.amount || 0), 0);
  const booked = new Set(bs.map(b => b.subId));
  const opts = allSubscriptions.filter(s => !['rejected', 'cancelled'].includes(s.status) && !booked.has(s.id)).sort((a, b) => (a.childName || '').localeCompare(b.childName || '', 'ar'))
    .map(s => `<option value="${s.id}">${Trips.esc(s.childName)} — ${s.phone}</option>`).join('');
  document.getElementById('tripDetailBody').innerHTML = `<div class="trip" style="box-shadow:none;margin:0 -4px 10px">${Trips.card(t)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      <button class="abtn primary" onclick="openTrip('${t.id}')">✏️ تعديل</button>
      ${st[1] === 'انتهت' ? '' : `<button class="abtn ${t.status === 'open' ? 'bad' : 'ok'}" onclick="toggleTripOpen('${t.id}')">${t.status === 'open' ? '🔒 إغلاق التسجيل' : '🔓 فتح التسجيل'}</button>`}
      <button class="abtn wa" onclick="shareTrip('${t.id}')">📲 إعلان واتساب</button>
    </div>
    <div class="card-h"><h4>👦 المشتركين المسجلين (${bs.length}/${t.capacity})</h4><button class="link" onclick="copyTripNames('${t.id}')">📋 نسخ</button></div>
    <p style="font-size:.78rem;color:var(--text-light);font-weight:800;margin:-4px 0 8px">المحصّل: ${paid.toFixed(3)} د.ك</p>
    ${bs.length ? bs.map((b, i) => `<div class="pay-row"><div class="pi" style="font-size:.9rem;font-weight:900">${i + 1}</div><div class="m"><b>${Trips.esc(b.childName)}</b><small><span dir="ltr">${b.phone}</span> · ${b.method === 'upayment' ? '💳 أونلاين' : '💵 نقدي'}</small></div><button class="abtn wa" style="flex:0;min-width:40px" onclick="window.open('https://wa.me/965${b.phone}','_blank')">💬</button><button class="abtn bad" style="flex:0;min-width:40px" onclick="removeTripBooking('${b.id}')">✕</button></div>`).join('') : '<div class="empty" style="padding:16px">لا توجد حجوزات بعد</div>'}
    <div class="card" style="background:var(--green-xpale);box-shadow:none;margin-top:10px">
      <div class="fg"><label>➕ حجز يدوي (دفع نقدي / تحويل)</label><select id="trManualSub"><option value="">— اختر المشترك —</option>${opts}</select></div>
      <label class="chatid" style="cursor:pointer"><span>💵 تسجيل ${(+t.price).toFixed(3)} د.ك كدخل في المالية</span><input type="checkbox" id="trManualIncome" checked style="width:20px;height:20px;accent-color:var(--green-mid)"/></label>
      <button class="btn primary" style="margin-top:10px" onclick="addTripBooking('${t.id}',this)">➕ إضافة الحجز</button>
    </div>`;
}
async function toggleTripOpen(id) {
  const t = tripsAdmin.find(x => x.id === id); if (!t) return;
  if (t.status !== 'open' && Trips.left(t) <= 0) return showToast('❌ العدد مكتمل — زد عدد المقاعد من "تعديل" أولاً');
  await db.collection('trips').doc(id).update({ status: t.status === 'open' ? 'closed' : 'open', closedReason: t.status === 'open' ? 'admin' : null });
  showToast(t.status === 'open' ? '🔒 تم إغلاق التسجيل' : '🔓 تم فتح التسجيل');
}
async function addTripBooking(id, btn) {
  const subId = document.getElementById('trManualSub').value; if (!subId) return showToast('❌ اختر المشترك');
  const s = allSubscriptions.find(x => x.id === subId), income = document.getElementById('trManualIncome').checked;
  const lt = tripsAdmin.find(x => x.id === id); if (lt && Trips.left(lt) <= 0 && !confirm(`العدد مكتمل (${lt.capacity}). إضافة ${s.childName} فوق العدد؟`)) return;
  btn.disabled = true;
  try {
    const tripRef = db.collection('trips').doc(id), bRef = db.collection('tripBookings').doc(`${id}_manual_${subId}`); let price = 0, title = '';
    await db.runTransaction(async tx => {
      const tr = await tx.get(tripRef), ex = await tx.get(bRef); if (!tr.exists) throw new Error('الرحلة غير موجودة'); if (ex.exists) throw new Error('محجوز مسبقاً');
      const t = tr.data(), booked = (+t.booked || 0) + 1; price = +t.price || 0; title = t.title || '';
      tx.set(bRef, { tripId: id, tripTitle: title, tripDate: t.date || '', subId, childName: s.childName || '', phone: s.phone, parentName: s.parentName || '', amount: price, method: 'cash', createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' });
      tx.update(tripRef, { booked, ...(booked >= (+t.capacity || 0) ? { status: 'closed', closedReason: 'full' } : {}) });
    });
    if (income) await db.collection('transactions').doc(`trip_${id}_${subId}`).set({ type: 'income', amount: price, category: 'رحلات وفعاليات', note: `رحلة ${title} — ${s.childName}`, method: 'cash', date: todayIso(), tripId: id, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: 'admin' });
    PortalSync.syncPhone(db, s.phone).catch(() => {});
    showToast('✅ تم الحجز');
  } catch (e) { showToast('❌ ' + e.message); }
  finally { btn.disabled = false; }
}
async function removeTripBooking(bid) {
  const b = tripBookings.find(x => x.id === bid); if (!b || !confirm(`إلغاء حجز ${b.childName}؟${b.method === 'upayment' ? '\n(دفع أونلاين — الاسترجاع يتم يدوياً)' : ''}`)) return;
  const tripRef = db.collection('trips').doc(b.tripId);
  try {
    await db.runTransaction(async tx => {
      const tr = await tx.get(tripRef); tx.delete(db.collection('tripBookings').doc(bid)); if (!tr.exists) return;
      const t = tr.data(), booked = Math.max(0, (+t.booked || 0) - 1);
      tx.update(tripRef, { booked, ...(t.closedReason === 'full' && booked < (+t.capacity || 0) ? { status: 'open', closedReason: null } : {}) }); // a seat freed → reopen
    });
    PortalSync.syncPhone(db, b.phone).catch(() => {});
    showToast('تم إلغاء الحجز');
  } catch (e) { showToast('❌ ' + e.message); }
}
function copyTripNames(id) {
  const t = tripsAdmin.find(x => x.id === id), txt = `رحلة ${t.title} — ${Trips.date(t.date)}\n` + bookingsOf(id).map((b, i) => `${i + 1}. ${b.childName} — ${b.phone}`).join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => showToast('📋 تم نسخ القائمة'), () => prompt('انسخ القائمة:', txt));
}
function shareTrip(id) {
  const t = tripsAdmin.find(x => x.id === id); if (!t) return;
  const msg = `🚌 رحلة ${t.title}\nيوم مليء بالمرح والتحدي 🎉\n${t.value ? `\n💚 القيمة التربوية: ${t.value}` : ''}\n📅 ${Trips.date(t.date)}\n📍 الانطلاق من: ${t.place || 'أكاديمية سلام'}\n👥 التجمع: ${Trips.time(t.meetTime)}\n🚌 الانطلاق: ${Trips.time(t.departTime)}\n🕐 العودة: ${Trips.time(t.returnTime)}\n💰 الرسوم: ${(+t.price).toFixed(3)} د.ك\n\n⚠️ عدد المقاعد محدود (${t.capacity}) — الأولوية للأسبق في الدفع\n\nللحجز والدفع من تطبيق أكاديمية سلام:\n${SITE_BASE}client/login.html?go=trips\n\nأكاديمية سلام — معاً نحو بناء جيل واثق 💪\n93000607`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

auth.onAuthStateChanged(u => { if (u) listenTrips(); });
