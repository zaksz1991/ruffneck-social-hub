# RuffNeck Social Hub v1.7.0

## Product direction

This release starts the shift from a single-provider upgrade sequence to a shared multi-platform integration layer. The Channels screen now presents all seven planned networks and clearly separates available connectors from integrations that have not been implemented.

## Included

- Central provider registry: Facebook, Instagram, TikTok, YouTube, LinkedIn, X and WhatsApp Business.
- Facebook Login OAuth for Pages.
- Signed and cookie-bound OAuth state linked to the authenticated user, workspace and brand.
- Server-side authorization-code exchange and long-lived token exchange.
- Explicit granted-scope checks; Page tokens are requested only after Page-list/read permissions are confirmed.
- Multiple managed Pages can be assigned to the selected brand in one atomic database operation.
- Page access tokens are encrypted with AES-256-GCM before storage in the existing server-only token vault.
- Workspace/brand/role checks and audit event in migration 0014.
- Provider status cards and account list updates in Channels.
- Regression tests for provider registry, Facebook data normalization, permissions, Graph version and OAuth state.

## Explicit non-goals

- No Facebook post, photo or video publishing.
- No Facebook inbox, comments, reactions, moderation or insights.
- No automatic response or AI action on Facebook.
- TikTok, YouTube, LinkedIn, X and WhatsApp are displayed as Planned, not connected.
- The publishing worker still dispatches Instagram single-image feed posts only.

The Facebook `content_publish` capability remains false. This release does not request `pages_manage_posts`; it is intentionally excluded until Facebook publishing is implemented. Facebook Page tokens are stored with a NULL expiry because this connection flow does not receive a Page-token expiry from Meta; future provider actions must validate the token before use.

## Database

Apply only `supabase/migrations/0014_facebook_pages_multi_provider.sql` when the database is already at v1.6.0 / migration 0013. Never rerun migrations 0001–0013.

## Environment

Add server-only `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` and optional `FACEBOOK_GRAPH_API_VERSION=v26.0`. Preserve the existing Supabase, encryption and Instagram variables.

## Verification

Release packaging and static TypeScript parsing are checked separately. The full Vitest suite, full TypeScript typecheck, full Next.js build, live Supabase migration and live Meta OAuth flow must be verified in the project environment before describing the release as production-validated.
