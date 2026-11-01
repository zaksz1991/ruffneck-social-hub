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


## 3.0.0 Facebook Messenger inbox and reviewed replies

- Facebook OAuth requests the Page messaging scopes `pages_messaging` and `pages_manage_metadata` in addition to existing Facebook Page scopes. Messaging is enabled separately from Page publishing and requires a suitable Page task for inbox access; the Send API additionally requires the MESSAGE task or full Page management.
- Callback attempts the Page `messages` webhook subscription and stores the subscription result. Existing Facebook Pages must be reconnected after these grants are approved.
- Added signature-verified `/api/webhooks/facebook`, normalized Page-scoped participant messages, idempotent conversation storage and attachment-type labels without attachment URLs. Capture begins after webhook subscription; no historical conversation backfill is implemented.
- The unified conversations list now displays Instagram and Facebook threads. Instagram direct messages remain read-only.
- Facebook uses the configured local/private AI adapter for drafts. A human must review each draft before an explicit text reply can be sent. The database checks the latest inbound message, Page Send API task and Meta's standard 24-hour response window at send time.
- One send attempt per draft; no automatic retries. Ambiguous outcomes are marked `needs_review`. Text sends are capped at 2,000 characters; the server requires strictly less than 24 hours since the latest inbound message. No AI auto-send, broadcast, message-tag bypass, attachment sends or out-of-window sends are enabled.
- Migration 0018 must be applied after 0017. Live Meta app review, live Page permission grants, webhook subscription/delivery, migration execution, Vitest, dependency-backed typecheck, production build and end-to-end send are not verified in this package environment.

## 3.9.0 Customer CRM

- Added explicit CRM enrolment for supported Instagram and Facebook Messenger conversations.
- Profiles are keyed by workspace, provider, connected account and participant ID; cross-provider identity matching is intentionally not inferred.
- Added manual relationship stages, bounded tags, internal labels and a recent interaction timeline (latest 30 text messages).
- Added append-only team notes. Note reads and writes are limited to owner, admin, manager and publisher roles.
- Migration 0026 adds workspace RLS, revokes direct client writes and exposes authenticated security-definer mutation functions with independent role and source-conversation validation.
- CRM UI masks provider participant IDs, lists at most 200 recently updated profiles and shows up to 12 recent conversation candidates for enrolment.
- Static internal-source audit and all CRM-specific integration/regression checks passed in this package workspace. Full dependency-based Vitest, `npm run typecheck`, Next.js production build, migration execution against Supabase and Vercel deployment remain unverified because package installation did not complete in this environment.
