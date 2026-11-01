# Changelog

## 3.8.0 — Routing automation insights

- Added a read-only manager dashboard for routing execution metrics, provider mix, per-rule outcomes, daily activity and safe reason codes.
- Added filters for 7-, 30- and 90-day windows, provider and execution outcome.
- Added a paginated safe execution journal.
- Limited reporting queries to safe execution metadata and the latest 1,000 matching records, with explicit sample disclosure.
- Added integration and regression safeguards to the build and test scripts.
- No database migration, provider permission or environment variable change.

## v3.5.0 — 2026-11-01

- Added deterministic AI reply safety scans for Instagram and Facebook Messenger drafts: brand restrictions, escalation triggers, high-risk customer topics, possible unsupported commitments and language mismatch signals.
- Added heuristic language hints for English, Hausa, Yoruba, Igbo, Nigerian Pidgin and French; unknown or low-confidence text remains explicitly inconclusive.
- Persisted each scan against the exact locked draft text and latest inbound message with a SHA-256 draft fingerprint; the database checks the draft text under row lock before accepting the assessment. The UI flags newer inbound messages and edited Messenger drafts as stale.
- Added a two-person clearance step for high-risk Facebook Messenger replies: a different owner/admin/manager must clear an already reviewed draft.
- Required a successfully stored scan before sending new Messenger drafts, including saved-reply drafts; editing or refreshing text resets scan and human review state, requiring a fresh scan and review.
- Added send-time database re-evaluation of the current brand policy; a later brand voice change cannot rely on an old low-risk scan.
- Added a database trigger preventing Messenger send attempts for unscanned drafts and high-risk drafts with stale scans or uncleared escalation. Existing Messenger drafts are grandfathered to preserve prior review decisions.
- Preserved mandatory human review, Instagram read-only replies, existing Facebook Messenger send policy and provider permission boundaries. No AI auto-send was introduced.

## v3.4.0 — 2026-11-01

- Added local-model AI conversation intent, sentiment, summary, escalation and suggested-priority triage to Instagram and Facebook Messenger threads.
- Added strict JSON schema validation, brand escalation-trigger context, prompt-injection safeguards, bounded summaries and private endpoint timeouts.
- Added workspace-role-checked persistence anchored to the exact latest inbound message; stale assessments are rejected if a newer message arrives during inference.
- Added an explicit human action to apply only the suggested priority while preserving current workflow status and assignment.
- Added migration 0023, RLS-protected workspace reads, a protected persistence RPC, safe numeric/category audit metadata and new regression/build audits.
- No automatic messages, public replies, status changes, assignments or provider API sends were introduced.

# Changelog

## v3.3.0 — 2026-11-01

- Added workspace-configurable first-response SLA targets for low, normal, high and urgent inbox priorities.
- Added 7/30/90-day first-response reporting for Instagram and Facebook Messenger, including compliance, average response time, at-risk and overdue queues.
- Added current-assignee workload analytics with explicit limits around sender attribution and historical target recalculation.
- Added migration 0022, protected workspace RPCs, aggregate-only reporting, audit metadata, responsive dashboard and regression guards.
- No provider auto-send behaviour or additional provider permissions were added.

## v3.2.0 — 2026-11-01

- Added a workspace-scoped saved reply library with all-channel, Instagram-only and Facebook-only templates.
- Added secure manager-only template management and provider-specific unsent draft creation in conversation threads.
- Added saved-reply unit, integration and build-time audit checks.
- No provider auto-send behaviour or new provider permission scope was added.


## 3.1.0 — Unified inbox team workflow

- Added workspace-scoped assignment, open/pending/resolved status and low/normal/high/urgent priority for Instagram and Facebook Messenger conversations.
- Added internal handoff notes with author and timestamp. Notes are never sent to a social provider.
- Added row-level read policies and security-definer mutation RPCs. Direct browser writes are revoked.
- Restricts teammate assignment to workspace owners, admins and managers; publishers may update status and priority without changing assignment.
- Added triage chips to the unified conversation list.
- No automated customer replies, background message sending, or additional provider permissions were introduced.

