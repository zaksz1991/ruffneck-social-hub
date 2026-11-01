# RuffNeck Social Hub v3.0.4 — build repair

## Why v3.0.3 still failed on Vercel

The v3.0.3 ZIP intentionally did not contain `src/app/content/ai-provider-variant-generator.tsx`, but extracting a ZIP over an existing GitHub checkout does not delete files that are absent from the archive. The stale component therefore remained in the repository and was still discovered by the source audit.

## What v3.0.4 changes

The production build now runs `scripts/remove-known-stale-content-component.mjs` before the import/export audit and Next.js build. It removes only the known obsolete component when all five known missing import names are present and no other source file imports that component. If the file has changed or is referenced, the cleanup refuses to delete it and stops with a clear error.

Then the build runs:

1. Stale-component cleanup.
2. Internal import/export audit.
3. Next.js production build.

No Supabase migration or environment-variable change is required for this repair.

## Deployment

Replace the repository contents with this release, or merge the ZIP as usual. The pre-build cleanup also handles the stale file already present in the existing GitHub repository, so a manual deletion is no longer required for this specific known orphan.
