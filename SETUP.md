# 🏆 Salam Academy Website - Setup Guide

## Tech Stack
- **Frontend**: GitHub Pages (HTML/CSS/JS)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication (Phone OTP + Email)
- **Payments**: Upayment Kuwait
- **Notifications**: WhatsApp (wa.me links)

---

## 📁 File Structure
```
salam-academy/
├── index.html              ← Landing page (homepage)
├── manifest.json / manifest-admin.json / sw.js  ← PWA (mobile app)
├── css/
│   ├── main.css            ← Main styles
│   ├── portal.css          ← Login / register styles
│   ├── register.css        ← Survey form
│   └── app.css             ← Mobile-app shell for both dashboards (bottom tabs, cards, sheets)
├── js/
│   ├── firebase-config.js  ← ⚠️ FILL IN YOUR FIREBASE CONFIG
│   ├── main.js             ← Landing page JS
│   ├── client-login.js     ← Client OTP/email login
│   ├── client-dashboard.js ← Client portal JS
│   ├── admin-login.js      ← Admin login
│   ├── register.js         ← Survey logic
│   ├── pwa-install.js      ← Install-to-home-screen banner
│   └── admin-dashboard.js  ← Admin CRUD + review queue
├── client/
│   ├── register.html       ← Registration survey (replaces Google Form)
│   ├── login.html          ← Client login page
│   ├── dashboard.html      ← Client portal (days remaining etc.)
│   └── payment-success.html← After Upayment redirect
├── admin/
│   ├── login.html          ← Admin login
│   └── dashboard.html      ← Full admin control panel
├── images/                 ← Add logo.png, favicon.png here
├── firestore.rules         ← Security rules
└── SETUP.md                ← This file
```

---

## 🚀 Step 1: Firebase Setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project: `salam-academy`
3. Enable **Firestore Database** (Production mode)
4. Enable **Authentication**:
   - Phone (for OTP login)
   - Email/Password (for admin)
5. Copy your config and update `js/firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "salam-academy.firebaseapp.com",
  projectId: "salam-academy",
  storageBucket: "salam-academy.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. Deploy Firestore rules:
```bash
firebase deploy --only firestore:rules
```

---

## 🔐 Step 2: Create Admin Account

In Firebase Console → Authentication → Users:
1. Create user with email: `admin@salamacademy.kw` and a strong password

In Firestore → Create collection `admins`:
1. Document ID = the UID of the admin user
2. Fields: `{ email: "admin@salamacademy.kw", name: "المدير", role: "super_admin" }`

---

## 💳 Step 3: Upayment Setup

1. Register at [upayments.com](https://upayments.com)
2. Get your API key from dashboard
3. Update `js/firebase-config.js`:
```javascript
const UPAYMENT_CONFIG = {
  apiKey: "your-upayment-api-key",
  testMode: false  // Set to false for production
};
```
4. Change the API URL in `main.js` from sandbox to production:
   - Sandbox: `https://sandboxapi.upayments.com/api/v1/charge`
   - Production: `https://api.upayments.com/api/v1/charge`

5. **Important**: Upayment requires a server-side call for security. 
   Use Firebase Cloud Functions to proxy the payment request.

---

## 🌐 Step 4: GitHub Pages Deployment

1. Create repository: `salam-academy-kwt`
2. Push all files to `main` branch
3. Go to Settings → Pages → Source: `main` branch, root `/`
4. Your site will be at: `https://YOUR_USERNAME.github.io/salam-academy-kwt`

### Optional: Custom Domain
1. Add file `CNAME` with content: `www.salamacademy.com.kw`
2. Configure DNS at your domain registrar

---

## 🔄 Registration & Approval Flow (NEW)

