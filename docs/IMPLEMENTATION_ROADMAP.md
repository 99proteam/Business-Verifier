# Business Verifier - Implementation Roadmap

## Product Goal
Build a trust infrastructure SaaS where customers can discover verified businesses, raise proof-backed tickets, and buy with confidence across online and offline channels.

## Technical Stack
- Next.js App Router (TypeScript + Tailwind CSS)
- Firebase Auth (Google sign-in)
- Firebase Firestore (core data)
- Firebase Storage (document and evidence uploads)
- Firebase automation endpoints + Vercel Cron
- Razorpay / RazorpayX provider integration (with mock fallback)

## Core Roles
- Customer
- Verifier Customer (membership holder)
- Business Basic
- Business Pro (public deposit + premium trust)
- Employee (business-managed)
- Admin

## Phase Plan Status
1. Phase 1 (foundation)
- `DONE` SaaS project shell and modern UI
- `DONE` Google sign-in integration setup
- `DONE` Core domain models
- `DONE` Business onboarding form
- `DONE` Ticket creation with mandatory proof files
- `DONE` Public directory tabs (online/offline)
- `DONE` Pricing base for customer/business plans

2. Phase 2 (trust engine + admin review)
- `DONE` Business verification queue in admin panel
- `DONE` Verification checklist workflow (mobile, address, docs, bank)
- `DONE` Certificate issuance + public certificate profile
- `DONE` Pro business deposit lock and public balance section
- `DONE` Follower, employee invite, and role permissions

3. Phase 3 (ticket/refund dispute system)
- `DONE` Full ticket thread for customer + business + admin
- `DONE` Admin escalation trigger when parties fail to resolve
- `DONE` Refund/partial refund outcomes with reason logs
- `DONE` Auto-create linked tickets from order/refund and review dissatisfaction
- `DONE` Reopen ticket support with full history

4. Phase 4 (digital products + escrow)
- `DONE` Business digital product management
- `DONE` No-refund tagged products
- `DONE` Unique product links
- `DONE` 45-day escrow hold and release workflow
- `DONE` Social proof, reviews, favorites, and favorite-customer offer broadcast
- `DONE` Payment intent + provider webhook integration layer (mock + Razorpay)
- `DONE` External product API feed aggregation

5. Phase 5 (wallet + payouts + billing)
- `DONE` Wallet top-up and transaction ledger
- `DONE` Refund credits to wallet
- `DONE` Withdrawal requests with country-wise detail schema
- `DONE` Admin approve/decline with reasons
- `DONE` Admin wallet add/debit with audit trail
- `DONE` Monthly billing for all scoped charge families
- `DONE` Payout execution + provider settlement callbacks (mock + RazorpayX)

6. Phase 6 (groups + notification API + widgets + ads)
- `DONE` Business-only group creation and member joins/unjoins
- `DONE` Group widget code and messaging controls
- `DONE` Notification API by unique user ID with spam controls
- `DONE` Trust badge widget for external sites
- `DONE` Banner ads, city targeting, pricing controls
- `DONE` Ad click tracking, CTR views, CSV exports

7. Phase 7 (membership economics and distribution)
- `DONE` Verifier Customer membership engine (minimum 10% discount rule)
- `DONE` Online integration APIs + offline CSV/manual ingestion
- `DONE` Eligibility checks and weighted distribution cycle engine
- `DONE` 4-month distribution cycle payouts and business reports
- `DONE` Integration kit snippets for Node/Python/PHP/cURL + usage monitoring

## Weighted Distribution Model (implemented)
- score = 0.55 * sqrt(eligible_transactions) + 0.45 * ln(1 + eligible_gross_value)
- per-business cap percentage
- minimum payout floor for eligible participants
- normalized against business share pool after reserve

## Security and Reliability (implemented)
- Role-sensitive flows gated in repository logic and dashboards
- Immutable audit stream for sensitive actions
- API route rate limits across major external/admin endpoints
- Cron orchestration endpoint with token/bearer validation
- Automation run history + ops webhook alerts

## Production Checklist
1. Configure Firebase project + deploy Firestore/Storage rules and indexes.
2. Configure Vercel env vars (`CRON_SECRET`, `CRON_PUBLIC_TRIGGER_TOKEN`, payment/payout secrets).
3. Configure Razorpay and RazorpayX webhooks to point to platform endpoints.
4. Enable Vercel cron from `vercel.json` for `/api/cron/system`.
