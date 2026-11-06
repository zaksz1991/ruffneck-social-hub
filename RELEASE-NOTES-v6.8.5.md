# RuffNeck Social Hub v6.8.5 — Publishing Worker Activation

## Core change

Adds a GitHub Actions worker trigger that calls the existing authenticated publishing endpoint every five minutes, with a manual run option. This addresses a deployment gap: the existing `vercel.json` schedules the daily subscription lifecycle processor but does not itself schedule the publishing worker.

## Included

- `.github/workflows/publishing-worker.yml` — five-minute scheduled invocation and manual trigger.
- `scripts/lib/publishing-worker-response.mjs` — strict, privacy-conscious worker response parser.
- `scripts/report-publishing-worker-response.mjs` — aggregate-only workflow output.
- `scripts/test-publishing-worker-trigger.mjs` — focused response validation tests.
- `scripts/audit-publishing-worker-trigger.mjs` — build-time contract audit for schedule, authentication and worker lifecycle.
- `scripts/audit-client-approval-portal.mjs` — changes the v6.8.0 exact version pin into a v6.8.0 minimum, preserving all feature contracts.
- `scripts/audit-publishing-capability-guard.mjs` — advances the release assertion to v6.8.5 and requires the worker trigger audit.
- `package.json` — advances to 6.8.5 and includes the new audit and tests in build/test.
- `README.md` — restores the full organisation-facing documentation and dependency-lockfile disclosure required by the organisation-readiness audit.
- `docs/PUBLISHING-WORKER-SCHEDULER-v6.8.5.md` — secret setup, activation and controlled live-test instructions.

## No changes

- No database migration.
- No provider OAuth scope or adapter expansion.
- No new npm dependency.
- No change to TikTok or YouTube user-driven workflows.
- No automatic retry of ambiguous provider publish outcomes.
- No replacement of the existing daily subscription lifecycle cron.

## Required configuration

The existing `SOCIAL_PUBLISH_CRON_SECRET` must be configured in Vercel Production and as a GitHub Actions repository secret with exactly the same value. The Vercel deployment must also retain its existing Supabase service-role settings.

## Honest release boundary

This package activates the existing scheduled publishing worker for the currently implemented Instagram single-image, Facebook Page single-image and LinkedIn text-only dispatch adapters. It does not establish successful live posting until a controlled post is confirmed in the native provider account.
