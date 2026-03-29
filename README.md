# Business Verifier

Business Verifier is a Next.js + Firebase SaaS platform for online/offline business trust, verification, customer protection, and transparent dispute handling.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- Firebase Auth (Google sign-in)
- Firebase Firestore + Storage (planned persistence)

## Current Foundation
- Modern SaaS landing page
- Public directory with online/offline tabs
- Google sign-in page
- Secure dashboard shell
- Business verification onboarding form (Firestore save)
- Ticket creation form with mandatory proof uploads (Storage + Firestore save)
- Ticket center with message thread, admin escalation, refund/resolve/reopen actions
- Admin verification queue with certificate issuing
- Admin ticket queue and per-ticket decision workflow
- Digital product management, marketplace listing, unique link pages, and favorites
- Checkout flow, order records, 45-day escrow timeline, refund request with proof, and admin order actions
- Business sales/refund analytics dashboard for digital products
- Wallet module: top-up, ledger, withdrawal request, admin approve/decline, and admin add/debit controls
- Group module: business group creation, join/unjoin, public/admin messaging modes, widget code, and admin group monitoring
- Notification API module: endpoint creation, targeted sends by public IDs, user notification center, spam marking, and admin endpoint controls
- Verifier customer membership module: wallet-based monthly/yearly purchase, member identity, and purchase history
- Business membership module: discount configuration, integration API keys, online/offline transaction ingestion, CSV import, and discount simulation
- Admin membership economics module: eligibility thresholds, weighted distribution settings, cycle generation, payouts, and business report visibility
- Product reviews module: proof-backed customer reviews, business responses, and conditional negative review hiding after resolution
- Follow business module: follow/unfollow from directory and followed-business dashboard
- Employee module: business employee add/remove by account email and employee assignment dashboard
- Partnership module: marketplace listings, verified deal chat, agreement workflow, and 2% completion fee settlement
- Admin identity module: verify/unverify user identities required for partnership chat access
- Location module: country/city catalog filters in directory and onboarding city suggestions
- Security module: authenticator MFA enrollment, login challenge, backup codes, and security center
- Forgot-password recovery flow for email/password accounts (while Gmail remains primary sign-in)
- Pro deposit module: lock lifecycle, public ledger, withdraw flow, and admin forfeiture controls
- Trust badge widget: embeddable iframe + public trust profile page
- Employee performance module: monthly scorecards by business owners and employee-side visibility
- Admin audit stream: unified immutable log for sensitive actions
- Automation APIs: cron routes for invoice generation, billing maintenance, due escrow releases, and matured deposit releases
- Payment integration layer: payment intents (wallet top-up and product checkout), webhook processing, and mock gateway
- Payout integration layer: payout records and withdrawal payout execution workflow
- Reconciliation exports: admin JSON/CSV month-wise financial reconciliation endpoints
- Geo import pipeline: admin API to import global country/city catalog into Firestore
- Pricing page for customer/business plans
- Domain models and implementation roadmap

## Setup
1. Install dependencies:
```bash
npm install
```

2. Copy Firebase env template:
```bash
cp .env.local.example .env.local
```

3. Fill `NEXT_PUBLIC_FIREBASE_*` values.

4. Run:
```bash
npm run dev
```

## Membership API Endpoints
- `POST /api/membership/discount/validate`
  - Validates verifier customer discount eligibility using `businessOwnerUid`, API key, customer public ID, and transaction value.
- `POST /api/membership/transactions/ingest`
  - Ingests one or many online/offline transaction rows for eligibility scoring.
- `POST /api/membership/distribution/run`
  - Protected by `x-cron-secret` (`MEMBERSHIP_CRON_SECRET`) for scheduled weighted distribution cycles.

Environment variables:
- `MEMBERSHIP_API_RATE_LIMIT_PER_10_MIN`
- `MEMBERSHIP_INGEST_RATE_LIMIT_PER_10_MIN`
- `MEMBERSHIP_CRON_SECRET`
- `AUTOMATION_CRON_SECRET`

## Automation API Endpoints
- `POST /api/automation/invoices/run`
  - Protected by `x-cron-secret` (`AUTOMATION_CRON_SECRET`), generates monthly invoices for businesses.
- `POST /api/automation/escrow/release/run`
  - Protected by `x-cron-secret` (`AUTOMATION_CRON_SECRET`), releases due escrow orders in batch.
- `POST /api/automation/deposits/release/run`
  - Protected by `x-cron-secret` (`AUTOMATION_CRON_SECRET`), releases matured pro-deposit locks.
- `POST /api/automation/billing/maintain/run`
  - Protected by `x-cron-secret` (`AUTOMATION_CRON_SECRET`), marks overdue invoices, applies late fees, and sends reminders.
- `POST /api/automation/run-all`
  - Protected by `x-cron-secret` (`AUTOMATION_CRON_SECRET`), runs invoice generation + escrow release + deposit release + billing maintenance in one call.

## Payments & Payout APIs
- `POST /api/payments/intents/create`
  - Creates wallet top-up or product checkout payment intent.
- `POST /api/payments/intents/confirm`
  - Confirms payment intent as paid and applies wallet credit or creates escrow order.
- `POST /api/payments/webhook`
  - Provider webhook endpoint protected by `x-payment-webhook-secret` (`PAYMENT_WEBHOOK_SECRET`).
- `POST /api/payouts/withdrawals/execute`
  - Executes payout for approved withdrawal request.

## Admin Data APIs
- `POST /api/admin/reconciliation/export`
  - Protected by `x-admin-export-secret` (`ADMIN_EXPORT_SECRET`), returns JSON report or CSV export.
- `POST /api/admin/geo/import`
  - Protected by `x-admin-geo-secret` (`ADMIN_GEO_IMPORT_SECRET`), imports country/city catalog seed to Firestore.

## Next Steps
Implementation sequence is detailed in:
- `docs/IMPLEMENTATION_ROADMAP.md`
