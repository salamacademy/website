// ============================================================
// SALAM ACADEMY — TELEGRAM BOT CORE (shared by polling + webhook)
// handleUpdate(update, ctx) where ctx = { db, tg }  (firebase-admin Firestore, Telegram API caller)
// ============================================================
const CATS = {
  expense: ['إيجار', 'رواتب', 'أكل وشرب', 'معدات', 'زي وملابس', 'مواصلات', 'تسويق', 'صيانة', 'رحلات وفعاليات', 'أخرى'],
  income: ['اشتراكات', 'رحلات وفعاليات', 'بيع زي', 'بطولات', 'رعاية', 'أخرى']
};
const ICON = { 'إيجار': '🏟️', 'رواتب': '👨‍🏫', 'أكل وشرب': '🍔', 'معدات': '⚽', 'زي وملابس': '👕', 'مواصلات': '🚌', 'تسويق': '📣', 'صيانة': '🔧', 'رحلات وفعاليات': '🎳', 'أخرى': '📦', 'اشتراكات': '💳', 'بيع زي': '👕', 'بطولات': '🏆', 'رعاية': '🤝' };
const ALIASES = { 'ايجار': 'إيجار', 'إيجار': 'إيجار', 'راتب': 'رواتب', 'رواتب': 'رواتب', 'اكل': 'أكل وشرب', 'أكل': 'أكل وشرب', 'ماء': 'أكل وشرب', 'مويه': 'أكل وشرب', 'غداء': 'أكل وشرب', 'معدات': 'معدات', 'كور': 'معدات', 'كرات': 'معدات', 'زي': 'زي وملابس', 'ملابس': 'زي وملابس', 'مواصلات': 'مواصلات', 'باص': 'مواصلات', 'بنزين': 'مواصلات', 'تسويق': 'تسويق', 'اعلان': 'تسويق', 'إعلان': 'تسويق', 'صيانة': 'صيانة', 'رحلة': 'رحلات وفعاليات', 'بولينج': 'رحلات وفعاليات', 'فعالية': 'رحلات وفعاليات', 'اشتراك': 'اشتراكات', 'اشتراكات': 'اشتراكات', 'بطولة': 'بطولات', 'رعاية': 'رعاية' };
const PortalSync = require('./portal-sync');
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const KD = n => (+n || 0).toFixed(3);
const todayISO = () => new Date(Date.now() + 3 * 3600e3).toISOString().split('T')[0]; // Kuwait UTC+3
const monthKey = () => todayISO().slice(0, 7);
const toD = ts => ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
const fmtD = ts => { const d = toD(ts); return d ? d.toLocaleDateString('ar-KW') : '--'; };

const KB = { keyboard: [[{ text: '💸 مصروف' }, { text: '💰 دخل' }], [{ text: '📊 ملخص الشهر' }, { text: '📋 آخر العمليات' }], [{ text: '👥 المشتركين' }, { text: '📝 طلبات التسجيل' }], [{ text: '⚠️ تنتهي قريباً' }, { text: '⏸️ الإيقافات' }]], resize_keyboard: true };

// ---- state kept in Firestore so it survives restarts / stateless functions ----
async function getState(db, chat) { const d = await db.collection('botState').doc(String(chat)).get(); return d.exists ? d.data() : {}; }
async function setState(db, chat, s) { await db.collection('botState').doc(String(chat)).set(s || {}, { merge: false }); }

async function allowed(db, chat) {
  const d = await db.collection('settings').doc('telegram').get();
  const ids = (d.exists ? d.data().chatIds || [] : []).map(c => String(c.id));
  return ids.includes(String(chat));
}

