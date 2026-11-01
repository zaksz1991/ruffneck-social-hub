# RuffNeck Social Hub v3.4.0 — AI Conversation Triage

Adds advisory local-AI intent and sentiment classification to Instagram and Facebook Messenger conversation detail pages. Results include concise summary, escalation recommendation, confidence and a suggested workflow priority. A team member must explicitly apply the priority. Existing status and assignment are preserved.

This release does not add auto-replies or provider sending behaviour. AI calls are made only to the configured server-side local/private inference endpoint. Inference uses recent message text and the brand voice profile.

Database: apply `0023_inbox_ai_conversation_triage.sql` after 0022. No new environment variables or Meta permissions are required.

See `README-v3.4.0-AI-CONVERSATION-TRIAGE.md` for usage, security, privacy and deployment details.
