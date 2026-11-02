# RuffNeck Social Hub v5.7.0 — Campaign Health Monitor

## What this upgrade adds

The AI Campaign Performance Coach now includes a deterministic Campaign Health Monitor. It evaluates evidence quality alongside the AI narrative and includes the checks in the downloadable CSV report.

The monitor checks:

- **Snapshot freshness:** identifies missing, stale, malformed or future-dated snapshot dates. Seven days is treated as current; snapshots older than fourteen days need refresh.
- **Destination coverage:** distinguishes no destinations, a single-destination sample and multiple tracked destinations.
- **Evidence provenance:** reports whether the analysis contains manual snapshots, official provider snapshots or both.
- **Rate denominators:** flags when impressions are missing or zero and engagement/click rate calculations cannot be supported.
- **AI data cautions:** highlights cautions returned by the model so they are not overlooked.

## Important interpretation rules

- Manual and official provider snapshots remain separate.
- Manual destination counts and official destination counts are displayed separately and are never added together by the health monitor.
- The monitor does not invent an overall numerical score, external benchmark, ROI, conversion rate or platform average.
- A clear status means only that these specific deterministic checks found no issue. It does not guarantee complete or accurate source data.
- Official platform metric definitions may differ. Cross-platform totals are not unique people.

## User experience

After generating a campaign analysis, users see a Campaign Health Monitor panel with an overall evidence status and individual checks, each with a clear next step. CSV downloads include the overall status and all health checks. The existing browser Print / Save as PDF report includes the new panel.

## Build and release compatibility

- Release version: `5.7.0`.
- The v5.6.0 AI Campaign Insights audit hotfix is included as the base.
- All eight previously version-gated integration audits preserve historical allow-lists and now accept any valid semantic version at or above `5.6.0`. This avoids repeating the same release-version build failure on later minor or major upgrades.
- Campaign Report Export audit uses a forward-compatible minimum version check and verifies the v5.7.0 health monitor integration.
- Build pipeline runs `audit:campaign-health`.
- Test pipeline runs `test-campaign-health.mjs`.

## Infrastructure impact

- No SQL migration.
- No new dependencies.
- No new environment variables.
- No OAuth permission or social-provider scope changes.
- No change to publishing, scheduling, message sending, ads, or campaign mutation workflows.

## Overlay files

### Replace existing files
- `package.json`
- `src/app/campaigns/ai-campaign-insights.tsx`
- `src/app/campaigns/ai-campaign-insights.css`
- `src/lib/reporting/campaign-report-export.ts`
- `scripts/audit-ai-campaign-insights.mjs`
- `scripts/audit-campaign-report-export.mjs`
- `scripts/audit-campaign-intelligence.mjs`
- `scripts/audit-provider-analytics.mjs`
- `scripts/audit-linkedin-analytics.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-youtube-integration.mjs`
- `scripts/audit-instagram-comments.mjs`
- `scripts/audit-whatsapp-integration.mjs`
- `scripts/audit-whatsapp-media-replies.mjs`
- `scripts/test-campaign-report-export.mjs`

### Add new files
- `scripts/lib/release-compat.mjs`
- `scripts/test-release-compat.mjs`
- `src/lib/ai/campaign-health.mjs`
- `src/lib/ai/campaign-health.d.mts`
- `scripts/audit-campaign-health.mjs`
- `scripts/test-campaign-health.mjs`

## Validation status

The new pure helper regression tests, targeted integration audit, JavaScript syntax checks, and ZIP integrity checks are run against this overlay. The full repository `npm test`, typecheck, and Vercel production build require the complete repository and are not claimed as passed here.
