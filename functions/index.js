// Salam Academy — Cloud Functions (push notifications)
// Deploy: firebase deploy --only functions   (requires Blaze plan)
const functions = require('firebase-functions');
const REGION = 'europe-west1'; // must match Firestore (eur3)
const fx = functions.region(REGION);
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const tgcore = require('./telegram-core');
const PortalSync = require('./portal-sync');
const Classes = require('./classes');
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const tg = async (method, body) => { const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };

async function sendTo(tokens, title, body, url) {
  tokens = (tokens || []).filter(Boolean);
  if (!tokens.length) return;
  const res = await admin.messaging().sendEachForMulticast({
    tokens, notification: { title, body },
    data: { url: url || '/website/' },
    webpush: { fcmOptions: { link: url || '/website/' }, notification: { icon: '/website/images/icon-192.png', dir: 'rtl', lang: 'ar' } }
  });
  return res;
}
// Admin notification feed (🔔 in the admin app) — written here so nothing is missed while the app is closed
async function addNotif(n, id) {
  const data = { read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), ...n };
  try { if (id) await db.collection('adminNotifs').doc(id).create(data); else await db.collection('adminNotifs').add(data); }
  catch (e) { if (e.code !== 6) console.error('notif', e.message); } // 6 = ALREADY_EXISTS (deduped)
}
async function adminTokens() {
  const snap = await db.collection('admins').get();
  return snap.docs.flatMap(d => d.data().fcmTokens || []);
}

// 1) New registration → notify admins
exports.onNewRequest = fx.firestore.document('subscriptions/{id}').onCreate(async (snap) => {
  const d = snap.data();
  if (d.status !== 'pending_review') return;
  await addNotif({ icon: '📝', title: 'طلب تسجيل جديد', body: `${d.childName || ''} — ${d.packageName || ''}`, page: 'review' });
  return sendTo(await adminTokens(), '📝 طلب تسجيل جديد', `${d.childName} — ${d.packageName}`, '/website/admin/dashboard.html');
});

// 2) Status change / pause → notify parent or admins
exports.onSubscriptionUpdate = fx.firestore.document('subscriptions/{id}').onUpdate(async (chg) => {
  const b = chg.before.data(), a = chg.after.data();
  const url = '/website/client/dashboard.html';
  if (b.status !== a.status) {
    if (a.status === 'approved') await sendTo(a.fcmTokens, '🎉 تمت الموافقة على طلبك', `${a.childName} — ${a.amount} د.ك · ادفع الآن لتفعيل الاشتراك`, url);
    if (a.status === 'active') await sendTo(a.fcmTokens, '✅ تم تفعيل الاشتراك', `${a.childName} — ${a.packageName}`, url);
    if (a.status === 'rejected') await sendTo(a.fcmTokens, 'طلب التسجيل', a.adminNote || 'لم يتم قبول الطلب، تواصل مع الإدارة', url);
  }
  if (!b.pauseStart && a.pauseStart) {
    await sendTo(await adminTokens(), '⏸️ إيقاف مؤقت جديد', `${a.childName} — أسبوع من ${a.pauseStart.toDate().toLocaleDateString('ar-KW')}`, '/website/admin/dashboard.html');
  }
});

