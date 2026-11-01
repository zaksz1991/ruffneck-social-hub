# RuffNeck Social Hub v4.0.0 — Publishing Campaign Intelligence

## Included

- `/campaigns` workspace campaign portfolio.
- Campaign creation by brand with objective, start/end dates, optional HTTPS landing page and unique generated UTM campaign slug (same-name campaigns receive distinct tracking identifiers).
- Campaign status controls for owners, admins and managers.
- Same-brand content linking for owners, admins, managers and publishers.
- UTM link builder for Facebook, Instagram, LinkedIn, TikTok, YouTube, X and WhatsApp.
- Manual performance snapshots for provider-confirmed publishing destinations: impressions, reach, likes, comments, shares, saves, link clicks, leads and conversions.
- Latest-snapshot-per-destination campaign rollups so subsequent snapshots do not double-count a post's previous values.
- Campaign summary cards and responsive workspace navigation.

## Important data boundary

This release does not connect to social-platform insights APIs and does not automatically retrieve impressions, reach, engagement, website sessions or conversions. Metric snapshots are entered by an authorised workspace member from the platform's native insights. The UI labels these figures as manual. UTM tags identify campaign traffic sources but do not collect analytics themselves; a separate website analytics setup is required.

Publishing destination totals count each provider/account queue result independently. If the same content is published to three accounts, it is three publishing destinations.

## Database

Apply `supabase/migrations/0027_publishing_campaign_intelligence.sql` once after confirming migrations 0001–0026 are already applied.

The migration creates:

- `publishing_campaigns`
- `campaign_content_items`
- `campaign_metric_snapshots`

All three tables have workspace-member read policies. Direct authenticated/anonymous insert, update and delete grants are revoked. Writes use four narrow `SECURITY DEFINER` RPCs that validate `auth.uid()`, workspace role, campaign/brand/content relationships and published queue state. Metric values are bounded whole-number snapshots. Re-entering the same destination/date updates that day's snapshot rather than creating a duplicate.

## Roles

- Owners, admins, managers and publishers can create campaigns and link same-brand content.
- Owners, admins and managers can change campaign status.
- Owners, admins, managers, publishers and analysts can record performance snapshots.
- Members without these permissions retain workspace-scoped read access.

## Use

1. Apply migration 0027.
2. Open Campaigns from the dashboard.
3. Create a campaign for a brand and objective.
4. Link drafts, in-review or approved content belonging to the same brand.
5. Schedule and publish content through the existing publishing workflow.
6. After a destination has a provider-confirmed `succeeded` publishing result, enter its metrics from the relevant platform's native insights.
7. Use the generated tagged links in organic social posts when a campaign landing page is configured.

A campaign may be linked to content before publishing. Metrics cannot be recorded until a linked content item has a successful publishing destination.

## Verification

The release adds:

- `scripts/audit-campaign-intelligence.mjs`
- `scripts/test-campaign-intelligence.mjs`
- `src/lib/campaigns/intelligence.mjs`

The build script runs the campaign integration audit before `next build`; the test script runs the standalone campaign regression checks before Vitest. Passing static/import checks is not equivalent to a completed Next.js production build. See `VERIFICATION-v4.0.0.md` for the exact verification boundary.
