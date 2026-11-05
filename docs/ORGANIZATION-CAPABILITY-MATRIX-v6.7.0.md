# RuffNeck Social Hub — organisation capability matrix (v6.7.0)

**Evidence baseline:** public GitHub `main`, package version 6.6.0, plus the current release notes and module audit contracts inspected on 5 November 2026. This is a conservative capability summary, not a promise that a specific organisation's provider accounts are already connected.

| Operating area | Product capability | State | Boundary / prerequisite |
|---|---|---|---|
| Workspace management | Multi-workspace and brand records | Available | Membership and database policies determine the signed-in user's visible workspaces. |
| Team governance | Invitations, role changes and protected team operations | Available | Invitation delivery is still manual copy/share in the documented baseline. |
| Content Studio | Editable platform-specific AI/content variants | Available | Generation requires a configured local/OpenAI-compatible inference endpoint. No hosted AI subscription is bundled. |
| Content calendar and queue | Scheduling, queue state and provider dispatch path | Setup-dependent | Queue records do not prove provider delivery; dispatch varies by platform and scopes. |
| Campaigns | Campaign records, objectives, UTM links and snapshots | Available | Manually entered snapshots are labelled separately from provider data. |
| Instagram | Professional account connection, supported publishing, comments/conversations, reviewed replies | Setup-dependent | Meta app access, account type and exact scopes apply. |
| Facebook Pages | Page connection, Messenger workflows, supported comment and insights features | Setup-dependent | Do not promise unrestricted Page publishing without confirming the enabled path for that Page. |
| LinkedIn | Organisation discovery, supported organic publishing and insights | Setup-dependent | LinkedIn product access and organization permissions are required. |
| TikTok | OAuth, manually requested video metrics, creator-inbox transfer | Limited | Direct public/scheduled publishing is not claimed. Creator must review/publish in TikTok. |
| YouTube | Channel analytics and optional private video transfer/upload | Limited | Public/scheduled publishing, monetisation and demographics are not claimed. Upload is explicitly consented and capped by deployment configuration. |
| WhatsApp Business | Cloud API connection, webhooks, conversations, consent, media/reply operations | Setup-dependent | Meta approval, consent and media-scanner configuration apply. Without a scanner, inbound media remains quarantined/unavailable. |
| Unified inbox | Instagram, Facebook Messenger and WhatsApp workflow | Setup-dependent | Only connected accounts, ingested messages and approved provider permissions appear. |
| Team routing and SLA | Assignment, priority/status, handoff notes, first-response measurements, routing rules | Available | Automation is workflow-only and manually triggered in the documented release; it does not send customer messages. |
| Customer CRM | Provider-specific relationship stages, tags, private notes and bounded timelines | Available | No automatic cross-provider identity merge or external contact enrichment is claimed. |
| AI triage and reply safety | Summaries, intent/priority hints, drafts and deterministic safety checks | Human-led | Human review and send-time safeguards remain. No general AI auto-send is claimed. |
| Provider analytics | Meta and LinkedIn organic metrics; manually triggered TikTok/YouTube reports | Setup-dependent | Metric definitions are provider-specific; website conversions, advertising spend/ROI and revenue are not inferred. |
| Flutterwave billing | Public-key checkout and protected manual payment review | Manual | Secret-key transaction verification is not available in public-key-only mode. A webhook is not proof of payment. |
| Subscription lifecycle | Daily due-period processing and guarded cancellation/expiry review | Partial automation | Cron can mark past-due and finalize previously confirmed cancellations; it does not verify payments, contact Flutterwave, automatically expire grace-ended subscriptions or cancel provider plans. |

## Meaning of status labels

- **Available:** application code and workflow contracts exist in the current code baseline; account configuration and deployment remain necessary.
- **Setup-dependent:** an external provider account, OAuth scopes, app approval, secret configuration or organisation setup is necessary.
- **Limited:** a narrower documented flow exists; broader provider actions should not be presented as available.
- **Human-led/manual:** the product intentionally requires an administrator or operator to verify or approve an action.

## Claims not to make

Do not claim universal cross-platform publishing, full X/Twitter integration, unrestricted Facebook Page dispatch, TikTok public auto-publishing, YouTube public scheduled publishing, universal direct-message parity, AI auto-send, automatic payment verification, social-ad buying, conversion attribution, SOC 2, ISO 27001, NDPA/GDPR certification, independent penetration testing, contractual uptime/SLA or zero operating cost.
