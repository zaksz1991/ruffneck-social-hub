# RuffNeck Social Hub v5.3.1 — Provider Variant Export Compatibility Fix

This one-file patch resolves the three missing-export findings in the Vercel
internal source audit:

- `AiProviderVariantBrief` was imported by the regression test but not exported.
- `buildAiProviderVariantMessages` was used internally but not re-exported.
- `parseAiProviderVariantsResponse` was not provided as a public compatibility
  parser.

The replacement preserves the existing local-AI generation flow and its
canonical validation. It accepts JSON content, an OpenAI-compatible response
wrapper, or a decoded variants object; all variants still pass through
`parseAiProviderVariants` before being returned.

## Scope

Only `src/lib/ai/provider-variants.ts` is replaced. The patch deliberately does
not touch `package.json`, server actions, UI, database migrations, existing
provider settings, or unrelated integrations.

## Validation performed

- Targeted strict TypeScript compile of the changed module and a consumer that
  imports all three reported names: passed.
- Four runtime compatibility checks (raw JSON, OpenAI-compatible wrapper,
  decoded object, and prompt-builder export): passed.
- Available local internal-import audit: 209 TypeScript/JavaScript files passed.
- ZIP integrity: checked after packaging.

The available local source snapshot contains 209 TS/JS files, while the latest
Vercel log reports 229. The full deployed repository's test suite and Vercel
build have not been run from this environment. This patch is targeted directly
at the exact missing exports reported by the Vercel log; deployment remains the
final confirmation.
