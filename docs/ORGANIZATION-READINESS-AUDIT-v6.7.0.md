# RuffNeck Social Hub — organisation readiness audit (v6.7.0)

**Audit date:** 5 November 2026  
**Code baseline verified:** public GitHub `main` package version 6.6.0  
**Audit method:** review of public repository metadata, package scripts, public raw source files for the root/login pages, environment example, CI workflow, internal import audit, inbox workflow/automation audit contracts, changelog and lifecycle migration. A complete repository archive and live Supabase/Vercel credentials were not available in this review; therefore this is an evidence-based public-source review, not a full executable source-code or production penetration audit.

## Executive assessment

RuffNeck has a substantial product foundation: multi-workspace governance, brand operations, content tooling, a publishing queue, provider integrations, inbox workflows, CRM, AI safety controls, campaign intelligence, billing review and subscription lifecycle processing. The codebase's release pipeline contains extensive module-specific integration audits and focused tests.

The biggest readiness gap is no longer a lack of product modules. It is the gap between the breadth of implemented modules and the ability to prove, explain, operate and procure them confidently for an organisation. Public-facing copy and operator dashboards must be more accurate; the repository needs a reproducible dependency baseline and security reporting hygiene; and enterprise legal/operational artefacts need owner-approved policies and evidence.

## Findings and actions

### P1 — Public repository entry point is not a product README

**Evidence:** public raw `README.md` currently describes a v5.5.0 one-file build hotfix rather than the v6.6.0 platform.  
**Risk:** an organisation, auditor or partner landing on GitHub sees maintenance history instead of product scope, deployment requirements or integration boundaries.  
**Action in this release:** replace README with product overview, capability matrix, provider limitations, deployment variable groups and onboarding guidance.

### P1 — Dashboard copy and metrics can misrepresent real capability

**Evidence:** the current `src/app/page.tsx` contains hard-coded zeroes for open conversations and AI workflows and stale labels such as “Inbox not connected”, “Publishing engine in development” and “Unified inbox in development”, despite inbox workflow, AI triage, CRM and publishing modules being present elsewhere in the repository.  
**Risk:** users and prospective organisations may infer that modules do not exist, or believe a zero is a live data count when it is only a placeholder.  
**Action in this release:** replace the dashboard with truthful live metrics only where a verified query exists; label queue records as queue records; show inbox/AI as capabilities with configuration caveats; remove fake zero metrics.

### P1 — Environment template omits operational secrets and billing setup

**Evidence:** current `.env.example` documents provider/OAuth configuration but omits `CRON_SECRET`, `NEXT_PUBLIC_FLW_PUBLIC_KEY`, `FLW_SECRET_HASH` and `BILLING_PLATFORM_ADMIN_EMAILS`, even though v6.6.0 includes a daily subscription lifecycle cron and public-key/manual-review billing.  
**Risk:** fresh deployment and handover can be incomplete or rely on scattered release notes.  
**Action in this release:** replace `.env.example` with a grouped inventory; secret values remain blank and server-only variables are explicitly labelled.

### P1 — Public organisation overview is blocked by authentication middleware

**Evidence:** `middleware.ts` allows login, signup, auth callbacks, invitations and one integration callback, but does not allow `/organizations`. An unauthenticated prospect is redirected to login before the public page can render.
**Risk:** the organisation-facing product overview cannot be used as a public prospect or procurement entry point.
**Action in this release:** replace `middleware.ts` to allow `/organizations` and nested organisation overview paths anonymously while keeping the existing authentication guard on all private routes. Add a regression assertion for both paths and the retained private-route guard.

### P1 — Dependency resolution is not reproducible

**Evidence:** `package-lock.json` is not present at the public raw path, and the CI workflow uses `npm install`, not `npm ci`.  
**Risk:** semver ranges may resolve to different dependency graphs across deployments; vulnerability review and rollback reproduction are harder.  
**Action:** flagged for a separately verified lockfile-generation change. A lockfile was not fabricated in this environment because the package registry could not be queried and the exact resolved dependency tree must be generated and reviewed against the actual app. Until then, do not claim reproducible dependency builds.

### P2 — Security reporting policy and continuous security scanning are not visible in repo baseline

