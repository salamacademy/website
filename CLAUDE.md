# Salam Academy — project brief for Claude Code

Arabic RTL website + PWA apps for a children's sports academy in Kuwait (football, kyokushin/self-defense).
Live at https://salamacademy.github.io/website/ (GitHub Pages, repo `salamacademy/website`). Read `SETUP.md` for full details.

## Stack
- Static site: plain HTML/CSS/JS, Firebase compat SDK 9.23 (no build step). Fonts: Tajawal. Brand: green #1B5E20/#2E7D32, copper #B8541E, cream #FBF7F0.
- Firebase project `salam-5e6f2` (Firestore in `eur3`, Cloud Functions in `europe-west1`, Node 22, Blaze plan).
- Payments: UPayment via `functions/index.js` (`createPayment`, `upaymentWebhook`, `verifyPayment`). API key only in `functions/.env` (git-ignored).
- Telegram bot `@Salamacademybot`: `functions/telegram-core.js` via `telegramWebhook` (webhook mode). `bot/` is a local polling backup.
- Push: FCM (`js/notifications.js`, `firebase-messaging-sw.js`), `manifest.json` / `manifest-admin.json`, `sw.js` (bump `CACHE` version on every release).

## Key files
- `index.html` + `css/main.css` — landing page
- `client/` — parent app (`login.html` phone-only login, `dashboard.html` + `js/client-dashboard.js`, `register.html` survey, `payment-success.html`)
- `admin/` — admin app (`dashboard.html` + `js/admin-dashboard.js` + `js/finance.js`)
- `css/app.css` — shared mobile-app shell (bottom tabs, cards, sheets)
- `js/portal-sync.js` — mirrors safe subscription data into `portal/{phone}` for parents (copies in `bot/` and `functions/`)
- `firestore.rules` — admins full access; parents read only `portal/{phone}` (get, not list) and append `pauseRequests`/`fcmTokens`; `payItems` public read; `payments` get-only.

## Firestore collections
`subscriptions` (full records, admin-only), `portal/{phone}` (parent mirror), `transactions` (accounting), `payItems` (pay catalog), `payments/{orderId}` (UPayment orders), `settings/telegram` (allowed chat IDs), `botState`, `admins/{uid}`.

Subscription statuses: `pending_review → approved → active → expired` (or `rejected`/`cancelled`). Pauses: up to 3 one-day pauses per month, parent requests → admin approves (+1 day).

## Commands
- Deploy functions: `firebase deploy --only functions`
- Deploy rules: `firebase deploy --only firestore:rules`
- Site: commit + `git push` (GitHub Pages auto-deploys); then hard-refresh.

## Rules for changes
- Keep all UI text Arabic; keep RTL; keep responses mobile-first (430px app frame).
- Never commit `functions/.env`, `bot/serviceAccount.json`, or `node_modules`.
- After any change that must reach the parent portal, make sure `PortalSync.syncPhone` runs (admin dashboard, functions `syncPortal`, or bot).
- Bump `CACHE` in `sw.js` whenever CSS/JS changes.
