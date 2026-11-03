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
  // date of the n-th class counting from `from` (inclusive); `skip` = academy closure days (Map/Set) that don't count
  function nth(from, n, t, skip) { let k = from, c = 0; for (let i = 0; i < 400; i++, k = add(k, 1)) if (isTrain(k, t) && !(skip && skip.has(k)) && ++c >= n) return k; return k; }
  const next = (k, t) => nth(add(k, 1), 1, t);      // first class after k
  function prev(k, t) { let x = add(k, -1); for (let i = 0; i < 14 && !isTrain(x, t); i++) x = add(x, -1); return x; } // last class before k
  // ---- sports inside a package: التميز = football (Sat) + kyokushin (Sun/Tue/Thu), each with its own last class ----
  const SPORTS = { football: { name: 'كرة القدم', icon: '⚽', days: [6] }, kyokushin: { name: 'الكيوكشن', icon: '🥋', days: [0, 2, 4] } };
  const PKG_SPORTS = { football: ['football'], confidence: ['kyokushin'], excellence: ['football', 'kyokushin'], excellence_loyal: ['football', 'kyokushin'] };
  const sportsOf = t => PKG_SPORTS[t] || [];
  const isSplit = t => sportsOf(t).length > 1;
  const dow = k => new Date(k + 'T00:00:00Z').getUTCDay();
  const sportOf = (k, t) => sportsOf(t).find(sp => SPORTS[sp].days.includes(dow(k))) || null;
  // last class of each sport (split packages); older records without sportEnds use subscriptionEnd for both
  function ends(s) { const e = key(s.subscriptionEnd), o = {}; if (!isSplit(s.packageType)) return null; sportsOf(s.packageType).forEach(sp => o[sp] = (s.sportEnds && s.sportEnds[sp]) || (e && prevS(add(e, 1), sp))); return o; } // fallback: that sport's last class on/before the end
  const lastOf = o => Object.values(o).sort().pop() || '';
  // n-th / next / previous class of one sport
  function nthS(from, n, sp, skip) { const d = SPORTS[sp].days; let k = from, c = 0; for (let i = 0; i < 400; i++, k = add(k, 1)) if (d.includes(dow(k)) && !(skip && skip.has(k)) && ++c >= n) return k; return k; }
  function prevS(k, sp) { const d = SPORTS[sp].days; let x = add(k, -1); for (let i = 0; i < 14 && !d.includes(dow(x)); i++) x = add(x, -1); return x; }
  // state = { end, sportEnds } — move the last class of `sp` by n classes (+ adds, − removes); non-split packages just move end
  function move(st, t, sp, n) {
    const out = { end: st.end, sportEnds: st.sportEnds ? { ...st.sportEnds } : null };
    for (let i = 0; i < Math.abs(n); i++) {
      if (out.sportEnds && sp && out.sportEnds[sp]) out.sportEnds[sp] = n > 0 ? nthS(add(out.sportEnds[sp], 1), 1, sp) : prevS(out.sportEnds[sp], sp);
      else if (out.end) out.end = n > 0 ? next(out.end, t) : prev(out.end, t);
    }
    if (out.sportEnds) out.end = lastOf(out.sportEnds);
    return out;
  }
  const stateOf = s => ({ end: key(s.subscriptionEnd), sportEnds: ends(s) });
  // a full month of classes from `from`: { end, sportEnds } (each sport counts its own classes)
  function plan(from, t, skip) {
    if (!isSplit(t)) return { end: nth(from, perMonth(t), t, skip), sportEnds: null };
    const o = {}; sportsOf(t).forEach(sp => o[sp] = nthS(from, SPORTS[sp].days.length * 4, sp, skip));
    return { end: lastOf(o), sportEnds: o };
  }
  // classes still to come per sport: { football: 3, kyokushin: 10 } (single-sport packages: { _: n })
  function leftBy(s, from) {
    const end = key(s.subscriptionEnd); if (!end) return null; from = from || today();
    const t = s.packageType, e = ends(s), off = new Set((Array.isArray(s.pauses) ? s.pauses : []).map(p => p.date)), c = {};
    if (e) sportsOf(t).forEach(sp => c[sp] = 0); else c._ = 0;
    const last = e ? lastOf(e) : end;
    for (let k = from, i = 0; k <= last && i < 400; k = add(k, 1), i++) {
      if (!isTrain(k, t) || off.has(k)) continue;
      if (!e) { c._++; continue; }
      const sp = sportOf(k, t); if (sp && k <= e[sp]) c[sp]++;
    }
    return c;
  }
  // classes still to come: today … end, without paused days
  function left(s, from) { const c = leftBy(s, from); return c ? Object.values(c).reduce((a, b) => a + b, 0) : null; }
  // new period: an active subscription continues after its last class (per sport), otherwise it starts today
  function renewal(s, n, skip) {
    const t = s.packageType, end = key(s.subscriptionEnd), cont = s.status === 'active' && end && end >= today(), start = cont ? key(s.subscriptionStart) || today() : today();
    if (isSplit(t) && !n) {
      const e = cont ? ends(s) : null, o = {}, firsts = [];
      sportsOf(t).forEach(sp => { const f = e ? nthS(add(e[sp], 1), 1, sp) : nthS(today(), 1, sp); firsts.push(f); o[sp] = nthS(f, SPORTS[sp].days.length * 4, sp, skip); });
      return { cont, start, first: firsts.sort()[0], end: lastOf(o), sportEnds: o };
    }
    const first = cont ? next(end, t) : nth(today(), 1, t);
    return { cont, start, first, end: nth(first, n || perMonth(t), t, skip), sportEnds: null };
  }
  // academy closures (closures/{id}: from, to, packages, active) → Map date → closure, training days of package t only
  function closedDays(list, t) {
    const m = new Map();
    (list || []).forEach(c => { if (c.active === false || (c.packages && c.packages.length && !c.packages.includes(t))) return; for (let k = c.from, i = 0; k && k <= c.to && i < 120; k = add(k, 1), i++) if (isTrain(k, t)) m.set(k, c); });
    return m;
  }
  // pauses the parent chose (closure days don't use the parent's quota)
  const own = ps => (Array.isArray(ps) ? ps : []).filter(p => !p.closure);
  // closure pauses to store for the period first … end
  const closurePauses = (m, first, end) => [...m.entries()].filter(([k]) => k >= first && k <= end).sort().map(([k, c]) => ({ date: k, reason: c.reason || 'إغلاق الأكاديمية', closure: true, closureId: c.id, by: 'academy' }));
  return { TRAIN_DAYS, SPORTS, perMonth, pauses, key, today, add, isTrain, toDate, nth, next, prev, left, leftBy, renewal, closedDays, own, closurePauses, sportsOf, isSplit, sportOf, ends, move, stateOf, plan };
});