1. Parent fills the survey at `client/register.html` (same questions as the Google Form) → saved with `status: pending_review`
2. Admin → **📝 طلبات المراجعة** sees all answers (health, allergies, reason, tournaments consent, package, loyalty) → **✅ موافقة** (set amount/start date) or **⛔ رفض** (reason) → WhatsApp opens automatically
3. Approved → `status: approved`. Parent sees "تمت الموافقة — ادفع الآن" in their portal
4. After payment received → admin clicks **▶️ تفعيل** → `status: active`, 30-day countdown starts, welcome WhatsApp opens

Statuses: `pending_review` → `approved` → `active` → `expired` (or `rejected` / `cancelled`)

## 📱 Mobile App (PWA)

Both dashboards are built as a phone app: bottom tab bar, a floating ➕ button, card lists (no tables), bottom-sheet dialogs, and a centred 430px phone frame on desktop. Admin tabs: الرئيسية · المراجعة · ➕ إضافة · الأعضاء · رسائل (plus تنتهي قريباً / الإيقافات via the home tiles). Member tabs: الرئيسية · الجدول · 💳 الدفع · إيقاف · اشتراكي.

Both portals install as apps from the browser — no App Store needed:
- **Android (Chrome):** a "تثبيت" banner appears in the dashboard → tap it
- **iPhone (Safari):** tap Share ⬆️ → "Add to Home Screen" (a hint banner shows once)
- Member app → `manifest.json` (copper icon) · Admin app → `manifest-admin.json` (dark icon)
- `sw.js` caches the app shell for fast launch; Firebase/Upayment requests are never cached
- Requires HTTPS — GitHub Pages provides this automatically

## ⏸️ One-Week Pause

Parents can pause an **active** subscription once per month for exactly 7 days (⏸️ إيقاف مؤقت in their portal). The end date auto-extends +7 days and WhatsApp opens to inform you. Admin sees it under **⏸️ الإيقافات المؤقتة** and in the stats, with a cancel button that reverts the +7 days. `pauseUsed` resets on activation/renewal. Firestore rules enforce the exact +7-day math.

## 🔔 Notifications

**Layer 1 — works now, no setup:** both dashboards show a "🔔 تفعيل الإشعارات" banner. Once allowed, the app listens to Firestore in realtime and shows a notification while the app is open or in a background tab:
- Admin: new registration, new pause
- Parent: approved / activated / rejected, and a ≤3-days-left reminder

**Layer 2 — push when the app is closed (optional, ~15 min setup):**
1. Firebase Console → **Project settings → Cloud Messaging → Web Push certificates → Generate key pair** → copy the public key into `FCM_VAPID_KEY` in `js/firebase-config.js`
2. Upgrade the project to the **Blaze** plan (pay-as-you-go; free tier covers this usage)
3. `cd functions && npm install && cd ..` then `firebase deploy --only functions`
4. Users who allowed notifications get real push even with the app closed: new requests → admin, approval/activation → parent, daily 9:00 AM expiry reminders (3 days & 1 day), and auto-expiry of overdue subscriptions.

iPhone note: web push on iOS requires iOS 16.4+ and the app to be **added to the Home Screen** first.

## 💰 Accounting (المالية tab)

- Firestore collection `transactions`: `{ type: income|expense, amount, category, note, method, date: "YYYY-MM-DD", recurring, createdBy: admin|telegram }`
- Month navigator, Income / Expenses / Net tiles, category breakdown bars with %, grouped transaction list, CSV export
- ➕ FAB on this tab opens the add sheet (type toggle, amount, category chips, date, method, note, 🔁 monthly recurring)
- **Recurring**: mark rent/salaries as 🔁 once → each month tap "تسجيلها لهذا الشهر" to post them in one go
- **Auto income**: activating a subscription (▶️ تفعيل or manual add) records an `اشتراكات` income automatically
- Home tile "صافي الشهر" shows this month's net

## 🤖 Telegram Bot

Log expenses from your phone, get the monthly P&L, see subscribers, and approve registrations — all synced live with the dashboard.

**Create the bot (2 min):** Telegram → `@BotFather` → `/newbot` → copy the token.

