# RuffNeck Social Hub v5.1.0 — WhatsApp recipient opt-out controls

## Scope

This incremental release records exact inbound WhatsApp consent keywords and blocks outbound text, approved-template and media sends for recipients who have opted out. It does not send automated acknowledgements.

## Customer commands

- Opt out: `STOP`, `STOP ALL`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`.
- Explicitly re-enable: `START`, `UNSTOP`.
- Matching is exact after trimming surrounding whitespace and trailing punctuation. Ordinary sentences containing these words do not change consent state.

## Enforcement

A workspace-scoped `whatsapp_contact_preferences` record is updated by a database trigger on newly ingested inbound messages. A second database trigger guards both existing send-attempt ledgers: text/template and reviewed-media. The send guard executes inside PostgreSQL, so UI-only checks cannot bypass it. RLS permits workspace members to read preference state; browser clients cannot write it.

The inbox shows the current preference state and the source keyword. Unknown preference state is not represented as confirmed opt-in. Existing per-template opt-in confirmation remains required. The release does not add bulk messaging, scheduled outreach or automatic replies.

## Install

1. Merge the incremental patch files into the current repository.
2. Apply `supabase/migrations/0038_whatsapp_contact_opt_out_controls.sql` once, after migration 0037.
3. Deploy through the existing GitHub-to-Vercel workflow.
4. Test inbound `STOP`, verify text/template/media send attempts are rejected, then send `START` and verify the state returns to opted-in.

No new environment variables are required.
