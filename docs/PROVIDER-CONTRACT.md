# Provider integration contract
For each platform record API version, account eligibility, approved scopes, review status, media constraints, publish operations, inbox/comment operations, webhooks, quotas, token refresh/revocation and data deletion requirements.

Lifecycle: disconnected -> authorizing -> connected -> degraded/expired -> revoked.
A login success does not mean publishing or messaging capability is approved. Expose a feature only after capability-specific tests and a real authorised test. Official APIs only.