// Parse "350 ايجار" / "ايجار 350" / "350" / "350.5 راتب المدرب احمد"
function parseEntry(text) {
  const m = text.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(',', '.'));
  const rest = text.replace(m[0], '').replace(/د\.?ك|دينار|kd|kwd/gi, '').trim();
  let category = null; const words = rest.split(/\s+/).filter(Boolean);
  for (const w of words) { const k = w.replace(/^ال/, ''); if (ALIASES[w]) { category = ALIASES[w]; break; } if (ALIASES[k]) { category = ALIASES[k]; break; } }
  const inInc = category && CATS.income.includes(category), inExp = category && CATS.expense.includes(category);
  const type = inInc && !inExp ? 'income' : inExp && !inInc ? 'expense' : null;
  return { amount, category, note: rest, type };
}

function catKeyboard(type, amount) {
  const rows = []; const cats = CATS[type];
  for (let i = 0; i < cats.length; i += 2) rows.push(cats.slice(i, i + 2).map(c => ({ text: `${ICON[c] || ''} ${c}`, callback_data: `cat|${type}|${c}` })));
  rows.push([{ text: '✖️ إلغاء', callback_data: 'cancel' }]);
  return { inline_keyboard: rows };
}

async function saveTx(db, chat, s) {
  const ref = await db.collection('transactions').add({ type: s.type, amount: s.amount, category: s.category, note: s.note || '', method: 'cash', date: todayISO(), createdAt: new Date(), createdBy: 'telegram', chatId: String(chat) });
  return ref.id;
}

