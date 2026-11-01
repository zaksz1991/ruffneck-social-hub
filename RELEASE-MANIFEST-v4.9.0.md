# v4.9.0 release manifest

## New application files
- `src/lib/integrations/whatsapp-media.ts`
- `src/app/api/inbox/whatsapp/media/[assetId]/retrieve/route.ts`
- `src/app/api/inbox/whatsapp/media/[assetId]/route.ts`
- `src/app/api/cron/whatsapp-media-retention/route.ts`
- `supabase/migrations/0036_whatsapp_secure_media_storage.sql`
- `.github/workflows/whatsapp-media-retention.yml`
- `services/whatsapp-media-scanner/Dockerfile`
- `services/whatsapp-media-scanner/clamd.conf`
- `services/whatsapp-media-scanner/entrypoint.sh`
- `services/whatsapp-media-scanner/server.mjs`
- `scripts/test-whatsapp-media.mjs`
- `scripts/audit-whatsapp-media.mjs`
- `README-v4.9.0-WHATSAPP-SECURE-MEDIA.md`
- `APPLY-v4.9.0.txt`
- `RELEASE-NOTES-v4.9.0.md`
- `RELEASE-MANIFEST-v4.9.0.md`
- `VERIFICATION-v4.9.0.md`

## Modified application files
- `src/lib/webhooks/whatsapp-message.ts` — retain safe provider media metadata from inbound message events.
- `src/app/api/webhooks/whatsapp/route.ts` — store media metadata against the ingested WhatsApp message.
- `src/app/inbox/whatsapp/[id]/page.tsx` — secure media status, retrieval and download controls; retrieval is hidden until scanner configuration is present.
- `src/app/inbox/inbox.css` — secure-media vault presentation and responsive controls.
- `package.json` — version 4.9.0, focused media test/audit scripts and build gate.
- `.env.example` — scanner endpoint and bearer secret variables.
- `README.md` — v4.9.0 scope, boundaries, environment and migration instructions.
- `CHANGELOG.md` — v4.8.0 and v4.9.0 release entries.
- `scripts/audit-linkedin-analytics.mjs`, `scripts/audit-tiktok-integration.mjs`, `scripts/audit-youtube-integration.mjs`, `scripts/audit-instagram-comments.mjs` — build-gate expectations updated to include the new WhatsApp media audit.
- `supabase/migrations/0036_whatsapp_secure_media_storage.sql` — includes a composite foreign key binding each media row to its exact WhatsApp message, conversation, workspace and account.

## Existing files deliberately not replaced
- Existing WhatsApp message-send functions, template rules, 24-hour window enforcement and send-attempt ledger.
- Existing Instagram, Facebook, LinkedIn, TikTok and YouTube provider integrations.
- Existing workspace/RLS, CRM, SLA, routing, publishing and analytics migrations/logic.
- `src/app/actions/whatsapp.ts` remains unchanged; media retrieval is a separate server route.

## New environment variables
- `WHATSAPP_MEDIA_SCANNER_URL`
- `WHATSAPP_MEDIA_SCANNER_TOKEN`

## New operational requirement
- Apply migration `0036_whatsapp_secure_media_storage.sql` after `0035_whatsapp_sla_and_routing.sql`.
- Deploy the included ClamAV scanner container and configure its bearer token.
- Enable `.github/workflows/whatsapp-media-retention.yml` for the 30-day purge.
