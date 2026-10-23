// ============================================================
// RUN THE BOT ANYWHERE (PC / VPS / Railway) — no Blaze plan needed
//   1) Put serviceAccount.json in this folder (Firebase Console → Project settings → Service accounts → Generate new private key)
//   2) set TELEGRAM_BOT_TOKEN env var (or paste below)
//   3) npm install && npm start
// ============================================================
const admin = require('firebase-admin');
const core = require('./core');
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'PASTE_BOT_TOKEN_HERE';
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccount.json')) });
const db = admin.firestore();
const API = `https://api.telegram.org/bot${TOKEN}/`;
const tg = async (method, body) => { const r = await fetch(API + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!j.ok) console.warn('TG', method, j.description); return j; };

// ---- realtime alerts: new registration / new pause ----
let ready = false; const seenPause = new Set();
db.collection('subscriptions').onSnapshot(snap => {
  if (!ready) { ready = true; snap.docs.forEach(d => { if (d.data().pauseStart) seenPause.add(d.id); }); return; }
  snap.docChanges().forEach(async ch => {
    const s = { id: ch.doc.id, ...ch.doc.data() };
    if (ch.type === 'added' && s.status === 'pending_review') await core.notifyAdmins(db, tg, '🔔 <b>طلب تسجيل جديد</b>\n\n' + core.requestCard(s), core.requestKb(s.id));
    if (ch.type === 'modified' && s.pauseStart && !seenPause.has(s.id)) { seenPause.add(s.id); await core.notifyAdmins(db, tg, `⏸️ <b>إيقاف مؤقت جديد</b>\n\n<b>${s.childName}</b> — من ${core.fmtD(s.pauseStart)} إلى ${core.fmtD(s.pauseEnd)}${s.pauseReason ? '\n📝 ' + s.pauseReason : ''}\n👤 ${s.parentName} · ${s.phone}`); }
  });
});

// ---- long polling loop ----
(async () => {
  await tg('deleteWebhook', {}); // ensure polling mode
  console.log('🤖 Salam bot running (polling)…');
  let offset = 0;
  for (;;) {
    try {
      const r = await fetch(API + `getUpdates?timeout=50&offset=${offset}`); const j = await r.json();
      for (const u of j.result || []) { offset = u.update_id + 1; core.handleUpdate(u, { db, tg }).catch(e => console.error('handle', e)); }
    } catch (e) { console.error('poll', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
})();
