# RuffNeck Social Hub v3.5.0 — AI Reply Safety & Escalation Guardrails

## Changes

- Added a deterministic safety assessment after local AI reply generation for Instagram and Facebook Messenger.
- Scans generated drafts for brand-forbidden claims, configured escalation triggers, high-risk customer topics, sensitive/internal wording, possible unsupported commitments and probable language mismatch.
- Adds lightweight language hints for English, Hausa, Yoruba, Igbo, Nigerian Pidgin and French; inconclusive text remains `unknown`.
- Stores an assessment against the provider, conversation, draft and exact latest inbound source message. A SHA-256 fingerprint reveals whether subsequent draft edits made the assessment stale.
- Adds protected assessment persistence and workspace-member read access through migration 0024.
- Adds a two-person clearance rule for high-risk Facebook Messenger replies: a reviewer marks the draft reviewed, then a different owner/admin/manager clears escalation.
- New Messenger drafts (including saved-reply drafts) must be scanned before sending; a database trigger blocks drafts without a stored scan.
- Assessment persistence locks the draft row and compares the exact draft text. The UI also detects when the latest inbound customer message no longer matches the assessment source.
- Editing or refreshing the draft resets its scan and human review state. The team must review again after the latest scan.
- The send-attempt trigger rechecks current brand rules, so brand policy changes after a scan require a refreshed assessment and second-person clearance when newly high-risk.
- A database trigger prevents Messenger send attempts for high-risk replies whose assessment is stale or escalation has not been cleared.
- Keeps Instagram reply drafts unsent; preserves the existing Facebook 24-hour send window, Page permission checks, 2,000-character text limit, one-attempt protection and manual handling of uncertain outcomes.

## Safety boundaries

The assessment is advisory and heuristic. It is not a verified language model, translation, legal or compliance decision, factual guarantee, or authorisation to send. Even a low-risk draft must be reviewed by a person. No automatic replies, campaign messages, comment publication or autonomous moderation are added.

## Database rollout

Apply `supabase/migrations/0024_ai_reply_safety_and_language_guardrails.sql` once after migration 0023. Existing Messenger drafts are grandfathered; all new drafts and saved-reply drafts need a successful scan before they can be sent. Fresh installations apply all migrations 0001–0024 in order. No new environment variable or Meta permission is introduced.

## Verification scope

The package includes a full internal import/export audit, feature integration audit, regression tests and migration assertions. The Next.js production build, full Vitest suite and live Supabase/Meta integration must be verified in the target deployment environment; static checks do not prove provider approval or live service availability.
