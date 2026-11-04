# RuffNeck Social Hub v6.1.2 — Flutterwave Live Public-Key Prefix Hotfix

## Finding

The deployed setup page reports `PUBLIC KEY MODE: NOT CONFIGURED` when its server-side
key detector returns `null`. The current v6.1.2 helper only accepts:

- `FLWPUBK_TEST-...-X` as Test
- `FLWPUBK_LIVE-...-X` as Live

Flutterwave's V3 authentication documentation says Test keys always carry the `_TEST`
marker. Standard V3 Live public keys use the form `FLWPUBK-...-X`; Test keys use
`FLWPUBK_TEST-...-X`. The old helper therefore rejects the standard Live format.

Sources:
- Flutterwave V3 authentication documentation: https://developer.flutterwave.com/v3.0.0/docs/authentication
- RuffNeck current helper: https://github.com/zaksz1991/ruffneck-social-hub/blob/main/src/lib/billing/flutterwave-public-key.mjs

## Correction

The replacement helper:
- Checks the Test format first.
- Recognises `FLWPUBK-...-X` as standard Live.
- Also accepts `FLWPUBK_LIVE-...-X` for compatibility with accounts that expose that form.
- Rejects incomplete prefixes and malformed key strings.

The test file covers both Live variants, the Test variant, the wrong key type, a bare prefix,
and a missing `-X` suffix. The build-time integration audit directly executes these checks.

## Scope

Four full-file replacements only. No database migration, Vercel variable rename, key rotation,
package dependency change, or payment-flow modification. Manual verification remains in force
until the Live Secret Key is available and the authenticated transaction-verification path is
implemented and tested.

## Validation performed in this package

- Focused Flutterwave helper regression tests: run locally in the package validation environment.
- Build-time audit assertions: included and syntax-checked.
- Full repository `npm test`, Next.js production build, Vercel deployment, and an actual
  Flutterwave transaction: not run here.

`LIVE KEY DETECTED` on the setup page indicates format recognition only. It is not proof of
account authentication or successful payment processing.
