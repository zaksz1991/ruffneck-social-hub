# Signup response repair

This update corrects the signup flow in the existing RuffNeck Social Hub project. It does not require a Supabase SQL migration or changes to the Vercel environment variables.

The previous server action redirected to `/login?notice=verify` whenever Supabase returned no session, without checking that Supabase had returned a newly created user identity. Supabase can return an obfuscated user with an empty `identities` array when an email is already registered. The previous code incorrectly displayed the verification-success message for that response.

The updated flow distinguishes:

- A real new email identity awaiting verification: show a verification notice on `/signup`.
- An existing or pending account: show an already-registered message on `/signup`.
- A missing user, incomplete response, configuration failure, rate limit, or Supabase error: show an error on `/signup`; do not claim registration succeeded.
- A signup that returns an authenticated session: provision the initial workspace and then open the application.

The app logs safe Supabase status/code/message details for server-side diagnosis, without logging passwords, access tokens, or submitted form values.

## Verification

A five-case Vitest regression test was added for signup response classification. Full dependency installation and Next.js build were not completed in this environment, so the update is not represented as a verified production fix.
