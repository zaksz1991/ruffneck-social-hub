# Workspace and brand management

## Delivered in migration 0003

- A signed-in owner can create additional workspaces through `create_additional_workspace`.
- Each newly created workspace receives an owner membership and a default `Primary brand`.
- Workspace membership is the authorization boundary. Workspace reads are restricted by the existing `is_workspace_member` RLS predicate.
- Brand creation and renaming are limited to workspace owners and admins by database policies.
- Brand deletion is intentionally unavailable until dependent content/account archival behavior is implemented.
- The dashboard lists only workspaces visible to the authenticated user and allows switching between them.

## Apply the database change

Apply `supabase/migrations/0003_multi_workspace_brand_management.sql` after migrations 0001 and 0002 in the Supabase SQL Editor. Do not rerun earlier migrations if they have already been applied. Verify that the function `public.create_additional_workspace(text)` exists before testing the create-workspace form.

## Team collaboration (migration 0006)

- Workspace owners, admins and managers can create one-time invitation links within their permitted role range.
- The server generates a 256-bit random token and stores only its SHA-256 hash.
- Invitation links expire after seven days and can be accepted once by the authenticated email address that was invited.
- Owners/admins can change eligible member roles and remove eligible members; the database checks these permissions independently of the UI.
- Invitations are copied and shared manually; no automatic email delivery is configured. See `docs/TEAM-ACCESS.md` for the exact role matrix.

## Current boundaries

- Workspace ownership transfer is not implemented in this milestone.
- Workspace membership creation remains server-controlled; no client can add itself to another workspace.
- Client accounts are represented as separate workspaces or brands. A dedicated client-portal role and external client approval workflow are future work.
- Provider OAuth, publishing, inbox synchronization, AI execution, and analytics are not active.
- The dashboard's zero counts are placeholders for unimplemented integrations, not live platform measurements.

## Manual acceptance checks

1. Sign in as the workspace owner.
2. Confirm only the user's memberships appear in the workspace portfolio.
3. Create a second workspace; confirm it appears and contains `Primary brand`.
4. Switch between the two workspaces; confirm each displays only its own brands.
5. Add and rename a brand in each workspace.
6. Sign in as a different user with no membership and confirm that direct database reads return no workspace or brand rows.
7. Confirm a non-admin member cannot insert or rename a brand.

These checks require a configured Supabase project and at least two test users. They have not been executed against the user's live database.


## Brand voice profiles (migration 0019)

- Open **Brands & clients** from the workspace dashboard.
- Workspace owners and admins can edit a brand's tone, supported languages, approved facts, forbidden claims and escalation triggers. Other roles have read-only access.
- Saved values use the existing `brands.voice_profile` JSONB column and are consumed by optional AI drafting/adaptation/reply assistance through the existing sanitizer.
- Migration `0019_brand_voice_profiles.sql` adds a role-checked update function and audit event. Apply it once after migration 0018.
- Tone and languages are each limited to 120 characters; each list supports at most 12 entries of up to 240 characters.
