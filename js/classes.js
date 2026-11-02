// ============================================================
// CLASSES — a subscription is a number of classes, not 30 days.
// The end date = the date of the last class; each pause moves it to the next training day.
// Same file in js/, functions/ and bot/ (browser + Node).
// ============================================================
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Classes = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  // training weekdays (0 = Sunday … 6 = Saturday)
  const TRAIN_DAYS = { football: [6], confidence: [0, 2, 4], excellence: [6, 0, 2, 4], excellence_loyal: [6, 0, 2, 4], premium: [6, 0, 1, 2, 3, 4] };
  const days = t => TRAIN_DAYS[t] || [6, 0, 1, 2, 3, 4];
  const perMonth = t => days(t).length * 4;            // football 4 · confidence 12 · excellence 16
  const pauses = t => t === 'football' ? 1 : /^excellence/.test(t || '') ? 4 : 3; // football 1 · excellence 4 · others 3
  const key = d => { if (!d) return ''; if (typeof d === 'string') return d.slice(0, 10); const x = d.toDate ? d.toDate() : new Date(d); return new Date(x.getTime() + 3 * 3600e3).toISOString().slice(0, 10); }; // Kuwait date
  const today = () => key(new Date());
  const add = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isTrain = (k, t) => days(t).includes(new Date(k + 'T00:00:00Z').getUTCDay());
  const toDate = k => new Date(k + 'T00:00:00Z');
  // date of the n-th class counting from `from` (inclusive)
  function nth(from, n, t) { let k = from, c = 0; for (let i = 0; i < 400; i++, k = add(k, 1)) if (isTrain(k, t) && ++c >= n) return k; return k; }
  const next = (k, t) => nth(add(k, 1), 1, t);      // first class after k
  function prev(k, t) { let x = add(k, -1); for (let i = 0; i < 14 && !isTrain(x, t); i++) x = add(x, -1); return x; } // last class before k
  // classes still to come: today … end, without paused days
  function left(s, from) {
    const end = key(s.subscriptionEnd); if (!end) return null; from = from || today();
    const off = new Set((Array.isArray(s.pauses) ? s.pauses : []).map(p => p.date)); let c = 0;
    for (let k = from, i = 0; k <= end && i < 400; k = add(k, 1), i++) if (isTrain(k, s.packageType) && !off.has(k)) c++;
    return c;
  }
  // new period: an active subscription continues after its last class, otherwise it starts today
  function renewal(s, n) {
    const t = s.packageType, end = key(s.subscriptionEnd), cont = s.status === 'active' && end && end >= today();
    const first = cont ? next(end, t) : nth(today(), 1, t);
    return { cont, start: cont ? key(s.subscriptionStart) || today() : today(), first, end: nth(first, n || perMonth(t), t) };
  }
  return { TRAIN_DAYS, perMonth, pauses, key, today, add, isTrain, toDate, nth, next, prev, left, renewal };
});
