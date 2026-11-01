# Release notes — RuffNeck Social Hub v4.1.0

## Official Meta campaign analytics

- Fetch Instagram media insights and Facebook Page post insights for up to five recent published campaign destinations per manual sync.
- Keep provider snapshots separate from manually entered snapshots.
- Add explicit Meta insight-scope gates, Facebook Page task checks, server-side token-vault retrieval, normalized data persistence and protected workspace RPC writes.
- Add eight-second provider request timeouts, no automatic retries, bounded date and record ranges, same-day idempotent upserts and safe error logging.
- Add a pre-build provider analytics audit and a deterministic regression script.

## Database migration

Apply `supabase/migrations/0028_official_meta_campaign_analytics.sql` after migration 0027. Do not reapply migrations already recorded as applied.

## Account reconnection

Existing eligible Meta accounts must reconnect through Channels to grant the additional insights permission. Facebook also requires the `ANALYZE` or `MANAGE` Page task. Meta App Review/Advanced Access may be required for customer assets.

## Verification status

The release's targeted static audits and deterministic regression checks are recorded in `VERIFICATION-v4.1.0.md`. Do not treat those checks as a substitute for the full Next.js build, a live Supabase migration, Meta OAuth permission approval or a deployed-site test.
