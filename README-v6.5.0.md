# RuffNeck Social Hub v6.5.0 — Subscription Lifecycle Management

## Release purpose
v6.5.0 extends the v6.4.0 billing and collections baseline with a controlled subscription lifecycle console. It also removes stale exact-version assertions from the v6.4 billing audits that otherwise fail when the package version advances.

## New routes
- `/platform/billing-lifecycle` — platform billing administrator console.
- `/billing/subscription` — subscription cancellation controls for workspace owners/admins.

## Lifecycle controls
- Workspace owners/admins can record or withdraw an end-of-period cancellation request.
- A platform administrator separately confirms that the recurring Flutterwave plan was cancelled in the merchant dashboard.
- Access remains available through the paid period; cancellation is finalized only after the provider cancellation is confirmed and the paid period has ended.
- When an active subscription reaches its paid-period end without a renewal, an administrator can mark it past due after inspecting Flutterwave. This starts a five-day grace period.
- An administrator can extend grace by 1–30 days, or expire access after the grace deadline and another provider-dashboard review.
- Confirmed renewals clear old cancellation and grace-period metadata and move the subscription back to active through the existing protected renewal function.
- Database triggers record lifecycle transitions in `workspace_subscription_lifecycle_events`. Event notes are readable only through the platform server-side console; workspace users do not receive access to platform review notes.

## Provider and automation boundary
This remains Flutterwave V3 Public-Key-only checkout with manual payment verification. A workspace cancellation request does not cancel the provider's recurring plan. RuffNeck cannot make that provider API call without the merchant's V3 Secret Key. An administrator must cancel the plan in Flutterwave Dashboard and then confirm that action in RuffNeck.

There is no cron job or background expiry processor. Lifecycle transitions are explicit administrator actions after checking Flutterwave. A webhook or browser redirect alone never activates an initial payment or renewal. The existing manual payment-review process remains mandatory.

## Database
New migration: `0049_subscription_lifecycle_management.sql`.

Prerequisites: 0043, 0046, 0047 and 0048. Migration 0048 was part of the earlier missing-webhook reconciliation release; verify migration history and run it only if it has not already succeeded. Run migration 0049 once after 0048. Migration 0049 adds lifecycle timestamps, an internal event table, guarded cancellation/grace/expiry functions, event triggers and a renewal-function update that clears stale lifecycle flags.

No new environment variables or dependencies are introduced.

## Build-audit compatibility repair
The following audits now use compatible-release lower bounds instead of stale package-version equality checks:
- `audit-flutterwave-operations.mjs`
- `audit-missing-webhook-reconciliation.mjs`
- `audit-billing-collections-analytics.mjs`

This prevents the 6.4.0 build failure where an audit still required package version 6.3.0, and avoids repeating the same failure on later releases.

## Validation performed
- Subscription lifecycle unit tests: passed.
- Subscription lifecycle integration audit: passed.
- Flutterwave operations tests: passed.
- Missing-webhook reconciliation tests and integration audit: passed.
- Billing collections analytics tests and integration audit: passed.
- JavaScript syntax checks: passed.
- TypeScript/TSX transpilation checks: passed.

Not performed: complete repository `npm test`, full Next.js production build, remote Supabase migration execution, live Flutterwave cancellation, or live renewal. The ZIP is an overlay for the existing repository, not a full application export.
