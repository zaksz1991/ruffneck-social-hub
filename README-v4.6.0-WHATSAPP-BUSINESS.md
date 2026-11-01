# RuffNeck Social Hub v4.6.0 — WhatsApp Business Cloud API

## Overview

v4.6.0 implements WhatsApp Business as an official provider in RuffNeck Social Hub. It uses Meta's WhatsApp Cloud API and Embedded Signup v4; it does not automate WhatsApp Web or browser sessions.

## Delivered

- Meta Embedded Signup v4 on `/channels/whatsapp`, using the existing Facebook app ID/secret and a dedicated Embedded Signup configuration ID.
- Server-side authorization-code exchange and token inspection. Both `whatsapp_business_management` and `whatsapp_business_messaging` must be granted.
- Phone-number ownership check against the selected WABA, six-digit Cloud API registration PIN submission to Meta, WABA webhook subscription and AES-256-GCM token-vault storage.
- Signed webhook verification using the exact raw request body and `X-Hub-Signature-256`.
- Idempotent inbound message ingestion and status receipt handling, scoped to the correct WhatsApp account and workspace.
- Unified Inbox conversation list and WhatsApp conversation detail page, including message status, assignment, priority and private notes.
- Manual replies and optional existing local-AI reply drafting. AI never sends a message.
- Human review plus a second explicit send confirmation. One send attempt is allowed per reviewed draft; network timeouts, 5xx and rate-limit ambiguity are recorded as `unknown` and locked against retry.
- Free-form text is blocked outside the last-inbound 24-hour customer-service window. Only approved parameter-free templates are surfaced outside that window.
- Template sending requires an operator attestation that customer opt-in has been verified. The actor and timestamp are stored with the send attempt. The business must retain the underlying opt-in evidence independently.

## Deliberate v4.6.0 boundaries

- Inbound text, interactive reply titles and media message metadata/captions are stored. The actual image, video, audio and document files are not downloaded or retained; media messages appear as metadata placeholders.
- Outbound support is text-only plus approved templates that need no variables and no media header. Media, interactive, location, contacts, catalogue/order and variable-bearing templates are not sent.
- No automated customer replies, auto-DMs, bulk/broadcast campaigns, proactive marketing, or automatic template sends.
- WhatsApp conversations support assignment, status, priority and private notes. The platform's existing Instagram/Facebook AI triage, playbooks, customer CRM, SLA analytics and routing automation are not represented as WhatsApp-enabled by this release.
- There is no automatic token refresh in v4.6.0. Reconnect before the returned token expiry; Embedded Signup configurations commonly use a 60-day system-user token. The exact expiry returned by Meta is stored.

## Database

Apply `supabase/migrations/0033_whatsapp_cloud_api_inbox.sql` after `0032_instagram_comment_reply_sending.sql`. Apply only migrations not already applied, in ascending order. Fresh installations apply 0001–0033.

The migration adds workspace-readable, RLS-protected WhatsApp conversation, message, draft, attempt and status-event tables. Sensitive mutations use role-checked RPCs; webhook ingestion and send-result/status recording are service-role-only. Status events are keyed by social account to prevent cross-account message-ID collisions. The migration also extends the existing team workflow RPCs to WhatsApp.

## Environment

Add these server-side values to Vercel Production (and Preview when used):

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- `WHATSAPP_GRAPH_API_VERSION=v26.0` (optional; defaults to this release's configured Meta Graph version)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (or reuse `META_WEBHOOK_VERIFY_TOKEN`)
- `WHATSAPP_APP_SECRET` (optional; defaults to `FACEBOOK_APP_SECRET`)
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or the existing supported `SUPABASE_SERVICE_KEY`)

Never put the service-role key, app secret, webhook verify token or encryption key in a `NEXT_PUBLIC_` variable.

## Meta app configuration

1. In Meta for Developers, enable the WhatsApp product and Facebook Login for Business.
2. Create a new **WhatsApp Embedded Signup v4** configuration. Select WhatsApp Cloud API, system-user access token, WhatsApp Business Account assets and the permissions `whatsapp_business_management` and `whatsapp_business_messaging`.
3. Copy its Configuration ID into `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`.
4. Configure the Meta Webhooks product with callback URL `https://ruffneck-social-hub.vercel.app/api/webhooks/whatsapp` and the exact value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Subscribe the `whatsapp_business_account` object to the `messages` field.
5. Complete any business verification, Tech Provider/partner eligibility, App Review and Advanced Access steps required for the intended multi-client onboarding model. A direct developer integration is not a substitute for Meta's approval to onboard unrelated customer businesses.
6. Use a Meta test WABA and a consenting test recipient first. Configure webhook delivery before testing inbound messages.

The WhatsApp Embedded Signup flow returns a short-lived authorization code and selected WABA/phone IDs. RuffNeck exchanges the code server-side, verifies the granted permissions and checks that the phone belongs to the WABA. The connecting operator supplies a six-digit PIN for Cloud API two-step phone registration. The PIN is sent to Meta during registration and is not stored by RuffNeck. Meta requires the phone number to be registered within 14 days after Embedded Signup; otherwise the number must go through Embedded Signup again.

## GUI installation sequence

1. Extract the complete ZIP using File Explorer.
2. Open the existing `ruffneck-social-hub` GitHub repository on the `main` branch. Merge the included folders and replace only files at matching paths; do not delete existing project files, GitHub workflows or public assets.
3. Use GitHub's **Add file → Upload files** interface to upload the changed/new files, preserving their folder paths, and commit the upgrade to `main`.
4. In Supabase Dashboard → SQL Editor, open and run `0033_whatsapp_cloud_api_inbox.sql` once, after migration 0032 has succeeded.
5. In Vercel → Project → Settings → Environment Variables, add the WhatsApp values above. Save and allow the connected GitHub deployment to build.
6. In Meta App Dashboard, configure the webhook callback and subscribe to `messages`.
7. On RuffNeck, open Channels, select a workspace/brand, choose Connect WhatsApp Business, enter the six-digit two-step PIN and complete Meta Embedded Signup.
8. Send a test message from a consenting test phone to the connected business number. Confirm it appears in the Unified Inbox; reply only after review and explicit send confirmation.

## Verification and limitations

The focused WhatsApp utility/webhook normalizer test suite and source/security audit are included in the ZIP. They do not prove Meta app approval, a live phone registration, webhook delivery, a successful live send, Supabase migration application or Vercel deployment. See `VERIFICATION-v4.6.0.md` for the exact local checks performed and outstanding operational tests.
