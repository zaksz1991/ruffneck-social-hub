# v5.0.0 file manifest

## New files
- APPLY-v5.0.0.txt
- README-v5.0.0-WHATSAPP-REVIEWED-MEDIA-REPLIES.md
- RELEASE-MANIFEST-v5.0.0.md
- RELEASE-NOTES-v5.0.0.md
- VERIFICATION-v5.0.0.md
- src/app/actions/whatsapp-media-replies.ts
- scripts/test-whatsapp-media-replies.mjs
- scripts/audit-whatsapp-media-replies.mjs
- supabase/migrations/0037_whatsapp_reviewed_media_replies.sql

## Replaced files
- package.json
- README.md
- CHANGELOG.md
- docs/STATUS.md
- docs/ROADMAP-AND-GATES.md
- src/lib/integrations/whatsapp-media.ts
- src/app/inbox/whatsapp/[id]/page.tsx
- src/app/api/inbox/whatsapp/media/[assetId]/retrieve/route.ts (v4.9.0 duplicate-expiry-variable build repair)
- scripts/audit-whatsapp-integration.mjs
- scripts/test-whatsapp-media.mjs
- scripts/test-whatsapp-operations.mjs
- scripts/audit-youtube-integration.mjs
- scripts/audit-linkedin-analytics.mjs
- scripts/audit-tiktok-integration.mjs
- scripts/audit-instagram-comments.mjs
- scripts/audit-campaign-intelligence.mjs
- scripts/audit-provider-analytics.mjs

## Database
- Apply `supabase/migrations/0037_whatsapp_reviewed_media_replies.sql` after 0036.

The v4.9.0 inbound-media route is included only to preserve the previously identified `expiresAt` build repair (`tokenExpiresAt`); its retrieval, validation, scanning and retention behavior is otherwise unchanged. No token vault, scanner service or provider webhook source file is replaced.
