# RuffNeck Social Hub v3.6.0 — AI Reply Playbooks

## What changed

The Instagram DM and Facebook Messenger reply studios now let an authorised workspace member guide local AI draft generation with three explicit preferences:

- **Response approach:** direct answer, empathetic acknowledgement, clarifying question, safe next steps, or human handoff.
- **Response tone:** professional, friendly, concise, or empathetic.
- **Reply language:** match the customer's language automatically, or explicitly choose English, Hausa, Nigerian Pidgin, Yoruba, Igbo or French.

The preferences are allowlisted and validated again in the server action. The model receives only the selected instructions, the recent thread and the sanitized brand voice profile. Customer messages remain untrusted data. The prompt continues to prohibit unsupported prices, policies, guarantees, refunds, delivery claims and other invented commitments.

## Workflow and safety

- A generated response is stored as a normal unsent draft.
- Existing deterministic reply-policy scanning is retained.
- Editing, review, safety assessment and current-message checks remain unchanged.
- Instagram responses remain draft-only.
- Facebook Messenger sending still requires the existing explicit human review, fresh safety assessment, escalation clearance where needed, provider permission checks, the 24-hour response window and one-attempt send gate.
- The handoff approach does not claim that a team member was notified and does not invent a response time.
- The clarifying approach prohibits requests for passwords, OTPs, card details or other credentials.

## Database and configuration

No database migration, new environment variable, new AI provider or additional Meta permission is introduced. Existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` configuration are reused.

## Verification

The release adds a source integration audit and deterministic regression checks for preference allowlists, server-side validation, provider wiring, multilingual choices, credential-safe clarification, factual handoff, the existing reply-policy scan and the existing Messenger send controls.

A full Next.js production build and complete Vitest suite must still be run in an environment with all project dependencies installed. Do not treat the static audits alone as proof of production build success.
