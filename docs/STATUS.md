# Current implementation status

## Delivered in 0.7.0
- Workspace team directory, role-aware invitations and invitation-link preview/acceptance.
- Seven-day invitation expiry, one-time acceptance, token-hash-only database storage and invited-email matching.
- Owner/admin role updates and member removal with protected-owner/self-removal restrictions.
- Audit visibility for team governance actions.

## Delivered in 0.6.0
- Branded authentication, email-confirmation callback and protected application routes.
- Workspace provisioning, multi-workspace access, brand creation and brand renaming.
- Tenant-scoped Content Studio with draft creation, editing, review submission, approval and change requests.
- Publishing calendar and PostgreSQL-backed scheduling queue for approved content.
- Same-workspace and same-brand destination validation, connected-account requirement and role-checked queue mutations.
- Brand-timezone scheduling, a 2-minute minimum lead time, a 90-day maximum horizon, duplicate active-job prevention and cancellation.
- Audit events for content and publishing queue operations.
- Dynamic dashboard counts for verified connected accounts and waiting queue records.
- Shared-project-safe Social Hub signup redirect selection and the npm-cache-free CI workflow.

## Explicitly not enabled
- Social provider OAuth and token vaulting.
- Provider dispatch worker or actual publishing to social networks.
- Unified inbox, analytics ingestion and AI model execution.
- Automated invitation email delivery; invitation links are manually copied and shared.
- Workspace ownership transfer remains deliberately unsupported.

A queue record means only that a schedule has been stored. It is not proof of dispatch or delivery. Do not mark an account `connected` unless a real provider authorisation and account verification flow has succeeded.

## Verification status for this package
- All TypeScript/TSX source files passed TypeScript transpilation syntax checks.
- A project-wide structural TypeScript check passed using temporary ambient stubs for dependencies that could not be installed. This is not a substitute for the actual dependency-backed `npm run typecheck`.
- Four new schedule-validation scenarios passed in a standalone local check.
- Ten standalone assertions for team validation and invitation-token hashing passed. Team tests are also included in Vitest; the full Vitest suite was not run because dependencies could not be installed in the build environment.
- Full `npm install` timed out in the build environment. The full Vitest suite and production Next.js build were therefore not run.
- Migration 0006 has not been applied to the live Supabase project or tested against live data.
- Vercel deployment and provider dispatch have not been verified.


## 0.8.0 provider connection status

- Instagram Business Login OAuth implementation: added; requires Meta app credentials and redirect allow-list configuration.
- Token encryption: AES-256-GCM implemented server-side; requires a persistent `SOCIAL_TOKEN_ENCRYPTION_KEY`.
- Token vault: migration 0007 added; apply once to the active Supabase project.
- Account profile verification: implemented in callback.
- Real OAuth acceptance: not yet verified; requires a Meta professional-account tester.
- Automatic token refresh and publishing dispatch: not implemented.


## 1.4.0 local AI reply-draft status

- Optional local/private OpenAI-compatible model endpoint support added for Instagram reply drafting.
- Draft generation uses up to 20 recent text messages and supported brand voice fields.
- Reply drafts are saved per workspace and can be edited, marked human-reviewed or discarded.
- Database writes are available only through authenticated security-definer functions; RLS exposes workspace-scoped reads.
- Draft generation is optional and remains disabled until `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL` are configured.
- No Instagram send API, automatic replies, attachments or comment moderation are enabled.
- Live model endpoint behavior, Supabase migration, full TypeScript check, full test suite and production build have not been verified in this package workspace.

## 1.5.0 Instagram comment triage status

- Added normalization for signature-verified Instagram `comments` change events.
- Added workspace-scoped comment storage with unique provider comment IDs per connected account.
- Added internal New/Reviewed/Ignored triage labels using a role-checked RPC and audit events.
- Added optional local AI public-comment reply drafts; saved drafts remain unsent and human-reviewed.
- Added opt-in OAuth scope request for `instagram_business_manage_comments`; disabled by default.
- Migration 0012 must be applied after 0001–0011.
- Real Meta webhook delivery requires the app's `comments` webhook subscription and the required permission/access level. Existing connections must be reauthorized to grant the extra scope.
- No comment reply, hide, unhide, delete or DM send action is implemented.
- Live Meta, Supabase migration, full TypeScript check, full test suite and production build have not been verified in this package workspace.

## 1.7.0 multi-platform integration status

