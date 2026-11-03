# RuffNeck Social Hub v6.1.1 — Flutterwave Setup & Verification

## Purpose

This patch adds an administrator-only setup centre for the existing RuffNeck subscription billing foundation. It provides a controlled way to verify server-side Flutterwave and Supabase configuration, create or verify recurring payment plans, and keep Flutterwave Test and Live plan IDs separate.

It does **not** connect to a user's Vercel or Flutterwave dashboard by itself. The platform administrator must add the credentials to Vercel and configure the webhook in Flutterwave. The setup centre then checks the configuration and provisions the plan records from the prices already stored in `billing_plans`.

## What's included

- `/platform/billing-setup`: private setup centre, restricted to emails listed in `BILLING_PLATFORM_ADMIN_EMAILS`.
- Server-side Flutterwave API connection check. It does not display or return secret keys to the browser.
- A Supabase service-role check that also verifies migration 0046's Test/Live columns are present.
- Separate `flutterwave_test_plan_id` and `flutterwave_live_plan_id` columns.
- Safe plan creation/reuse. Existing matching plans are reused; duplicate names or mismatched prices/currency/interval/status stop provisioning.
- Protected service-role database function to store a plan ID only after the provider plan has been checked.
- A five-minute, environment-specific database lock prevents two administrators from provisioning the same Test or Live plans concurrently.
- Environment-aware checkout: Test credentials can only use Test plan IDs; Live credentials can only use Live plan IDs.
- Pricing-change invalidation: if an administrator edits a plan amount, currency or interval, both saved provider plan IDs are cleared and checkout is disabled until those provider plans are reverified.
- Improved billing page status and a link to the setup centre for authorised platform operators.
- A fix for Next.js server-action redirect handling so a successful result is not caught and misreported as a failure.
- Focused tests and a build integration audit.

## Current paid plan prices

The setup centre reads price, currency and interval from the database. It does not hard-code prices. Review the exact values shown in the setup page before selecting the price-confirmation checkbox. The checkbox is required before any Flutterwave payment-plan records can be created.

The setup centre creates or verifies provider payment-plan records. It does not initiate a checkout, charge a customer, or prove that a live payment will settle.

## Required server environment variables

Configure these in Vercel Project → Settings → Environment Variables:

| Variable | Purpose |
|---|---|
| `FLW_SECRET_KEY` | Flutterwave secret API key for the deployment environment. Use a Test key in Preview/Test and a Live key in Production. |
| `FLW_SECRET_HASH` | Webhook secret hash for the same Flutterwave environment. It must match the hash saved in that environment's Flutterwave dashboard. |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS URL for that deployment (Preview URL in Preview; production domain in Production). |
| `BILLING_PLATFORM_ADMIN_EMAILS` | Comma-separated list of RuffNeck login email addresses allowed to open and operate the setup centre. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only Supabase service-role secret. `SUPABASE_SERVICE_KEY` is accepted as a fallback if that is what the project already uses. |

