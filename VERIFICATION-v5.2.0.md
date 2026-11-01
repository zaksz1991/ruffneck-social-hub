# v5.2.0 verification report

## Scope

Verified the incremental v5.2.0 patch against the local RuffNeck Social Hub v5.1.0 source snapshot available in this task. This snapshot has not been reconciled with a later GitHub `main` commit.

## Passed checks

- External opt-out helper regression: 15 assertions passed.
- External opt-out integration/security source audit: 14 contracts passed.
- Existing WhatsApp consent keyword regression: 21 assertions passed.
- Existing WhatsApp consent integration/security audit: 18 contracts passed.
- Internal source/import audit: 203 TypeScript/JavaScript files checked; syntax, local imports and named exports passed.
- Full configured Node-based `npm test` pipeline ran through all configured stages up to the final Vitest invocation. Existing workflow, saved replies, inbox SLA, AI triage, reply safety, playbooks, automation, customer CRM, campaign/provider/LinkedIn/TikTok/YouTube/Instagram and WhatsApp integration/operations/media regression/audit stages passed. The final command exited because `vitest` is not installed in this workspace (`vitest: not found`). Therefore `npm test` is not reported as fully passing.
- `npm run build` completed the configured pre-build audit chain, including the new consent-evidence audit and existing provider/WhatsApp audits. It stopped before Next.js compilation because `next` is not installed in this workspace (`next: not found`).

## Not verified

- Next.js production compilation and build output.
- Full TypeScript typecheck. Required project packages and type declarations are not installed in the workspace, so the standalone global TypeScript invocation cannot resolve Next.js, Supabase, React, Node or Vitest declarations.
- Migration 0039 execution against a PostgreSQL/Supabase database.
- Live UI, role-permission, text/template/media suppression and START/UNSTOP tests against the deployed application and Meta API.
- Vercel deployment.

## Security properties covered by source audit

- Workspace, WhatsApp account and recipient are derived from the conversation row, not accepted as caller input.
- The protected function requires an authenticated workspace owner, admin or manager.
- Only external source channels from the explicit allowlist are accepted; evidence references are required and bounded.
- Both inbound keyword events and externally recorded opt-outs are written to the consent event ledger.
- Authenticated users receive read access to the ledger but no direct write privileges.
- The existing v5.1 database triggers continue checking opted-out recipient state before both text/template and reviewed-media send attempts.
- The external RPC only records opt-out. It has no staff-controlled opt-in branch.

No live database or provider behavior is claimed as tested.
