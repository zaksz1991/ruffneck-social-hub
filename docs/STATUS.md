# Current implementation status

## Delivered in 0.6.0
- Branded authentication, email-confirmation callback and protected application routes.
- Workspace provisioning, multi-workspace access, brand creation and brand renaming.
- Tenant-scoped Content Studio with draft creation, editing, review submission, approval and change requests.
- Publishing calendar and PostgreSQL-backed scheduling queue for approved content.
- Same-workspace and same-brand destination validation, connected-account requirement and role-checked queue mutations.
- Brand-timezone scheduling, a 2-minute minimum lead time, a 90-day maximum horizon, duplicate active-job prevention and cancellation.
- Audit events for content and publishing queue operations.
- Dynamic dashboard counts for verified connected accounts and waiting queue records.
- Shared-project-safe Social Hub signup redirect selection and the npm-cache-free CI workflow.

## Explicitly not enabled
- Social provider OAuth and token vaulting.
- Provider dispatch worker or actual publishing to social networks.
- Unified inbox, analytics ingestion and AI model execution.
- Team invitation delivery and full member role management UI.

A queue record means only that a schedule has been stored. It is not proof of dispatch or delivery. Do not mark an account `connected` unless a real provider authorisation and account verification flow has succeeded.

## Verification status for this package
- All TypeScript/TSX source files passed TypeScript transpilation syntax checks.
- A project-wide structural TypeScript check passed using temporary ambient stubs for dependencies that could not be installed. This is not a substitute for the actual dependency-backed `npm run typecheck`.
- Four new schedule-validation scenarios passed in a standalone local check.
- Full `npm install` timed out in the build environment. The full Vitest suite and production Next.js build were therefore not run.
- SQL migration has not been applied to the live Supabase project or tested against live data.
- Vercel deployment and provider dispatch have not been verified.
