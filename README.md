# Business Verifier

Business Verifier is a Next.js + Firebase trust SaaS platform for online/offline business verification, customer protection, dispute management, membership economics, and transparent public trust signals.

## Stack
- Next.js App Router + TypeScript + Tailwind CSS
- Firebase Auth, Firestore, Storage
- Flutter mobile app (shared Firebase data model)
- Razorpay / RazorpayX (with mock provider fallback)
- Vercel Cron for automation orchestration

## Feature Coverage
- Business onboarding, admin verification queue, certificate issuance
- Public directory (online/offline tabs), trust profile pages, trust badge widget
- Pro deposit lock lifecycle and public deposit ledger
- Ticketing/disputes with proof uploads, escalation, reopen, admin refunds
- Digital products, unique links, no-refund flags, 45-day escrow
- Digital product pricing plans (one-time/monthly/yearly) + plan-aware checkout
- Product favorites with targeted offer broadcast to favorite customers
- Customer favorites dashboard (`/dashboard/favorites`)
- Product reviews + proof-of-purchase + business response + conditional hide on resolution
- Wallet top-up, withdrawal requests, payout logs, admin wallet adjust
- Country/method withdrawal compliance schema (dynamic input packs)
- Groups (business-only create, join/unjoin, admin-only/public messaging, widget)
- Employee moderator controls for groups
- Notification API (target by user public IDs) + spam handling + delivery logs
- Mobile push queue (`mobilePushQueue`) + FCM token registry (`users/{uid}/mobilePushTokens`)
- Truecaller verification integration API for customer/business identity checks
- Notification endpoint lifecycle with permanent/temporary IDs + disconnect control
- Ads (campaign management, city targeting, impressions/clicks, CTR, CSV exports)
- Ad tag plans (monthly/yearly + custom plans) configurable by admin
- Verifier customer membership + business participation + weighted distribution cycles
- Membership APIs (discount validate, transaction ingest, distribution run)
- All-platform membership integration kit snippets (Node/Python/PHP/cURL)
- Admin automation monitor + reconciliation exports (JSON/CSV)
- Unified audit stream + route-level rate limits

## Local Setup
1. Install dependencies
```bash
npm install
```

2. Create env file
```bash
copy .env.local.example .env.local
```

3. Fill Firebase + secrets in `.env.local`
- `NEXT_PUBLIC_FIREBASE_*`
- `NEXT_PUBLIC_ADMIN_EMAILS`, `ADMIN_EMAILS`
- `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
- payment/payout secrets
- optional PayPal + currency config: `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `USD_INR_RATE`
- cron secrets
- mobile push secrets (`MOBILE_PUSH_DISPATCH_SECRET`) and toggles (`CRON_ENABLE_MOBILE_PUSH`, `CRON_MOBILE_PUSH_LIMIT`)
- optional Truecaller adapter secrets (`TRUECALLER_VERIFY_ENDPOINT`, `TRUECALLER_API_KEY`, `TRUECALLER_APP_KEY`)

4. Run dev server
```bash
npm run dev
```

## Firebase Config Files
This repo includes:
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

Deploy with Firebase CLI after linking your project:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

Notes:
- `firestore.rules` and `storage.rules` now authorize admins from `admins/{uid}` docs (`active: true`).
- Seed an admin document for your admin user UID before production use.
- `FIREBASE_ADMIN_PRIVATE_KEY` must keep escaped newlines in `.env` (`\\n`).
- Membership CSV import accepts CSV/TSV/Excel-export text files. Native `.xlsx` direct parsing is not enabled in this build.

## Scheduler (Vercel Cron)
- Configured in `vercel.json`
- Path: `/api/cron/system`
- Schedule: daily (`10 0 * * *`)
- Auth accepted by route:
  - `?token=<CRON_PUBLIC_TRIGGER_TOKEN>` query
  - `Authorization: Bearer <CRON_PUBLIC_TRIGGER_TOKEN or CRON_SECRET>`

## Important API Routes
- `POST /api/payments/intents/create`
- `POST /api/payments/intents/confirm`
- `POST /api/payments/webhook`
- `POST /api/payouts/withdrawals/review`
- `POST /api/payouts/withdrawals/execute`
- `POST /api/payouts/webhook`
- `POST /api/membership/discount/validate`
- `POST /api/membership/transactions/ingest`
- `POST /api/membership/distribution/run`
- `GET /api/membership/sdk`
- `GET /api/search/global`
- `GET /api/products/external`
- `GET /api/ads/click`
- `GET /api/cron/system`
- `POST /api/admin/reconciliation/export`
- `POST /api/admin/geo/import`
- `POST /api/mobile/push/register`
- `POST /api/mobile/push/unregister`
- `POST /api/mobile/push/dispatch`
- `GET/POST /api/auth/truecaller/verify`

Auth notes:
- `POST /api/payments/intents/create` and `POST /api/payments/intents/confirm` require `Authorization: Bearer <Firebase ID token>`.
- `POST /api/payouts/withdrawals/review` and `POST /api/payouts/withdrawals/execute` require admin bearer token (email in `ADMIN_EMAILS`).
- `POST /api/admin/reconciliation/export` and `POST /api/admin/geo/import` accept admin bearer token or their existing secret headers.
- `POST /api/automation/*` endpoints accept admin bearer token or `x-cron-secret` (`AUTOMATION_CRON_SECRET`).
- `POST /api/mobile/push/dispatch` accepts admin bearer token or `x-mobile-push-secret` (`MOBILE_PUSH_DISPATCH_SECRET`).

## Mobile App (Flutter)
- Folder: `mobile-app`
- The mobile app and website share the same Firebase collections, so changes sync in real time across both.
- Setup instructions: `mobile-app/README.md`

## Membership Offline CSV Template
- `public/templates/membership-offline-transactions-template.csv`

## Documentation
- Scope completion checklist: `docs/MASTER_SCOPE_CHECKLIST.md`
- Delivery roadmap: `docs/IMPLEMENTATION_ROADMAP.md`
