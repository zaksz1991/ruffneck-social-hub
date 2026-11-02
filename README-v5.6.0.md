# RuffNeck Social Hub v5.6.0 — Executive Campaign Reporting Pack

## What this upgrade adds

The AI Campaign Performance Coach now produces an exportable campaign report after a successful analysis.

- **CSV export:** downloads campaign metadata, manual and official snapshot totals, platform-by-platform official metrics, AI observations, recommended experiments, data cautions and the suggested review window.
- **Print / Save as PDF:** opens the browser print dialog with a print layout that isolates the campaign report from the rest of the page. Select “Save as PDF” in the browser print destination to create a PDF.
- **Spreadsheet safety:** CSV fields beginning with spreadsheet formula characters are neutralised, and embedded quotes are escaped.
- **Data provenance:** manual snapshots and official provider snapshots remain separate. Provider platform metrics remain individually identified. Cross-platform sums are not represented as unique people.

## Security and operational scope

- Exports are generated in the user's browser from the already-authorised AI analysis result.
- No new server endpoint, database table, migration, OAuth scope, social token, environment variable or dependency is introduced.
- The export is generated only after the existing server action authenticates the user, checks workspace membership and authorises the role.
- Nothing is automatically shared, emailed, uploaded or persisted by this upgrade.
- The feature does not publish, schedule, upload media, send replies, launch ads or modify campaigns.

## Release compatibility

The eight release audit gates that previously rejected v5.5.0 now explicitly accept v5.6.0:

- Campaign Intelligence
- Provider Analytics
- LinkedIn Analytics
- TikTok
- YouTube
- Instagram Comments
- WhatsApp Integration
- WhatsApp Media Replies

Existing audit contracts are otherwise preserved. The build now runs the campaign-report-export audit; the test pipeline runs its focused regression tests.

## Files in this overlay

Replace existing files:

- `package.json`
- `src/app/campaigns/ai-campaign-insights.tsx`
- `src/app/campaigns/ai-campaign-insights.css`
- `scripts/audit-campaign-intelligence.mjs`
- `scripts/audit-provider-analytics.mjs`
- `scripts/audit-linkedin-analytics.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-youtube-integration.mjs`
- `scripts/audit-instagram-comments.mjs`
- `scripts/audit-whatsapp-integration.mjs`
- `scripts/audit-whatsapp-media-replies.mjs`

Add new files:

- `src/lib/reporting/campaign-report-export.ts`
- `scripts/audit-campaign-report-export.mjs`
- `scripts/test-campaign-report-export.mjs`

## Database and environment

No SQL migration or new environment variable is required. The report uses the same stored campaign snapshots and AI result returned by v5.5.0.

## Validation performed

The campaign report exporter regression tests and focused integration audit are run against this overlay. JavaScript syntax checks are also run for the updated scripts. The full repository test suite and Vercel production build require the complete repository and its installed dependencies; they are not claimed as passed here.
