# Business Verifier Master Scope Checklist

Status legend:
- `DONE` = implemented and wired in UI/routes
- `PARTIAL` = some logic exists, needs deeper production completion
- `PENDING` = not implemented yet

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
- `PARTIAL` Auto-ticket from all possible fraud/report entry points (main order/refund path done)

## 5) Directory & Discovery
- `DONE` Home listing by online/offline tabs
- `PARTIAL` Search and listing coverage currently based on existing datasets/pages
- `DONE` City-wise listing + country/city master filters with geo import automation pipeline

## 6) Digital Products & Escrow
- `DONE` Business digital products creation
- `DONE` Unique product links
- `DONE` No-refund flag with highlighting
- `DONE` Purchase via platform + 45-day refund/escrow timeline
- `PARTIAL` Full payment gateway integration (mock + provider abstraction and webhook paths implemented; live provider handshake pending)
- `PARTIAL` Automatic timed escrow release jobs (automation endpoints + run-all orchestration implemented; external scheduler wiring pending)
- `PARTIAL` External product API fetch/aggregation

## 7) Wallet & Withdrawals
- `DONE` Wallet top-up and ledger
- `DONE` Refund credits to wallet
- `DONE` Withdrawal requests with details
- `DONE` Admin approve/decline with reason
- `DONE` Admin add/debit wallet with reason
- `PARTIAL` Country-specific dynamic withdrawal field packs/compliance depth
- `PARTIAL` Payout provider integration (payout execution flow + logs implemented with mock/provider abstraction; live provider settlement pending)

## 8) Groups & Community
- `DONE` Business-only group creation
- `DONE` Join/unjoin
- `DONE` Public or admin-only messaging mode
- `DONE` Group widget code and join flow
- `PARTIAL` Employee-specific community moderation controls

## 9) Notification API
- `DONE` Business endpoint creation and secret
- `DONE` Send to user public IDs
- `DONE` User notification center
- `DONE` Spam marking + admin controls
- `PARTIAL` Deep anti-abuse automation and delivery analytics

## 10) Ads & Monetization
- `DONE` Ads manager (business create, admin review, pricing)
- `DONE` Home/directory banner rendering + impression counting
- `DONE` City targeting support
- `DONE` Billing integration for ad usage
- `PARTIAL` Rich ad reporting exports and optimization tooling

## 11) Membership Economics (Verifier Customer + Business Share)
- `DONE` Customer membership purchase/renewal
- `DONE` Business participation setup with minimum discount enforcement
- `DONE` Discount validation logic
- `DONE` Weighted distribution cycle generation + payout credits
- `DONE` External API endpoints (validate/ingest/distribution run)
- `PARTIAL` Production scheduler + monitoring + reconciliation automation
- `PARTIAL` Full “all-platform” integration kits/connectors

## 12) Reviews & Social Proof
- `DONE` Product reviews with proof-of-purchase requirement
- `DONE` Business response flow on reviews
- `DONE` Conditional negative-review removal when issue resolved
- `DONE` Social proof visibility blocks across product listing and product detail surfaces

## 13) Partnerships
- `PARTIAL` Partnership intent fields captured in onboarding
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
- `PARTIAL` Runtime hardening and scheduled jobs productionization (run-all orchestration + monitor panel added; external managed scheduler/alerts pending)
- `PARTIAL` Admin identity verification controls for partnership safety

## Execution Order From Here
1. Live payment provider handshake and settlement callbacks (`PARTIAL`)
2. Live payout provider settlement confirmation (`PARTIAL`)
3. External managed scheduler + alerts for automation endpoints (`PARTIAL`)
