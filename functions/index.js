// Salam Academy — Cloud Functions (push notifications)
// Deploy: firebase deploy --only functions   (requires Blaze plan)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

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