// 3) Daily 9:00 Kuwait — expiry reminders (3 days & 1 day) + expire overdue
exports.dailyReminders = fx.pubsub.schedule('0 9 * * *').timeZone('Asia/Kuwait').onRun(async () => {
  const now = new Date();
  const snap = await db.collection('subscriptions').where('status', '==', 'active').get();
  const soon = [];
  for (const doc of snap.docs) {
    const s = doc.data(); if (!s.subscriptionEnd) continue;
    const days = Math.ceil((s.subscriptionEnd.toDate() - now) / 864e5);
    if (days >= 0 && days <= 3) soon.push([days, `• <b>${s.childName}</b> — ${days === 0 ? 'ينتهي اليوم' : `متبقٍ ${days} يوم`} · ${s.phone}`]);
    if (days === 3 || days === 1) await sendTo(s.fcmTokens, '⏳ اشتراكك ينتهي قريباً', `${s.childName} — متبقٍ ${days} يوم · جدد الآن`, '/website/client/dashboard.html');
    if (days < 0) await doc.ref.update({ status: 'expired' });
  }
  // admin heads-up on Telegram (works even when the admin app is closed)
  if (soon.length) await addNotif({ icon: '⏳', title: `${soon.length} اشتراك ينتهي خلال 3 أيام`, body: soon.sort((a, b) => a[0] - b[0]).map(x => x[1].replace(/<[^>]+>/g, '').replace(/^• /, '')).join('\n'), page: 'expiring' }, 'exp_' + new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
  if (soon.length && TG_TOKEN) { try { await tgcore.notifyAdmins(db, tg, `⏳ <b>اشتراكات تنتهي خلال 3 أيام (${soon.length})</b>\n\n${soon.sort((a, b) => a[0] - b[0]).map(x => x[1]).join('\n')}\n\nأرسل رابط التجديد من لوحة الإدارة ← تنتهي قريباً`); } catch (e) { console.error('tg expiry', e); } }
  return null;
});

// 4) Admin sends a custom push to one subscription (callable)
exports.sendCustomPush = fx.https.onCall(async (data, ctx) => {
  if (!ctx.auth) throw new functions.https.HttpsError('unauthenticated', 'login required');
  const isAdmin = (await db.collection('admins').doc(ctx.auth.uid).get()).exists;
  if (!isAdmin) throw new functions.https.HttpsError('permission-denied', 'admins only');
  const sub = (await db.collection('subscriptions').doc(data.subId).get()).data();
  return sendTo(sub?.fcmTokens, data.title || 'أكاديمية سلام', data.body || '', '/website/client/dashboard.html');
});


// ================= TELEGRAM BOT (webhook) =================
// Set token in functions/.env → TELEGRAM_BOT_TOKEN=123:ABC
// Register:   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<region>-salam-5e6f2.cloudfunctions.net/telegramWebhook
exports.telegramWebhook = fx.https.onRequest(async (req, res) => {
  try { if (req.method === 'POST' && TG_TOKEN) await tgcore.handleUpdate(req.body, { db, tg }); } catch (e) { console.error(e); }
  res.status(200).send('ok');
});
// Telegram alerts on new registration / pause (reuse existing triggers)
exports.tgOnNewRequest = fx.firestore.document('subscriptions/{id}').onCreate(async (snap) => {
  const s = { id: snap.id, ...snap.data() }; if (s.status !== 'pending_review' || !TG_TOKEN) return;
  return tgcore.notifyAdmins(db, tg, '🔔 <b>طلب تسجيل جديد</b>\n\n' + tgcore.requestCard(s), tgcore.requestKb(s.id));
});
exports.tgOnPause = fx.firestore.document('subscriptions/{id}').onUpdate(async (chg) => {
  const b = chg.before.data(), a = { id: chg.after.id, ...chg.after.data() }; if (b.pauseStart || !a.pauseStart || !TG_TOKEN) return;
  return tgcore.notifyAdmins(db, tg, `⏸️ <b>إيقاف مؤقت جديد</b>\n\n<b>${a.childName}</b> — من ${tgcore.fmtD(a.pauseStart)} إلى ${tgcore.fmtD(a.pauseEnd)}${a.pauseReason ? '\n📝 ' + a.pauseReason : ''}\n👤 ${a.parentName} · ${a.phone}`);
});

// Keep parent portal in sync with any subscription write
exports.syncPortal = fx.firestore.document('subscriptions/{id}').onWrite(async (chg) => {
  const phones = new Set([chg.before.exists && chg.before.data().phone, chg.after.exists && chg.after.data().phone].filter(Boolean));
  for (const p of phones) await PortalSync.syncPhone(db, p);
});

// ================= UPAYMENT (API key stays server-side) =================
// Config: functions/.env  →  UPAYMENTS_KEY=...  UPAYMENTS_SANDBOX=true|false  TELEGRAM_BOT_TOKEN=...
// Deploy:    firebase deploy --only functions
// Then put the functions base URL into js/firebase-config.js → PAYMENT_API_URL
const UP = { key: process.env.UPAYMENTS_KEY || '', sandbox: String(process.env.UPAYMENTS_SANDBOX || 'true') !== 'false' };
const UP_BASE = () => UP.sandbox ? 'https://sandboxapi.upayments.com/api/v1' : 'https://uapi.upayments.com/api/v1';
const CORS = (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); if (req.method === 'OPTIONS') { res.status(204).send(''); return true; } return false; };
const norm = p => String(p || '').replace(/\D/g, '').slice(-8);

