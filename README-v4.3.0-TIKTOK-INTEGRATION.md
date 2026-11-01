# RuffNeck Social Hub v4.3.0 — TikTok account, analytics and creator-inbox video transfer

## Included

- Official TikTok Login Kit OAuth v2 connection using `user.info.basic`, `video.list` and `video.upload` scopes.
- Encrypted server-side access/refresh token bundle storage and refresh-token rotation.
- Manual Display API sync for up to five eligible creator accounts and up to 20 recent public videos per account.
- Workspace-scoped snapshots for TikTok video views, likes, comments and shares, separate from Facebook/Instagram/LinkedIn campaign snapshots.
- Human-consented transfer of one approved `.mp4` or `.mov` video from a TikTok-verified HTTPS media host into the creator's TikTok app inbox using the official PULL_FROM_URL upload path.
- Manual upload-status refresh and an audit history for transfer outcomes.
- Manager-only manual reconciliation controls for an ambiguous transfer: confirm it was not uploaded (which permits a new transfer), confirm it reached the creator inbox, or confirm it was already published. Every choice is recorded in a workspace audit event.
- Explicit gating: TikTok direct/public publishing and scheduled TikTok dispatch remain disabled.

## TikTok developer setup

1. Create or use a TikTok developer app with Login Kit and the approved Display API and Content Posting API products needed by the requested scopes.
2. Register this exact OAuth callback URL in the TikTok app: `https://YOUR_PUBLIC_DOMAIN/api/integrations/tiktok/callback`.
3. Enable the `user.info.basic`, `video.list` and `video.upload` scopes in the app. Approval and production access are determined by TikTok; a successful local source audit does not grant these permissions.
4. For PULL_FROM_URL, complete TikTok's URL-prefix/domain verification for the exact media hostnames the app will fetch. The URL must be publicly reachable by TikTok over HTTPS and must not require cookies, authorization headers or redirects.
5. Set the Vercel server-only variables listed below. Do not prefix secrets with `NEXT_PUBLIC_`.

## Environment variables

- `TIKTOK_CLIENT_KEY`: TikTok app client key.
- `TIKTOK_CLIENT_SECRET`: TikTok app client secret.
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: existing 32-byte base64 or 64-character hex key used by the server token vault.
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS production site origin.
- `TIKTOK_VERIFIED_MEDIA_HOSTS`: comma-separated exact hostnames TikTok has verified, e.g. `media.example.com,cdn.example.com`. Do not add wildcards, schemes, ports or paths.
- Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` remain required for the corresponding Supabase operations. The service-role key remains server-only.

## Account connection

Open Channels, choose the target brand and connect TikTok. The callback verifies the signed, cookie-bound OAuth state, exchanges the code server-side, reads the TikTok profile, validates `open_id` and scopes, encrypts the complete access/refresh token bundle, and stores the account through a role-checked Supabase function. Existing TikTok accounts connected to a different workspace or brand are rejected instead of silently moved.

The returned scopes are stored exactly from the provider's grant (restricted to the scopes this release understands). `video.list` enables public video analytics; `video.upload` enables the separate native-inbox transfer. `content_publish` is explicitly false.

## Analytics sync

Open Analytics and select **Sync TikTok video insights**. The server checks workspace membership, connected account state, the `video.list` scope and the analytics capability, refreshes expiring credentials if needed, then requests up to 20 latest account videos from TikTok's Display API. It stores one same-day upsert per account/video and exposes the latest snapshot per distinct video.

These are TikTok public video counters, not reach, unique audience, ad performance, campaign attribution, clicks, website leads or conversions. TikTok video snapshots are kept separate from the cross-platform campaign table because the Display API list is account-scoped and not inherently linked to RuffNeck publishing jobs or campaigns.

## Transfer an approved video into TikTok

Open Publishing Queue → **Send an approved video to TikTok**. Select content with exactly one public `.mp4` or `.mov` URL and a connected TikTok account belonging to the same brand. The user must confirm the workspace owns or is authorized to transfer the media. The server checks `video.upload`, the exact hostname allowlist, HTTPS, the file extension and the approved content state before requesting the official PULL_FROM_URL inbox upload.

A successful transfer sends the video to the creator's TikTok inbox. The creator must open TikTok, review the draft, add/adjust the caption, choose privacy and complete the final publish action inside the TikTok app. RuffNeck does not set privacy or publish automatically. The transfer is not a scheduled publishing-queue job.

If the network outcome is ambiguous after the upload request is sent, the record is marked `unknown` and retry is blocked to avoid creating duplicate transfers. Check the upload record and reconcile manually before starting another transfer.

## Database migration

New migration: `supabase/migrations/0030_tiktok_video_analytics_and_inbox_uploads.sql`.

- Existing databases already upgraded through v4.2.0 / migration 0029: apply migration 0030 once.
- Older databases: apply only each migration that has not yet succeeded, in ascending order. Never rerun a migration already recorded as applied.
- Fresh installations: apply migrations 0001 through 0030 in order.

Migration 0030 adds role-checked OAuth storage and analytics RPCs, workspace-readable but browser-write-protected analytics snapshots, and a consent-ledger for TikTok creator-inbox uploads. It does not grant direct publishing or add TikTok to the scheduled publishing worker.

## Build and acceptance boundaries

`npm run build` now runs the existing internal-import, inbox, campaign and provider checks plus `audit:tiktok` before `next build`. `npm test` includes deterministic TikTok OAuth, token parsing, URL allowlist, API normalization and guardrail checks.

Provider analytics writes are accepted only through the server-side service-role path after a live TikTok API response; authenticated browser roles cannot call the snapshot RPC. Unknown upload outcomes are never automatically retried; owners/admins/managers must verify the creator inbox before choosing a manual reconciliation outcome. The source-level tests do not prove TikTok app approval, live OAuth access, token refresh against a real TikTok account, media-host verification, provider delivery or production deployment. Complete Next.js production build and live provider acceptance must still be performed in the deployment environment. Do not describe the release as production-build-certified until the full Vercel build succeeds.
