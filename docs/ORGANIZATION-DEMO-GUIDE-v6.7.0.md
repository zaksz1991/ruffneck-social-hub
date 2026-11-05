# RuffNeck Social Hub — organisation demonstration guide (v6.7.0)

## Suggested 20-minute walkthrough

### 1. Set the operating context (2 minutes)

Explain that RuffNeck is a workspace-led social operations platform for organisations, agencies and multi-brand teams. Demonstrate the public `/organizations` overview, then sign in to a demonstration workspace. Do not use a live customer workspace or expose customer records during a prospect demonstration.

### 2. Workspace and brand governance (3 minutes)

Show the workspace switcher, accessible workspace list, brand list and team access. Explain that workspace membership and database Row Level Security define the tenant boundary. Show role-specific controls without changing a prospect's access.

### 3. Content operations (4 minutes)

Open Content Studio and show editable provider-specific variants. Explain that AI generation requires a configured inference endpoint; it is not active merely because the interface exists. Show the calendar/queue and distinguish a queued record from confirmed provider delivery. Use a test account for any dispatch.

### 4. Conversations and customer operations (5 minutes)

Open the unified inbox. Show assignment, priority, status, internal notes, saved replies, first-response targets and CRM relationship context. Explain that the inbox only contains data from connected accounts and approved provider permissions. Demonstrate AI triage or reply safety only where a test workspace has a live configured model and sample data. Never send an AI-generated reply to a real customer during a prospect demo.

### 5. Campaigns and analytics (3 minutes)

Show campaign planning, UTM-tagged links, supported Meta/LinkedIn insights and manually triggered TikTok/YouTube reports where accounts are connected. Explicitly identify provider-reported, manually entered and operational data. Do not present manual snapshots as verified provider metrics.

### 6. Governance and rollout (3 minutes)

Show the integration/permission prerequisites, the human approval model and the security boundaries. Close with a scoped pilot proposal: one workspace, a limited set of brands, one or two approved provider connections, named owners/reviewers and agreed success measures.

## Demo preparation checklist

- Use a dedicated demo workspace with synthetic brand names and no real customer content.
- Create one owner/admin and one publisher test user; verify what each role can see and do.
- Use provider test accounts or non-customer accounts. Confirm app mode and permissions before connecting.
- Confirm the connected channel list and provider capabilities for each demo account.
- Configure the inference endpoint before demonstrating AI generation; otherwise describe it as optional and show the approval process without claiming a live model response.
- Keep a content draft, a scheduled-but-not-dispatched queue item and a manually reviewed analytics snapshot clearly labelled.
- Do not use fake follower counts, fake conversations, fabricated usage, revenue or customer testimonials.
- Never reveal webhook hashes, OAuth tokens, service-role credentials or private review notes.
- Have a rollback plan for any test publishing action and obtain explicit permission before publishing externally.

## Recommended organisation discovery questions

1. How many brands, departments or client accounts need separation?
2. Which provider accounts are organisation-owned, and who controls the administrator access?
3. Which channels need publishing, and which need inbox support?
4. Who approves content and customer responses? What requires a two-person review?
5. What response-time targets and escalation categories apply?
6. Which metrics are required, and which must come directly from provider APIs?
7. What privacy, retention, residency, backup, audit, procurement and security requirements must be satisfied?
8. What monthly content/conversation volume and operating hours should the pilot cover?

## Suggested pilot acceptance criteria

- Every test user can access only the workspaces and brands granted to their role.
- Every provider connection is owned by the organisation and displays the expected scopes/capabilities.
- A test content draft moves through edit, approval, queue and the verified provider path without duplicate publication.
- Inbox assignment, internal notes, priorities and escalation are correctly attributed to the intended team members.
- AI output is reviewed, scanned where the feature applies, and never sent without the required explicit human action.
- Reports identify their source and distinguish provider metrics, manual snapshots and queue counts.
- Admins can export the agreed reports without leaking credentials, unnecessary PII or internal review notes.
- Incident, data-retention, deletion, backup and support processes are documented before production launch.
