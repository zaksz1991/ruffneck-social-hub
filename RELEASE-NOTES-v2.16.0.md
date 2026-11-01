# RuffNeck Social Hub v2.16.0

## Local-AI campaign draft assistant

Content Studio now includes an optional AI-assisted campaign drafting tool. It can create an editable master-post title and body from a campaign brief, audience description, selected brand, objective, tone and language. The existing brand voice profile is sanitized before it is sent to the model endpoint.

### Workflow

1. A workspace owner, administrator, manager or publisher selects the brand and campaign settings.
2. The user enters a brief of 20–1,200 characters and optionally describes the audience.
3. The server validates authentication, workspace membership, role and brand/workspace association.
4. The server sends the bounded brief and sanitized brand voice information to the configured local/OpenAI-compatible model endpoint.
5. The generated result appears as an editable preview.
6. The user explicitly saves the edited result as a normal content draft.

Saving does not submit the content for approval or publish it. The existing approval and provider-variant workflows remain in force. TikTok, YouTube, X and WhatsApp are not added as publishing destinations by this release.

### Configuration

Reuses the existing optional server-side variables:

- `LOCAL_AI_BASE_URL`
- `LOCAL_AI_MODEL`
- `LOCAL_AI_API_KEY` (optional)

No new environment variables, migrations, dependencies or provider permissions are required. If the existing local-AI endpoint is not configured, the assistant displays an explanatory disabled state and manual content drafting remains available.

### Privacy and safety

The campaign brief and sanitized brand voice profile are sent to the endpoint configured by the operator. Do not enter credentials, private customer records or confidential information. The assistant is instructed not to invent prices, availability, performance claims, policies or guarantees. The model output is untrusted draft text and must be checked by a human before it is saved, reviewed or published.

### Verification limits

Static syntax and focused helper assertions are run for this package. A live model endpoint, Supabase workspace membership, full dependency-backed typecheck, complete Vitest suite, Next.js production build and production deployment are not verified by packaging this ZIP.
