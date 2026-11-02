# RuffNeck Social Hub v6.0.0
## Paid Plans & Subscription Billing Foundation

This release introduces workspace-level plan catalogue, billing history, Flutterwave hosted checkout, transaction verification, recurring subscription event processing and a protected webhook journal.

It is a billing foundation release. It does **not** yet enforce plan quotas across existing publishing, brand, AI or team operations. Existing workspaces are not automatically restricted or charged. Paid checkout is disabled by default until pricing and provider plan IDs are explicitly configured.

## Included

- Four editable workspace plans: Free, Starter, Professional and Agency.
- Proposed Nigerian-naira monthly prices seeded as ₦5,000, ₦15,000 and ₦40,000 for paid tiers. These are launch proposals, not final commercial pricing.
- A server-rendered `/billing` page with current workspace subscription state, plan capacities and recent payment history.
- Owner/admin-only checkout initiation, enforced in both server action and Supabase RPC.
- Flutterwave hosted Standard checkout using a configured Payment Plan ID.
- Verified transaction activation: status, reference, transaction ID, currency, exact amount and customer email are checked before a paid subscription is activated.
- Signed Flutterwave webhook handling using `verif-hash`, an idempotency journal, verified charge processing, renewal recording, past-due status and cancellation synchronization.
- Supabase row-level security and protected database functions. Browser clients have read-only access to workspace-scoped payment and subscription history.
- No card numbers, CVV, access tokens or raw webhook payloads are stored by this feature.
- No new npm dependencies.

## Important limitations

1. **Plan limits are catalogue information only.** This release displays connected-account, brand, team, client-workspace and monthly AI-generation allowances. It does not yet hard-block operations when those limits are exceeded. A separate entitlement-enforcement release must cover every relevant server action and database mutation before plans are marketed as capacity-restricted.
2. **Checkout defaults to disabled.** All paid tiers have `checkout_enabled = false` and no Flutterwave plan ID. Configure and test each provider plan before enabling it.
3. **Prices are proposals.** Review and approve all prices, taxes, fees, refund terms and customer-facing terms before enabling live payments.
4. **Flutterwave recurring Payment Plans are card-only.** The customer email used at subscription creation is tied to that subscription; changing the customer's email requires cancelling and recreating the subscription.
5. **Cancellation sync is webhook-driven.** This release does not add an in-app cancellation or upgrade/downgrade portal. An operator must cancel through Flutterwave until a customer self-service billing portal is delivered.
6. **Ambiguous renewals are not assigned automatically.** If the same billing email and provider plan identify multiple workspaces, renewal processing deliberately declines to guess. Review those cases manually rather than risking cross-workspace credit.
7. **Existing workspaces stay on the Free display fallback** until their workspace has a successful paid subscription record. This release does not create subscription rows for all existing workspaces.
8. **Ambiguous checkout requests remain pending.** If the Flutterwave checkout-creation request times out or returns an untrusted response, RuffNeck does not mark the invoice failed because Flutterwave may still have created the checkout. Confirm the invoice in Flutterwave before manually reconciling it; the workspace remains blocked from starting another checkout while that record is pending.
9. **Payment timestamps use provider verification time.** Renewal events older than the last recorded successful payment are rejected so delayed webhooks cannot extend a subscription period a second time.

## Database migration

Apply `supabase/migrations/0043_billing_subscription_foundation.sql` after migration `0042_campaign_experiment_tracker.sql`.

Do not apply migration 0043 twice manually. Confirm it is applied in Supabase before testing `/billing`.

## Environment variables

Add these to the Vercel project environment settings:

- `FLW_SECRET_KEY` — Flutterwave secret key. Use the test key for test-mode verification and the live key only for production after sign-off.
- `FLW_SECRET_HASH` — a high-entropy webhook secret hash. Configure the identical value in Flutterwave's webhook settings.
- `NEXT_PUBLIC_APP_URL` — the canonical HTTPS origin for this deployment, without a trailing path (for example, `https://your-production-domain`).

The existing server-side Supabase service-role setting is also required by the admin client: `SUPABASE_SERVICE_ROLE_KEY` (or the already-supported `SUPABASE_SERVICE_KEY`). Never expose it as a `NEXT_PUBLIC_` variable.

## Flutterwave setup sequence

1. Start in Flutterwave test mode.
2. Create one monthly NGN Payment Plan for each paid tier. Use the final approved tier amount. Keep the plan amount and the matching `billing_plans.price_amount` identical.
3. Copy the numeric Payment Plan ID returned by Flutterwave.
4. Set the `FLW_SECRET_KEY`, `FLW_SECRET_HASH` and `NEXT_PUBLIC_APP_URL` Vercel variables in the Preview/test environment first.
5. Register this webhook URL in Flutterwave: `https://your-production-domain/api/webhooks/flutterwave` (use the actual Preview URL when testing).
6. Configure the same webhook secret hash as `FLW_SECRET_HASH`; enable `charge.completed` and `subscription.cancelled`, and enable webhook retries.
7. In Supabase, set the matching plan IDs and enable checkout only after the test checkout, callback and webhook have been verified.
8. Complete a test payment, confirm the workspace subscription and payment record, then verify a renewal/cancellation event using Flutterwave's supported test process.
9. Only after commercial approval and test sign-off, repeat the setup with live Flutterwave credentials and live Payment Plan IDs.

Example Supabase SQL (replace each ID with the real numeric ID from your Flutterwave account; adjust the prices only after approval):

```sql
update public.billing_plans
set price_amount = 5000,
    currency = 'NGN',
    flutterwave_payment_plan_id = 'STARTER_PLAN_ID',
    checkout_enabled = true,
    updated_at = now()
where code = 'starter';

update public.billing_plans
set price_amount = 15000,
    currency = 'NGN',
    flutterwave_payment_plan_id = 'PROFESSIONAL_PLAN_ID',
    checkout_enabled = true,
    updated_at = now()
where code = 'professional';

update public.billing_plans
set price_amount = 40000,
    currency = 'NGN',
    flutterwave_payment_plan_id = 'AGENCY_PLAN_ID',
    checkout_enabled = true,
    updated_at = now()
where code = 'agency';
```

Keep `checkout_enabled = false` until the real matching plan ID and approved amount are present. To pause new checkouts for a tier, set `checkout_enabled = false` for that plan. Do not change a plan's amount independently from the Flutterwave payment plan used for recurring charges.

## Build and test hooks

- `npm run audit:billing-subscriptions` checks the integration's security contracts and release hooks.
- `npm run test:billing-subscriptions` checks payment references, provider identifiers, hosted checkout URL allowlisting and amount matching.
- The production build runs the billing integration audit before `next build`.
- The repository `test` script includes the focused billing tests and audit.

## Validation status for this package

Focused Node tests, release-compatibility tests, JavaScript syntax checks and the billing integration audit passed in the package workspace. A full repository `npm test`, TypeScript project check, Supabase migration execution and Vercel production build have **not** been run here. This package is not represented as production-verified.
