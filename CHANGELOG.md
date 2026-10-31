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
