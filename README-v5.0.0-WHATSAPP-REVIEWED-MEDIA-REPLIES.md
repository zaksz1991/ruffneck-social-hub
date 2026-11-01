# RuffNeck Social Hub v5.0.0 — WhatsApp reviewed media replies

## What this upgrade adds

This incremental patch also includes the narrow v4.9.0 Vercel compile repair: the token-expiry local is named `tokenExpiresAt`; the separate 30-day media-retention `expiresAt` is preserved.

A team member can prepare a reply using a media attachment that a customer has already sent, provided the attachment passed the v4.9.0 validation and ClamAV scan and remains within its private 30-day retention period. The user prepares a media draft, another authorised workspace operator can review it, and a separate confirmation is required to send it.

The application uploads the scanned file to Meta's WhatsApp Cloud API, receives a temporary provider media ID, then sends one message through the existing phone-number `/messages` endpoint. The source media is never exposed through a public URL.

## Supported outbound formats

| Message type | Accepted MIME types | Release ceiling |
|---|---|---:|
| Image | JPEG, PNG | 5 MiB |
| Video | MP4, 3GPP | 16 MiB |
| Audio | AAC, MP4/M4A, MPEG/MP3, AMR | 16 MiB |
| Document | PDF, plain text | 16 MiB |

The application is deliberately more restrictive than some provider maximums because the current inbound scanner and private vault have a 16 MiB ceiling. WebP is excluded because it is used for WhatsApp stickers with different constraints. OGG audio is excluded because WhatsApp requires the Opus codec and the current scanner does not verify codec/channel properties. The code does not infer those properties from the MIME label.

## User workflow

1. Receive an inbound media message.
2. Retrieve it manually. Meta's SHA-256, MIME, size and file signature are checked; a clean ClamAV result is required before the file is stored privately.
3. While the 24-hour customer-service window is open, select **Prepare media reply** on an eligible clean attachment.
4. Add an optional caption for image/video/document. Audio captions are not accepted.
5. An authorised operator reviews the recipient, attachment and caption.
6. A second explicit confirmation starts one send attempt.
7. The existing WhatsApp status webhooks update the outbound message to sent, delivered, read or failed.

Only the latest inbound message's media attachment can be prepared. If a newer inbound message arrives, the draft becomes stale and must be recreated. A clean attachment can have only one active media reply draft; after it is sent it cannot be sent again through this flow.

## Security and delivery rules

- Uses the existing official Meta Cloud API connection and encrypted token vault.
- No WhatsApp Web automation or unofficial gateway is used.
- No arbitrary local file upload is introduced. Only a clean private-vault asset is eligible.
- Server rechecks workspace/account/conversation binding, scan state, retention deadline, exact private storage path, file size, SHA-256 and file signature before provider upload.
- SQL independently checks workspace membership, role, source message freshness, clean asset state, connection capabilities and the 24-hour service window.
- Review and send are separate actions. `client_approver` can prepare drafts but cannot review or send. Owner, admin, manager and publisher roles can review and send.
- A unique attempt row is created immediately before the customer-send request. A failed, unknown or unrecordable send cannot be retried from that draft.
- A timeout during the media-upload stage is safe to retry because uploading a media object alone does not send a customer message. A timeout during the final `/messages` stage is unknown and locked.
- No automatic replies, broadcasts, mass outreach, message-tag bypass, template media headers or media sends outside the 24-hour window are enabled.

## Installation

1. Merge the supplied replacement `package.json`, `README.md`, `CHANGELOG.md`, `docs/STATUS.md`, `docs/ROADMAP-AND-GATES.md`, WhatsApp conversation page, media helper and audit-script updates into the current repository. Add the new server action, migration, tests and docs at their exact paths.
2. The bundled `src/app/api/inbox/whatsapp/media/[assetId]/retrieve/route.ts` retains the `tokenExpiresAt` build repair from the prior Vercel error.
3. Apply `supabase/migrations/0037_whatsapp_reviewed_media_replies.sql` once, after migration 0036 has succeeded.
4. Confirm the existing `WHATSAPP_MEDIA_SCANNER_URL` and `WHATSAPP_MEDIA_SCANNER_TOKEN` are configured and that the scanner host has adequate memory.
5. Deploy through the normal GitHub-to-Vercel flow.
6. Test one authorised image, video, audio and document reply in a controlled business test conversation. Verify inbound and outbound webhook receipts.

No new environment variables are introduced. Do not apply migration 0037 twice. Existing v4.9.0 media objects and text/template drafts remain unchanged.

## Meta API shape

The integration uploads the validated bytes as multipart form data to `/{PHONE_NUMBER_ID}/media` with `messaging_product=whatsapp` and the declared MIME type, then sends the returned media ID in the corresponding image/video/audio/document object on `/{PHONE_NUMBER_ID}/messages`. The upload uses the official Meta-hosted Cloud API endpoint and bearer token.
