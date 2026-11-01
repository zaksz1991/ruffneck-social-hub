# RuffNeck Social Hub v3.0.4 release manifest

- Base project: complete cumulative v3.0.3 source package.
- Package version: `3.0.4`.
- Updated `package.json`: build now runs guarded stale-component cleanup, then the internal import/export audit, then `next build`.
- Added `scripts/remove-known-stale-content-component.mjs`: removes only the known obsolete, unreferenced `src/app/content/ai-provider-variant-generator.tsx` file when its five-import signature matches. It refuses to remove a changed file or a file referenced by another source file.
- Added `scripts/remove-known-stale-content-component.test.mjs`: regression tests for removal, modified-file protection and importer protection.
- Kept `scripts/audit-internal-imports.mjs` as the next build gate.
- Updated `README.md`, `CHANGELOG.md`, and added v3.0.4 repair/release notes.
- No Supabase migration or environment-variable changes.

## Verification

- Internal source audit: passed on 96 TypeScript/JavaScript files after cleanup.
- Cleanup regression checks: 3 scenarios passed (manual Node execution of the same test cases).
- ZIP integrity: verified after packaging.
- Dependency installation: attempted but timed out in this environment.
- Vitest suite and full Next.js production build: not run; no successful dependency installation was available. Do not treat this package as independently production-build-verified until Vercel completes its build.
