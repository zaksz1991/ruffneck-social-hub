# RuffNeck Social Hub — Minimal Vercel Build Fix

The deployment log shows that Vercel invokes `next build` directly through the existing `vercel-build` script. The TypeScript compiler then fails on an orphaned AI provider variant component importing four server-action exports that do not exist.

This minimal patch avoids replacing the repository's full package manifest. Add the included cleanup script and change only the `vercel-build` command as documented in `APPLY.txt`.

The script fails closed: it deletes the component only if its source matches the known obsolete signature and no other source file imports or references it. Otherwise it leaves the file untouched and stops with an explicit safety message.

This is a targeted build repair, not a claim that the component's intended feature has been reimplemented. The deployment must be rerun to confirm the actual repository's reference state and full TypeScript result.
