# Facebook Pages connection — v1.7.0

This release introduces the shared provider registry and an official Facebook Login flow for connecting Pages to a selected RuffNeck brand.

## What is included

- Facebook OAuth start and callback routes under `/api/integrations/facebook/`.
- Ten-minute signed OAuth state bound to the authenticated user, workspace and brand, plus an HttpOnly state cookie.
- Authorization-code exchange and long-lived user-token exchange on the server.
- Explicit permission verification through the Facebook Graph API `me/permissions` edge.
- Retrieval of managed Pages through `me/accounts`, with cursor pagination and a 100-Page per-brand connection limit.
- All verified Pages returned to the selected brand are connected in one database transaction.
- Each Page access token is encrypted with AES-256-GCM before it is passed to the database RPC.
- The existing server-only token vault is reused; browser roles cannot read Page tokens.
- Database-side workspace role, brand ownership, scope and payload checks plus audit logging.
- A central seven-network provider registry and Channels page showing which connectors are available and which are still planned.

## Important boundary

This release connects Facebook Pages and stores their encrypted access tokens. It requests only `pages_show_list` and `pages_read_engagement`. It does not request `pages_manage_posts` because no Facebook publishing action is implemented. The schema is ready to record a future permission signal, but the current flow does not ask for it.

**Facebook publishing is not enabled by this release.** The publishing worker remains Instagram-only. The Facebook `content_publish` capability deliberately remains `false` until Facebook post creation, media handling, delivery reconciliation, retry policy and end-to-end tests are implemented.

No Facebook posts, comments, messages or moderation actions are sent by this release.

## Supabase migration

For a project already updated through v1.6.0, apply only:

`supabase/migrations/0014_facebook_pages_multi_provider.sql`

Do not rerun migrations 0001–0013. The function validates the full batch before writing, and its transaction stores all selected Page connections or none of them.

## Vercel environment variables

Keep existing Social Hub variables. Add these server-only variables:

| Variable | Value |
|---|---|
| `FACEBOOK_APP_ID` | Meta app ID |
| `FACEBOOK_APP_SECRET` | Meta app secret |
| `FACEBOOK_GRAPH_API_VERSION` | `v26.0` (optional; defaults to `v26.0`) |

The flow also requires the existing:

- `NEXT_PUBLIC_SITE_URL=https://ruffneck-social-hub.vercel.app`
- `SOCIAL_TOKEN_ENCRYPTION_KEY` (32 bytes, base64 or 64-character hex)

Never put the app secret or token encryption key in a `NEXT_PUBLIC_` variable.

## Meta configuration

1. Configure Facebook Login for the Meta app.
2. Add this exact Valid OAuth Redirect URI:
   `https://ruffneck-social-hub.vercel.app/api/integrations/facebook/callback`
3. Request the Page permissions used by this flow: `pages_show_list` and `pages_read_engagement`. Do not request `pages_manage_posts` until Facebook publishing is implemented.
4. Complete Meta app review / Advanced Access requirements for the intended users and production use. Permission approval is controlled by Meta, not this repository.
5. The authorizing Facebook user must have access to the Pages to be connected.

The application stores only scopes that Meta explicitly reports as `granted`. The flow requires both `pages_show_list` and `pages_read_engagement`. If Meta does not grant them, no Page credentials are stored.

## Token expiry handling

The Facebook Page-list response used by this flow does not provide a separate Page-token expiry field. Migration 0014 makes the existing vault expiry column nullable, and Facebook Page tokens are stored with `token_expires_at = NULL` rather than an invented date. This does not mean the token can never be revoked. Meta may invalidate a Page token after Page-role, app-access, permission or security changes. Any future Facebook provider action must validate the token with Meta and treat invalidation as reconnect-required.

## Provider catalogue

The channel registry now lists Facebook, Instagram, TikTok, YouTube, LinkedIn, X and WhatsApp Business. Only Facebook Pages and Instagram have connectable OAuth flows in this release. The other five are explicitly marked Planned; they have no fake connection buttons and do not use scraping or browser automation.

## Verification boundary

Unit tests cover the provider registry, Facebook URL/version validation, scope filtering, Page normalization, publication-permission detection and signed OAuth state. Static source and archive checks are separate from live provider validation.

A successful local test does not confirm your Meta app is approved, the production callback URI is configured, a Facebook user has Page tasks, the SQL migration has been applied or that production OAuth completes. Complete those checks in the target Supabase, Meta and Vercel projects.
