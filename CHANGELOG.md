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
