# RuffNeck Social Hub v3.0.1 — Brand Voice Action Repair

## Deployment repair

The v3.0.0 source package included a Brands & clients page that imported `saveBrandVoiceProfile`, but the workspace server-action module did not export that action. Next.js could compile the route with a warning, then failed the production TypeScript check with `Module has no exported member 'saveBrandVoiceProfile'`.

This patch adds the missing server action and restores the complete Brand Voice Studio route, helper, styles, tests and database migration 0019 in the source package.

## Security and data handling

- The server action validates workspace and brand identifiers and normalizes all submitted profile fields before writing.
- The action calls `update_brand_voice_profile`; the database function independently resolves the brand's actual workspace and checks that the authenticated user is an owner or admin.
- Database-side limits are enforced for tone, languages, and up to 12 entries per list, with 240 characters per entry.
- The database writes a safe audit event containing configuration counts only, not the brand's private profile text.
- Other workspace roles retain read-only access. Profile values remain scoped to the brand and workspace.

## Database

For an installation that has applied migrations 0001–0018 but has not yet applied 0019, apply:

`supabase/migrations/0019_brand_voice_profiles.sql`

Do not reapply migration 0019 if it is already recorded as applied in Supabase. Do not rerun migrations 0001–0018.

## Verification boundaries

The package was checked for ZIP integrity, TypeScript/TSX syntax, the exported action/RPC contract, migration safeguards and the brand voice helper's normalization and bounds. A complete Next.js production build and live Supabase execution were not run in this environment. The Vercel deployment must provide the final production-build confirmation.