// 1) Create a payment: validates items against payItems, stores payments/{orderId}, returns UPayment link
exports.createPayment = fx.https.onRequest(async (req, res) => {
  if (CORS(req, res)) return;
  try {
    if (!UP.key) throw new Error('UPayments key not configured');
    const b = req.body || {}; const phone = norm(b.phone); if (phone.length !== 8) throw new Error('phone');
    if (b.trip) return await createTripPayment(b, phone, res);
    const wanted = Array.isArray(b.items) ? b.items : []; if (!wanted.length) throw new Error('no items');
    // Only families whose registration the admin approved may pay (new → register + terms → admin approval → pay)
    const PAY_OK = ['approved', 'pending_payment', 'active', 'expired'];
    const subs = (await db.collection('subscriptions').where('phone', '==', phone).get()).docs;
    const own = b.subId ? subs.filter(d => d.id === b.subId) : subs;
    if (!own.some(d => PAY_OK.includes(d.data().status))) return res.status(403).json({ ok: false, code: 'not_approved', error: subs.length ? 'طلب التسجيل لم تتم الموافقة عليه بعد. يمكنك الدفع بعد موافقة الإدارة.' : 'لا يوجد طلب تسجيل لهذا الرقم. يرجى تعبئة نموذج التسجيل أولاً وانتظار موافقة الإدارة.' });
    const items = [];
    for (const w of wanted) {
      const d = await db.collection('payItems').doc(String(w.id)).get(); if (!d.exists || d.data().active === false) continue; const it = d.data(); const qty = Math.max(1, Math.min(20, parseInt(w.qty) || 1));
      if (it.customAmount) { // parent typed the amount — validate it server-side, never trust the browser
        const amt = Math.round(parseFloat(w.amount) * 1000) / 1000; if (!(amt >= 0.5 && amt <= 2000)) throw new Error('المبلغ يجب أن يكون بين 0.5 و 2000 د.ك');
        const purpose = PKG_NAME[w.purpose] || w.purpose === 'other' ? w.purpose : null, note = String(w.note || '').slice(0, 80);
        const label = purpose === 'other' ? (note ? 'أخرى: ' + note : 'أخرى') : purpose ? 'تجديد ' + PKG_NAME[purpose] : '';
        items.push({ id: d.id, name: it.name + (label ? ' — ' + label : ''), icon: it.icon || '', price: amt, qty: 1, packageType: null, category: purpose && purpose !== 'other' ? 'اشتراكات' : it.category || 'أخرى', customAmount: true, purpose, note }); continue;
      }
      items.push({ id: d.id, name: it.name, icon: it.icon || '', price: +it.price, qty: it.allowQty ? qty : 1, packageType: it.packageType || null, category: it.category || 'أخرى' });
    }
    if (!items.length) throw new Error('items unavailable');
    // the parent must accept the terms (classes per month, continuous, pauses only) before every payment
    if (b.termsAccepted !== true) return res.status(400).json({ ok: false, code: 'terms', error: 'يرجى الموافقة على الشروط قبل الدفع' });
    const amount = +items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(3); if (amount <= 0) throw new Error('amount');
    const ref = db.collection('payments').doc(); const orderId = ref.id;
    const g = await upCharge(orderId, items, amount, phone, b);
    await ref.set({ status: 'pending', amount, items, phone, termsAccepted: true, termsText: String(b.termsText || '').slice(0, 1500), subId: b.subId || null, childName: b.childName || '', parentName: b.parentName || '', trackId: g.trackId || null, sessionId: g.sessionId || null, link: g.link, createdAt: admin.firestore.FieldValue.serverTimestamp(), sandbox: UP.sandbox });
    res.json({ ok: true, link: g.link, orderId });
  } catch (e) { console.error(e); res.status(400).json({ ok: false, error: e.message }); }
});
async function upCharge(orderId, items, amount, phone, b, expiry = 60) {
  const base = String(b.returnBase || '').replace(/\/$/, '') || 'https://salamacademy.github.io/website/client';
  const payload = {
    products: items.map(i => ({ name: i.name, description: i.name, price: i.price, quantity: i.qty })),
    order: { id: orderId, reference: orderId, description: 'أكاديمية سلام — ' + items.map(i => i.name).join('، ').slice(0, 480), currency: 'KWD', amount },
    language: 'ar', reference: { id: orderId }, tokens: {},      customer: { uniqueId: phone, name: (b.parentName || 'Parent').slice(0, 50), email: (b.email || '').slice(0, 50) || undefined, mobile: '+965' + phone },
    returnUrl: `${base}/payment-success.html?order=${orderId}`, cancelUrl: `${base}/payment-success.html?order=${orderId}&result=CANCELED`,
    notificationUrl: `https://${REGION}-${process.env.GCLOUD_PROJECT || 'salam-5e6f2'}.cloudfunctions.net/upaymentWebhook`,
    paymentLinkExpiryInMinutes: expiry
  };
  const r = await fetch(UP_BASE() + '/charge', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + UP.key }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!j || j.status !== true || !j.data || !j.data.link) { console.error('UP charge failed', JSON.stringify(j)); throw new Error(j && j.message ? j.message : 'gateway error'); }
  return j.data;
}

