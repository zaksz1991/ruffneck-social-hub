# RuffNeck Social Hub v3.0.2 — Content Studio AI generation repair

## Build failure repaired

The v3.0.1 Vercel build failed because `src/app/content/ai-content-generator.tsx` imported `generateAiContentDraft` and `GenerateAiContentDraftState` from `src/app/actions/content.ts`, but that server-action module did not export them. v3.0.2 implements the missing server action and state type.

## What is included

- Complete `generateAiContentDraft` server action using React 19 `useActionState` semantics.
- Workspace authentication and membership checks; only roles permitted by the existing `canCreateContent` policy can request generation.
- Brand lookup constrained by both selected brand ID and workspace ID.
- Campaign objectives, language, tone, optional audience and a bounded campaign brief.
- Brand voice context, including approved facts and forbidden claims, sanitized through the existing AI helper.
- Local/OpenAI-compatible chat-completions call using the existing server-only `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY`.
- Editable generated preview in Content Studio. A second, explicit form submission saves the content as an ordinary draft.
- No AI approval, publishing, queue insertion or automatic external action.
- Five focused unit tests for prompt construction and response parsing.

## Configuration

No new environment variables are introduced. The assistant is enabled only when both existing server-side variables are set:

- `LOCAL_AI_BASE_URL`
- `LOCAL_AI_MODEL`

`LOCAL_AI_API_KEY` remains optional for secured inference gateways. Keep all three server-only; do not prefix them with `NEXT_PUBLIC_`. The deployment runtime must be able to reach the configured endpoint. Existing endpoint validation requires HTTPS for public hosts and permits HTTP only for private/loopback hosts.

When the model is not configured, Content Studio displays a configuration notice and the manual content-draft workflow remains available.

## Database

No migration is required. The generation action reads the existing `workspace_members` and `brands.voice_profile` data. Brand voice storage was introduced by migration `0019_brand_voice_profiles.sql` in v3.0.1.

## Safety and workflow boundaries

The model output is a suggested title and post body. The action returns this preview to the authenticated user and does not insert it into `content_items`. The user must review/edit the copy and explicitly choose **Save as content draft**. The normal existing review and publishing controls remain separate.

## Verification status

- TypeScript/TSX source parsing: run against the generated source package.
- Focused Vitest tests: included but not executed in this environment because package installation did not complete and the package ZIP has no lockfile.
- Full `next build`: not run locally. Vercel production build is the authoritative check after the updated source is pushed.
- Live inference endpoint: not tested; endpoint connectivity and model output depend on deployment configuration.
