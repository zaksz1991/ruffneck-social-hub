# v3.4.0 — AI Conversation Intelligence & Human-Controlled Priority Suggestions

## Included

- Local-model intent classification for Instagram and Facebook Messenger conversations.
- Sentiment, short non-sensitive summary, escalation recommendation, confidence and low/normal/high/urgent priority suggestion.
- Strict response-schema validation; unknown intent, sentiment, priority, malformed confidence and incomplete summaries are rejected.
- A provider/conversation/source-message anchor so the stored assessment is tied to the exact latest inbound message.
- Explicit team action to apply the suggested priority while preserving the current workflow status and assignee.
- A protected migration RPC, workspace-read RLS policy, numeric/category-only audit metadata and responsive UI.

## Use

Open an Instagram or Facebook Messenger conversation with a latest inbound text message. Select **Analyse conversation**. Review the intent, sentiment, summary, escalation flag and suggested priority. Nothing is changed by analysis itself. To use the recommendation, select **Apply suggested priority**. The server confirms that the source message is still the latest message and calls the existing role-checked workflow RPC. Current status and assignment are preserved.

Owners, admins, managers, publishers and client approvers can run analysis. Applying priority is limited to owners, admins, managers and publishers, matching the existing conversation workflow policy.

## AI and privacy boundary

The server sends up to 12 recent text messages and the brand voice profile to the configured `LOCAL_AI_BASE_URL` endpoint. The endpoint must be private and access-controlled. The request uses a 25-second timeout, disables redirects and requires an OpenAI-compatible JSON response. Summary and reason fields are bounded; the prompt instructs the model to avoid personal data, but AI output is not a privacy filter and must be reviewed.

Do not send confidential customer conversations to an untrusted or public inference endpoint. No message content is written into `audit_events`; the audit stores provider, category, sentiment, priority, escalation and confidence only.

## Operational safeguards

- AI output is advisory, not a verified fact.
- No automatic customer reply, comment response, publishing or moderation is introduced.
- Analysis does not update workflow status or assignment.
- Priority is applied only by an explicit human action.
- A saved result cannot be applied after a newer message arrives; rerun triage against the current message.
- Database reads are limited to workspace members. Writes occur only through a `SECURITY DEFINER` RPC with an empty search path and role checks.

## Database

Apply `supabase/migrations/0023_inbox_ai_conversation_triage.sql` once after migration 0022. Existing installations should confirm 0022 is already applied. Fresh installations apply migrations 0001–0023 in order. Do not rerun successful migrations.

## Environment

Reuse the existing server-only `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` used by AI reply drafts. No new environment variable, Meta permission or provider webhook subscription is required.
