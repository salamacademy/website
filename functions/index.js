// Salam Academy — Cloud Functions (push notifications)
// Deploy: firebase deploy --only functions   (requires Blaze plan)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const tgcore = require('./telegram-core');
const PortalSync = require('./portal-sync');
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || (functions.config().telegram && functions.config().telegram.token) || '';
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
async function adminTokens() {
  const snap = await db.collection('admins').get();
  return snap.docs.flatMap(d => d.data().fcmTokens || []);
}

// 1) New registration → notify admins
exports.onNewRequest = functions.firestore.document('subscriptions/{id}').onCreate(async (snap) => {
  const d = snap.data();
  if (d.status !== 'pending_review') return;
  return sendTo(await adminTokens(), '📝 طلب تسجيل جديد', `${d.childName} — ${d.packageName}`, '/website/admin/dashboard.html');
});

// 2) Status change / pause → notify parent or admins
exports.onSubscriptionUpdate = functions.firestore.document('subscriptions/{id}').onUpdate(async (chg) => {
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
exports.dailyReminders = functions.pubsub.schedule('0 9 * * *').timeZone('Asia/Kuwait').onRun(async () => {
  const now = new Date();
  const snap = await db.collection('subscriptions').where('status', '==', 'active').get();
  for (const doc of snap.docs) {
    const s = doc.data(); if (!s.subscriptionEnd) continue;
    const days = Math.ceil((s.subscriptionEnd.toDate() - now) / 864e5);
    if (days === 3 || days === 1) await sendTo(s.fcmTokens, '⏳ اشتراكك ينتهي قريباً', `${s.childName} — متبقٍ ${days} يوم · جدد الآن`, '/website/client/dashboard.html');
    if (days < 0) await doc.ref.update({ status: 'expired' });
  }
  return null;
});

// 4) Admin sends a custom push to one subscription (callable)
exports.sendCustomPush = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth) throw new functions.https.HttpsError('unauthenticated', 'login required');
  const isAdmin = (await db.collection('admins').doc(ctx.auth.uid).get()).exists;
  if (!isAdmin) throw new functions.https.HttpsError('permission-denied', 'admins only');
  const sub = (await db.collection('subscriptions').doc(data.subId).get()).data();
  return sendTo(sub?.fcmTokens, data.title || 'أكاديمية سلام', data.body || '', '/website/client/dashboard.html');
});


// ================= TELEGRAM BOT (webhook) =================
// Set token:  firebase functions:config:set telegram.token="123:ABC"   (or TELEGRAM_BOT_TOKEN secret)
// Register:   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<region>-salam-5e6f2.cloudfunctions.net/telegramWebhook
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  try { if (req.method === 'POST' && TG_TOKEN) await tgcore.handleUpdate(req.body, { db, tg }); } catch (e) { console.error(e); }
  res.status(200).send('ok');
});
// Telegram alerts on new registration / pause (reuse existing triggers)
exports.tgOnNewRequest = functions.firestore.document('subscriptions/{id}').onCreate(async (snap) => {
  const s = { id: snap.id, ...snap.data() }; if (s.status !== 'pending_review' || !TG_TOKEN) return;
  return tgcore.notifyAdmins(db, tg, '🔔 <b>طلب تسجيل جديد</b>\n\n' + tgcore.requestCard(s), tgcore.requestKb(s.id));
});
exports.tgOnPause = functions.firestore.document('subscriptions/{id}').onUpdate(async (chg) => {
  const b = chg.before.data(), a = { id: chg.after.id, ...chg.after.data() }; if (b.pauseStart || !a.pauseStart || !TG_TOKEN) return;
  return tgcore.notifyAdmins(db, tg, `⏸️ <b>إيقاف مؤقت جديد</b>\n\n<b>${a.childName}</b> — من ${tgcore.fmtD(a.pauseStart)} إلى ${tgcore.fmtD(a.pauseEnd)}${a.pauseReason ? '\n📝 ' + a.pauseReason : ''}\n👤 ${a.parentName} · ${a.phone}`);
});

// Keep parent portal in sync with any subscription write
exports.syncPortal = functions.firestore.document('subscriptions/{id}').onWrite(async (chg) => {
  const phones = new Set([chg.before.exists && chg.before.data().phone, chg.after.exists && chg.after.data().phone].filter(Boolean));
  for (const p of phones) await PortalSync.syncPhone(db, p);
});

