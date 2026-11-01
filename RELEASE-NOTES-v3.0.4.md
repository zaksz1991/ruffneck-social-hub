# v3.0.4 — Stale component cleanup before build

- Fixes the v3.0.3 deployment gap: ZIP overlays do not remove files that are absent from the archive.
- Adds a guarded pre-build cleanup for the unreferenced `ai-provider-variant-generator.tsx` file.
- Cleanup checks the known obsolete import signature and refuses deletion if the file changed or another source file references it.
- Adds three regression tests for successful cleanup, signature mismatch protection and importer protection.
- Keeps the existing import/export audit in the build pipeline after cleanup.
- No database migration or environment-variable changes.
