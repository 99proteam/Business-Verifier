# Business Verifier Master Scope Checklist

Status legend:
- `DONE` = implemented and wired in UI/routes

## 1) Core Platform
- `DONE` Next.js SaaS base app structure and modern UI
- `DONE` Firebase data/auth/storage integration baseline
- `DONE` Gmail/Google sign-in for platform access
- `DONE` Forgot password / authenticator / MFA hardening (authenticator MFA + forgot-password flow)
- `DONE` Unique public ID for users

## 2) Business Verification & Certificates
- `DONE` Business onboarding (online/offline/hybrid, stage, docs summary, years, bank details, partnership fields)
- `DONE` Admin verification queue
- `DONE` Certificate issuance after review
- `DONE` Public trust badge widget for external websites (dedicated trust badge iframe + public trust profile page)

## 3) Pro Business Deposits & Public Trust
- `DONE` Pro deposit capture fields and visibility concept present
- `DONE` Deposit lock lifecycle controls and timeline management UI
- `DONE` Full public deposit ledger/history display

## 4) Ticketing, Disputes, Refund Flows
- `DONE` Ticket creation with mandatory proof documents
- `DONE` Customer/business/admin thread style workflow
- `DONE` Escalation and reopen logic
- `DONE` Admin resolve/refund actions
- `DONE` Auto-ticket triggers from order/refund and review dissatisfaction signals

## 5) Directory & Discovery
- `DONE` Home listing by online/offline tabs
- `DONE` Cross-module search and listing coverage (business, products, groups, partnerships)
- `DONE` City-wise listing + country/city master filters with geo import automation pipeline

## 6) Digital Products & Escrow
- `DONE` Business digital products creation
- `DONE` Unique product links
- `DONE` No-refund flag with highlighting
- `DONE` Purchase via platform + 45-day refund/escrow timeline
- `DONE` Payment gateway integration with provider abstraction + Razorpay order/signature/webhook flow
- `DONE` Timed escrow release automation with orchestration endpoint and scheduler wiring
- `DONE` External product API fetch/aggregation with public marketplace rendering

## 7) Wallet & Withdrawals
- `DONE` Wallet top-up and ledger
- `DONE` Refund credits to wallet
- `DONE` Withdrawal requests with details
- `DONE` Admin approve/decline with reason
- `DONE` Admin add/debit wallet with reason
- `DONE` Country-specific dynamic withdrawal field packs/compliance validation
- `DONE` Payout provider integration with provider abstraction + RazorpayX webhook settlement

## 8) Groups & Community
- `DONE` Business-only group creation
- `DONE` Join/unjoin
- `DONE` Public or admin-only messaging mode
- `DONE` Group widget code and join flow
- `DONE` Employee-specific moderation controls for group messaging

## 9) Notification API
- `DONE` Business endpoint creation and secret
- `DONE` Send to user public IDs
- `DONE` User notification center
- `DONE` Spam marking + admin controls
- `DONE` Anti-abuse automation (temporary blocks/spam review) and delivery analytics logs

## 10) Ads & Monetization
- `DONE` Ads manager (business create, admin review, pricing)
- `DONE` Home/directory banner rendering + impression counting
- `DONE` City targeting support
- `DONE` Billing integration for ad usage
- `DONE` Ad click tracking, CTR metrics, and CSV export reporting

## 11) Membership Economics (Verifier Customer + Business Share)
- `DONE` Customer membership purchase/renewal
- `DONE` Business participation setup with minimum discount enforcement
- `DONE` Discount validation logic
- `DONE` Weighted distribution cycle generation + payout credits
- `DONE` External API endpoints (validate/ingest/distribution run)
- `DONE` Scheduler + monitoring + reconciliation automation
- `DONE` All-platform integration kit snippets + offline CSV template + usage visibility

## 12) Reviews & Social Proof
- `DONE` Product reviews with proof-of-purchase requirement
- `DONE` Business response flow on reviews
- `DONE` Conditional negative-review removal when issue resolved
- `DONE` Social proof visibility blocks across product listing and product detail surfaces

## 13) Partnerships
- `DONE` Partnership intent fields captured in onboarding
- `DONE` Dedicated partnership marketplace/chat window
- `DONE` Identity-verified-only partnership chat enforcement
- `DONE` 2% company partnership fee workflow until deal closure

## 14) Followers, Employees, Org Features
- `DONE` Follow business
- `DONE` Employee add/invite flows tied to platform accounts
- `DONE` Employee-wise review/performance module

## 15) Billing & Charges Coverage
- `DONE` Base monthly billing engine (commission, notification usage, ad usage, digital fee)
- `DONE` Full monthly statement coverage for all custom charge families from original scope
- `DONE` Late fee/reminder automation
- `DONE` Reconciliation export APIs (JSON + CSV)

## 16) Security & Reliability
- `DONE` External API throttling baseline platform-wide (shared route limiter across membership/automation/payments/admin APIs)
- `DONE` Unified audit event stream for all sensitive state changes
- `DONE` Runtime hardening and scheduled jobs productionization (run-all orchestration + managed cron endpoint + run monitor + ops alerts)
- `DONE` Admin identity verification controls for partnership safety

## Production Notes
- Configure Vercel cron secret/token envs before enabling scheduled execution.
- Configure Razorpay/RazorpayX credentials and webhook secrets for live settlement.
- Review Firebase rules for your organization policy before launch.