- Added a central provider registry for Facebook, Instagram, TikTok, YouTube, LinkedIn, X and WhatsApp Business.
- Facebook Pages OAuth connection and Page-list retrieval are implemented using official Meta endpoints.
- Facebook authorization requests only `pages_show_list` and `pages_read_engagement`; publishing permission is not requested in this release.
- Multiple verified Pages are assigned to the selected brand atomically; Page access tokens are encrypted before database writes.
- Migration 0014 adds the role-checked storage RPC and makes token expiry nullable for Page tokens when the provider flow does not report a Page-token expiry.
- The Facebook `content_publish` capability remains false. Facebook dispatch, inbox, comments, insights and moderation are not enabled.
- Instagram publishing remains the only active publishing worker.
- TikTok, YouTube, LinkedIn, X and WhatsApp appear in the registry as Planned, without connection buttons.
- Live Meta OAuth, the migration against the target Supabase project, full Vitest suite, dependency-backed typecheck, full Next.js build and production deployment have not been verified in this package workspace.


## Current provider and publishing status as of v2.12.0

- Instagram Business: single-image publishing, read-only message conversations, internal comment triage and unsent AI reply drafts. Sending DMs or comment replies and automated moderation remain disabled.
- Facebook Pages: single-image publishing through the official Page API when the stored permission and Page task checks pass.
- LinkedIn organization Pages: text-only publishing through the official organization Posts API; image publishing and automatic token refresh are not implemented.
- TikTok, YouTube, X and WhatsApp Business remain planned, with no publishing worker enabled.
- Publishing preflight now checks the selected content and each destination both in the client UI and again on the authenticated server action before any queue writes. It does not verify remote image reachability or provider acceptance.
- v2.12.0 adds no database migration or environment variable.
- New preflight helper assertions passed in a standalone local runtime check. Changed source files passed TypeScript syntax transpilation. The full Vitest suite, dependency-backed typecheck, production Next.js build, live provider tests and Vercel deployment were not run.

## 2.15.0 provider-specific content variants

- Added named variants for the currently implemented Instagram, Facebook and LinkedIn publishing providers.
- Master content must already be approved. Each provider variant then follows a separate draft → in-review → approved / changes-requested lifecycle.
- Approved variants are immutable through the application workflow; a requested change returns the variant to draft for another review.
- Scheduling can select one approved variant per provider for a multi-destination batch. The authenticated server revalidates the variant's workspace, master-content relationship, provider and approval state for each selected account.
- Migration 0018 adds variant and review tables, `publishing_jobs.variant_id`, role-checked RPCs, and the worker claim projection that supplies the selected variant's copy and media to the existing dispatch functions.
- Existing publishing jobs remain valid and continue to use master content because their new `variant_id` is null.
- TikTok, YouTube, X and WhatsApp Business remain planned, with no active publishing worker.
- Migration 0018 has not been applied to the live Supabase project as part of this package build. Live provider publishing, full Vitest suite, dependency-backed typecheck, production Next.js build and Vercel deployment are not verified here.

## 2.16.0 local-AI campaign draft assistant

- Added optional Content Studio generation of a master-post title and body using the existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` configuration.
- The action verifies the signed-in user, content-creation workspace role and the selected brand's workspace relationship before contacting the configured inference endpoint.
- Prompts contain a sanitized allowlisted brand-voice profile and bounded campaign fields encoded as untrusted data; the request has a 30-second timeout and bounded response parsing.
- Generated text is returned as an editable preview and is saved only through the existing content-draft server action/RPC. There is no approval, variant creation, scheduling or publishing automation in this feature.
- No migration or dependency changes are required.
- The new helper passed strict standalone TypeScript checking; five changed TypeScript/TSX files passed syntax transpilation; 10 focused runtime assertion groups passed, including a mocked local inference endpoint.
- The full dependency-backed project typecheck, complete Vitest suite, Next.js production build, live inference endpoint and production deployment were not run in this build environment.

## 2.17.0 AI platform-specific copy adaptation

- Added an optional Content Studio assistant on approved master posts to draft tailored Instagram, Facebook and LinkedIn variants from the approved title/body and sanitized brand voice profile.
- Generation checks the signed-in user, workspace membership and content-creation role, verifies the approved master belongs to the workspace, and verifies the associated brand belongs to the same workspace.
- Generated copy is returned as editable previews. Saving rechecks membership and master approval and writes each selected provider draft through the existing role-checked `create_content_variant` RPC.
- Variant names are checked against existing names before generation; duplicate save attempts are surfaced per provider. Partial saves do not block successful variants from being retained.
- Generated variants remain draft status and require the established separate review and approval workflow. No automatic scheduling or publishing is added.
- No new database migration, package dependency or environment variable. Existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` settings are reused. Migration 0018 remains a prerequisite for provider variants.
- Provider adaptation prompt/parser tests were added. New helper strict TypeScript check passed; six changed TypeScript/TSX files passed syntax transpilation; 17 focused runtime assertions passed, including a mocked local AI endpoint.
- Full Vitest suite, dependency-backed project typecheck, Next.js production build, live Supabase RPC behavior, live AI endpoint and Vercel deployment were not run in this environment.
