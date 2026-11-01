# Release manifest — RuffNeck Social Hub v4.4.1

## Release type

Maintenance release for v4.4.0.

## Included changes

- Fixes the YouTube private-upload `fetch` request body TypeScript incompatibility by copying bounded Node Buffer bytes into an exact-length standalone `ArrayBuffer`.
- Adds a regression test for body type, byte length, byte preservation and independence from source-buffer mutation.
- Updates version-gated integration audits so existing TikTok, LinkedIn, provider-analytics and campaign-intelligence contracts continue to accept the v4.4.1 maintenance release.
- Updates release documentation and verification status.

## Database and configuration

- No new Supabase migration. Existing migration 0031 remains required for the v4.4.0 YouTube feature.
- No new environment variables.
- No new OAuth scopes or provider permissions.

## Deployment requirements

Use v4.4.1 as a complete project replacement. Do not apply a new database migration for this maintenance release. Vercel must complete `npm run build` successfully before production is considered verified.
