# Release manifest — v5.2.0

Feature: WhatsApp external opt-out evidence and consent event history.

Required migration: `supabase/migrations/0039_whatsapp_external_opt_out_evidence.sql` after migration 0038.

Changed application files:
- `package.json`
- `CHANGELOG.md`
- `README.md`
- `src/app/actions/whatsapp.ts`
- `src/app/inbox/whatsapp/[id]/page.tsx`
- `src/app/inbox/inbox.css`
- `src/lib/integrations/whatsapp-consent-evidence.ts`
- `src/lib/integrations/whatsapp-consent-evidence.test.ts`
- `supabase/migrations/0039_whatsapp_external_opt_out_evidence.sql`
- `scripts/test-whatsapp-consent-evidence.mjs`
- `scripts/audit-whatsapp-consent-evidence.mjs`
- `scripts/audit-campaign-intelligence.mjs`
- `scripts/audit-instagram-comments.mjs`
- `scripts/audit-linkedin-analytics.mjs`
- `scripts/audit-provider-analytics.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-whatsapp-integration.mjs`
- `scripts/audit-whatsapp-media-replies.mjs`
- `scripts/audit-youtube-integration.mjs`
- `scripts/test-whatsapp-media.mjs`
- `scripts/test-whatsapp-operations.mjs`

Release documentation:
- `APPLY-v5.2.0.txt`
- `README-v5.2.0-WHATSAPP-EXTERNAL-OPT-OUT-EVIDENCE.md`
- `RELEASE-NOTES-v5.2.0.md`
- `RELEASE-MANIFEST-v5.2.0.md`
- `VERIFICATION-v5.2.0.md`

No environment variables added. No new third-party service. No staff-driven opt-in operation.
