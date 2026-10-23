// ============================================================
// PORTAL SYNC — mirrors a family's safe subscription data into portal/{phone}
// Parents read portal/{phone} with no login (no health notes / survey answers inside).
// Used by: admin dashboard (browser SDK) and the Telegram bot (admin SDK) — same code.
// ============================================================
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PortalSync = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const PUBLIC = ['childName', 'parentName', 'phone', 'email', 'packageType', 'packageName', 'amount', 'status', 'subscriptionStart', 'subscriptionEnd', 'plannedStart', 'plannedEnd', 'adminNote', 'pauseStart', 'pauseEnd', 'pauseUsed', 'pauseReason', 'loyaltyMember', 'createdAt'];
  const norm = p => String(p || '').replace(/\D/g, '').slice(-8);
  function buildDoc(subs) {
    const kids = subs.map(s => { const o = { subId: s.id }; PUBLIC.forEach(k => { if (s[k] !== undefined && s[k] !== null) o[k] = s[k]; }); return o; });
    const p = subs[0] || {};
    return { parentName: p.parentName || '', phone: norm(p.phone), kids, updatedAt: new Date() };
  }
  // sync one phone: db = Firestore (compat or admin), FieldValue optional
  async function syncPhone(db, phone, allSubs) {
    phone = norm(phone); if (phone.length !== 8) return;
    let subs = allSubs ? allSubs.filter(s => norm(s.phone) === phone) : null;
    if (!subs) { const snap = await db.collection('subscriptions').where('phone', '==', phone).get(); subs = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    const ref = db.collection('portal').doc(phone);
    if (!subs.length) { try { await ref.delete(); } catch (_) {} return; }
    const doc = buildDoc(subs);
    const cur = await ref.get(); const curData = cur.exists ? cur.data() : null;
    if (curData) { doc.pauseRequests = curData.pauseRequests || []; doc.fcmTokens = curData.fcmTokens || []; }
    await ref.set(doc, { merge: false });
  }
  async function syncAll(db, allSubs) { const phones = [...new Set(allSubs.map(s => norm(s.phone)).filter(p => p.length === 8))]; for (const p of phones) await syncPhone(db, p, allSubs); }
  return { syncPhone, syncAll, norm };
});