**Run it — Option A (free, no Blaze): the `bot/` folder**
1. Firebase Console → Project settings → Service accounts → *Generate new private key* → save as `bot/serviceAccount.json` (never commit it; it's git-ignored)
2. `cd bot && npm install`
3. `set TELEGRAM_BOT_TOKEN=123:ABC` (Windows) / `export TELEGRAM_BOT_TOKEN=123:ABC` then `npm start`
4. Keep it running on any always-on machine (a PC, a VPS, Railway/Render free tier). It uses long-polling, so no public URL is needed.

**Run it — Option B (Blaze): Cloud Function webhook**
1. `firebase functions:config:set telegram.token="123:ABC"` then `firebase deploy --only functions`
2. Open once in a browser: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://us-central1-salam-5e6f2.cloudfunctions.net/telegramWebhook`

**Connect your phone:** send `/start` to the bot → it replies with your Chat ID → Admin dashboard → 📨 → 🤖 بوت تيليجرام → add the ID. Only added IDs can use the bot.

**What you can type**
| You send | Bot does |
|---|---|
| `350 إيجار` | saves a 350 KD rent expense instantly |
| `25 اشتراك أحمد` | saves 25 KD subscription income |
| `120` | asks مصروف/دخل → then category buttons |
| 📊 ملخص الشهر | income, expenses, net, % per category |
| 📋 آخر العمليات | last 10 transactions |
| 👥 المشتركين | counts by status and package |
| 📝 طلبات التسجيل | each pending form with ✅ موافقة / ⛔ رفض buttons |
| ⚠️ تنتهي قريباً / ⏸️ الإيقافات | lists with WhatsApp links |

Recognised words: إيجار، راتب/رواتب، أكل/ماء/غداء، معدات/كور، زي/ملابس، باص/بنزين، إعلان/تسويق، صيانة، رحلة/بولينج، اشتراك، بطولة، رعاية. Anything else → category buttons.

The bot also pushes an alert to every connected phone on each new registration (with approve/reject buttons) and each new pause.

## 📊 Firestore Data Structure

### `subscriptions` collection:
```json
{
  "childName": "أحمد محمد",
  "childAge": 10,
  "parentName": "محمد أحمد",
  "phone": "99999999",
  "email": "parent@email.com",
  "uid": "firebase-auth-uid",
  "birthDate": "2016-03-12",
  "phone2": "66666666",
  "healthIssues": "لا يوجد",
  "allergies": "لا يوجد",
  "reason": "بناء الثقة",
  "tournamentsConsent": "لا أمانع",
  "loyaltyMember": false,
  "termsAccepted": true,
  "adminNote": "",
  "packageType": "football | confidence | excellence",
  "packageName": "معسكر كرة القدم",
  "amount": 25,
  "paymentMethod": "upayment",
  "status": "pending_review | approved | active | expired | rejected",
  "subscriptionStart": "Timestamp",
  "subscriptionEnd": "Timestamp",
  "daysRemaining": 30,
  "createdAt": "Timestamp",
  "paidAt": "Timestamp",
  "notes": ""
}
```

### `admins` collection:
```json
{
  "email": "admin@salamacademy.kw",
  "name": "المدير",
  "role": "super_admin"
}
```

---

## 📱 WhatsApp Integration

The site uses direct `wa.me` links for WhatsApp integration:
- Format: `https://wa.me/96593000607?text=MESSAGE`
- No API key needed for basic links
- For automated reminders, consider WhatsApp Business API

---

## 🔄 Auto-Renewal Reminders (Optional Enhancement)

Deploy a Firebase Cloud Function that runs daily:
```javascript
exports.dailyRenewalCheck = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    // Query subscriptions ending in 7 days
    // Send WhatsApp via Twilio/WhatsApp Business API
  });
```

---

## 📞 Support
WhatsApp: 93000607
Instagram: @salam_academy_kwt
