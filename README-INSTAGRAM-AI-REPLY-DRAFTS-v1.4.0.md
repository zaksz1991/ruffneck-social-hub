# Instagram AI-assisted reply drafts (v1.4.0)

Apply migration `0011_instagram_ai_reply_drafts.sql` after migrations 0001–0010. Do not rerun earlier migrations.

## What this release adds

- Optional AI-assisted response drafts for normalized Instagram text conversations.
- OpenAI-compatible local/private inference endpoint support, including Ollama-compatible `/v1/chat/completions` services.
- Brand voice context drawn only from the supported `voice_profile` fields: `tone`, `languages`, `approved_facts`, `forbidden_claims`, and `escalation_triggers`.
- A bounded recent transcript (up to 20 messages) and four response-tone choices.
- Editable saved drafts, a human-reviewed status and a discard status.
- Workspace membership enforcement through RLS and security-definer database functions.
- Audit events for generation, review, edits and discarding. Draft text is not copied into the audit log.

## Configure optional local AI

Set these server-only Vercel environment variables if AI drafting is required:

- `LOCAL_AI_BASE_URL`: base URL of an OpenAI-compatible private inference service, usually ending in `/v1`.
- `LOCAL_AI_MODEL`: model identifier understood by that service.
- `LOCAL_AI_API_KEY`: optional bearer token for a secured inference gateway.

The server appends `/chat/completions` to the configured base URL. HTTPS is required for public hosts; HTTP is allowed only for loopback/private hosts. The service must be reachable from the deployed server. A model running only on a developer's laptop is not automatically reachable by Vercel.

If these settings are absent, the rest of Social Hub continues to work and the draft-generation action reports that local AI is not configured.

## Privacy and governance

When the feature runs, the recent conversation text and supported brand voice fields are sent from the server to the configured inference endpoint. Configure an endpoint whose privacy and retention properties are acceptable for client/customer data. Do not expose model credentials with `NEXT_PUBLIC_` variables.

Customer message content is treated as untrusted data in the model prompt. The app does not send conversation messages to a third-party AI provider by default. Use a private/authenticated inference service.

## Human review only

Generated drafts are saved with status `draft`. Workspace members can edit them, mark them `reviewed`, or discard them. The reviewed status means a human reviewed the draft; it does not approve or trigger a send. This release adds no Instagram send API, no auto-send behavior, and no comment/DM automation.

The generate action is shown only when the newest stored message is inbound. Attachments and non-text messages remain unsupported by the normalized conversation pipeline.
