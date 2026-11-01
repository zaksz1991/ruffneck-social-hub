# Release Manifest — v4.7.0

Base: complete RuffNeck Social Hub v4.6.0 source package.

## Added
- `supabase/migrations/0034_whatsapp_crm_and_ai_triage.sql`
- `README-v4.7.0-WHATSAPP-CRM-AI.md`
- `RELEASE-NOTES-v4.7.0.md`
- `RELEASE-MANIFEST-v4.7.0.md`
- `VERIFICATION-v4.7.0.md`
- `scripts/test-whatsapp-operations.mjs`
- `scripts/audit-whatsapp-operations.mjs`

## Updated
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `docs/STATUS.md`
- `docs/ROADMAP-AND-GATES.md`
- `src/app/actions/inbox-customers.ts`
- `src/app/actions/inbox.ts`
- `src/app/inbox/customers/page.tsx`
- `src/app/inbox/conversation-ai-triage.tsx`
- `src/app/inbox/whatsapp/[id]/page.tsx`
- `src/app/channels/page.tsx`
- `scripts/audit-youtube-integration.mjs`
- `scripts/audit-instagram-comments.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-linkedin-analytics.mjs`

## Migration sequence
`0034_whatsapp_crm_and_ai_triage.sql` follows `0033_whatsapp_cloud_api_inbox.sql`.
