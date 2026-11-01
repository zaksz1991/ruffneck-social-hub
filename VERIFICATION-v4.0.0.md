# v4.0.0 verification record

Date: 2026-11-01

## Passed

- Internal TypeScript/JavaScript syntax and local import/export audit: 142 files.
- Campaign intelligence integration audit: 7 file contracts, 4 protected RPC contracts and 3 RLS-protected tables.
- Campaign intelligence standalone regression checks: 20/20.
- Existing standalone Node regression scripts completed before the Vitest stage: 131 checks across inbox workflow, saved replies, SLA, AI triage, reply safety, reply playbooks, inbox routing automation, automation insights, customer CRM and campaign intelligence.
- Existing integration audits completed: inbox workflow (15), saved replies (17), SLA (18), AI triage (12), reply safety (19), reply playbooks (15), routing automation (17), automation insights (8), customer CRM (15), plus campaign intelligence (7).
- Targeted TypeScript semantic check of the new campaign action, route and helper declarations passed using temporary type stubs for absent Next.js/Supabase packages. This is not a full project typecheck.
- ZIP integrity check passed after packaging.

## Not verified

- Dependency-backed full `tsc --noEmit` typecheck. A global TypeScript invocation was attempted but the project dependencies and ambient framework types were unavailable; unrelated existing files also reported missing package/type declarations.
- Full Vitest suite: `npm test` completed all configured standalone Node regression scripts, then stopped at `vitest: not found`.
- Full Next.js production build: `npm run build` completed the cleanup and all configured source/integration audits, then stopped because the `next` executable was unavailable (`next: not found`). The optimized Next.js build did not run.
- Supabase migration 0027 has not been run against the live project.
- Browser visual checks, live Vercel deployment and provider analytics API integrations were not tested.

A dependency installation attempt timed out and did not leave a usable `node_modules` directory. Do not treat v4.0.0 as production-build-certified until Vercel or CI completes the full dependency-backed typecheck, Vitest suite and Next.js production build.

## Data boundary

Campaign performance metrics in v4.0.0 are manual snapshots entered by authorised workspace members. They are not fetched from Meta, LinkedIn, TikTok, YouTube, X or WhatsApp analytics APIs. UTM tagging does not collect analytics by itself.
