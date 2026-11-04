# RuffNeck Social Hub v6.3.0 — Combined Billing Operations Upgrade

## Target baseline
This combined upgrade starts from the v6.1.3 billing-review-console baseline and incorporates the v6.2.0 Flutterwave billing-operations hardening plus v6.3.0 missing-webhook reconciliation. It avoids requiring the v6.2.0 overlay to be installed as a separate step. It still requires the v6.1.2 Public-Key checkout/manual-review foundation and migration 0047 to be present, as they are in the v6.1.3 baseline.

## Included upgrades
- Fixes the Flutterwave billing audit so it validates supported public-key formats at runtime rather than depending on a regular-expression source spelling.
- Improves billing setup diagnostics: webhook event activity, processing failures, incomplete events and clearer key/hash status wording.
- Preserves the Public-Key-only checkout model and its manual payment review requirement.
- Adds typed `APPROVE` confirmation and a transaction-specific approval note to the separate manual activation step.
- Adds `/platform/billing-reconcile` for missing successful initial-payment webhooks. It compares the transaction reference, amount, currency, customer email and plan ID against a locked pending RuffNeck invoice.
- Marks the new record `manual_reconciliation`, retains the reconciliation actor/time/note, and leaves it pending. The existing separate approval action is still required to activate access.
- Updates the review console to display webhook vs manual-reconciliation provenance.
- Adds migration 0048 and focused validation/audit checks.

## Strict payment boundaries
This release does not call Flutterwave transaction-verification APIs, does not invent a Secret Key, and does not activate subscriptions from checkout redirects or webhooks. Missing-webhook reconciliation is limited to initial successful payments attached to a pending RuffNeck invoice. Missing recurring-renewal webhooks are not eligible for this form. Every payment still requires a second, separate manual approval after direct inspection in the Flutterwave merchant dashboard.

## Database and environment
Apply migration `0048_flutterwave_missing_webhook_reconciliation.sql` once, after migrations 0043, 0046 and 0047 are already applied. No new Vercel environment variables or credentials are required. Keep the Supabase service-role key server-side only.

## Validation boundary
Focused Flutterwave operation tests, missing-webhook input tests, static integration audits and TypeScript/TSX syntax transpilation were run during preparation. The complete repository test suite, full Next.js production build, remote Supabase migration and a real Live transaction were not run in the user's environment.
