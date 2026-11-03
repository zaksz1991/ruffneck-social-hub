# RuffNeck Social Hub v6.1.1 — Billing / Managed-Client Disclosure Hotfix

## Deployment failure addressed

The v6.1.1 Vercel build reached `audit:subscription-entitlements` and failed because `src/app/billing/page.tsx` did not disclose that agency-side managed client records are counted against the plan allowance after Supabase migration 0045. The same audit also requires a link to the agency client portfolio.

## Exact correction

Replace the complete `src/app/billing/page.tsx` with the file in this package. The replacement is based on the v6.1.1 billing page and preserves its Flutterwave environment detection, separate Test/Live payment-plan selection, billing admin setup link, checkout gating, pending-payment protection, payment history, and existing billing layout.

It adds:

- A workspace-scoped `Manage agency clients` link.
- The exact managed-client disclosure required by the subscription entitlement audit.
- A plan allowance label of `Managed client accounts`.
- A clear boundary: agency client records do not grant access to a client's separate workspace or social accounts.

## Installation

Replace only:

`src/app/billing/page.tsx`

Do not replace `scripts/audit-subscription-entitlements.mjs` or weaken its assertion. No migration, dependency, environment variable, or payment-provider setting is changed by this hotfix.

## Validation performed

- TypeScript/TSX transpilation syntax check: PASS.
- Required entitlement-audit disclosure phrase: PASS.
- Required workspace-scoped agency-client link: PASS.
- Managed-client plan label: PASS.
- Flutterwave environment detection and Test/Live plan-ID wiring retained: PASS by source comparison against the v6.1.1 base component.

The full repository test suite, Next.js production build, Supabase migrations, and live Flutterwave transactions have not been run or verified by this package.
