# RuffNeck Social Hub — Vercel build repair (complete targeted files)

This archive includes the complete replacement `package.json` and both required script files. It is structured relative to the repository root: `package.json` is at the archive root and the two script files are under `scripts/`.

## What this repairs

The Vercel log shows that the deployed `vercel-build` script still runs `next build` directly. The included `package.json` changes `vercel-build` to `npm run build`, so the project's existing guarded pre-build checks execute before Next.js.

The existing build script runs `scripts/remove-known-stale-content-component.mjs` before the audits and `next build`. That script removes `src/app/content/ai-provider-variant-generator.tsx` only when all of these conditions hold:

- the file exists at that exact path;
- its source still contains the four known missing imports and the expected actions-module import;
- no other source file imports or references that component.

If any condition is not met, it preserves the file and stops with a diagnostic. It does not create placeholder AI functions or disable TypeScript checking.

## Files in this archive

- `package.json` — complete project package manifest for this v5.2.0 source snapshot, with `vercel-build` routed through `npm run build`.
- `scripts/remove-known-stale-content-component.mjs` — guarded cleanup.
- `scripts/test-remove-known-stale-content-component.mjs` — three safety regression tests.

## Compatibility note

This package was assembled from the available RuffNeck Social Hub v5.2.0 local source snapshot. The exact GitHub commit `2133232` was not available for a source-by-source comparison. The manifest preserves all scripts and dependencies from that snapshot; compare against newer repository changes before replacing the root manifest if any were added after that snapshot.
