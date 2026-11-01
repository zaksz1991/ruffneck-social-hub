# v3.6.0 — AI reply playbooks

- Added guided response approaches for Instagram DM and Facebook Messenger AI reply drafts: direct, empathetic, clarifying, resolution and human handoff.
- Added explicit reply-language choices for automatic customer-language matching, English, Hausa, Nigerian Pidgin, Yoruba, Igbo and French.
- Added server-side allowlist validation for approach and language preferences.
- Retained sanitized brand voice, untrusted-message prompt handling, deterministic reply-safety assessment and human review.
- Preserved Instagram draft-only behavior and the existing guarded Facebook Messenger send workflow.
- Added reply-playbook integration audit and regression checks.
- No database migration or new environment variable is required.
- Full Next.js production build and full Vitest suite remain to be confirmed in the deployment environment.
