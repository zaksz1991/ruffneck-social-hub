# RuffNeck Social Hub v2.0.0 — LinkedIn organization Pages

## What changed

This release adds the first LinkedIn connection to the multi-platform provider layer.

- 3-legged LinkedIn OAuth with a signed ten-minute state token bound to the authenticated user, workspace and brand.
- Discovery of organizations where the authorizing member has an approved `ADMINISTRATOR` role, using LinkedIn's official `/rest/organizationAcls` REST API.
- Server-side token encryption with the existing AES-256-GCM provider vault.
- Provider-reported access-token expiry stored in `social_account_token_vault.token_expires_at`.
- Atomic database validation of workspace membership, manager role, brand ownership, organization ID/URN, administrator role and required scope.
- Audit event written for the completed organization connection batch.

The integration requests only `r_organization_admin`. The implementation does not request write, comment, messaging or analytics permissions.

## LinkedIn application setup

Official LinkedIn references:

- App creation and API access: https://www.linkedin.com/help/linkedin/answer/a526048
- Current API product permissions and access tiers: https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-10
- Organization ACL endpoint and administrator roles: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role?view=li-lms-2026-05

1. Create or select an app in the LinkedIn Developer Portal and associate it with the relevant LinkedIn Company Page, as required by LinkedIn's app setup process.
2. Apply for the LinkedIn API product/access tier that grants `r_organization_admin`. LinkedIn controls product approval and the permissions made available to an app; creating an app alone does not grant Marketing API access.
3. In the app's Auth settings, add this exact redirect URL:

   `https://ruffneck-social-hub.vercel.app/api/integrations/linkedin/callback`

4. Add these server-only Vercel Production environment variables:

   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`
   - `LINKEDIN_API_VERSION=202610`

5. Confirm that the existing variables remain configured:

   - `NEXT_PUBLIC_SITE_URL=https://ruffneck-social-hub.vercel.app`
   - `SOCIAL_TOKEN_ENCRYPTION_KEY` (32-byte key encoded as base64 or 64 hex characters)
6. Apply `supabase/migrations/0016_linkedin_organization_connection.sql` in Supabase after migrations 0001–0015.
7. Deploy and open **Connected channels**. Choose a brand and select **Connect LinkedIn Pages**.

## Permissions and account eligibility

The app must have access to the `r_organization_admin` permission. The connection callback calls `GET https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED` with the `X-Restli-Protocol-Version: 2.0.0` and `LinkedIn-Version` headers. Only organizations returned with an approved `ADMINISTRATOR` role are stored.

If LinkedIn returns no eligible organization Pages, the connection is not stored. If the API returns a permission error, verify the app's approved product access and the member's administrator access. Some records may use a fallback label such as `LinkedIn Organization 12345` when the provider response does not include a localized display name.

## Important capability boundaries

- This is a **connection-only, read-only milestone**. It does not publish LinkedIn posts, upload media, retrieve analytics, read or respond to comments, or send messages.
- LinkedIn publishing will require a later release with the relevant posting permission (for example, `w_organization_social`), provider-format handling, media-upload flow and organization authorization checks. This release does not request that permission.
- LinkedIn access-token expiry is persisted, but automatic refresh is not implemented. Reconnect the LinkedIn organization account after its token expires.
- An app's API product approval, the member's Page role, OAuth consent and token validity are controlled by LinkedIn and must be verified in the target account. This ZIP cannot grant those permissions.
- Do not paste the LinkedIn client secret or access tokens into source files, browser variables, issue trackers or chat messages.

## Verification performed for this package

- ZIP integrity checked after packaging.
- Package JSON parsed and version updated to 2.0.0.
- Changed TypeScript/TSX source files transpiled for syntax checks.
- LinkedIn helper tests added for OAuth URL construction, HTTPS callback validation, version validation, administrator-role filtering, URN validation, deduplication and safe error handling.
- OAuth state tests extended for LinkedIn while preserving Facebook state binding.
- SQL migration checked for role/scope/brand/tenant validation and encrypted vault writes.

A full dependency-backed Next.js production build, full Vitest suite, live Supabase migration and live LinkedIn OAuth/API test were not run in this environment. These remain to be verified by the repository CI and target accounts.