## Earlier releases

## 3.0.4 — 2026-11-01

- Adds guarded pre-build removal of the known unreferenced AI provider variants component that persisted after ZIP overlays.
- Adds cleanup regression tests and keeps the full internal import/export audit before Next.js build.

## 3.0.3 — 2026-11-01

- Added a TypeScript/JavaScript internal-source audit to the production build, checking local module resolution and named/default export contracts before Next.js runs.
- Reproduced the five unresolved exports reported by Vercel in the abandoned AI provider-variant component; removed that component because it was not mounted by the active Content Studio page and had no matching persistence/action implementation.
- Updated migration guidance so fresh installs and existing v2.9/v3.0 databases apply migrations 0018 and 0019 only when pending.
- No new migration, environment variable or provider integration.

## 3.0.2 — 2026-11-01

- Fixed the Content Studio TypeScript build failure by implementing the missing `generateAiContentDraft` server action and its exported state type.
- Activated the existing AI campaign draft component in Content Studio for authorized workspace content creators.
- Added local/OpenAI-compatible model generation for editable title and post copy using the existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` settings.
- Applies workspace membership and brand/workspace checks before generation; includes sanitized brand-voice guidance and bounded campaign inputs.
- Generated copy remains an unsaved preview until a user edits/reviews it and explicitly saves it as a content draft. No auto-approval, scheduling or publishing is performed.
- No database migration or new environment variable is required.

# Changelog

## 3.0.0 — 2026-11-01

- Added Facebook Messenger inbox ingestion, unified conversation listing, local AI reply drafts and a human-reviewed send action with server-side 24-hour-window enforcement.
- Added Meta Page messaging scope/task checks, webhook subscription tracking, signed webhook verification, attachment URL redaction and a one-attempt send ledger.
- Instagram direct messages remain read-only; no AI auto-send or broadcast capability was added.

## [2.5.0] - Calendar interoperability

- Added authenticated, workspace-scoped iCalendar (.ics) export for the selected publishing month.
- Exports scheduled timestamps as UTC and includes post title, brand, platform, destination and queue state.
- Preserves cancelled state in calendar clients; escapes iCalendar text and folds long lines.
- Export is a snapshot, not a live calendar subscription or two-way sync.
- No database migration or environment variable changes.

## 1.0.0

- Added signed Instagram webhook verification and idempotent workspace-scoped event ingestion.
- Added migration 0009, signature tests, and setup/capability documentation.
- Messaging and comments remain disabled pending Meta permission approval and further implementation.


## 0.4.0 — Visual identity and dashboard refresh
- Replaced the dark prototype dashboard with a responsive enterprise SaaS visual system.
- Added primary, inverse and symbol logo variants.
- Added SVG favicon, PNG app icons and PWA manifest.
- Added a reusable SVG product icon set.
- Added avatar, media and post-preview placeholders.
- Added editable portrait and square marketing flyer templates, with PNG exports.
- Updated login, signup and authentication gate branding.
- Added design system and asset usage documentation.
- Preserved existing Supabase actions, workspace queries and role-gated brand controls.
- No database migrations or social provider integrations were added.


## Signup response handling
- Stop treating every Supabase signup response without a session as a successful email-verification signup.
- Detect Supabase's empty-identities response for an already-registered email.
- Keep pending-verification confirmation on the signup page, and show explicit errors for missing or incomplete responses.
- Add regression tests for the signup-response classifier.

## Confirmation redirect repair
- Pin production email confirmation redirects to the RuffNeck Social Hub callback rather than inheriting the shared Supabase Site URL.
- Retain configurable localhost redirects for development.
- Add safe callback-destination diagnostics and redirect regression tests.

## 0.6.0 — Publishing calendar and queue

- Added the publishing calendar route and queue management page.
- Added server actions for scheduling approved content and cancelling queued jobs.
- Added migration 0005 with role and tenant checks, brand-timezone conversion, date-window validation, duplicate protection and audit events.
- Provider dispatch remains intentionally disabled until official provider integrations and a queue worker are verified.


## 0.7.0 — Workspace team and access governance

- Added a team directory for each accessible workspace.
- Added invitation links using 256-bit random tokens; only SHA-256 hashes are stored.
- Added seven-day expiry, one-time acceptance, invitation revocation and invited-email matching.
- Added role-aware invitation creation, member role updates and member removal restrictions.
- Added team activity audit visibility for owners and administrators.
- Added an invitation acceptance route and safe sign-in return path.
- Added regression tests for team input and role-policy helpers.
- Invitation delivery remains manual in this release; the interface provides a secure copyable link and does not claim to send email.

## 0.8.0 — Instagram Business Login connection

- Added the first official provider OAuth flow using Instagram Login for professional accounts.
- Bound signed, ten-minute OAuth state to the authenticated user, workspace and brand.
- Added server-side authorization-code and long-lived token exchange plus profile verification.
- Added AES-256-GCM encryption before persisting provider access tokens.
- Added a locked-down token vault with no browser-role access and a role-checked connection RPC.
- Added the Connected Channels management page and dashboard navigation.
- Limited requested permissions to professional profile basics and content publishing; comments, messaging, insights and automatic dispatch remain off.
- Added migration 0007 and OAuth-state/token-encryption regression tests.


## 1.3.0
- Added normalized, workspace-scoped, read-only Instagram text conversations and message threads.
- Added migration 0010 and message normalization tests.

## 1.4.0
- Added optional local AI-assisted Instagram reply drafts with human review, edit and discard workflow.
- Added migration 0011 for workspace-scoped draft storage, server-controlled writes and audit events.
- Added private/HTTPS endpoint validation for OpenAI-compatible local model services.

## 1.5.0
- Added signature-verified Instagram comment normalization and workspace-scoped comment ingestion from the existing webhook route.
- Added migration 0012 for comment triage, reviewed/ignored internal statuses, comment reply draft storage, role-checked RPCs and audit events.
- Added an Instagram Comments queue with workspace/status filtering, pagination and internal triage controls.
- Extended optional local AI drafting to produce public comment reply drafts; drafts are editable, reviewable and unsent.
- Added opt-in `instagram_business_manage_comments` OAuth scope request, controlled by `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT` and reflected in stored account capabilities.
- No comment reply, hide, delete or other provider action is executed.


## 1.7.1 — Multi-platform provider layer and Facebook Pages connection

- Added a central registry for Facebook, Instagram, TikTok, YouTube, LinkedIn, X and WhatsApp Business.
- Added official Facebook Login OAuth start/callback, signed state, permission verification, Page-list pagination and long-lived user-token exchange.
- Added atomic storage for multiple Facebook Pages in the existing encrypted provider-token vault.
- Added migration 0014 with role/brand/scope validation and a workspace audit event.
- Added a unified Channels screen that distinguishes available providers from planned providers.
- Facebook Page publishing permission is detected but actual Facebook dispatch remains disabled; the publishing worker remains Instagram-only.


## 2.0.0 — LinkedIn organization Page connection foundation

- Added LinkedIn 3-legged OAuth with signed state bound to the authenticated user, workspace and brand.
- Added approved LinkedIn organization administrator discovery through the official `/rest/organizationAcls` API.
- Added encrypted LinkedIn access-token persistence in the existing server-only token vault, including provider-reported expiry.
- Added migration 0016 with atomic workspace/brand/role/scope validation and audit logging.
- Added LinkedIn to the implemented provider registry and Connected Channels interface.
- Kept publishing, comments, messaging and analytics disabled for LinkedIn; only `r_organization_admin` is requested.
- LinkedIn Marketing API product access and scope approval are required from LinkedIn; access-token refresh is not implemented in this release.


## 2.1.0 — LinkedIn organization publishing

- Added LinkedIn `w_organization_social` to the OAuth request alongside organization administration access.
- Added a workspace/brand/administrator capability gate for LinkedIn publishing.
- Extended the existing leased publishing worker to publish approved text-only posts to LinkedIn organization Pages through the official REST Posts API.
- Rejects media-bearing LinkedIn jobs until image upload support is implemented.
- Expired LinkedIn tokens and uncertain provider responses move to manual review; the worker does not blindly retry POST requests.
- Instagram and Facebook publishing remain supported.


## 2.2.0 — Cross-platform publishing operations analytics

- Added a workspace-scoped Publishing Analytics page for 7-, 30- and 90-day reporting periods.
- Reports queue volume, confirmed successful publications, pending work and failed/manual-review records.
- Breaks down publishing outcomes by connected provider and displays daily queue creation versus confirmed delivery trends.
- Added navigation from the workspace sidebar, dashboard quick links and operational modules.
- Uses only existing publishing-job and connected-account records; no new migration or environment variable is required.
- Explicitly excludes impressions, reach, clicks, audience growth and engagement until official provider analytics APIs are integrated.

## 2.3.0 — 2026-10-31
- Added authenticated, workspace-scoped CSV export for publishing operations analytics.
- Added summary and per-job reporting for 7-, 30- and 90-day periods.
- Added CSV formula-injection protection and private download headers.

## [2.4.0] - Monthly publishing calendar
- Added a responsive monthly publishing calendar with workspace-preserving month navigation.
- Groups schedule records by each brand's configured timezone and highlights published and attention states.
- Preserved the existing queue, scheduler, cancellation flow and v2.3 CSV export.
- No migration or environment variable changes.

## 2.6.0 — Publishing queue filters
- Added workspace-scoped queue filtering by post/account text, delivery state, connected platform and brand.
- Filters preserve the selected workspace and calendar month and can be cleared in one action.
- Queue filtering is applied only to the already authorized, workspace-scoped records loaded by the page; it does not broaden database access or change publishing behavior.
- No database migration or environment variable is required.

## 2.7.0 — Filtered publishing queue export
- Added authenticated CSV export for queue records, reusing the current status, platform, brand and search filters.
- Includes post, brand, account, scheduling, delivery, attempt and safe error fields.
- Export is workspace-scoped, private/no-store and capped at 5,000 records.

## 2.9.0 - 2026-11-01
- Added paginated access to complete workspace publishing history, with 25 records per page and exact total count.
- Kept the latest-100 operational snapshot for the calendar and queue-health panel distinct from the full history browser.
- Added responsive previous/next navigation and preserved active filters between pages.

## 3.0.1 — 2026-11-01

- Fixed the production TypeScript error by exporting the missing `saveBrandVoiceProfile` server action consumed by the Brands & clients route.
- Added validated profile normalization and an authenticated, workspace-role-checked call to `update_brand_voice_profile`.
- Included the Brand Voice Studio route, helper, styles, unit tests and migration 0019 in the complete source package.
- Kept profile writes restricted to workspace owners and admins; the database function remains the authoritative authorization boundary.


## 3.6.0 — AI reply playbooks

- Added response approach controls for direct answers, empathetic acknowledgement, clarification, safe next steps and human handoff.
- Added automatic customer-language matching and explicit English, Hausa, Nigerian Pidgin, Yoruba, Igbo and French output choices.
- Added server-side preference allowlists and regression checks.
- Preserved safety scanning, human review, draft-only Instagram behavior and guarded Facebook Messenger send controls.
- No database migration or additional provider configuration.

## [3.7.0] — 2026-11-01

### Added
- Controlled inbox routing rules for Instagram and Facebook Messenger.
- Provider, AI intent, sentiment, suggested-priority, escalation, confidence and keyword conditions.
- Internal assignment, priority and Open/Pending status actions.
- Dry-run previews, bounded manual batch execution, safe execution history and per-message idempotency.
- Workspace owner/admin/manager controls and automation page at `/inbox/automation`.

### Safety
- No webhook-triggered or background execution in this release.
- No customer replies are generated, approved or sent by routing rules.
- No automatic conversation resolution; no provider messaging API calls.
- Exact latest-inbound-message binding for AI triage and keyword matching.
- Safe execution logs exclude message content and customer profile details.

### Database
- Added migration `0025_inbox_routing_automation_rules.sql`.
