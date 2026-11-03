# RuffNeck Social Hub v6.2.0
## Agency Client Portfolio Management

### Release purpose

v6.2.0 adds an agency-side client portfolio to each workspace. It gives an agency a controlled place to track the businesses it manages, service levels, contacts, retainer amounts, review dates, client status and private internal notes.

This is an overlay for the existing v6.1.0 project. It is not a standalone repository.

## What users can do

Open `/agency/clients?workspace=<workspace-id>` to:

- create a managed client record;
- record a business name and primary contact;
- save contact email, phone and a public HTTPS website;
- select Prospect, Onboarding, Active, Paused or Closed status;
- record Basic, Standard or Premium service level;
- optionally record a monthly retainer and currency;
- set service start and next review dates;
- update the client's profile and status;
- add private, append-only internal agency notes;
- search clients and filter the portfolio by status;
- see managed-client capacity against the workspace plan.

The billing page links to the client portfolio. The billing usage page now includes the managed-client allowance after migration 0045 is applied.

## Managed-client plan limit

The migration uses the existing `billing_plans.max_client_workspaces` allowance as the number of non-closed agency client records. The current catalogue values are unchanged:

| Plan | Managed client records |
|---|---:|
| Free | 1 |
| Starter | 1 |
| Professional | 5 |
| Agency | 20 |

A record in Prospect, Onboarding, Active or Paused status consumes a slot. A Closed record does not. Reopening a closed record is checked against the plan limit. Existing data is not deleted if the workspace is above its plan allowance; new client records and re-open operations are blocked until capacity is available or the plan allowance changes.

The database serializes capacity-changing requests with a workspace transaction lock, then checks the active plan before inserting or reopening a client record. The UI's disabled button is only a convenience; the database RPC performs the authoritative check.

## Permissions and privacy

- Only workspace owners, admins and managers can read or manage client portfolio records.
- Supabase Row Level Security protects both client and note tables.
- Browser roles have read-only table grants; writes go through protected security-definer RPCs that independently verify the signed-in user's workspace role.
- Internal notes are append-only through the application. Direct browser inserts, updates and deletes are not granted.
- Each record is attached to exactly one agency workspace. Composite foreign keys ensure a note cannot point to a client in another workspace.
- The feature does not grant agency users access to a client's separate RuffNeck workspace, social accounts, messages or analytics.

## Scope boundaries

This release provides an agency-side client directory, not a complete client login portal. It does not yet include:

- client invitations or external client accounts;
- cross-workspace delegation or access to a client's connected social profiles;
- client post approval/rejection;
- client-facing content previews or revision requests;
- automated billing or invoice generation for each agency client;
- white-label client portals.

Those capabilities require a separate consented workspace-sharing and approval workflow and are not implied by creating a client record.

## Database migration

Apply `supabase/migrations/0045_agency_client_management.sql` in Supabase SQL Editor after both:

1. `0043_billing_subscription_foundation.sql`
2. `0044_subscription_entitlement_enforcement.sql`

The new migration creates `agency_clients` and `agency_client_notes`, enables RLS, removes direct browser write grants, installs protected RPCs and enables the plan cap.

## Files in this overlay

### Add

- `src/app/actions/agency-clients.ts`
- `src/app/agency/clients/page.tsx`
- `src/lib/agency/client-management.mjs`
- `src/lib/agency/client-management.d.mts`
- `supabase/migrations/0045_agency_client_management.sql`
- `scripts/test-agency-client-management.mjs`
- `scripts/audit-agency-client-management.mjs`

### Replace

- `package.json` — release version and build/test hooks;
- `src/app/billing/page.tsx` — client management navigation and updated plan allowance explanation;
- `src/app/billing/usage/page.tsx` — managed-client usage card and migration status;
- `scripts/audit-billing-subscriptions.mjs` — remove the stale exact `6.0.0` release assertion while preserving the original billing audit contracts;
- `scripts/test-release-compat.mjs` — extend semantic-version regression coverage through v6.2.0;
- `scripts/lib/release-compat.mjs` — retain the shared semantic-version compatibility helper used by the audit scripts.

## Validation performed on this overlay

- focused agency-client helper tests: PASS;
- agency-client integration/security audit: PASS;
- JavaScript syntax checks: PASS;
- TSX syntax transpilation for the new route, server actions and modified billing pages: PASS;
- package JSON parse: PASS;
- ZIP integrity: PASS.

Not verified from this package-preparation environment:

- full repository `npm test`;
- complete Next.js production build;
- SQL migration execution against the live Supabase project;
- browser-level agency client workflows against production data.

The billing audit replacement addresses the exact-version failure shown in the supplied v6.1.0 deployment log. It does not establish that every remaining v6.1.0 integration audit or the full build passes.