async function monthSummary(db) {
  const k = monthKey();
  const snap = await db.collection('transactions').where('date', '>=', k + '-01').where('date', '<=', k + '-31').get();
  const tx = snap.docs.map(d => d.data());
  const sum = t => tx.filter(x => x.type === t).reduce((a, x) => a + (+x.amount || 0), 0);
  const by = t => { const o = {}; tx.filter(x => x.type === t).forEach(x => o[x.category || 'أخرى'] = (o[x.category || 'أخرى'] || 0) + (+x.amount || 0)); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const inc = sum('income'), exp = sum('expense'), net = inc - exp;
  const mName = MONTHS[+k.slice(5, 7) - 1];
  let msg = `📊 <b>ملخص ${mName}</b> (${tx.length} عملية)\n\n💰 الدخل: <b>${KD(inc)} د.ك</b>\n💸 المصاريف: <b>${KD(exp)} د.ك</b>\n${net >= 0 ? '✅' : '🔻'} الصافي: <b>${KD(net)} د.ك</b>\n`;
  const be = by('expense'); if (be.length) { msg += '\n<b>المصاريف حسب الفئة:</b>\n'; be.forEach(([c, v]) => msg += `• ${ICON[c] || ''} ${c}: ${KD(v)} د.ك (${Math.round(v / exp * 100)}%)\n`); }
  const bi = by('income'); if (bi.length) { msg += '\n<b>الدخل حسب الفئة:</b>\n'; bi.forEach(([c, v]) => msg += `• ${ICON[c] || ''} ${c}: ${KD(v)} د.ك (${Math.round(v / inc * 100)}%)\n`); }
  return msg;
}

async function lastTx(db) {
  const snap = await db.collection('transactions').orderBy('createdAt', 'desc').limit(10).get();
  if (snap.empty) return '📋 لا توجد عمليات بعد';
  return '📋 <b>آخر 10 عمليات</b>\n\n' + snap.docs.map(d => { const t = d.data(); return `${t.type === 'income' ? '💰' : '💸'} ${KD(t.amount)} — ${ICON[t.category] || ''} ${t.category}${t.note ? ' · ' + t.note : ''}\n<i>${t.date}${t.createdBy === 'telegram' ? ' · 🤖' : ''}</i>`; }).join('\n\n');
}

const daysLeft = s => { const e = toD(s.subscriptionEnd); return e ? Math.ceil((e - new Date()) / 864e5) : null; };
const pausedNow = s => { const a = toD(s.pauseStart), b = toD(s.pauseEnd); if (!a || !b) return false; const n = new Date(); return n >= a && n <= b; };

async function subscribers(db) {
  const snap = await db.collection('subscriptions').get(); const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const act = all.filter(s => s.status === 'active'); const by = {}; act.forEach(s => by[s.packageName || s.packageType] = (by[s.packageName || s.packageType] || 0) + 1);
  return `👥 <b>المشتركين</b>\n\n✅ نشط: <b>${act.length}</b>\n📝 بانتظار المراجعة: <b>${all.filter(s => s.status === 'pending_review').length}</b>\n💳 بانتظار الدفع: <b>${all.filter(s => s.status === 'approved').length}</b>\n⚠️ تنتهي خلال 7 أيام: <b>${act.filter(s => { const d = daysLeft(s); return d !== null && d >= 0 && d <= 7; }).length}</b>\n⏸️ متوقف مؤقتاً: <b>${all.filter(pausedNow).length}</b>\n❌ منتهي: <b>${all.filter(s => s.status === 'expired').length}</b>\n\n<b>حسب الباقة:</b>\n` + Object.entries(by).map(([k, v]) => `• ${k}: ${v}`).join('\n');
}
async function expiring(db) {
  const snap = await db.collection('subscriptions').where('status', '==', 'active').get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => { const d = daysLeft(s); return d !== null && d >= 0 && d <= 7; }).sort((a, b) => daysLeft(a) - daysLeft(b));
  if (!list.length) return '✅ لا توجد اشتراكات تنتهي خلال 7 أيام';
  return '⚠️ <b>تنتهي خلال 7 أيام</b>\n\n' + list.map(s => `• <b>${s.childName}</b> — ${daysLeft(s)} يوم\n  👤 ${s.parentName} · <a href="https://wa.me/965${s.phone}">${s.phone}</a> · ${s.packageName || ''}`).join('\n');
}
async function pauses(db) {
  const snap = await db.collection('subscriptions').where('pauseUsed', '==', true).get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.pauseStart && toD(s.pauseEnd) >= new Date());
  if (!list.length) return '⏸️ لا توجد إيقافات حالية أو قادمة';
  return '⏸️ <b>الإيقافات المؤقتة</b>\n\n' + list.map(s => `• <b>${s.childName}</b> ${pausedNow(s) ? '(جارٍ)' : '(قادم)'}\n  من ${fmtD(s.pauseStart)} إلى ${fmtD(s.pauseEnd)}${s.pauseReason ? ' · ' + s.pauseReason : ''}\n  👤 ${s.parentName} · ${s.phone}`).join('\n');
}
function requestCard(s) {
  return `📝 <b>طلب تسجيل</b>\n\n👦 <b>${s.childName}</b>${s.childAge ? ` (${s.childAge} سنة)` : ''} · 🎂 ${s.birthDate || '--'}\n👤 ${s.parentName}\n📱 <a href="https://wa.me/965${s.phone}">${s.phone}</a>${s.phone2 ? ' · ' + s.phone2 : ''}\n📧 ${s.email || '--'}\n\n📦 ${s.packageName} — <b>${s.amount} د.ك</b>${s.loyaltyMember ? '\n🏅 أسرة سلام' : ''}\n🏆 البطولات: ${s.tournamentsConsent || '--'}\n🩺 صحة: ${s.healthIssues || '--'}\n🤧 حساسية: ${s.allergies || '--'}\n🎯 السبب: ${s.reason || '--'}`;
}
const requestKb = id => ({ inline_keyboard: [[{ text: '✅ موافقة', callback_data: `approve|${id}` }, { text: '⛔ رفض', callback_data: `reject|${id}` }]] });
async function pendingRequests(db, tg, chat) {
  const snap = await db.collection('subscriptions').where('status', '==', 'pending_review').get();
  if (snap.empty) return tg('sendMessage', { chat_id: chat, text: '🎉 لا توجد طلبات بانتظار المراجعة', reply_markup: KB });
  for (const d of snap.docs) await tg('sendMessage', { chat_id: chat, text: requestCard({ id: d.id, ...d.data() }), parse_mode: 'HTML', reply_markup: requestKb(d.id), disable_web_page_preview: true });
}