`NEXT_PUBLIC_SUPABASE_URL` and the regular Supabase public/anon key are also required by the existing project. Do not expose `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, or the Supabase service-role key through any `NEXT_PUBLIC_` variable, client component, screenshot, chat message, or Git commit.

Set Preview and Production values separately. The Preview environment should use the Flutterwave Test key and Test webhook hash. Production should use the Live key and Live webhook hash. The same migration stores IDs in separate Test and Live columns so they cannot be mixed during checkout.

## Setup workflow

1. Apply Supabase migration `0046_flutterwave_environment_plan_ids.sql` after the existing billing foundation migration `0043_billing_subscription_foundation.sql`. Apply it once; the migration is designed to be safe to rerun. Preserve and apply any other already-numbered migrations in their normal order.
2. Add the Vercel environment variables listed above. Add the exact email address used to sign into RuffNeck to `BILLING_PLATFORM_ADMIN_EMAILS`.
3. Redeploy the Vercel environment after saving its environment variables. Vercel environment-variable changes do not alter an already-running deployment.
4. Sign in with the allowlisted administrator account and open `/platform/billing-setup`.
5. Confirm the displayed mode is `TEST` when using the Test key or `LIVE` when using the Live key. The page should show that the secret key prefix is recognised, the webhook hash exists, the URL is valid HTTPS, the service-role key exists, and active billing plans can be read.
6. Select **Test Flutterwave & Supabase connection**. This is read-only: it verifies the key can read Flutterwave payment plans and that Supabase service-role access plus migration 0046 work. It does not create a payment plan or charge a card.
7. Review every paid plan's amount, currency and billing interval. Correct the billing plan records first if any displayed amount is not approved.
8. Select the confirmation checkbox and then **Create or verify [TEST/LIVE] payment plans**. The server creates a missing plan or reuses an exact-name plan only after checking its amount, currency, interval and active status. It then stores the ID in the environment-specific database column. No customer is charged.
9. In the matching Flutterwave dashboard, open Settings → Webhooks. Set the webhook URL displayed in the setup centre. Set the webhook secret hash to exactly the value configured as `FLW_SECRET_HASH` in that Vercel environment. Enable relevant payment/subscription notifications and retries, save, and send a test webhook where supported.
10. Repeat steps 2–9 for the other environment. Test and Live credentials, webhook hashes, app URLs and plan IDs must remain paired.
11. Test the complete subscription flow using Flutterwave Test credentials and a test payment method. Confirm that the callback verifies the transaction with Flutterwave and activates the correct RuffNeck workspace subscription. Confirm recurring and cancellation webhook events are recorded correctly before enabling Live checkout for customers.

## Important behaviour and safeguards

- If a stored provider plan ID no longer matches the current price/currency/interval or is inactive, provisioning stops and does not overwrite it.
- If more than one Flutterwave plan has the expected RuffNeck plan name, provisioning stops rather than guessing which one to use. If the account catalogue spans multiple API pages, setup also stops before creating anything so it cannot miss a matching plan on a later page.
- Provisioning is serialized separately for Test and Live. A crashed operation leaves a lock that expires automatically after five minutes.
- If Flutterwave creates a plan but Supabase fails to save its ID, the next run searches by the exact expected name and can safely verify/reuse it.
- Pending checkouts are not automatically marked failed just because a network request timed out. This prevents a second checkout from accidentally creating a duplicate charge.
- Payment-plan subscriptions are card-only when the `payment_plan` field is used in Flutterwave Standard Checkout. Flutterwave states that subscriptions are tied to the customer's email address. Review these implications before publishing paid plans.
- The webhook route uses Flutterwave's `verif-hash` header and constant-time comparison. Flutterwave's current v3 webhook documentation describes this header. It also recommends verifying the underlying transaction through the API, handling duplicate events idempotently, enabling retries, and returning HTTP 200 for accepted notifications.
- Test mode is not proof that Live credentials, Live payment plans, Live webhooks, settlement, or merchant account approval are ready.

## Validation performed for this patch

| Check | Result |
|---|---|
| Flutterwave environment/helper tests | PASS |
| Flutterwave setup integration audit | PASS |
| JavaScript syntax checks | PASS |
| TypeScript/TSX syntax transpilation for four changed TS/TSX files | PASS |
| Declaration-file parse checks | PASS |
| Full repository TypeScript typecheck | NOT RUN — the complete repository and installed dependency tree were not available in this working package |
| Full repository regression suite | NOT RUN |
| Full Next.js production build | NOT RUN |
| Supabase migration execution against the user's project | NOT RUN |
| Flutterwave API calls using the user's credentials | NOT RUN |
| End-to-end Test payment and webhook | NOT RUN |
| Live payment | NOT RUN |

This is a prepared integration patch, not evidence that the user's provider account has been connected or that a production payment has succeeded.
