# RuffNeck Social Hub v6.7.0 — Consolidated Billing Upgrade

## Baseline and scope
This package is aligned to the v6.4.0 deployment log at commit `b4dc17f`. It carries forward the v6.5.0 subscription lifecycle controls and v6.6.0 daily lifecycle processor, then adds v6.7.0 workspace billing history. It is a targeted source overlay, not a full application export.

## v6.7.0 — Workspace Billing History
- `/billing/history` provides owner/admin workspace payment history and subscription activity.
- `/api/billing/history/export` provides a server-authorized CSV statement.
- 30-, 90- and 365-day reporting windows.
- Payment status filters.
- Payment transaction ID, invoice reference, amount/currency, provider status, RuffNeck review status and source.
- Safe subscription activity labels and timestamps.
- Workspace membership is verified on page and export; query-supplied workspace IDs must belong to the user's current owner/admin membership set.
- CSV formula injection protection, bounded exports, no customer email/card fields and no private review/event notes or actor IDs.
- No new database migration, environment variable, dependency, Flutterwave API call or payment credential in v6.7.0.

## Carried-forward v6.5.0 — Subscription Lifecycle
- Workspace owners/admins can request or withdraw end-of-period cancellation.
- Platform admins can separately confirm provider cancellation, mark past due, grant bounded grace extensions, expire access after review, or finalize cancellation after paid term end.
- Lifecycle transition events are written to `workspace_subscription_lifecycle_events`.

## Carried-forward v6.6.0 — Daily Lifecycle Processor
- Daily Vercel Cron at `03:00 UTC` calls `/api/cron/subscription-lifecycle`.
- Requires server-only `CRON_SECRET` (at least 32 random characters, different from `FLW_SECRET_HASH`).
- A protected, bounded Supabase batch function marks overdue active subscriptions `past_due` and finalizes only already-confirmed provider cancellations after paid term end.
- Does not contact Flutterwave, infer payment success, approve transactions, automatically expire grace-ended subscriptions or cancel provider plans.

## Migrations
The consolidated ZIP includes 0048 (missing-webhook reconciliation), 0049 (subscription lifecycle) and 0050 (daily processor). Check Supabase migration history and apply only missing migrations in numerical order. v6.7 itself adds no migration.

## Accounting and payment boundary
Only payments marked approved after separate merchant-dashboard inspection have completed RuffNeck manual review. The history page is not a bank-settlement statement or full accounting ledger. Refunds, reversals, chargebacks, provider fees and absent transactions are not inferred. The existing public-key-only Flutterwave mode remains manual-verification mode until a real V3 Live Secret Key is available and an automated verification implementation is independently tested.

## Validation performed locally
- New workspace billing-history unit tests: passed.
- New workspace billing-history integration audit: passed.
- Existing v6.5/v6.6 focused billing regression tests: passed.
- Changed TS/TSX syntax transpilation: passed.
- JavaScript syntax checks and package JSON parse: passed.
- Final ZIP integrity: passed.

Not performed: full repository `npm test`, full Next.js production build, remote migrations, live Cron invocation, live Flutterwave payment or bank settlement verification.
