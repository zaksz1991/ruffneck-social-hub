# Publishing worker scheduler — v6.8.5

## Purpose

The publishing worker already exposes an authenticated `POST /api/cron/publishing` route. This release adds a GitHub Actions schedule that invokes that route every five minutes and provides a manual `workflow_dispatch` trigger. It does not change provider adapters or claim broader publishing support.

## What runs

- GitHub Actions invokes `https://ruffneck-social-hub.vercel.app/api/cron/publishing` with `POST`.
- The request authenticates with the existing server-side `SOCIAL_PUBLISH_CRON_SECRET` bearer secret.
- The existing worker claims up to three due jobs using `claim_due_publishing_jobs`, dispatches through the existing provider adapters, then writes each outcome through `finish_publishing_job`.
- The workflow logs only aggregate outcome counts. It does not print job IDs, provider IDs, post content, provider error text or secrets.
- The existing worker's supported scheduled dispatch paths remain Instagram single-image posts, Facebook Page single-image posts and LinkedIn organisation text-only posts.

TikTok creator-inbox transfers and YouTube private uploads remain separate user-driven flows. WhatsApp is not a social-feed publishing destination.

## Required configuration

Create one strong random secret of at least 32 characters. Store the exact same value in both locations:

1. Vercel project → Settings → Environment Variables → add `SOCIAL_PUBLISH_CRON_SECRET` for Production. Redeploy Production after saving it.
2. GitHub repository → Settings → Secrets and variables → Actions → Secrets → New repository secret named `SOCIAL_PUBLISH_CRON_SECRET`.

Do not put the value in a workflow file, README, issue, commit, screenshot or ordinary repository variable. Do not reuse the daily subscription `CRON_SECRET` unless the organisation intentionally chooses to share credentials; separate values are preferable.

The Vercel deployment also needs the existing `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` configuration used by the publishing worker.

## Enable and test

1. Commit the files in this package to the repository's default branch (`main`).
2. Confirm GitHub Actions is enabled for the repository.
3. Open Actions → RuffNeck scheduled publishing worker → Run workflow.
4. Confirm the manual run completes successfully. `claimed=0` is a healthy idle result; it means the worker ran and found no due posts.
5. Confirm subsequent scheduled runs appear in the workflow history.
6. For an end-to-end acceptance test, schedule one approved test post on an organisation-owned account whose provider permissions and content format match the supported adapter. Compare the GitHub Actions run, publishing queue state and native provider post. Do not use a customer account or customer content for the first test.

## Operational limits and safety

- GitHub's shortest supported scheduled interval is five minutes. Scheduled runs can be delayed during service load; this is not a precise execution-time guarantee or an SLA.
- Scheduled workflows run from the repository's default branch. A public repository's schedule can be automatically disabled after 60 days without repository activity; inspect and re-enable it when needed.
- The worker claims at most three due jobs per invocation. A busy queue can take multiple runs to drain.
- Each job is processed independently. Failed or ambiguous outcomes remain visible in the publishing queue. Do not blindly retry an item in `needs_review` or `completion_unconfirmed`; first verify the native provider account to avoid duplicate posts.
- The workflow's concurrency group prevents overlapping invocations of this workflow.
- GitHub Actions is an external trigger, not a durable queue. Supabase remains the queue state store and its claim/finish RPCs remain the authoritative state transitions.
- The GitHub HTTP deadline does not extend Vercel Function execution. Confirm the publishing route has enough configured maximum duration in Vercel Project Settings → Functions for its bounded sequential batch. Vercel duration limits depend on plan and Fluid Compute configuration; do not set a duration above the project plan limit. If the route times out, inspect Vercel Function logs and the queue state before manually retrying any ambiguous post.
- The workflow does not run on a new social account connection by itself and does not publish TikTok, YouTube or WhatsApp content through the scheduled public-post queue.

## Verification boundary

Static audits and response-parser tests do not prove that GitHub Actions is enabled, that the two secrets match, that Vercel environment variables are set, or that a provider accepted a post. A successful manual workflow run proves the worker endpoint responded; only a controlled live post with a provider post ID and native provider confirmation proves the corresponding publishing path.