// Trip booking: one seat per child, price × children. Seats = capacity − paid bookings − unpaid orders of the last 20 min (hold).
const TRIP_HOLD_MS = 20 * 60e3;
async function tripSeats(tripId) {
  const tr = await db.collection('trips').doc(tripId).get(); if (!tr.exists) return null;
  const pend = (await db.collection('payments').where('tripId', '==', tripId).get()).docs.map(d => d.data())
    .filter(p => p.status === 'pending' && p.createdAt && Date.now() - p.createdAt.toMillis() < TRIP_HOLD_MS);
  const held = pend.reduce((a, p) => a + (p.tripKids || []).length, 0);
  const trip = tr.data(); return { trip, left: Math.max(0, (+trip.capacity || 0) - (+trip.booked || 0) - held), pend };
}
async function createTripPayment(b, phone, res) {
  const tripId = String(b.trip.id || ''); const want = Array.isArray(b.trip.kids) ? b.trip.kids.map(String) : [];
  if (!tripId || !want.length) throw new Error('اختر المشترك');
  const s = await tripSeats(tripId); if (!s) throw new Error('الرحلة غير موجودة');
  const trip = s.trip;
  if (trip.status !== 'open' || trip.hidden) return res.status(409).json({ ok: false, code: 'closed', error: 'التسجيل في هذه الرحلة مغلق' });
  if (trip.date && trip.date < kwToday()) return res.status(409).json({ ok: false, code: 'closed', error: 'انتهى موعد هذه الرحلة' });
  // only this family's own registered children, each booked once
  const subs = (await db.collection('subscriptions').where('phone', '==', phone).get()).docs.filter(d => !['rejected', 'cancelled'].includes(d.data().status));
  const booked = new Set((await db.collection('tripBookings').where('tripId', '==', tripId).get()).docs.map(d => d.data().subId));
  const kids = [...new Set(want)].map(id => subs.find(d => d.id === id)).filter(Boolean).filter(d => !booked.has(d.id)).map(d => ({ subId: d.id, childName: d.data().childName || '' }));
  if (!kids.length) throw new Error('المشترك محجوز مسبقاً في هذه الرحلة');
  if (kids.length > s.left) return res.status(409).json({ ok: false, code: 'full', error: s.left ? `متبقٍ ${s.left} ${s.left === 1 ? 'مقعد' : 'مقاعد'} فقط` : 'اكتمل العدد — لا توجد مقاعد متاحة' });
  const price = +(+trip.price).toFixed(3); if (!(price > 0)) throw new Error('سعر الرحلة غير محدد');
  const items = kids.map(k => ({ id: 'trip_' + tripId, name: `رحلة ${trip.title} — ${k.childName.split(' ')[0]}`, icon: '🚌', price, qty: 1, packageType: null, category: 'رحلات وفعاليات' }));
  const amount = +(price * kids.length).toFixed(3);
  const ref = db.collection('payments').doc(); const orderId = ref.id;
  const g = await upCharge(orderId, items, amount, phone, b, 20);
  await ref.set({ status: 'pending', amount, items, phone, tripId, tripTitle: trip.title || '', tripKids: kids, subId: null, childName: kids.map(k => k.childName).join('، '), parentName: b.parentName || '', trackId: g.trackId || null, sessionId: g.sessionId || null, link: g.link, createdAt: admin.firestore.FieldValue.serverTimestamp(), sandbox: UP.sandbox });
  res.json({ ok: true, link: g.link, orderId });
}
// Paid trip order → bookings + seat counter; closes the trip when full. Paid seats are always kept (even past capacity).
async function bookTrip(orderId, p, method) {
  const tripRef = db.collection('trips').doc(p.tripId); let full = false;
  await db.runTransaction(async t => {
    const tr = await t.get(tripRef); if (!tr.exists) return;
    const refs = (p.tripKids || []).map((k, i) => db.collection('tripBookings').doc(`${p.tripId}_${orderId}_${i}`));
    const ex = await Promise.all(refs.map(r => t.get(r))); const n = ex.filter(x => !x.exists).length; if (!n) return;
    refs.forEach((r, i) => { if (!ex[i].exists) { const k = p.tripKids[i]; t.set(r, { tripId: p.tripId, tripTitle: p.tripTitle || tr.data().title || '', tripDate: tr.data().date || '', subId: k.subId, childName: k.childName, phone: p.phone, parentName: p.parentName || '', amount: +(+tr.data().price).toFixed(3), method, orderId, createdAt: admin.firestore.FieldValue.serverTimestamp() }); } });
    const booked = (+tr.data().booked || 0) + n; full = booked >= (+tr.data().capacity || 0);
    t.update(tripRef, { booked, ...(full ? { status: 'closed', closedReason: 'full' } : {}) });
  });
  return full;
}

