# RuffNeck Social Hub v6.4.0 — Payment Collections Analytics

## Release scope
v6.4.0 is a combined billing upgrade for the v6.1.3 billing-review-console baseline. It carries forward the v6.2.0 billing-operation hardening and v6.3.0 missing-webhook reconciliation, then adds read-only payment collections analytics.

## New `/platform/billing-analytics` dashboard
- 30-, 90- and 365-day reporting windows.
- Counts for all five manual-review states.
- Approved collection totals grouped by currency; values from different currencies are never added together.
- Pending and needs-attention amounts shown separately and never labelled as collected funds.
- Daily trend for the 30-day window and monthly trend for 90-/365-day windows.
- Approved collections split by authenticated webhook origin vs manually reconciled missing-webhook origin.
- Latest approved transactions table and a formula-safe, PII-minimized CSV download.
- Platform billing administrator authorization on both the page and export endpoint.
- Read-only service-role query; no table writes, RPC calls, new environment variables or new analytics migration.

## Accounting boundary
This page reports records from `flutterwave_manual_payment_reviews`. It measures payment events that RuffNeck administrators have separately approved after checking the Flutterwave merchant dashboard. It is not a complete accounting ledger, bank-statement reconciliation, tax report, profit statement or settlement report. Refunds, reversals, chargebacks, provider fees, settlement delays, and provider payments that never reached or were not reconciled into RuffNeck are not inferred. Always reconcile against Flutterwave and bank statements before financial decisions.

## Combined Flutterwave safeguards
- Corrects the brittle public-key audit by testing supported key formats at runtime.
- Retains Public-Key-only Inline checkout.
- A webhook receipt or browser redirect never activates a subscription.
- Missing-webhook reconciliation creates a pending review record only after exact match to an outstanding initial invoice.
- The separate dashboard-verified APPROVE workflow remains required for subscription activation or renewal.
- No fictional Secret Key is introduced.

## Database and environment
- Requires existing migrations 0043, 0046 and 0047.
- Includes migration 0048 for missing-webhook reconciliation. Apply it once only if not already applied by v6.3.0.
- Analytics reads the ledger and adds no schema changes.
- No new environment variables or payment credentials are introduced.

## Validation performed
- Billing collections analytics helper tests: passed.
- Billing collections analytics integration audit: passed.
- TypeScript/TSX syntax transpilation for new and changed pages/routes: passed.
- JavaScript syntax checks and package JSON parsing: passed.

Not performed: full repository npm test, complete Next.js production build, remote migration execution, live Vercel deployment, live Flutterwave payment or bank settlement verification.
