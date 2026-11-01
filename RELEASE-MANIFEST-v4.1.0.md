# Release manifest — RuffNeck Social Hub v4.1.0

## Included

- Complete cumulative RuffNeck Social Hub project based on the supplied v4.0.0 source package.
- Official Meta post-level analytics sync for Facebook Pages and Instagram professional accounts.
- New Supabase migration `0028_official_meta_campaign_analytics.sql`.
- Separate provider analytics snapshots and campaign UI rollups.
- Explicit OAuth-scope and Facebook Page task checks.
- Server-only encrypted token retrieval; no raw API payload or token storage in analytics snapshots.
- Pre-build integration audit and deterministic provider analytics regression tests.
- Release guide, changelog and verification boundaries.

## Executed checks

- Internal import/export and source syntax audit: **passed, 146 TypeScript/JavaScript files**.
- Provider analytics integration audit: **passed**.
- Provider analytics regression checks: **15/15 passed**.
- Existing Node integration and regression scripts: **passed** (inbox workflow, saved replies, SLA, AI triage, reply safety, reply playbooks, routing automation, automation insights, customer CRM and campaign intelligence).
- Targeted TypeScript check for provider helper, campaign action and Campaigns page: **passed using temporary framework/Supabase declaration stubs**. This is not a substitute for the complete project typecheck.
- Provider metric normalizer runtime checks: **4 assertions passed**.
- ZIP integrity: verified after archive creation.

## Not verified

- Full Vitest run: not run; package dependency installation timed out in the local environment.
- Full Next.js production build: pre-build cleanup and all configured audits passed, but the final `next build` command could not start because the Next.js executable was unavailable after dependency installation timed out.
- Supabase migration execution and PostgreSQL runtime behavior: not run against the user's project.
- Meta OAuth scope approval, account reconnection and live API calls: not run.
- Vercel deployment and browser verification: not run.

## Deployment requirement

Apply migration 0028 once after migration 0027. Reconnect eligible Facebook Pages and Instagram professional accounts from Channels to grant the new insights permissions. A successful ZIP audit does not certify production deployment; Vercel must complete the full build in the target repository.
