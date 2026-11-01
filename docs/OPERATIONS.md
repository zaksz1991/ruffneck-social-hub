# Operational runbooks
**Pause automation:** disable workspace/account kill switch, stop claiming jobs, let in-flight requests settle and reconcile dispatching records.
**Expired token:** stop outbound work for that account, request reauthorization, verify scopes and resume.
**Ambiguous publish timeout:** mark needs_review; query provider state if supported; do not resubmit until resolved.
**Quota exhausted:** stop optional work, retain jobs, show quota status and resume only after reset/capacity change.
**Credential exposure:** revoke token, rotate secrets, disable adapter, inspect audit records and follow incident notification obligations.


## Facebook Messenger send outcomes (3.0.0)

- `sent`: Meta returned a message ID, the outbound message was ingested and the send ledger was completed.
- `failed`: Meta returned a definite rejected response. Inspect Page permissions and provider error category before creating a fresh draft.
- `needs_review`: the request timed out, Meta returned a 429/5xx, the provider response lacked a message ID, or local persistence failed after a provider success. Do not retry. Check Meta Business Suite and reconcile the conversation first.
- A draft can have only one send attempt. Create a new draft only after the thread and actual provider outcome are reconciled.
- If Messenger is shown as not enabled, verify Meta app approval, Page tasks, the `messages` webhook subscription, migration 0018, then reconnect the Facebook Page.
