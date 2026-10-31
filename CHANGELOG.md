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

# Changelog

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
