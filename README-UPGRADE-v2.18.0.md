# RuffNeck Social Hub v2.18.0 — Brand Voice Studio

## What changed

The new **Brands & clients** page includes a voice profile editor for every brand in the selected workspace. It stores five structured settings in the existing `brands.voice_profile` JSONB field:

- Tone and writing style.
- Supported languages.
- Approved facts the AI may repeat when relevant.
- Forbidden claims the AI must not make.
- Escalation triggers that should be handed to a person.

The profile uses the existing AI sanitization helper, so campaign drafting, provider-copy adaptation and Instagram reply drafts consume the same saved profile. A profile is guidance, not proof of a claim: owners must enter only verified facts. The feature does not enable AI auto-send, approval or publishing.

## Permissions and audit

Only workspace owners and admins can save brand voice profiles. The server action checks membership before calling the database function. Migration 0019 independently verifies the role, confirms the brand's workspace, validates the structured fields, updates the profile and writes a workspace audit event. Audit metadata records field counts and whether guidance fields are configured; it does not copy the profile text into the audit log. Other workspace roles can view the profile but cannot edit it.

Validation limits: tone and language guidance are each limited to 120 characters; each of the three lists supports up to 12 entries, each no longer than 240 characters. Empty list lines are ignored and duplicate lines are removed by the application validator.

## Installation

1. Extract the ZIP and replace the existing repository files with the extracted project.
2. In the existing Supabase project, open **SQL Editor**.
3. Run `supabase/migrations/0019_brand_voice_profiles.sql` once, after migrations 0001–0018.
4. Push the replacement project to the existing GitHub `main` branch and allow the existing Vercel project to deploy.
5. Open **Brands & clients → Brand voice profiles**, select a workspace, and save a profile for each brand.

Do not rerun migrations 0001–0018. No existing Supabase global auth settings or other shared-project settings need to change.

## Environment and dependencies

- No new environment variables.
- No new packages.
- Existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` continue to control optional AI features.
- The new page works without AI configured; it only edits brand configuration.

## Verification scope

This ZIP's verification record is in `VERIFICATION-v2.18.0.md`. Syntax and focused helper checks do not replace a dependency-backed project typecheck, full Vitest run, production build, live migration test or provider acceptance test.