**Evidence:** no root `SECURITY.md` was available at the public raw path; the current CI pipeline runs typecheck, tests and build but no visible CodeQL workflow or Dependabot configuration.  
**Risk:** vulnerability reporting and code/dependency monitoring rely on maintainer memory.  
**Action in this release:** add a responsible disclosure policy, CodeQL JavaScript/TypeScript workflow and weekly Dependabot manifests. GitHub security features still require repository settings to be enabled and reviewed; a workflow is not a substitute for alert triage.

### P2 — Provider feature parity needs a single source of truth

**Evidence:** changelog and module audits describe distinct provider boundaries: TikTok inbox transfer rather than direct public dispatch; YouTube private upload and analytics rather than public scheduled publishing; LinkedIn requires organisation product/scopes; Meta features require app review and separate scopes.  
**Risk:** sales conversations can overstate “all-platform publishing” or treat a connected provider as full feature access.  
**Action in this release:** add a shared capability catalogue, public organisation page and provider matrix with available/setup/limited/manual states.

### P1 — Enterprise legal and operational assurance pack is not evidenced

**Not established by the code reviewed:** organisation privacy notice, data processing agreement, subprocessor register, data-retention/deletion schedule, data residency commitments, incident notification policy, backup/restore evidence, RTO/RPO, uptime SLA, support response commitment, accessibility conformance statement, independent penetration-test report or compliance certification.  
**Risk:** enterprise procurement may require these documents regardless of product functionality.  
**Action:** do not invent legal terms or certifications. Assign owner/legal/security review and produce them using the actual operating model before making procurement claims.

### P2 — Deployment and provider operations need acceptance evidence

**Evidence:** release notes state that full production builds, live migrations, live OAuth and provider calls remain separate deployment acceptance tasks. v6.6.0 adds a daily cron protected by `CRON_SECRET`; the lifecycle SQL deliberately does not verify payment, contact Flutterwave or expire grace-ended subscriptions.  
**Risk:** a passing source audit can be mistaken for confirmed live behaviour.  
**Action:** add organisation deployment checklist and capability caveats. Verify cron schedule, secrets, migration state, webhook delivery, app review and end-to-end test accounts after release.

## Current codebase strengths observed

- Package `6.6.0` has a large scripted `build`/`test` pipeline spanning AI variants, campaigns, WhatsApp consent/media, inbox workflow/routing/CRM, provider analytics, billing, payment review, reconciliation, collections analytics and subscription lifecycle.
- `scripts/audit-internal-imports.mjs` parses TypeScript/JavaScript sources and checks local module resolution plus imported named/default exports.
- Inbox workflow SQL contracts demonstrate workspace-scoped read policies, revoked browser writes, protected RPC mutations, manager role checks and membership validation.
- Routing automation contracts include preview/dry-run semantics, idempotency and no customer-reply send path.
- AI reply safety contracts bind review to exact draft text/latest inbound message and require separate clearance for high-risk messages.
- Daily lifecycle SQL is service-role-only, uses an advisory lock and bounded batches, and does not claim to verify payment or cancel provider plans.

## Free-of-new-subscription position

This v6.7.0 change adds no external runtime dependency, paid API, paid SaaS monitor or database migration. CodeQL and Dependabot configuration use GitHub repository automation. The existing product can use an organisation-run local/OpenAI-compatible inference endpoint. This does not eliminate the cost of hosting, compute, backups, network transfer, support or provider account usage. Free tiers have provider-specific quotas and terms.

## Audit limitations

- The full GitHub archive could not be downloaded into the audit environment; some conclusions are limited to public raw files, CI/build logs and visible module audit contracts.
- No authenticated workspace account or production database was available.
- No real Meta, LinkedIn, TikTok, YouTube, WhatsApp or Flutterwave event was triggered.
- No full repository `npm test`, typecheck, Next.js production build, automated accessibility scan, dependency audit, penetration test or restore drill was run in this environment.
- This document is not a security certification, legal opinion or compliance attestation.

## Release acceptance checks

1. Apply the overlay to main only if the package is still v6.6.0; reconcile rather than overwrite if main has advanced.
2. Run the new organization readiness helper test and integration audit.
3. Run the full `npm test`, `npm run typecheck` and Vercel production build in the repository.
4. Verify `/organizations`, `/login` and the refreshed workspace dashboard on desktop and mobile.
5. Verify CodeQL workflow and Dependabot alerts are active in repository Security settings.
6. Generate and review the dependency lockfile as a separate controlled change before production procurement.
7. Complete actual provider, privacy, backup, support and legal readiness checks with the organisation.