// 2) Finalise a paid order: activate subscription (if a package item), book income, sync portal — idempotent
const PKG_NAME = { football: 'معسكر كرة القدم', confidence: 'معسكر بناء الثقة والكيوكشن', excellence: 'باقة التميز', excellence_loyal: 'باقة التميز - أسرة سلام' };
// One month of classes (football 4 · confidence 12 · excellence 16): an active subscription continues after its last class,
// an expired / new one starts today. The end date is the date of the last class.
// academy-wide closures still to come (holidays / emergencies) — their days don't count as classes
async function upcomingClosures() { const q = await db.collection('closures').where('to', '>=', kwToday()).get(); return q.docs.map(d => ({ id: d.id, ...d.data() })); }
async function renewSub(subRef, s, orderId, pkg) {
  const t = (pkg && pkg.packageType) || s.packageType, closed = Classes.closedDays(await upcomingClosures().catch(() => []), t);
  const now = new Date(), r = Classes.renewal({ ...s, ...(pkg || {}) }, 0, closed), end = Classes.toDate(r.end);
  const keep = Classes.closurePauses(closed, Classes.today(), r.end); // closure days inside the old + new period
  await subRef.update({ status: 'active', ...(pkg || {}), subscriptionStart: admin.firestore.Timestamp.fromDate(Classes.toDate(r.start)), subscriptionEnd: admin.firestore.Timestamp.fromDate(end), daysRemaining: Math.ceil((end - now) / 864e5), classesPerMonth: Classes.perMonth((pkg && pkg.packageType) || s.packageType), paidAt: admin.firestore.FieldValue.serverTimestamp(), paymentMethod: 'upayment', pauseUsed: false, pauseStart: admin.firestore.FieldValue.delete(), pauseEnd: admin.firestore.FieldValue.delete(), lastPaymentId: orderId, pauses: keep });
}
async function finalizePayment(orderId, gw) {
  const ref = db.collection('payments').doc(orderId); const d = await ref.get(); if (!d.exists) return 'no-order';
  const p = d.data(); if (p.status === 'paid') return 'already';
  const paid = String(gw.result || gw.status || '').toUpperCase() === 'CAPTURED' || gw.status === 'success';
  if (!paid && (!String(gw.result || gw.status || '').trim() || /PENDING|INITIATED|PROGRESS/i.test(String(gw.result || gw.status)))) return 'pending';
  if (!paid) { await ref.update({ status: 'failed', gateway: gw, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return 'failed'; }
  let activated = false;
  const pkgItem = (p.items || []).find(i => i.packageType);
  if (pkgItem) {
    let subRef = p.subId ? db.collection('subscriptions').doc(p.subId) : null; let sub = subRef ? (await subRef.get()) : null;
    if (!sub || !sub.exists) { const q = await db.collection('subscriptions').where('phone', '==', p.phone).get(); const docs = q.docs.filter(x => !p.childName || x.data().childName === p.childName); if (docs.length) { subRef = docs[0].ref; sub = docs[0]; } }
    if (sub && sub.exists) { await renewSub(subRef, sub.data(), orderId, { packageType: pkgItem.packageType, packageName: pkgItem.name, amount: pkgItem.price }); activated = true; }
  }
  // Open amount ("ادخال مبلغ يدوي"): the parent chose what it is for — a package (renew +30 days) or "other" (no renewal)
  let renewNote = '';
  const custom = (p.items || []).filter(i => i.customAmount);
  if (!pkgItem && custom.length && custom.length === (p.items || []).length && !custom.every(i => i.purpose === 'other')) {
    const amt = custom.reduce((a, i) => a + i.price * i.qty, 0), eq = (a, b) => Math.abs(a - b) < 0.001;
    const pkg = (custom.find(i => PKG_NAME[i.purpose]) || {}).purpose; // undefined = older app without the choice
    const subs = (await db.collection('subscriptions').where('phone', '==', p.phone).get()).docs.filter(x => ['active', 'expired', 'approved', 'pending_payment'].includes(x.data().status));
    const own = subs.find(x => x.id === p.subId), fee = x => +x.data().amount || 0;
    let targets = [], ownPkg = null;
    if (subs.length > 1 && subs.every(x => fee(x) > 0) && eq(subs.reduce((a, x) => a + fee(x), 0), amt)) targets = subs; // one payment for all siblings
    else if (own && (pkg ? amt >= fee(own) - 0.001 : fee(own) > 0 && eq(fee(own), amt))) { targets = [own]; ownPkg = pkg; }
    for (const x of targets) await renewSub(x.ref, x.data(), orderId, x === own && ownPkg && ownPkg !== x.data().packageType ? { packageType: ownPkg, packageName: PKG_NAME[ownPkg], ...(fee(x) ? {} : { amount: amt }) } : (fee(x) ? null : { amount: amt }));
    if (targets.length) { activated = true; if (targets.length > 1) renewNote = targets.map(x => x.data().childName).join('، '); }
    else renewNote = pkg ? `⚠️ المبلغ أقل من رسوم الاشتراك (${own ? fee(own) : '?'} د.ك) — لم يُجدَّد تلقائياً، تحقق وجدّد يدوياً` : '⚠️ المبلغ لا يطابق رسوم الاشتراك — لم يُجدَّد تلقائياً، تحقق وجدّد يدوياً';
  }
  let tripFull = false;
  if (p.tripId) { try { tripFull = await bookTrip(orderId, p, 'upayment'); } catch (e) { console.error('trip booking', orderId, e); } }
  const batch = db.batch(); const today = new Date(Date.now() + 3 * 3600e3).toISOString().split('T')[0];
  (p.items || []).forEach(i => batch.set(db.collection('transactions').doc(), { type: 'income', amount: +(i.price * i.qty).toFixed(3), category: i.category || 'أخرى', note: `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''} — ${p.childName || p.phone} (UPayment)`, method: 'upayment', date: today, paymentId: orderId, createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: 'upayment' }));
  batch.update(ref, { status: 'paid', activated, gateway: gw, paymentType: gw.payment_type || gw.paymentType || null, paidAt: admin.firestore.FieldValue.serverTimestamp() });
  await batch.commit();
  try { await PortalSync.syncPhone(db, p.phone); } catch (e) { console.warn('portal sync', e.message); } // subscription + payment history
  const extra = activated ? ' · ✅ تم التجديد' + (renewNote ? ' (' + renewNote + ')' : '') : renewNote ? ' · ' + renewNote : p.tripId ? ` · 🚌 حجز رحلة${tripFull ? ' · اكتمل العدد وأُغلق التسجيل' : ''}` : '';
  await addNotif({ icon: p.tripId ? '🚌' : '💳', title: `دفعة ${(+p.amount).toFixed(3)} د.ك`, body: `${p.childName || p.phone} — ${(p.items || []).map(i => i.name).join('، ')}${extra}`, page: p.tripId ? 'trips' : 'finance' }, 'pay_' + orderId);
  try { await tgcore.notifyAdmins(db, tg, `💳 <b>دفعة UPayment</b>\n${p.childName || p.phone} — <b>${(+p.amount).toFixed(3)} د.ك</b>\n${(p.items || []).map(i => '• ' + i.name).join('\n')}${activated ? '\n✅ تم تجديد الاشتراك (+30 يوم)' + (renewNote ? ': ' + renewNote : '') : renewNote ? '\n' + renewNote : ''}${p.tripId ? '\n🚌 تم حجز الرحلة' + (tripFull ? ' — اكتمل العدد وأُغلق التسجيل' : '') : ''}`); } catch (_) {}
  if (p.phone) { try { const pd = await db.collection('portal').doc(p.phone).get(); await sendTo(pd.exists ? pd.data().fcmTokens : [], '✅ تم استلام الدفع', `${(+p.amount).toFixed(3)} د.ك${activated ? ' · تم تفعيل الاشتراك' : p.tripId ? ' · تم حجز الرحلة 🚌' : ''}`, '/website/client/dashboard.html'); } catch (_) {} }
  return 'paid';
}
async function fetchStatus(trackId) { const r = await fetch(UP_BASE() + '/get-payment-status/' + encodeURIComponent(trackId), { headers: { Accept: 'application/json', Authorization: 'Bearer ' + UP.key } }); return r.json(); }
function gwFromStatus(j) { const t = (j && j.data && (j.data.transaction || j.data)) || {}; return { result: t.result || t.status || t.transaction_status || '', payment_type: t.payment_type || t.paymentType || '', raw: j }; }

// 3) Webhook from UPayments (notificationUrl) — verifies via status API before trusting
exports.upaymentWebhook = fx.https.onRequest(async (req, res) => {
  try {
    const b = Object.assign({}, req.query || {}, req.body || {});
    const orderId = b.requested_order_id || b.order_id || b.reference || (b.order && b.order.id) || ''; const track = b.track_id || b.trackId;
    if (!orderId) return res.status(200).send('ignored');
    let gw = { result: b.result || b.status, payment_type: b.payment_type };
    if (track && UP.key) { try { gw = Object.assign(gw, gwFromStatus(await fetchStatus(track))); } catch (e) { console.warn('status check', e.message); } }
    const out = await finalizePayment(orderId, gw); res.status(200).send(out);
  } catch (e) { console.error(e); res.status(200).send('error'); }
});

// 4) Called by payment-success page on return (in case webhook is late). Finds the order by id OR track_id.
exports.verifyPayment = fx.https.onRequest(async (req, res) => {
  if (CORS(req, res)) return;
  try {
    const oid = v => (String(v || '').match(/^[A-Za-z0-9]{20}/) || [''])[0]; // UPayment appends "?payment_id=…" to ?order=
    let orderId = oid(req.query.requested_order_id) || oid(req.query.order) || oid(req.query.order_id); const track = req.query.track_id || req.query.trackId;
    let d = orderId ? await db.collection('payments').doc(orderId).get() : null;
    if ((!d || !d.exists) && track) { const q = await db.collection('payments').where('trackId', '==', String(track)).limit(1).get(); if (!q.empty) { d = q.docs[0]; orderId = d.id; } }
    if (!d || !d.exists) return res.json({ ok: false, error: 'order not found' });
    const info = x => ({ ok: true, orderId, status: x.status, amount: x.amount, items: x.items || [], childName: x.childName || '', activated: !!x.activated, trip: x.tripTitle || '' });
    const p = d.data(); if (p.status === 'paid') return res.json(info(p));
    const tk = track || p.trackId; if (!tk || !UP.key) return res.json(info(p));
    await finalizePayment(orderId, gwFromStatus(await fetchStatus(tk)));
    res.json(info((await db.collection('payments').doc(orderId).get()).data()));
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// Parent pauses (portal/{phone}.pauseRequests) — approved automatically, no admin step.
// Checks: active subscription, training day of the package, today..end date, max 3 (football 1). Each pause adds one class at the end.
// A request with type 'cancel' removes a future pause (−1 day). Everything runs in one transaction.
const TRAIN_DAYS = Classes.TRAIN_DAYS;
const kwToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const isoOf = ts => ts && ts.toDate ? ts.toDate().toISOString().slice(0, 10) : '';
// Academy closure (admin "إيقاف عام") → tell the affected parents their classes were moved to the end
exports.onClosure = fx.firestore.document('closures/{id}').onCreate(async (snap) => {
  const c = snap.data(), phones = [...new Set((c.affected || []).map(a => a.phone).filter(Boolean))];
  const fmt = k => new Date(k + 'T00:00:00Z').toLocaleDateString('ar-KW', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const body = `${c.reason ? c.reason + ' — ' : ''}لا تدريب ${c.from === c.to ? 'يوم ' + fmt(c.from) : `من ${fmt(c.from)} إلى ${fmt(c.to)}`}. لن تُخصم الحصص وأُضيفت إلى نهاية الاشتراك ✅`;
  for (const ph of phones) { try { const pd = await db.collection('portal').doc(ph).get(); if (pd.exists) await sendTo(pd.data().fcmTokens, '🏖️ إيقاف التدريب في الأكاديمية', body, '/website/client/dashboard.html'); } catch (e) { console.warn('closure push', ph, e.message); } }
  if (TG_TOKEN) try { await tgcore.notifyAdmins(db, tg, `🏖️ <b>إيقاف عام</b>
${body}
👥 ${(c.affected || []).length} مشترك`); } catch (_) {}
});

exports.tgOnPauseRequest = fx.firestore.document('portal/{phone}').onUpdate(async (chg) => {
  if (!(chg.after.data().pauseRequests || []).some(r => r.status === 'pending')) return;
  const portalRef = chg.after.ref; const done = [];
  await db.runTransaction(async t => {
    done.length = 0;
    const pd = (await t.get(portalRef)).data() || {}; const reqs = (pd.pauseRequests || []).map(r => ({ ...r }));
    const pending = reqs.filter(r => r.status === 'pending'); if (!pending.length) return;
    const subs = {};
    for (const id of [...new Set(pending.map(r => r.subId))]) { const sd = await t.get(db.collection('subscriptions').doc(String(id))); subs[id] = sd.exists ? { ref: sd.ref, s: sd.data() } : null; }
    const today = kwToday(), now = new Date().toISOString(), upd = {};
    for (const r of pending.sort((x, y) => (x.type === 'cancel' ? 0 : 1) - (y.type === 'cancel' ? 0 : 1))) { // cancels first → frees quota
      const x = subs[r.subId]; let note = '';
      if (!x) note = 'الاشتراك غير موجود';
      else {
        const s = x.s, cur = upd[r.subId] || { pauses: Array.isArray(s.pauses) ? s.pauses.slice() : (s.pauseStart ? [{ date: isoOf(s.pauseStart) }] : []), end: s.subscriptionEnd ? s.subscriptionEnd.toDate() : null };
        const endKey = cur.end ? Classes.key(cur.end) : '';
        if (r.type === 'cancel') {
          const i = cur.pauses.findIndex(p => p.date === r.start);
          if (i < 0) note = 'لا يوجد إيقاف في هذا اليوم'; else if (cur.pauses[i].closure) note = 'هذا يوم إغلاق من الأكاديمية'; else if (r.start < today) note = 'لا يمكن إلغاء يوم مضى';
          else { cur.pauses.splice(i, 1); if (cur.end) cur.end = Classes.toDate(Classes.prev(Classes.key(cur.end), s.packageType)); } // last class moves back
        } else {
          const dow = new Date(r.start + 'T00:00:00Z').getUTCDay();
          if (s.status !== 'active') note = 'الاشتراك غير نشط';
          else if (!/^\d{4}-\d\d-\d\d$/.test(r.start || '') || r.start < today) note = 'لا يمكن إيقاف يوم مضى';
          else if (endKey && r.start > endKey) note = 'بعد نهاية الاشتراك';
          else if (!(TRAIN_DAYS[s.packageType] || [6, 0, 1, 2, 3, 4]).includes(dow)) note = 'ليس من أيام تدريب الباقة';
          else if (cur.pauses.some(p => p.date === r.start)) note = 'هذا اليوم موقوف مسبقاً';
          else if (Classes.own(cur.pauses).length >= Classes.pauses(s.packageType)) note = s.packageType === 'football' ? 'كرة القدم: إيقاف واحد فقط في الشهر' : `استُخدمت الإيقافات المسموحة (${Classes.pauses(s.packageType)})`;
          else { cur.pauses.push({ date: r.start, reason: r.reason || '', approvedAt: now, by: 'parent' }); if (cur.end) cur.end = Classes.toDate(Classes.next(Classes.key(cur.end), s.packageType)); } // +1 class at the end
        }
        if (!note) upd[r.subId] = cur;
      }
      Object.assign(r, { status: note ? 'rejected' : 'approved', decidedAt: now, auto: true }, note ? { adminNote: note } : {});
      done.push({ r, ok: !note });
    }
    for (const [id, u] of Object.entries(upd)) {
      const pauses = u.pauses.sort((a, b) => a.date.localeCompare(b.date));
      t.update(subs[id].ref, { pauses, pauseUsed: Classes.own(pauses).length >= Classes.pauses(subs[id].s.packageType), pauseStart: admin.firestore.FieldValue.delete(), pauseEnd: admin.firestore.FieldValue.delete(), ...(u.end ? { subscriptionEnd: admin.firestore.Timestamp.fromDate(u.end), daysRemaining: Math.max(0, Math.ceil((u.end - new Date()) / 864e5)) } : {}) });
    }
    const cutoff = new Date(Date.now() - 60 * 864e5).toISOString(); // keep history short
    t.update(portalRef, { pauseRequests: reqs.filter(r => r.status === 'pending' || !r.decidedAt || r.decidedAt > cutoff) });
  });
  const ok = done.filter(d => d.ok); if (!ok.length) return; // syncPortal refreshes the parent's view after the subscription write
  const fd = k => `${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(k + 'T00:00:00Z').getUTCDay()]} ${+k.slice(8)}/${+k.slice(5, 7)}`;
  const r = ok[0].r, adds = ok.filter(d => d.r.type !== 'cancel').map(d => fd(d.r.start)), cancels = ok.filter(d => d.r.type === 'cancel').map(d => fd(d.r.start));
  const body = `${r.childName || ''}${adds.length ? ' — إيقاف: ' + adds.join('، ') : ''}${cancels.length ? ' — إلغاء: ' + cancels.join('، ') : ''}${r.reason ? ' · ' + r.reason : ''}`;
  await addNotif({ icon: '⏸️', title: adds.length ? `إيقاف ${adds.length > 1 ? adds.length + ' أيام' : 'يوم'}` : 'إلغاء إيقاف', body, page: 'paused' });
  if (TG_TOKEN) await tgcore.notifyAdmins(db, tg, `⏸️ <b>${adds.length ? 'إيقاف تلقائي' : 'إلغاء إيقاف'}</b>\n\n<b>${r.childName || ''}</b>${adds.length ? '\nأيام الإيقاف: ' + adds.join('، ') : ''}${cancels.length ? '\nأُلغي: ' + cancels.join('، ') : ''}${r.reason ? '\n📝 ' + r.reason : ''}\n👤 ${chg.after.data().parentName || ''} · ${chg.after.id}\n(تم تمديد الاشتراك تلقائياً)`);
});
