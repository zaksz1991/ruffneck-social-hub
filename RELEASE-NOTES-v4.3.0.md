# RuffNeck Social Hub v4.3.0 — TikTok official integration

## Highlights

- TikTok OAuth connection with encrypted access/refresh token storage and server-side refresh-token rotation.
- Official TikTok Display API video metrics: views, likes, comments and shares for up to 20 recent videos per connected creator account on a manual sync.
- A separate TikTok analytics section in the cross-platform Analytics dashboard.
- Consent-based transfer of one approved video to the TikTok creator inbox using the official PULL_FROM_URL endpoint and an exact TikTok-verified media-host allowlist.
- Manual TikTok upload status refresh and duplicate-protection for ambiguous outcomes.

## Important feature boundary

Provider analytics snapshots can only be persisted through the server-side service-role path after provider API retrieval; direct authenticated RPC writes are revoked. This is not TikTok Direct Post and does not enable scheduled or automatic TikTok publishing. The creator must finish the draft in TikTok, choose visibility and publish manually. `content_publish` and `direct_post_enabled` remain false. No TikTok inbox, comment or messaging automation was added.

## Database and setup

Apply `supabase/migrations/0030_tiktok_video_analytics_and_inbox_uploads.sql` once after migration 0029. Configure `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_VERIFIED_MEDIA_HOSTS`, the existing token-encryption key and the canonical site URL. TikTok app product/scope approval and domain-prefix verification are independent provider requirements. Reconnect eligible accounts after migration to obtain the required scopes.

See `README-v4.3.0-TIKTOK-INTEGRATION.md` for setup, security boundaries and operational steps.

## Verification boundary

This package includes static integration audits and deterministic regression checks. A source audit is not a production build. The complete Next.js production build, live Supabase migration, TikTok OAuth, token refresh, analytics API response and creator-inbox transfer must be verified in the target deployment before release certification.
