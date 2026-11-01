# Release manifest — v4.8.0

## Database
- `supabase/migrations/0035_whatsapp_sla_and_routing.sql`

## Routing logic and UI
- `src/lib/inbox/routing-rules.ts`
- `src/lib/inbox/routing-rules.test.ts`
- `src/app/actions/inbox.ts`
- `src/app/inbox/automation/page.tsx`
- `src/app/inbox/automation/insights/page.tsx`

## SLA UI
- `src/app/inbox/sla/page.tsx`

## Regression and build guards
- `scripts/test-whatsapp-sla-routing.mjs`
- `scripts/audit-whatsapp-sla-routing.mjs`
- `scripts/audit-inbox-automation.mjs`
- `scripts/audit-campaign-intelligence.mjs`
- `scripts/audit-provider-analytics.mjs`
- `scripts/audit-linkedin-analytics.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-youtube-integration.mjs`
- `scripts/audit-instagram-comments.mjs`
- `scripts/audit-whatsapp-integration.mjs`
- `scripts/test-whatsapp-operations.mjs`
- `package.json`

## Release documentation
- `README.md`
- `CHANGELOG.md`
- `docs/ROADMAP-AND-GATES.md`
- `docs/STATUS.md`
- `README-v4.8.0-WHATSAPP-SLA-ROUTING.md`
- `APPLY-v4.8.0.txt`
- `RELEASE-NOTES-v4.8.0.md`
- `RELEASE-MANIFEST-v4.8.0.md`
- `VERIFICATION-v4.8.0.md`

No existing provider connection, publishing, inbox reply, media or customer CRM module is intentionally removed by this release.
