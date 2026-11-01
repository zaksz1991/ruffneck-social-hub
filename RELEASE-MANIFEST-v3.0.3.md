# RuffNeck Social Hub v3.0.3 release manifest

- Base project: cumulative v3.0.2 complete source package.
- Package version: `3.0.3`.
- Added: `scripts/audit-internal-imports.mjs`.
- Updated: `package.json` — adds `audit:imports`; production `build` runs the audit before `next build`.
- Updated: `README.md` — build gate, exact stale-file removal, and corrected migration guidance.
- Added: `RELEASE-NOTES-v3.0.3.md`, `RELEASE-MANIFEST-v3.0.3.md`, and `REMOVE-FILES-v3.0.3.txt`.
- Updated: `CHANGELOG.md`.
- Removed from this complete source package: `src/app/content/ai-provider-variant-generator.tsx`. It is an unreferenced component with five non-existent server-action imports and no DB persistence contract.
- No existing active route or page imports the removed component. The existing `AiContentGenerator` component and `generateAiContentDraft` server action are retained.
- No Supabase migration or environment variable changes.
- No provider integration, auto-approval, auto-scheduling or auto-publishing is introduced.

## Validation boundary

The source audit passed on the 94 TypeScript/JavaScript files in this package. Its negative control detected all five unresolved imports from the Vercel error log. Full dependency-backed Vitest and Next.js production builds were unavailable in this environment and are not claimed as passed.
