# RuffNeck Social Hub v6.1.3 — Billing Review Console

## Purpose
Extends the v6.1.2 Flutterwave V3 Public-Key/manual-review workflow with a practical payment-review console for platform billing administrators. It reduces the manual-review queue's operational friction without weakening the explicit human-verification requirement.

## Features
- Status summary counts for pending, needs-attention, approved, rejected and not-required records.
- Filter records by review status.
- Exact-match search by Flutterwave transaction ID, RuffNeck invoice reference or customer email.
- Bounded pagination (25 records per page) and exact result counts.
- Filter-preserving pagination links and a clear-filters action.
- Strict query validation; raw PostgREST filters and wildcard expressions are never accepted from the URL.
- Existing platform-admin authorization, service-role reads and manual approval action are preserved.
- Payment activation remains possible only for successful, invoice-matched, pending records after the administrator confirms the transaction in Flutterwave and enters the required review note.

## No database migration
This release uses the existing `flutterwave_manual_payment_reviews` table from migration `0047_flutterwave_public_key_manual_review.sql`. It introduces no new tables, policies, RPCs, environment variables, dependencies or Flutterwave API calls.

## Baseline
Built as an overlay for the publicly visible `main` package version 6.1.2. It replaces `src/app/platform/billing-review/page.tsx`, adds the review filter helper and tests, and replaces `package.json` to register release `6.1.3`.

## Important payment limitation
The V3 Live Secret Key has not been provided. Therefore, successful initial charges and recurring renewals remain manually verified against the Flutterwave merchant dashboard before activation/renewal. A webhook signature or redirect is not treated as payment verification. The release does not claim that Flutterwave is connected or that a live payment has been tested.

## Validation status
The included pure-helper test and integration audit are run directly during package preparation. The full repository test suite, Next.js production build, actual Supabase state and live payment flow must still be verified against the deployed repository.
