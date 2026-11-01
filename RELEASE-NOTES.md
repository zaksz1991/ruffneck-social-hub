# RuffNeck Social Hub Release 0.8.0

## Instagram Business Login — first provider connection

This release establishes the first live provider OAuth connection for Instagram professional accounts (Business or Creator). It adds a user/workspace/brand-bound OAuth state, server-side token exchange, profile verification, AES-256-GCM token encryption, a locked-down token vault, and a Connected Channels screen.

### Required setup

- Configure an Instagram Business Login app in Meta for Developers.
- Register `https://ruffneck-social-hub.vercel.app/api/integrations/instagram/callback` as an allowed Instagram OAuth redirect URI in that Meta app.
- Add `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, and `SOCIAL_TOKEN_ENCRYPTION_KEY` to Vercel as server-only variables.
- Apply Supabase migration `0007_instagram_business_connection.sql` after migrations 0001–0006.
- Redeploy the application after setting environment variables.

See `README-INSTAGRAM-CONNECTION-UPGRADE.md` for detailed setup and acceptance gates.

### Operational boundaries

- No publish dispatch, inbox, messaging, comments, insights, webhook processing, or automatic token refresh is enabled.
- The publishing queue continues to store schedule records only.
- Meta app review/advanced access may be required before connecting accounts outside app roles/testers.
- The live Meta OAuth flow and live Supabase migration have not been run in this build environment.
