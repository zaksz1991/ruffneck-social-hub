# RuffNeck Social Hub v4.7.0 — WhatsApp CRM and AI Conversation Intelligence

This release extends the existing WhatsApp Cloud API inbox with provider-scoped Customer CRM and advisory AI conversation triage.

## WhatsApp customer CRM

- Enrol a WhatsApp contact from the conversation detail page or the Customer CRM candidate list.
- Maintain an internal label, relationship stage and up to 12 tags.
- View the latest 30 messages and add append-only internal notes.
- Keep CRM identity scoped to the workspace, connected WhatsApp account and provider participant ID. No automatic identity merging is performed.

## WhatsApp conversation intelligence

- Uses the configured private/local OpenAI-compatible endpoint (`LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL`, optional `LOCAL_AI_API_KEY`).
- Analyses up to the latest 12 text messages and the connected brand voice profile.
- Returns intent, sentiment, summary, escalation recommendation, confidence and suggested priority.
- Requires a human-authorised action to apply the suggested priority.
- Saves only against the exact latest inbound message; a newer message makes the old result stale.
- Never sends or drafts a customer reply, changes workflow automatically, or triggers routing rules.

## Installation

1. Extract the v4.7.0 ZIP.
2. In the existing GitHub repository's `main` branch, merge the included changed/new files by path. Do not delete files, public assets or workflows.
3. Run `supabase/migrations/0034_whatsapp_crm_and_ai_triage.sql` in Supabase SQL Editor after 0033 has succeeded.
4. Allow the Vercel deployment from the repository's connected GitHub branch to complete.
5. With a WhatsApp thread open, enrol the customer in CRM and use Conversation Intelligence. AI remains disabled until the private/local AI endpoint settings are configured.

## Commercial and policy boundary

WhatsApp Business Platform messaging is subject to Meta policy and pricing. Charges may apply by message category and recipient market. The application does not represent WhatsApp API messaging as free. Template use requires valid opt-in, and free-form replies remain limited to the 24-hour customer-service window.

## Verification boundaries

Local source and contract tests are included. They do not prove migration execution, a real Meta webhook, an authorised business phone, production AI endpoint availability or Vercel deployment. No new Meta permissions or environment variables are introduced.