// ================= UPAYMENT (API key stays server-side) =================
// Set once:  firebase functions:config:set upayments.key="YOUR_API_KEY" upayments.sandbox="false"
// Deploy:    firebase deploy --only functions
// Then put the functions base URL into js/firebase-config.js → PAYMENT_API_URL
const UP = (() => { const c = (functions.config().upayments || {}); return { key: process.env.UPAYMENTS_KEY || c.key || '', sandbox: String(process.env.UPAYMENTS_SANDBOX || c.sandbox || 'true') !== 'false' }; })();
const UP_BASE = () => UP.sandbox ? 'https://sandboxapi.upayments.com/api/v1' : 'https://uapi.upayments.com/api/v1';
const CORS = (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); if (req.method === 'OPTIONS') { res.status(204).send(''); return true; } return false; };
const norm = p => String(p || '').replace(/\D/g, '').slice(-8);

// 1) Create a payment: validates items against payItems, stores payments/{orderId}, returns UPayment link
exports.createPayment = functions.https.onRequest(async (req, res) => {
  if (CORS(req, res)) return;
  try {
    if (!UP.key) throw new Error('UPayments key not configured');
    const b = req.body || {}; const phone = norm(b.phone); if (phone.length !== 8) throw new Error('phone');
    const wanted = Array.isArray(b.items) ? b.items : []; if (!wanted.length) throw new Error('no items');
    const items = [];
    for (const w of wanted) { const d = await db.collection('payItems').doc(String(w.id)).get(); if (!d.exists || d.data().active === false) continue; const it = d.data(); const qty = Math.max(1, Math.min(20, parseInt(w.qty) || 1)); items.push({ id: d.id, name: it.name, icon: it.icon || '', price: +it.price, qty: it.allowQty ? qty : 1, packageType: it.packageType || null, category: it.category || 'أخرى' }); }
    if (!items.length) throw new Error('items unavailable');
    const amount = +items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(3); if (amount <= 0) throw new Error('amount');
    const ref = db.collection('payments').doc(); const orderId = ref.id;
    const base = String(b.returnBase || '').replace(/\/$/, '') || 'https://salamacademy.github.io/website/client';
    const payload = {
      products: items.map(i => ({ name: i.name, description: i.name, price: i.price, quantity: i.qty })),
      order: { id: orderId, reference: orderId, description: 'أكاديمية سلام — ' + items.map(i => i.name).join('، ').slice(0, 480), currency: 'KWD', amount },
      language: 'ar', reference: { id: orderId },
      customer: { uniqueId: phone, name: (b.parentName || 'Parent').slice(0, 50), email: (b.email || '').slice(0, 50) || undefined, mobile: '+965' + phone },
      returnUrl: `${base}/payment-success.html?order=${orderId}`, cancelUrl: `${base}/payment-success.html?order=${orderId}&result=CANCELED`,
      notificationUrl: `https://${process.env.FUNCTION_REGION || 'us-central1'}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/upaymentWebhook`,
      paymentLinkExpiryInMinutes: 60
    };
    const r = await fetch(UP_BASE() + '/charge', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + UP.key }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!j || j.status !== true || !j.data || !j.data.link) { console.error('UP charge failed', JSON.stringify(j)); throw new Error(j && j.message ? j.message : 'gateway error'); }
    await ref.set({ status: 'pending', amount, items, phone, subId: b.subId || null, childName: b.childName || '', parentName: b.parentName || '', trackId: j.data.trackId || null, sessionId: j.data.sessionId || null, link: j.data.link, createdAt: admin.firestore.FieldValue.serverTimestamp(), sandbox: UP.sandbox });
    res.json({ ok: true, link: j.data.link, orderId });
  } catch (e) { console.error(e); res.status(400).json({ ok: false, error: e.message }); }
});

