# RuffNeck Social Hub v2.0.0

## LinkedIn Pages connection foundation

The multi-platform provider layer now has a third implemented network: LinkedIn organization Pages.

### Included

- LinkedIn OAuth start and callback routes.
- Signed, provider-bound OAuth state shared safely with the existing Facebook state contract.
- Official organization ACL discovery, restricted to approved `ADMINISTRATOR` organizations.
- AES-256-GCM encrypted token storage in the existing provider vault.
- Provider-issued access-token expiry persisted for future expiry checks.
- Workspace/brand/role/scope validation and audit logging in Supabase migration 0016.
- LinkedIn availability and configuration in Connected Channels.

### Not included

LinkedIn publishing, media uploads, analytics, comments, inbox messaging and automatic token refresh are not enabled. The connection requests only `r_organization_admin`; no write permission is requested.

### Installation

1. Replace the repository with the full project in this ZIP.
2. Apply only `supabase/migrations/0016_linkedin_organization_connection.sql` after migrations 0001–0015.
3. Add `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` and `LINKEDIN_API_VERSION=202610` to Vercel Production.
4. Add the exact LinkedIn OAuth redirect URL: `https://ruffneck-social-hub.vercel.app/api/integrations/linkedin/callback`.
5. Confirm that LinkedIn has approved the app for `r_organization_admin`.
6. Deploy and connect LinkedIn Pages from Connected Channels.

### Verification

- ZIP integrity: passed on the final archive.
- Package JSON/version validation: passed.
- Changed TypeScript/TSX syntax transpilation: passed for the LinkedIn routes, provider helpers/state and Channels page.
- Runtime helper and OAuth-state assertions: 22 passed.
- SQL structural checks: passed.
- Full Vitest suite and Next.js production build: not run; dependency installation timed out in this environment.
- Live Supabase migration and LinkedIn OAuth/API flow: not tested.
