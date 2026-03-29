# Business Verifier - Implementation Roadmap

## Product Goal
Build a trust infrastructure SaaS where customers can discover verified businesses, raise proof-backed tickets, and buy with confidence across online and offline channels.

## Technical Stack
- Next.js App Router (TypeScript + Tailwind CSS)
- Firebase Auth (Google sign-in)
- Firebase Firestore (core data)
- Firebase Storage (document and evidence uploads)
- Firebase Cloud Functions (escrow timers, commission billing, monthly distributions)
- Firebase Cloud Messaging (notifications)

## Core Roles
- Customer
- Verifier Customer (membership holder)
- Business Basic
- Business Pro (public deposit + premium trust)
- Employee (business-managed)
- Admin

## Phase Plan
1. Phase 1 (current foundation)
- SaaS project shell and modern UI
- Google sign-in integration setup
- Core domain models
- Business onboarding form
- Ticket creation with mandatory proof files
- Public directory tabs (online/offline)
- Pricing base for customer/business plans

2. Phase 2 (trust engine + admin review)
- Business verification queue in admin panel
- Verification checklist workflow (mobile, address, docs, bank)
- Certificate issuance + public certificate profile
- Pro business deposit lock and public balance section
- Follower, employee invite, and role permissions

3. Phase 3 (ticket/refund dispute system)
- Full ticket thread for customer + business + admin
- Admin escalation trigger when parties fail to resolve
- Refund/partial refund outcomes with reason logs
- Auto-create linked ticket from product/order issues
- Reopen ticket support with full history

Status:
- In progress: thread messaging, escalation, admin resolve/refund, and reopen flow are implemented.
- Pending in this phase: stricter role checks, partial refund amount handling, and SLA timers.

4. Phase 4 (digital products + escrow)
- Business digital product management
- No-refund tagged products
- Unique product links
- 45-day escrow hold for eligible purchases
- Release automation, refund windows, social proof and reviews
- Favorites and owner broadcast to favorites

Status:
- In progress: product creation, no-refund tags, unique link pages, favorites, checkout/order creation, escrow timelines, refund request flow, admin order actions, proof-backed product reviews, business responses, and conditional negative-review hiding are implemented.
- In progress: social-proof metrics are now visible across marketplace and product detail surfaces.
- In progress: payment intent + webhook integration layer with mock/provider abstraction is implemented.
- Pending in this phase: live third-party payment provider handshake and owner broadcast API to favorites.

5. Phase 5 (wallet + payouts + billing)
- Wallet top-up and transaction ledger
- Refund credits to wallet
- Withdrawal requests with country-wise details schema
- Admin approve/decline with reasons
- Admin wallet add/debit with audit trail
- Monthly billing for 2% sales commission and notification API usage

Status:
- In progress: wallet top-up, transaction ledger, refund-to-wallet credits, withdrawal requests, admin approve/decline, wallet adjustments, and withdrawal charge settings are implemented.
- In progress: automated monthly commission invoices are implemented with expanded charge families (partnership, withdrawal, refund case), due dates, late fee/reminders, and maintenance runner.
- In progress: payout execution flow + payout logs are implemented with mock/provider abstraction.
- Pending in this phase: live external payout settlement integration.

6. Phase 6 (groups + notification API + widgets + ads)
- Business-only group creation and member joins/unjoins
- Group widget code
- Admin-only or public group messaging mode
- Notification API by unique user ID with spam controls
- Trust badge widget for external sites
- Banner ads, city targeting, and CPM/flat pricing controls

Status:
- In progress: group creation, join/unjoin, admin-only/public messaging mode, group thread, widget code generation, admin group monitor, notification API endpoints, targeted sends by public IDs, user notification center, spam marking, admin endpoint controls, business/admin ads manager, public ad banner rendering, city targeting, and ad pricing controls are implemented.
- In progress: trust badge iframe widget and public trust profile page are implemented.
- Pending in this phase: richer anti-spam automation and ad reporting exports.

Phase 2 update:
- Implemented: follow/unfollow business from directory, followed businesses dashboard, employee add/remove by Gmail account, and employee assignment dashboard.
- Remaining: deeper role/permission boundaries and employee performance module.

Partnership update:
- Implemented: public partnership marketplace, deal chat threads, agreement/close workflow, identity-verified-only chat enforcement, admin partnership monitor, and fixed 2% platform fee debit on completed deals.
- Implemented: admin identity verification panel to enable/disable user verification required for partnership chat.

Location update:
- Implemented: country and city catalog filters in directory and onboarding suggestions with expanded global catalog.
- Implemented: admin geo import API pipeline for loading global country/city seed into Firestore.
- Pending: deeper geo-targeting automation and enrichment feeds.

Auth and automation update:
- Implemented: authenticator MFA enrollment/verification, backup codes, MFA login challenge page, dashboard security center, and forgot-password flow.
- Implemented: cron-ready automation APIs for monthly invoice generation, due escrow release, matured pro-deposit release, and billing maintenance.
- Implemented: admin automation monitor dashboard panel and unified audit stream panel.
- Implemented: run-all automation orchestration endpoint and admin reconciliation export APIs (JSON + CSV).
- Pending: production managed scheduler/alerts wiring.

7. Phase 7 (membership economics and distribution)
- Verifier Customer membership engine (minimum 10% discount rule)
- Online integration APIs + offline monthly Excel ingestion
- Eligibility checks:
  - Offline: at least 100 transactions/month
  - Online: at least 250 transactions/month
  - Minimum transaction value: INR 500
- Weighted Distribution Model every 4 months for 40% share pool
- Month-wise earnings reports + missed eligibility reasons

Status:
- In progress: customer membership purchase/renewal flow, business participation setup, integration API key management, transaction ingestion (manual + CSV), discount validation simulator, admin economics settings, weighted distribution cycle generation with payout credits, external API routes (discount validate + ingest), and cron-triggered distribution endpoint are implemented.
- Pending in this phase: offline transaction validation templates and production scheduling/monitoring hardening for cron jobs.

## Weighted Distribution Model (for high-order fairness)
Use capped weighted scoring so top performers earn more without letting one business absorb almost all rewards.

Recommended formula:
- score = 0.55 * sqrt(eligible_transactions) + 0.45 * ln(1 + eligible_gross_value)
- apply per-business cap: no business can exceed 12% of a distribution cycle pool
- apply floor: if eligible, minimum payout INR 500
- normalize all scores into 100% of the 40% share pool

Why this works:
- `sqrt` and `ln` reward growth but reduce runaway dominance.
- Cap protects ecosystem health.
- Floor keeps smaller honest businesses engaged.

## Your concern: "If someone has lakhs of orders, they expect more share"
Answer:
- They still get more share due to higher score.
- But cap + diminishing return avoids monopolization.
- You can expose a transparent calculator in admin so businesses can predict payout clearly.

## Minimum/Maximum controls to add in admin
- Per-business monthly minimum eligible GMV threshold
- Per-business maximum share cap percentage per cycle
- Cycle pool reserve percentage (e.g., 5%) for disputes/manual corrections
- Commission invoice due window and auto-late fee rules

## Important Security Rules
- All sensitive actions require authenticated user and role check.
- Ticket creation must include evidence upload.
- Partnership chat access requires identity-verified users.
- Admin can audit every action with immutable event logs.

## Next Build Priorities
1. Wire live payment and payout providers end-to-end with production credentials and callback signatures.
2. Move automation endpoints to managed scheduler with alerting and runbook escalation.
3. Harden external verifier membership API further (device fingerprinting + abuse heuristics).
4. Add scheduled 4-month distribution jobs with signed reconciliation archives.
