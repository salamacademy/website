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
├── css/
│   ├── main.css            ← Main styles
│   ├── portal.css          ← Dashboard & login styles
│   └── admin.css           ← Admin overrides
├── js/
│   ├── firebase-config.js  ← ⚠️ FILL IN YOUR FIREBASE CONFIG
│   ├── main.js             ← Landing page JS
│   ├── client-login.js     ← Client OTP/email login
│   ├── client-dashboard.js ← Client portal JS
│   ├── admin-login.js      ← Admin login
│   └── admin-dashboard.js  ← Admin CRUD panel
├── client/
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
  "packageType": "football",
  "packageName": "باقة كرة القدم",
  "amount": 60,
  "paymentMethod": "upayment",
  "status": "active",
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