// 2) Finalise a paid order: activate subscription (if a package item), book income, sync portal — idempotent
async function finalizePayment(orderId, gw) {
  const ref = db.collection('payments').doc(orderId); const d = await ref.get(); if (!d.exists) return 'no-order';
  const p = d.data(); if (p.status === 'paid') return 'already';
  const paid = String(gw.result || gw.status || '').toUpperCase() === 'CAPTURED' || gw.status === 'success';
  if (!paid) { await ref.update({ status: 'failed', gateway: gw, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return 'failed'; }
  let activated = false;
  const pkgItem = (p.items || []).find(i => i.packageType);
  if (pkgItem) {
    let subRef = p.subId ? db.collection('subscriptions').doc(p.subId) : null; let sub = subRef ? (await subRef.get()) : null;
    if (!sub || !sub.exists) { const q = await db.collection('subscriptions').where('phone', '==', p.phone).get(); const docs = q.docs.filter(x => !p.childName || x.data().childName === p.childName); if (docs.length) { subRef = docs[0].ref; sub = docs[0]; } }
    if (sub && sub.exists) {
      const s = sub.data(); const now = new Date();
      const curEnd = s.subscriptionEnd && s.subscriptionEnd.toDate ? s.subscriptionEnd.toDate() : null;
      const start = s.status === 'active' && curEnd && curEnd > now ? curEnd : now; // renewal extends from current end
      const end = new Date(start); end.setDate(end.getDate() + 30);
      await subRef.update({ status: 'active', packageType: pkgItem.packageType, packageName: pkgItem.name, amount: pkgItem.price, subscriptionStart: admin.firestore.Timestamp.fromDate(s.status === 'active' && curEnd && curEnd > now ? (s.subscriptionStart.toDate ? s.subscriptionStart.toDate() : now) : now), subscriptionEnd: admin.firestore.Timestamp.fromDate(end), daysRemaining: 30, paidAt: admin.firestore.FieldValue.serverTimestamp(), paymentMethod: 'upayment', pauseUsed: false, pauseStart: admin.firestore.FieldValue.delete(), pauseEnd: admin.firestore.FieldValue.delete(), lastPaymentId: orderId });
      activated = true; await PortalSync.syncPhone(db, p.phone);
    }
  }
  const batch = db.batch(); const today = new Date(Date.now() + 3 * 3600e3).toISOString().split('T')[0];
  (p.items || []).forEach(i => batch.set(db.collection('transactions').doc(), { type: 'income', amount: +(i.price * i.qty).toFixed(3), category: i.category || 'أخرى', note: `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''} — ${p.childName || p.phone} (UPayment)`, method: 'upayment', date: today, paymentId: orderId, createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: 'upayment' }));
  batch.update(ref, { status: 'paid', activated, gateway: gw, paymentType: gw.payment_type || gw.paymentType || null, paidAt: admin.firestore.FieldValue.serverTimestamp() });
  await batch.commit();
  try { await tgcore.notifyAdmins(db, tg, `💳 <b>دفعة UPayment</b>\n${p.childName || p.phone} — <b>${(+p.amount).toFixed(3)} د.ك</b>\n${(p.items || []).map(i => '• ' + i.name).join('\n')}${activated ? '\n✅ تم تفعيل الاشتراك' : ''}`); } catch (_) {}
  if (p.phone) { try { const pd = await db.collection('portal').doc(p.phone).get(); await sendTo(pd.exists ? pd.data().fcmTokens : [], '✅ تم استلام الدفع', `${(+p.amount).toFixed(3)} د.ك${activated ? ' · تم تفعيل الاشتراك' : ''}`, '/website/client/dashboard.html'); } catch (_) {} }
  return 'paid';
}
async function fetchStatus(trackId) { const r = await fetch(UP_BASE() + '/get-payment-status/' + encodeURIComponent(trackId), { headers: { Accept: 'application/json', Authorization: 'Bearer ' + UP.key } }); return r.json(); }
function gwFromStatus(j) { const t = (j && j.data && (j.data.transaction || j.data)) || {}; return { result: t.result || t.status || t.transaction_status || '', payment_type: t.payment_type || t.paymentType || '', raw: j }; }

// 3) Webhook from UPayments (notificationUrl) — verifies via status API before trusting
exports.upaymentWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const b = Object.assign({}, req.query || {}, req.body || {});
    const orderId = b.requested_order_id || b.order_id || b.reference || (b.order && b.order.id) || ''; const track = b.track_id || b.trackId;
    if (!orderId) return res.status(200).send('ignored');
    let gw = { result: b.result || b.status, payment_type: b.payment_type };
    if (track && UP.key) { try { gw = Object.assign(gw, gwFromStatus(await fetchStatus(track))); } catch (e) { console.warn('status check', e.message); } }
    const out = await finalizePayment(orderId, gw); res.status(200).send(out);
  } catch (e) { console.error(e); res.status(200).send('error'); }
});

// 4) Called by payment-success page on return (in case webhook is late)
exports.verifyPayment = functions.https.onRequest(async (req, res) => {
  if (CORS(req, res)) return;
  try {
    const orderId = req.query.order; const d = await db.collection('payments').doc(String(orderId)).get(); if (!d.exists) return res.json({ ok: false });
    const p = d.data(); if (p.status === 'paid') return res.json({ ok: true, status: 'paid' });
    const track = req.query.track_id || p.trackId; if (!track || !UP.key) return res.json({ ok: true, status: p.status });
    const out = await finalizePayment(String(orderId), gwFromStatus(await fetchStatus(track)));
    res.json({ ok: true, status: out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
