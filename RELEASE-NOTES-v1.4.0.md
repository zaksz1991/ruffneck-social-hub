# RuffNeck Social Hub v1.4.0

## Added

- Optional local/private AI-assisted Instagram reply drafts.
- Ollama-compatible OpenAI chat-completions endpoint support with server-side configuration.
- Brand-voice conditioning using supported approved facts, forbidden claims and escalation triggers.
- Conversation transcript safety instructions, bounded history and four drafting tones.
- Persisted, editable reply drafts with draft / human-reviewed / discarded states.
- Workspace RLS, security-definer write functions and audit events without storing draft text in audit metadata.

## Safety limits

- No AI auto-send.
- No Instagram messaging send endpoint.
- Human-reviewed does not mean sent or scheduled.
- AI is optional; Social Hub remains usable without model configuration.
- Local/private endpoint configuration and network reachability are the operator's responsibility.
