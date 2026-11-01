# Release manifest — RuffNeck Social Hub v3.5.0

Base: complete v3.4.0 source package.

Added:
- `src/lib/ai/reply-safety.ts` and `src/lib/ai/reply-safety.test.ts`
- `supabase/migrations/0024_ai_reply_safety_and_language_guardrails.sql`
- `scripts/audit-reply-safety.mjs`
- `README-v3.5.0-AI-REPLY-SAFETY-GUARDRAILS.md`
- `RELEASE-NOTES-v3.5.0.md`

Updated:
- Instagram and Facebook Messenger reply-generation server actions
- Instagram and Facebook conversation pages and draft studios
- Inbox styling, package build/test scripts, main README and changelog

Database change: migration 0024 only. Apply after 0023. No new environment variables or provider permissions.

Operational controls: rule-based scan, exact-draft fingerprint and row-locked exact-text verification, latest-inbound freshness checks, mandatory scanning for new Messenger drafts (including saved-reply drafts), rescan/re-review after edits, two-person clearance for high-risk Messenger replies, send-time brand-policy re-evaluation and a database send-attempt guard. Existing drafts are grandfathered by migration 0024. Instagram remains read-only for DM replies.
