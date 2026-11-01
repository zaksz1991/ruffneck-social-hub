# v3.5.0 — AI Reply Safety, Language and Escalation Guardrails

## Included

- Deterministic post-generation checks for both Instagram and Facebook Messenger AI reply drafts.
- Brand forbidden-claim and escalation-trigger matching using the selected brand voice profile.
- High-risk topic signals for credential exposure, suspected fraud, identity theft, legal threats, chargebacks and safety concerns.
- Warnings for potentially unsupported promises, guarantees, delivery or refund commitments.
- Language hints for English, Hausa, Yoruba, Igbo, Nigerian Pidgin and French, with an explicit uncertain state.
- A SHA-256 fingerprint that ties the assessment to the exact draft text. Editing a Messenger reply invalidates its prior safety scan and any escalation clearance.
- Workspace-readable, RPC-written assessment records with RLS, role checks, source-message freshness checks and safe aggregate audit metadata.
- A two-person clearance requirement for high-risk Facebook Messenger replies: one authorised team member reviews the draft; a different owner, admin or manager clears the escalation before a send attempt can be created.
- New Messenger drafts, including drafts created from saved replies, must have a successfully stored policy scan before a send attempt.
- The assessment RPC locks the draft row and compares the exact submitted text before saving the fingerprint, preventing a concurrent edit from being mistaken for a current scan.
- The UI also marks an assessment stale when a newer inbound customer message has arrived.
- Editing a Messenger draft resets its scan and review state. Save the edited text, run the scan again, and then have a team member review it.
- The Messenger send-attempt trigger rechecks the current brand policy at send time. If a brand voice change newly makes the reply high-risk, the previous low-risk assessment cannot authorise sending; refresh the scan and obtain second-person clearance.
- A database trigger rejects Messenger send attempts for unscanned drafts and for uncleared or stale high-risk assessments.

## Workflow

1. Open an Instagram or Facebook Messenger conversation with a latest inbound customer text.
2. Generate a reply draft using the configured private/local AI service.
3. The server checks the generated text against the brand's forbidden claims, escalation triggers, risky topic patterns, possible unsupported commitments and a lightweight language heuristic.
4. The result is stored against the exact draft and inbound message. Review the risk, detected languages and flags inside the draft card.
5. Every reply still requires a human review. A `review` result calls for extra fact and language checks.
6. For a high-risk Facebook reply, a team member marks the current scanned draft reviewed. A different owner, admin or manager must then clear the escalation. Editing the text resets the scan and review; a newer inbound message makes the assessment stale. Only after the current draft is rescanned, reviewed and (when required) cleared does the existing Messenger send flow become eligible, subject to its Page permissions, webhook, latest-message, 24-hour-window and one-attempt checks.

Instagram remains read-only for replies. Its safety scan is advisory because RuffNeck does not send Instagram DMs in this release.

## Important limits

- Language detection is a bounded phrase/marker heuristic, not machine translation or a verified language-identification model. `unknown` and uncertain matches must be treated as inconclusive.
- Policy scans are deterministic guardrails, not proof that a draft is true, complete, lawful, culturally appropriate or safe. They can produce false positives and miss risks.
- Approved brand facts are context for drafting; the rule engine does not prove a claim merely because a phrase overlaps an approved fact.
- A low-risk result is not send approval. It means only that none of the configured rules fired.
- A high-risk marker on a Facebook draft requires a separate authorised clearance by someone other than the person who marked the draft reviewed. Editing the draft invalidates the scan and clearance.
- Refreshing a Messenger scan resets the prior human review and any high-risk clearance. A team member must review the newly scanned draft again, then a different authorised manager must clear it when high-risk.
- The scan does not send, publish, translate, assign, resolve, or otherwise act on customer conversations.

## Database

Apply `supabase/migrations/0024_ai_reply_safety_and_language_guardrails.sql` once after migration 0023. Fresh installations apply migrations 0001–0024 in ascending order. For an existing v3.4.0 installation, apply only migration 0024. New Messenger drafts created after the migration must be scanned before sending; existing drafts are grandfathered to avoid silently changing past review decisions. Never rerun a migration that has already succeeded.

## Environment and providers

Reuse the existing server-only `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY`. No new Meta permission, webhook subscription or environment variable is required. Facebook Messenger retains its existing standard 24-hour window, 2,000-character limit, send permission, single-attempt ledger and no-automatic-retry rules.
