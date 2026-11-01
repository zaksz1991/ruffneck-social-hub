# v3.0.2 package manifest

- Base source: complete v3.0.1 project package.
- Fixed the missing `generateAiContentDraft` export that blocked the Vercel TypeScript check.
- Added `src/lib/ai/content-draft.ts` and focused tests.
- Added the Content Studio AI draft component and responsive styles.
- Integrated the component into the existing Content Studio page.
- Reuses existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` configuration.
- No new database migration or environment variable.
- No automatic saving, approval, scheduling or publishing is performed by AI generation.

This ZIP is a complete project source package. It does not modify GitHub, Vercel or Supabase automatically. The generated source received syntax parsing checks; the full dependency-backed test suite and production build were not run in this environment.
