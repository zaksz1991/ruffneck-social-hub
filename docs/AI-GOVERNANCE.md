# AI governance
Default mode is L1: classify, summarise and draft; human sends.
L2 may send only exact pre-approved templates for narrow intents after explicit brand opt-in.
L3 model-generated auto-send is disabled until risk review, confidence calibration, sampling, rate limits, opt-out handling and emergency stop are proven.

Brand profile includes tone, languages, approved facts, forbidden claims and escalation triggers. AI cannot select tenants/accounts, access secrets, change permissions, invent product facts or call platform APIs. Optional Ollama-compatible inference must be private/authenticated; app remains functional without AI.
