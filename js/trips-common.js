// ============================
// TRIPS — shared helpers (parent app + admin app)
// trips/{id}: title, value (القيمة التربوية), date (YYYY-MM-DD), place, meetTime, departTime, returnTime (HH:MM),
//             price, capacity, booked, status ('open' | 'closed'), closedReason, hidden, image (data URL, optional), notes
// tripBookings/{id}: tripId, tripTitle, tripDate, subId, childName, phone, parentName, amount, method, orderId
// ============================
const Trips = (() => {
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toLocaleDateString('en-CA');
  function time(t) { // '09:30' → '9:30 صباحاً'
    if (!/^\d\d:\d\d$/.test(t || '')) return t || '';
    const [h, m] = t.split(':').map(Number); const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'صباحاً' : h < 15 ? 'ظهراً' : 'مساءً'}`;
  }
  const date = k => k ? new Date(k + 'T00:00:00Z').toLocaleDateString('ar-KW', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '--';
  const left = t => Math.max(0, (+t.capacity || 0) - (+t.booked || 0));
  // [chip class, label, can book]
  function state(t) {
    if (t.date && t.date < today()) return ['bad', 'انتهت', false];
    if (left(t) <= 0) return ['bad', '🔴 اكتمل العدد', false];
    if (t.status !== 'open') return ['gold', '🔒 التسجيل مغلق', false];
    return ['ok', '🟢 التسجيل مفتوح', true];
  }
  function seats(t) {
    const cap = +t.capacity || 0, b = Math.min(cap, +t.booked || 0), l = left(t);
    return `<div class="seats ${l <= 0 ? 'full' : ''}">${l <= 0 ? 'اكتمل العدد' : `متبقٍ <b>${l}</b> من ${cap} مقعد`}<div class="b"><i style="width:${cap ? Math.round(b / cap * 100) : 0}%"></i></div></div>`;
  }
  // full poster-style card body (image or green hero + details)
  function card(t, extra) {
    const st = state(t);
    const head = t.image ? `<img class="trip-img" src="${t.image}" alt="" loading="lazy"/>` : `<div class="trip-hero"><div class="e">🚌</div><div class="k">رحلة</div><h3>${esc(t.title)}</h3><div class="k">يوم مليء بالمرح والتحدي</div></div>`;
    const info = [['📅 التاريخ', date(t.date), 'w'], ['📍 مكان الانطلاق', t.place || 'أكاديمية سلام', 'w'], ['👥 التجمع', time(t.meetTime)], ['🚌 الانطلاق', time(t.departTime)], ['🕐 العودة', time(t.returnTime)]]
      .filter(r => r[1]).map(r => `<div class="${r[2] || ''}">${r[0]}<b>${esc(r[1])}</b></div>`).join('');
    return `${head}<div class="trip-b">
      <div class="trip-t"><h4>🚌 رحلة ${esc(t.title)}</h4><span class="chip ${st[0]}">${st[1]}</span></div>
      ${t.value ? `<div class="trip-val">💚 القيمة التربوية: <b>${esc(t.value)}</b></div>` : ''}
      <div class="trip-info">${info}</div>
      ${t.notes ? `<div class="trip-notes">${esc(t.notes)}</div>` : ''}
      <div class="trip-price"><div class="pr">${(+t.price || 0).toFixed(3).replace(/\.?0+$/, '')} <small>د.ك للمشترك</small></div>${seats(t)}</div>
      ${extra || ''}</div>`;
  }
  return { esc, today, time, date, left, state, seats, card };
})();