// ============ MAIN HANDLER ============
async function handleUpdate(update, { db, tg }) {
  const msg = update.message, cq = update.callback_query;
  const chat = msg ? msg.chat.id : cq ? cq.message.chat.id : null; if (!chat) return;
  const send = (text, extra = {}) => tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

  // /start → show chat id (works even if not allowed)
  if (msg && /^\/start/.test(msg.text || '')) {
    const ok = await allowed(db, chat);
    if (ok) return send('👋 أهلاً بك في بوت <b>أكاديمية سلام</b>\n\nاكتب مبلغاً مثل <code>350 إيجار</code> لتسجيل عملية، أو استخدم الأزرار بالأسفل.', { reply_markup: KB });
    return send(`👋 أهلاً! رقم المحادثة الخاص بك:\n\n<code>${chat}</code>\n\nأضفه في لوحة الإدارة → 🤖 بوت تيليجرام لتفعيل الوصول.`);
  }
  if (!(await allowed(db, chat))) return send(`⛔ غير مصرح. رقم المحادثة: <code>${chat}</code>\nأضفه في لوحة الإدارة أولاً.`);

  // ---- inline buttons ----
  if (cq) {
    const [act, a, b] = (cq.data || '').split('|');
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    if (act === 'cancel') { await setState(db, chat, {}); return tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: '✖️ تم الإلغاء' }); }
    if (act === 'type') { const st = await getState(db, chat); st.type = a; await setState(db, chat, st); return tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: `${a === 'income' ? '💰 دخل' : '💸 مصروف'} <b>${KD(st.amount)} د.ك</b>\nاختر الفئة:`, parse_mode: 'HTML', reply_markup: catKeyboard(a) }); }
    if (act === 'cat') {
      const st = await getState(db, chat); st.type = a; st.category = b;
      await saveTx(db, chat, st); await setState(db, chat, {});
      const sum = await quickTotals(db);
      return tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: `✅ تم الحفظ\n${a === 'income' ? '💰' : '💸'} <b>${KD(st.amount)} د.ك</b> — ${ICON[b] || ''} ${b}${st.note ? '\n📝 ' + st.note : ''}\n\n${sum}`, parse_mode: 'HTML' });
    }
    if (act === 'approve' || act === 'reject') {
      const ref = db.collection('subscriptions').doc(a); const d = await ref.get(); if (!d.exists) return send('الطلب غير موجود');
      const s = d.data();
      if (act === 'approve') {
        const start = new Date(); const end = new Date(start); end.setDate(end.getDate() + 30);
        await ref.update({ status: 'approved', approvedAt: new Date(), plannedStart: start, plannedEnd: end, approvedVia: 'telegram' }); await PortalSync.syncPhone(db, s.phone);
        const wa = `https://wa.me/965${s.phone}?text=` + encodeURIComponent(`السلام عليكم ${s.parentName} 👋\n\nيسعدنا إبلاغكم بالموافقة على تسجيل ${s.childName} في أكاديمية سلام 🏆\n\nالباقة: ${s.packageName}\nالرسوم الشهرية: ${s.amount} د.ك\n\nلإتمام التسجيل يرجى سداد الرسوم، وسيتم تفعيل الاشتراك فور استلام الدفع.\n\nأكاديمية سلام 💪 93000607`);
        await tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: `✅ <b>تمت الموافقة</b> على ${s.childName}\n\nأرسل رسالة الموافقة للأهل:`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '💬 فتح واتساب', url: wa }]] } });
      } else {
        await ref.update({ status: 'rejected', rejectedAt: new Date(), approvedVia: 'telegram' }); await PortalSync.syncPhone(db, s.phone);
        await tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: `⛔ تم رفض طلب ${s.childName}`, parse_mode: 'HTML' });
      }
      return;
    }
    return;
  }

  const text = (msg.text || '').trim(); if (!text) return;
  const st = await getState(db, chat);

  // ---- menu buttons ----
  if (/ملخص/.test(text)) return send(await monthSummary(db), { reply_markup: KB });
  if (/آخر العمليات|اخر العمليات/.test(text)) return send(await lastTx(db), { reply_markup: KB });
  if (/المشتركين/.test(text)) return send(await subscribers(db), { reply_markup: KB });
  if (/طلبات/.test(text)) return pendingRequests(db, tg, chat);
  if (/تنتهي/.test(text)) return send(await expiring(db), { reply_markup: KB });
  if (/الإيقافات|الايقافات/.test(text)) return send(await pauses(db), { reply_markup: KB });
  if (/^💸|^مصروف$/.test(text)) { await setState(db, chat, { await: 'amount', type: 'expense' }); return send('💸 اكتب مبلغ المصروف (مثال: <code>350 إيجار</code>):'); }
  if (/^💰|^دخل$/.test(text)) { await setState(db, chat, { await: 'amount', type: 'income' }); return send('💰 اكتب مبلغ الدخل (مثال: <code>25 اشتراك أحمد</code>):'); }
  if (/^\/help|مساعدة/.test(text)) return send('اكتب <code>المبلغ + الوصف</code> مثل <code>120 رواتب المدرب</code> وسأحفظه.\nأو استخدم الأزرار بالأسفل.', { reply_markup: KB });

  // ---- amount entry ----
  const p = parseEntry(text);
  if (!p) return send('لم أفهم 🤔 اكتب مبلغاً مثل <code>350 إيجار</code> أو استخدم الأزرار.', { reply_markup: KB });
  const type = st.type || p.type;
  const ns = { amount: p.amount, note: p.note, category: p.category, type };
  if (!type) { await setState(db, chat, ns); return send(`<b>${KD(p.amount)} د.ك</b>${p.note ? ' — ' + p.note : ''}\nهل هذا مصروف أم دخل؟`, { reply_markup: { inline_keyboard: [[{ text: '💸 مصروف', callback_data: 'type|expense' }, { text: '💰 دخل', callback_data: 'type|income' }], [{ text: '✖️ إلغاء', callback_data: 'cancel' }]] } }); }
  if (p.category && CATS[type].includes(p.category)) { ns.category = p.category; await saveTx(db, chat, ns); await setState(db, chat, {}); return send(`✅ تم الحفظ\n${type === 'income' ? '💰' : '💸'} <b>${KD(p.amount)} د.ك</b> — ${ICON[p.category] || ''} ${p.category}${p.note ? '\n📝 ' + p.note : ''}\n\n${await quickTotals(db)}`, { reply_markup: KB }); }
  await setState(db, chat, ns);
  return send(`${type === 'income' ? '💰 دخل' : '💸 مصروف'} <b>${KD(p.amount)} د.ك</b>${p.note ? ' — ' + p.note : ''}\nاختر الفئة:`, { reply_markup: catKeyboard(type) });
}

async function quickTotals(db) {
  const k = monthKey(); const snap = await db.collection('transactions').where('date', '>=', k + '-01').where('date', '<=', k + '-31').get();
  let i = 0, e = 0; snap.docs.forEach(d => { const t = d.data(); if (t.type === 'income') i += +t.amount; else e += +t.amount; });
  return `<i>${MONTHS[+k.slice(5, 7) - 1]}: دخل ${KD(i)} · مصاريف ${KD(e)} · صافي ${KD(i - e)}</i>`;
}

// Notify all allowed chats (used by Firestore triggers / watcher)
async function notifyAdmins(db, tg, text, reply_markup) {
  const d = await db.collection('settings').doc('telegram').get(); const ids = d.exists ? d.data().chatIds || [] : [];
  for (const c of ids) { try { await tg('sendMessage', { chat_id: c.id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) }); } catch (e) { console.warn('notify', c.id, e.message); } }
}

module.exports = { handleUpdate, notifyAdmins, requestCard, requestKb, fmtD };
