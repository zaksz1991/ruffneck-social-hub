# RuffNeck Social Hub v3.9.0 — Customer CRM

## Included

- Workspace-scoped customer relationship records for supported Instagram and Facebook Messenger conversations.
- A provider/account-specific identity key. The system does not guess that the same person across two Pages, accounts or providers is the same customer.
- Optional internal customer label, manual relationship stage and up to 12 tags.
- Recent text-message history for the selected conversation (up to 30 messages shown).
- Append-only private team notes, visible to workspace owners, admins, managers and publishers.
- Workspace membership, role validation, RLS read policies and protected database write functions.
- Responsive route at `/inbox/customers`, discoverable from the main workspace navigation and inbox navigation.

## Database

Apply `supabase/migrations/0026_inbox_customer_crm.sql` once, after migration 0025. It creates `inbox_customer_profiles` and `inbox_customer_notes`. Direct browser writes are revoked. Profile and note changes use security-definer RPCs that independently validate the authenticated user, workspace membership, role and source conversation.

## Identity and privacy boundaries

- Profiles are created only when a team member explicitly enrols a conversation into CRM.
- A profile is scoped to a single connected social account and provider participant ID. No automatic merging or cross-channel identity resolution is performed.
- Provider participant IDs are masked in the CRM interface. RuffNeck does not infer personal names, email addresses or telephone numbers.
- Internal notes are not sent to Instagram, Facebook or the customer. Notes are append-only in this release.
- Notes are readable only by operational roles. Analysts and client approvers do not receive note rows through the CRM notes query policy.
- Message history is loaded only when a CRM profile is selected and is limited to the latest 30 text messages.
- This version does not add external contact enrichment, bulk import, automated segment assignment, outbound campaigns or automated replies.

## Usage

1. Apply migration 0026 in Supabase after confirming migration 0025 is installed.
2. Open Inbox → Customer CRM.
3. Add a recent Instagram or Facebook conversation to CRM.
4. Set an internal customer label, relationship stage and tags.
5. Review the recent interaction history and add private team notes where permitted.

## Verification

The release includes a customer CRM import/export audit, SQL contract checks and helper unit tests. The ZIP does not modify GitHub, Vercel or Supabase automatically. Run the full dependency-based test suite and Next.js production build in the repository before treating it as production-verified.
