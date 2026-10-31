# Operational runbooks
**Pause automation:** disable workspace/account kill switch, stop claiming jobs, let in-flight requests settle and reconcile dispatching records.
**Expired token:** stop outbound work for that account, request reauthorization, verify scopes and resume.
**Ambiguous publish timeout:** mark needs_review; query provider state if supported; do not resubmit until resolved.
**Quota exhausted:** stop optional work, retain jobs, show quota status and resume only after reset/capacity change.
**Credential exposure:** revoke token, rotate secrets, disable adapter, inspect audit records and follow incident notification obligations.
