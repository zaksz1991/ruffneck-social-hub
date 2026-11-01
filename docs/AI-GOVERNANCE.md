# AI governance
Default mode is L1: classify, summarise and draft; human sends.
L2 may send only exact pre-approved templates for narrow intents after explicit brand opt-in.
L3 model-generated auto-send is disabled until risk review, confidence calibration, sampling, rate limits, opt-out handling and emergency stop are proven.

Brand profile includes tone, languages, approved facts, forbidden claims and escalation triggers. AI cannot select tenants/accounts, access secrets, change permissions, invent product facts or call platform APIs. Optional Ollama-compatible inference must be private/authenticated; app remains functional without AI.


## v1.4.0 Instagram reply drafting
- Optional local/private OpenAI-compatible inference prepares drafts only.
- The server sends at most 20 recent text messages and the allowlisted brand voice fields to the configured endpoint after a member explicitly requests generation.
- Customer message text is treated as untrusted input. Only brand-profile approved facts may be presented as facts.
- A workspace member must edit/review or discard each draft. The reviewed state is an internal review marker, not a send approval.
- No model output is sent to Instagram. No auto-send path is implemented.


## v2.17.0 approved-post platform adaptation
- Optional local/private inference adapts an already-approved master post into separate Instagram, Facebook and LinkedIn copy.
- The generation action verifies the signed-in user, workspace content-creation role, workspace-scoped approved master post and its brand before inference.
- The prompt uses bounded master content and allowlisted brand-voice fields as untrusted source data. It instructs the model not to add claims, prices, dates, metrics, commitments or other unsupported facts, and to preserve the master copy's primary language.
- Each adaptation is an editable preview. Saving calls the existing authenticated `create_content_variant` RPC, which rechecks membership and master approval and records a draft variant with an audit event.
- Saved variants must follow the existing separate submit-for-review and approval workflow. No model output is automatically approved, scheduled, published or sent to a provider.
- The feature reuses `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY`; no new migration or dependency is required.
