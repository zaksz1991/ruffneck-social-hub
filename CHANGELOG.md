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
