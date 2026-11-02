# RuffNeck Social Hub v5.5.0 — AI Campaign Performance Coach

## What this upgrade adds

Campaign Intelligence now includes an AI Performance Coach. A workspace member with an authorised role can select a campaign and request an evidence-grounded analysis of its stored performance snapshots.

The coach returns:

- A concise campaign assessment.
- Observations tied to manual or official provider data.
- Practical experiments with a primary metric, priority and review window.
- Data cautions where the sample is small, incomplete or platform definitions differ.

## Evidence and reporting safeguards

- Manual `campaign_metric_snapshots` and official `provider_analytics_snapshots` are loaded and summarised separately.
- Only the latest snapshot per published destination is counted in each source.
- Official destination records are deduplicated by provider and publishing job.
- Engagement and click-through percentages are calculated on the server against reported impressions; rates are not fabricated when impressions are zero.
- Platform totals are described as provider-reported sums, not unique people.
- The AI is instructed not to invent benchmarks, audiences, leads, conversions, platform capabilities or performance causes.
- The server validates and bounds the structured AI response before returning it to the browser.

## Security and operational scope

- AI requests run from a Next.js server action, not from the browser.
- The action verifies the signed-in user, workspace membership, authorised role and campaign/workspace relationship before reading metrics.
- Allowed roles: owner, admin, manager and analyst.
- The action uses the existing server-side `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` settings.
- No provider OAuth scopes, social tokens, Supabase service-role key or new dependencies are introduced.
- No database migration is required. No data is written or stored by this feature.
- The coach does not publish, schedule, upload media, send replies, launch ads or modify campaign settings. All experiments require human review and execution.

## Environment

No new environment variable is needed. Existing `.env.example` already documents:

- `LOCAL_AI_BASE_URL`
- `LOCAL_AI_MODEL`
- `LOCAL_AI_API_KEY` (optional)

The deployed server must be able to reach the configured AI endpoint. A `localhost` or private-LAN model address on a personal computer is not reachable from Vercel's hosted server. For a Vercel deployment, use an HTTPS endpoint reachable by the deployment, or leave the feature disabled until one is available. Keep the API key server-only; never use a `NEXT_PUBLIC_` prefix.

## Test and build integration

- `scripts/test-ai-campaign-insights.mjs` covers latest-snapshot selection, source separation, rate calculations, response validation and prompt guardrails.
- `scripts/audit-ai-campaign-insights.mjs` checks server authorization, workspace scoping, read-only behaviour and page integration.
- The new audit is added to the production build chain.
- The focused test is added to the existing `npm test` chain.

## Files in this overlay

Replace existing files:

- `package.json`
- `src/app/campaigns/page.tsx`

Add new files:

- `src/app/actions/campaign-ai-insights.ts`
- `src/app/campaigns/ai-campaign-insights.tsx`
- `src/app/campaigns/ai-campaign-insights.css`
- `src/lib/ai/campaign-insights.ts`
- `scripts/audit-ai-campaign-insights.mjs`
- `scripts/test-ai-campaign-insights.mjs`

## Database changes

None. Existing campaign and analytics tables are reused. Do not run a new SQL migration for v5.5.0.
