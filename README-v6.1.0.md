# RuffNeck Social Hub v6.1.0
## Subscription Entitlement Enforcement

### Release purpose

v6.1.0 turns selected plan allowances from catalogue information into database-enforced limits. The release builds on the v6.0.0 billing foundation; it does not activate paid checkout or change Flutterwave credentials.

### What is enforced

1. **Connected social accounts** — only records with `connection_state = 'connected'` consume an account slot. A provider connection is blocked when it would exceed the active plan's account limit.
2. **Brands** — creating a brand or moving a brand into a workspace is blocked when the resulting workspace would exceed its brand allowance.
3. **Workspace team members** — inserting a new workspace member or moving a member into a workspace is blocked when the member allowance is full.
4. **Monthly AI content generation** — successful AI content-draft generation and successful AI provider-variant batches consume one unit each. One multi-platform variant batch counts once, regardless of the number of platforms selected.

The database checks resource caps in triggers, not only in the browser. Resource-creation checks use a workspace transaction lock so concurrent requests cannot simply race past a limit. AI usage is reserved before the model call, completed on success, and released when generation throws an error. Old reservations expire after 15 minutes.

### Usage dashboard

A new authenticated page is available at:

`/billing/usage?workspace=<workspace-id>`

The Plans & Billing page contains a link to this dashboard. It shows the effective plan, current usage, capacity remaining and progress for the four enforced resource categories.

### How plans are selected

The database uses the most recent active or past-due workspace subscription whose current billing period has not ended. If no such subscription exists, it uses the active Free plan from migration 0043. A past-due subscription retains its plan only until its stored period end.

### Deliberate scope boundaries

This release does **not** enforce the client-workspace allowance because the current schema does not establish an agency-client-workspace parent relationship. The UI and snapshot label that capacity as informational only.

The AI meter in this release covers only:
- `generateAiContentDraft` (one per successful generated draft);
- `generateAiProviderVariants` (one per successful platform-variant batch).

It does not yet meter AI inbox replies, AI triage, campaign insights, or other AI tools. Manually saving or editing a draft does not consume an AI generation.

The usage period is a UTC calendar month. Failed generation attempts are released and do not count. A temporary reservation counts while a generation is in progress; reservations older than 15 minutes are released during the next reservation attempt.

### User impact and safety

- Existing brands, social accounts and team members are not removed when a workspace is already above its current plan cap.
- Existing resources remain available. New additions that would exceed a cap are rejected at the database boundary.
- Only workspace members with `owner`, `admin`, `manager` or `publisher` role can reserve AI content-generation usage, matching the existing content-creation permission helper.
- The AI usage ledger has RLS enabled and no direct browser-role table grants. Reads are through a membership-checked security-definer snapshot function.
- No OAuth scope, social provider integration, billing provider, or external message-send behavior is changed.

### Plan catalogue defaults

The limits are read from `billing_plans`, seeded by migration 0043. The current seed values are:

| Plan | Connected accounts | Brands | Team members | AI content generations/month |
|---|---:|---:|---:|---:|
| Free | 2 | 1 | 1 | 30 |
| Starter | 5 | 1 | 2 | 150 |
| Professional | 15 | 5 | 5 | 600 |
| Agency | 50 | 20 | 15 | 2,000 |

The listed prices in the billing catalogue remain proposed launch prices. Paid checkout remains disabled until the business approves prices and configures real Flutterwave payment-plan IDs.

### Database migration

Apply this migration in Supabase SQL Editor **after** `0043_billing_subscription_foundation.sql`:

`supabase/migrations/0044_subscription_entitlement_enforcement.sql`

The migration creates the private AI usage ledger, protected RPCs and database triggers. It is designed to be repeatable with `create or replace`, `create table if not exists`, and `drop trigger if exists` statements.

### Files in this overlay

- `package.json` — release version and build/test hooks.
- `src/app/actions/content.ts` — quota reservation around AI content-draft generation.
- `src/app/actions/content-provider-variants.ts` — quota reservation around platform-variant generation.
- `src/app/billing/page.tsx` — usage dashboard navigation and accurate enforcement notice.
- `src/app/billing/usage/page.tsx` — new usage dashboard.
- `src/lib/billing/entitlement-rules.mjs` and `.d.mts` — safe usage snapshot normalisation and usage calculations.
- `supabase/migrations/0044_subscription_entitlement_enforcement.sql` — database enforcement.
- `scripts/test-subscription-entitlements.mjs` — focused regression tests.
- `scripts/audit-subscription-entitlements.mjs` — release integration/security contract audit.

### Validation status

Validated locally in the prepared overlay:
- focused entitlement helper tests: PASS;
- entitlement integration audit: PASS;
- JavaScript syntax checks: PASS;
- TypeScript/TSX transpilation checks for the modified actions and pages: PASS;
- ZIP integrity: to be checked as part of packaging.

Not verified in this environment:
- full repository `npm test`;
- full Next.js production build;
- live Supabase migration execution;
- live social-account connection and team-invitation flows against production data.

This ZIP is an **overlay** for the existing v6.0.0 repository, not a standalone project. Do not replace the entire repository with the ZIP contents.
