# Release manifest — RuffNeck Social Hub v3.6.0

Base: complete v3.5.0 source package.

Added:
- `README-v3.6.0-AI-REPLY-PLAYBOOKS.md`
- `RELEASE-NOTES-v3.6.0.md`
- `scripts/audit-reply-playbooks.mjs`
- `scripts/test-reply-playbooks.mjs`

Updated:
- `src/lib/ai/reply-draft.ts` and `src/lib/ai/reply-draft.test.ts`
- Instagram and Facebook Messenger reply-generation server actions
- Instagram and Facebook Messenger reply composer controls
- Inbox responsive styling
- Package build/test scripts, README and changelog

Database change: none. No new environment variables, AI provider, Meta permissions or OAuth scopes.

Controls preserved: server-side allowlists for approach and language, sanitized workspace brand voice, customer-message prompt-injection boundaries, deterministic safety scans, unsent Instagram drafts, mandatory human review, Messenger 24-hour window, two-person clearance for high-risk replies and one-attempt sending.

Verification performed: complete internal import/export and syntax audit; all existing workflow, saved-reply, SLA, AI-triage and reply-safety integration/regression scripts; new reply-playbook integration and regression scripts; JavaScript module syntax checks; direct runtime prompt checks using the installed TypeScript transpiler. Dependency installation timed out and the full Next.js production build and Vitest suite were not run in this environment.
