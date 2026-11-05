# RuffNeck Social Hub v6.6.0 — Daily Subscription Lifecycle Automation

## Purpose
v6.6.0 builds on the v6.5.0 lifecycle console with a once-daily, authenticated Vercel Cron processor. It reduces the need for an administrator to manually move subscriptions into a past-due grace state after the paid period has elapsed.

## Automatic actions
- Moves `active` subscriptions to `past_due` when `current_period_ends_at` has passed, no cancellation is scheduled, and no later approved renewal has updated the record. The existing five-day grace window begins.
- Finalizes a scheduled cancellation only when the provider cancellation was already confirmed by an administrator and the paid period has ended.
- Uses row-level `FOR UPDATE SKIP LOCKED`, a transaction-scoped advisory lock, bounded batches, and a service-role-only RPC. Run summaries are stored in `workspace_subscription_lifecycle_runs` and displayed on `/platform/billing-lifecycle`.

## Explicit non-actions
- Does not call Flutterwave or verify a payment.
- Does not approve manual payment reviews or activate/renew subscriptions. The protected payment approval flow remains authoritative.
- Does not expire subscriptions merely because the grace period elapsed. Grace-ended subscriptions remain for administrator review.
- Does not cancel the recurring payment plan at Flutterwave.

## Schedule and environment
- Vercel Cron: `0 3 * * *` (03:00 UTC daily). Nigeria is UTC+1, so this maps to the 04:00 hour locally. On Vercel Hobby the invocation can occur at any point in the configured hour.
- Add server-only `CRON_SECRET` (recommended at least 32 random characters) to Preview and Production. It must not be a `NEXT_PUBLIC_` variable and must not be the same as `FLW_SECRET_HASH`.
- Existing `SUPABASE_SERVICE_ROLE_KEY` or supported service-key fallback is required server-side.

## New route
`GET /api/cron/subscription-lifecycle`, invoked by Vercel Cron using `Authorization: Bearer <CRON_SECRET>`. Unauthorized calls return 401; missing configuration returns 503. Responses expose only aggregate counts and run IDs, never customer or payment details.

## Database
New migration `0050_daily_subscription_lifecycle_processor.sql`, after 0049. It adds a protected run-summary table and the service-role-only batch RPC. Apply it once. No new payment or billing credentials are introduced.

## Validation status
Pure helper tests and static integration audit are included and run during package preparation. The complete repository test suite, Next.js production build, remote Supabase migration and actual Vercel Cron execution have not been performed in this environment.
