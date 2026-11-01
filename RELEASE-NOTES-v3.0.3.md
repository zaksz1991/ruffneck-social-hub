# RuffNeck Social Hub v3.0.3 — Integrated source audit and build guard

## Vercel failure addressed

The 2026-11-01 Vercel build at commit `d80639e` failed because `src/app/content/ai-provider-variant-generator.tsx` imported five exports that were absent from `src/app/actions/content.ts`:

- `generateAiProviderVariants`
- `saveAiProviderVariants`
- `AiProviderVariantDraft`
- `GenerateAiProviderVariantsState`
- `SaveAiProviderVariantsState`

The component was not imported by the active `src/app/content/page.tsx` route. The database migrations also contained no provider-variant persistence contract. It was therefore an incomplete, unreferenced component rather than a working application feature. The complete v3.0.3 source package omits it. Exact deletion path: `src/app/content/ai-provider-variant-generator.tsx`.

## Build guard added

`npm run build` now executes `npm run audit:imports` before `next build`. The audit checks all repository TypeScript/JavaScript source files for syntax errors, unresolved relative or `@/` modules, and missing named/default exports from local modules. It reports all detected import/export contract failures in one run. Next.js still performs its normal type validation after the audit passes. This guard does not replace the Next.js production build or Vitest suite.

## Verification performed in this environment

| Check | Result |
|---|---|
| Internal source audit on packaged project | Passed — 94 TypeScript/JavaScript files |
| Negative control using the exact five missing imports from the Vercel log | Passed — guard reported all five missing exports together and exited non-zero |
| Audit rerun after removing the fixture | Passed |
| TypeScript parser syntax diagnostics | Passed as part of the source audit |
| Full `npm test` / Vitest suite | Not run — project dependencies could not be installed in this environment |
| Full `next build` | Not run — project dependencies could not be installed in this environment |
| Live Vercel/Supabase/Meta integration | Not verified |

The v3.0.3 package is not represented as having passed a full production build. Vercel's next build log remains the release acceptance check.

## Database and environment

- No new Supabase migration.
- No new environment variable.
- Retains v3.0.0 Messenger, v3.0.1 Brand Voice Studio and v3.0.2 AI content-draft changes.
- Apply migrations 0018 and 0019 only if the target database has not already recorded them as successfully applied.

## Deployment note

This is a complete source ZIP. Do not merge files while leaving stale branch-only files in place. Apply the one explicit deletion in `REMOVE-FILES-v3.0.3.txt`, then commit the complete project on the existing `main` branch. The build will run the internal-source audit automatically before `next build`.
