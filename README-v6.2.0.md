# RuffNeck Social Hub v6.2.0 — Flutterwave Billing Operations

## Scope
This overlay extends the v6.1.3 billing setup and review console without changing the checkout model or the manual payment activation policy.

## Changes

### Webhook activity visibility
The platform setup page now reads the existing `billing_webhook_events` journal with the server-side Supabase client. It shows authenticated event volume over the last 24 hours, processing failures, events still marked `received`, and the six most recent event outcomes. Timestamps render in West Africa Time. No customer email, transaction reference, secret hash, or service-role credential is included in this diagnostic view.

The panel is deliberately passive. A row means an incoming webhook passed the configured `verif-hash` check and was journalled by RuffNeck. An empty journal does not prove the provider is misconfigured, and activity does not prove that every Flutterwave event was delivered.

### Manual approval guard
A pending successful payment can still be approved only by an authenticated platform billing administrator and only through the existing protected service-role database function. The server action now additionally requires:

- the existing provider-dashboard confirmation checkbox;
- the exact uppercase phrase `APPROVE`;
- a 20–2,000 character review note containing the exact numeric Flutterwave transaction ID.

The database continues to check pending invoice/subscription state, amount, currency, customer email, provider plan ID, timestamps and idempotent activation/renewal.

### Plan mapping and setup wording
The setup page distinguishes a valid-looking key prefix from an authenticated merchant connection. A configured hash means only that Vercel has a value; it cannot establish that the same value is saved in Flutterwave. The plan ID field now matches the server's safe numeric input limit.

### Billing audit stability
The billing subscription audit now tests supported key formats at runtime. It no longer depends on the literal source spelling of a regular expression, so equivalent expressions do not cause false build failures.

## Database and environment
No migration, new environment variable, secret rotation, external API call or new dependency is introduced. Existing migrations 0043, 0046 and 0047 remain prerequisites.

## Validation boundary
Included focused tests and static audit are executed during package preparation. Full `npm test`, full Next.js build, deployed webhook delivery and a real payment must still be checked in the user's repository and merchant account.
