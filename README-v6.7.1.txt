# RuffNeck Social Hub v6.7.1 — Internal Import Audit Hotfix

Fixes a false-positive syntax failure in `scripts/audit-internal-imports.mjs` introduced by importing the new `src/app/home.module.css` CSS module from `src/app/page.tsx`.

The audit resolved the CSS module but called `getModuleExports()` before checking whether the target was JavaScript/TypeScript. The TypeScript parser interpreted minified CSS as TypeScript and emitted 1,676 diagnostics across the source scan.

The replacement gates default-export inspection with the same JavaScript/TypeScript extension allowlist used by the asset guard. CSS and JSON paths remain existence-checked but are not parsed as TypeScript. JavaScript/TypeScript syntax, local path and export checks are retained.

No package file, dependencies, database migration, environment variable, billing implementation or payment credential changes are included.

The Vercel log identifies a Dependabot preview branch (`dependabot/npm_and_yarn/supabase/ssr-0.12.7`, commit `f9c014b`), not the production `main` branch. Apply the patch to that branch/PR or refresh it after merging the fix to main.

Focused regression tests are included in `scripts/test-internal-imports-assets.mjs`. Full project tests and production build are not claimed as run in this patch environment.
