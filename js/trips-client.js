// ============================
// PARENT — TRIPS (الرحلات): upcoming trips, pick children, pay via UPayment
// Seats are checked again on the server; the trip closes itself when full.
// ============================
let tripsList = [], tripPick = {};

function listenTripsClient() {
  db.collection('trips').where('date', '>=', Trips.today()).onSnapshot(s => {
    tripsList = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.hidden).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    renderTripsClient();
  }, e => { console.warn('trips', e); const el = $('tripsList'); if (el) el.innerHTML = '<div class="empty">تعذر تحميل الرحلات</div>'; });
}
// children of this family that may join (not rejected / cancelled)
const tripKids = () => kids.filter(k => !['rejected', 'cancelled'].includes(k.status));
const isBooked = (t, k) => (portalDoc?.trips || []).some(b => b.tripId === t.id && (b.subId === k.id || (b.childName || '').trim() === (k.childName || '').trim()));

function renderTripsClient() {
  const el = $('tripsList'); if (!el) return;
  const promo = $('tripPromo'), next = tripsList.find(t => Trips.state(t)[2]);
  if (promo) { promo.style.display = next ? 'flex' : 'none'; if (next) promo.innerHTML = `<div class="e">🚌</div><div><b>رحلة ${Trips.esc(next.title)}</b><small>${Trips.date(next.date)} · ${(+next.price).toFixed(3).replace(/\.?0+$/, '')} د.ك · متبقٍ ${Trips.left(next)} مقعد</small></div><span class="go">احجز الآن</span>`; }
  const tab = document.querySelector('.tab[data-page="trips"] .dot'); if (tab) { const n = tripsList.filter(t => Trips.state(t)[2] && !tripKids().every(k => isBooked(t, k))).length; tab.textContent = n; tab.style.display = n ? 'flex' : 'none'; }
  if (!tripsList.length) { el.innerHTML = '<div class="empty"><div style="font-size:2.4rem">🚌</div>لا توجد رحلات قادمة حالياً<br/><small>سنعلن عن الرحلة القادمة هنا قريباً</small></div>'; return; }
  el.innerHTML = tripsList.map(t => `<div class="trip">${Trips.card(t, tripActions(t))}</div>`).join('');
}
function tripActions(t) {
  const ks = tripKids(), st = Trips.state(t), pick = tripPick[t.id] || [];
  if (!ks.length) return `<div class="note">📝 الحجز متاح للمشتركين المسجلين في الأكاديمية. <a href="register.html" style="color:var(--green);font-weight:900">سجّل الآن</a></div>`;
  const chips = ks.map(k => { const done = isBooked(t, k), on = pick.includes(k.id); return `<button class="${done ? 'done' : on ? 'on' : ''}" ${done || !st[2] ? 'disabled' : ''} onclick="toggleTripKid('${t.id}','${k.id}')">${done ? '✅' : on ? '✓' : '👦'} ${Trips.esc((k.childName || '').split(' ')[0])}${done ? ' — محجوز' : ''}</button>`; }).join('');
  const all = ks.every(k => isBooked(t, k));
  if (!st[2]) return `<div class="kidpick">${chips}</div>${all ? '' : `<button class="btn ghost" disabled style="opacity:.7">${st[1]}</button>`}`;
  if (all) return `<div class="kidpick">${chips}</div><div class="note" style="text-align:center">✅ تم الحجز — نراكم في الرحلة!</div>`;
  const total = pick.length * (+t.price || 0), off = !pick.length;
  return `<div style="font-size:.8rem;font-weight:800;color:var(--text-mid);margin-bottom:6px">اختر المشترك:</div><div class="kidpick">${chips}</div>
    <button class="btn upay" id="tripPay_${t.id}" ${off ? 'disabled style="opacity:.6"' : ''} onclick="payTrip('${t.id}')"><img src="../images/upayment.svg" class="upay-ic" alt=""/> <span>${off ? 'اختر المشترك للحجز' : `احجز وادفع ${total.toFixed(3)} د.ك`}</span></button>`;
}
function toggleTripKid(tid, kid) {
  const t = tripsList.find(x => x.id === tid); const p = tripPick[tid] = tripPick[tid] || [];
  const i = p.indexOf(kid); if (i >= 0) p.splice(i, 1); else { if (p.length >= Trips.left(t)) return alert(`متبقٍ ${Trips.left(t)} ${Trips.left(t) === 1 ? 'مقعد' : 'مقاعد'} فقط`); p.push(kid); }
  renderTripsClient();
}
async function payTrip(tid) {
  const t = tripsList.find(x => x.id === tid), pick = (tripPick[tid] || []).filter(id => { const k = kids.find(x => x.id === id); return k && !isBooked(t, k); });
  if (!t || !pick.length) return;
  const names = pick.map(id => (kids.find(k => k.id === id)?.childName || '').split(' ')[0]).join('، ');
  if (!confirm(`حجز رحلة ${t.title}\n${Trips.date(t.date)}\nالمشترك: ${names}\nالإجمالي: ${(pick.length * t.price).toFixed(3)} د.ك`)) return;
  const btn = $('tripPay_' + tid); btn.disabled = true; btn.innerHTML = '⏳ جاري تحويلك إلى UPayment...';
  try {
    const r = await fetch(PAYMENT_API_URL + '/createPayment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: PHONE, parentName: portalDoc?.parentName || kids[0]?.parentName || '', trip: { id: tid, kids: pick }, returnBase: location.origin + location.pathname.replace(/[^/]*$/, '') }) });
    const j = await r.json();
    if (!j.ok || !j.link) throw new Error(j.error || 'فشل إنشاء الدفع');
    location.href = j.link;
  } catch (e) { alert('تعذر الحجز: ' + e.message); tripPick[tid] = []; renderTripsClient(); }
}
listenTripsClient();
