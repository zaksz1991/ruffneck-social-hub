# v4.0.0 Release Manifest

Base: complete v3.9.0 project ZIP.

New route: `/campaigns`.

New database migration: `0027_publishing_campaign_intelligence.sql` (apply after 0026).

New source files:
- `src/app/campaigns/page.tsx`
- `src/app/campaigns/campaigns.css`
- `src/app/actions/campaigns.ts`
- `src/lib/campaigns/intelligence.mjs`
- `scripts/audit-campaign-intelligence.mjs`
- `scripts/test-campaign-intelligence.mjs`
- `README-v4.0.0-PUBLISHING-CAMPAIGN-INTELLIGENCE.md`
- `RELEASE-NOTES-v4.0.0.md`
- `RELEASE-MANIFEST-v4.0.0.md`
- `VERIFICATION-v4.0.0.md`

Updated files:
- `src/app/page.tsx`
- `supabase/migrations/0027_publishing_campaign_intelligence.sql`
- `package.json`
- `tsconfig.json`
- `CHANGELOG.md`

Database tables: `publishing_campaigns`, `campaign_content_items`, `campaign_metric_snapshots`.

Database RPCs: `create_publishing_campaign`, `update_publishing_campaign_status`, `link_content_to_campaign`, `record_campaign_metric_snapshot`.

No new environment variables. No new social-platform permissions. Provider analytics ingestion is not included.
