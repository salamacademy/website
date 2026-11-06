// ============================================================
// MONTHLY REPORT — income, expenses, net, subscribers and what every family paid.
// Built on the 1st for the month before (Cloud Function monthlyReport) or on demand from المالية.
// ============================================================
const PKG = { confidence: '🥋 بناء الثقة والكيوكشن', football: '⚽ كرة القدم', excellence: '⚡ باقة التميز (قدم + كيوكشن)', excellence_loyal: '🏅 أسرة سلام' };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const METHOD = { upayment: 'UPayment', cash: 'نقدي', knet: 'كي نت / تحويل' };
const KD = n => (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kw = d => new Date(d.getTime() + 3 * 3600e3).toISOString(); // Kuwait time
const tsKey = t => t && t.toDate ? kw(t.toDate()).slice(0, 10) : '';
const monthName = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const prevMonth = (now = new Date()) => { const d = new Date(kw(now).slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

async function buildReport(db, month) {
  const [txS, subS, payS] = await Promise.all([
    db.collection('transactions').where('date', '>=', month + '-01').where('date', '<=', month + '-31').get(),
    db.collection('subscriptions').get(),
    db.collection('payments').where('status', '==', 'paid').get()]);
  const tx = txS.docs.map(d => ({ id: d.id, ...d.data() }));
  const subs = {}; subS.docs.forEach(d => subs[d.id] = { id: d.id, ...d.data() });
  const pays = {}; payS.docs.forEach(d => pays[d.id] = { id: d.id, ...d.data() });
  const sum = a => a.reduce((x, t) => x + (+t.amount || 0), 0);
  const inc = tx.filter(t => t.type === 'income'), exp = tx.filter(t => t.type === 'expense');
  const by = (a, k) => { const o = {}; a.forEach(t => o[t[k] || 'أخرى'] = (o[t[k] || 'أخرى'] || 0) + (+t.amount || 0)); return Object.entries(o).sort((x, y) => y[1] - x[1]); };
  const income = sum(inc), expense = sum(exp), fees = sum(exp.filter(t => t.category === 'رسوم الدفع'));

  // every family: what they paid this month (UPayment orders + cash / manual entries)
  const fam = {};
  inc.forEach(t => {
    const p = t.paymentId && pays[t.paymentId], s = subs[(p && p.subId) || t.subId] || null;
    const phone = (p && p.phone) || (s && s.phone) || '';
    const f = fam[phone || '—'] = fam[phone || '—'] || { phone, parent: '', kids: new Set(), rows: [], total: 0 };
    f.parent = f.parent || (p && p.parentName) || (s && s.parentName) || '';
    const kid = (p && p.childName) || (s && s.childName); if (kid) f.kids.add(kid);
    f.rows.push({ date: t.date, what: t.note || t.category, amount: +t.amount || 0, method: METHOD[t.method] || t.method || '', pkg: s ? (PKG[s.packageType] || s.packageName || '') : '' });
    f.total += +t.amount || 0;
  });
  const families = Object.values(fam).sort((a, b) => b.total - a.total);

  // subscribers (now) + what happened this month
  const all = Object.values(subs), act = all.filter(s => s.status === 'active');
  const pkgCount = Object.keys(PKG).map(k => [PKG[k], act.filter(s => s.packageType === k).length]);
  const isNew = s => tsKey(s.createdAt).startsWith(month), newSubs = all.filter(isNew);
  const renewed = Object.values(pays).filter(p => p.activated && tsKey(p.paidAt).startsWith(month)).length;
  const upay = inc.filter(t => t.method === 'upayment'), cash = inc.filter(t => t.method !== 'upayment');

  const summary = { month, income: +income.toFixed(3), expense: +expense.toFixed(3), net: +(income - expense).toFixed(3), fees: +fees.toFixed(3), active: act.length, newSubs: newSubs.length, renewed, families: families.filter(f => f.phone).length };

  // ---- Telegram text (short) ----
  const text = `📊 <b>تقرير شهر ${monthName(month)}</b>\n\n💰 الدخل: <b>${KD(income)}</b> د.ك\n   • UPayment: ${KD(sum(upay))} · نقدي/تحويل: ${KD(sum(cash))}\n💸 المصاريف: <b>${KD(expense)}</b> د.ك${fees ? `\n   • منها رسوم UPayment: ${KD(fees)}` : ''}\n${income - expense >= 0 ? '✅ صافي الربح' : '🔻 صافي الخسارة'}: <b>${KD(Math.abs(income - expense))}</b> د.ك\n\n👥 مشتركين نشطين: <b>${act.length}</b>\n`
    + pkgCount.map(([n, c]) => `   • ${n}: ${c}`).join('\n') + `\n🆕 تسجيل جديد: ${newSubs.length} · 🔄 تجديد عبر UPayment: ${renewed}\n👨‍👩‍👦 عائلات دفعت هذا الشهر: ${summary.families}\n\n📎 التفاصيل الكاملة لكل عميل في الملف المرفق`;

  // ---- full HTML report ----
  const catRows = (a, cls) => a.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="n ${cls}">${KD(v)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>تقرير ${monthName(month)} — أكاديمية سلام</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet"/>
<style>
body{font-family:Tajawal,sans-serif;background:#FBF7F0;color:#2b2b2b;margin:0;padding:16px;max-width:900px;margin-inline:auto}
h1{color:#1B5E20;margin:0 0 4px;font-size:1.5rem}.sub{color:#8a7f73;margin:0 0 16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.kpi{background:#fff;border-radius:16px;padding:14px;box-shadow:0 2px 10px rgba(0,0,0,.05)}.kpi small{color:#8a7f73;font-weight:700}.kpi b{display:block;font-size:1.35rem;margin-top:4px}
.in{color:#2E7D32}.out{color:#C62828}.cu{color:#B8541E}
.card{background:#fff;border-radius:16px;padding:14px;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.05)}
h2{font-size:1.1rem;margin:0 0 10px;color:#1B5E20}table{width:100%;border-collapse:collapse;font-size:.92rem}
td,th{padding:7px 6px;border-bottom:1px solid #f0e8de;text-align:right;vertical-align:top}th{color:#8a7f73;font-size:.8rem}
.n{text-align:left;font-weight:700;white-space:nowrap;direction:ltr}.fam td{background:#F6FBF6;font-weight:900}.muted{color:#8a7f73;font-size:.82rem}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
</style></head><body>
<h1>📊 تقرير شهر ${monthName(month)}</h1><p class="sub">أكاديمية سلام · أُنشئ ${kw(new Date()).slice(0, 16).replace('T', ' ')}</p>
<div class="kpis">
<div class="kpi"><small>💰 الدخل</small><b class="in">${KD(income)}</b></div>
<div class="kpi"><small>💸 المصاريف</small><b class="out">${KD(expense)}</b></div>
<div class="kpi"><small>${income - expense >= 0 ? '✅ صافي الربح' : '🔻 صافي الخسارة'}</small><b class="${income - expense >= 0 ? 'in' : 'out'}">${KD(Math.abs(income - expense))}</b></div>
<div class="kpi"><small>🏦 رسوم UPayment</small><b class="cu">${KD(fees)}</b></div>
<div class="kpi"><small>👥 مشتركين نشطين</small><b>${act.length}</b></div>
<div class="kpi"><small>🆕 جديد · 🔄 تجديد</small><b>${newSubs.length} · ${renewed}</b></div>
</div>
<div class="grid2">
<div class="card"><h2>💰 الدخل حسب الفئة</h2><table>${catRows(by(inc, 'category'), 'in')}<tr><td><b>UPayment</b></td><td class="n">${KD(sum(upay))}</td></tr><tr><td><b>نقدي / تحويل</b></td><td class="n">${KD(sum(cash))}</td></tr></table></div>
<div class="card"><h2>💸 المصاريف</h2><table>${exp.length ? exp.sort((a, b) => b.amount - a.amount).filter(t => t.category !== 'رسوم الدفع').map(t => `<tr><td>${esc(t.note || t.category)}<div class="muted">${esc(t.category)}${t.perHead ? ` · ${t.perHead} × ${t.heads} مشترك` : ''}</div></td><td class="n out">${KD(t.amount)}</td></tr>`).join('') + (fees ? `<tr><td>رسوم UPayment<div class="muted">${exp.filter(t => t.category === 'رسوم الدفع').length} دفعة</div></td><td class="n out">${KD(fees)}</td></tr>` : '') : '<tr><td class="muted">لا توجد مصاريف مسجلة</td></tr>'}</table></div>
</div>
<div class="card"><h2>👥 المشتركين حسب الباقة (الآن)</h2><table>${pkgCount.map(([n, c]) => `<tr><td>${n}</td><td class="n">${c}</td></tr>`).join('')}</table>
${newSubs.length ? `<p class="muted" style="margin-top:10px">🆕 تسجيل جديد: ${newSubs.map(s => esc(s.childName)).join('، ')}</p>` : ''}</div>
<div class="card"><h2>👨‍👩‍👦 ما دفعه كل عميل (${families.length})</h2><table><tr><th>العميل / التفاصيل</th><th>التاريخ</th><th>الطريقة</th><th class="n">المبلغ</th></tr>
${families.map(f => `<tr class="fam"><td colspan="3">${esc(f.parent || 'بدون اسم')} ${f.phone ? `<span class="muted" dir="ltr">${f.phone}</span>` : ''}<div class="muted">${[...f.kids].map(esc).join('، ')}</div></td><td class="n in">${KD(f.total)}</td></tr>`
    + f.rows.sort((a, b) => a.date.localeCompare(b.date)).map(r => `<tr><td>${esc(r.what)}${r.pkg ? `<div class="muted">${r.pkg}</div>` : ''}</td><td class="muted">${r.date.slice(5)}</td><td class="muted">${esc(r.method)}</td><td class="n">${KD(r.amount)}</td></tr>`).join('')).join('')}
</table></div>
</body></html>`;
  return { month, html, text, summary };
}

// fixed monthly expenses: settings/finance.fixedExpenses (managed by the admin in المالية) → posted once for `month`
// fallback when that list doesn't exist yet: latest recurring expense per category+note
async function postRecurring(db, admin, month) {
  const rec = (await db.collection('transactions').where('recurring', '==', true).get()).docs.map(d => d.data()).filter(t => t.type === 'expense');
  let list = ((await db.collection('settings').doc('finance').get()).data() || {}).fixedExpenses;
  if (!Array.isArray(list)) {
    const seen = {}; rec.forEach(t => { const k = (t.category || '') + '|' + (t.note || ''); if (!seen[k] || t.date > seen[k].date) seen[k] = t; });
    list = Object.values(seen).map((t, i) => ({ id: 'auto' + (i + 1), name: t.note || t.category, category: t.category, amount: +t.amount, ...(t.perHead ? { perHead: +t.perHead, perHeadPkgs: t.perHeadPkgs || null } : {}), active: true }));
  }
  const cur = rec.filter(t => (t.date || '').startsWith(month));
  const todo = list.filter(f => f.active !== false && !cur.some(x => x.fixedId === f.id || (!x.fixedId && x.category === f.category && x.note === f.name)));
  if (!todo.length) return 0;
  const act = (await db.collection('subscriptions').where('status', '==', 'active').get()).docs.map(d => d.data()), b = db.batch();
  const headsOf = f => act.filter(s => !f.perHeadPkgs || f.perHeadPkgs.includes(s.packageType)).length; // e.g. الكبتن: kyokushin package only
  todo.forEach(f => b.set(db.collection('transactions').doc(`rec_${month}_${f.id}`), { type: 'expense', amount: f.perHead ? +(f.perHead * headsOf(f)).toFixed(3) : +f.amount || 0, category: f.category, note: f.name || '', method: 'cash', date: month + '-01', recurring: true, fixedId: f.id, ...(f.perHead ? { perHead: +f.perHead, heads: headsOf(f), ...(f.perHeadPkgs ? { perHeadPkgs: f.perHeadPkgs } : {}) } : {}), createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: 'auto' }));
  await b.commit(); return todo.length;
}

module.exports = { buildReport, postRecurring, prevMonth, monthName };
