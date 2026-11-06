# RuffNeck Social Hub

**Multi-brand social operations for organisations, agencies and teams.**

RuffNeck Social Hub brings workspace and brand governance, content planning, supported publishing workflows, social conversations, customer operations, campaign reporting and human-governed AI assistance into one workspace-led application.

- **Live application:** https://ruffneck-social-hub.vercel.app
- **Organisation overview:** https://ruffneck-social-hub.vercel.app/organizations
- **Source repository:** https://github.com/zaksz1991/ruffneck-social-hub

> Capability note: a module in the application does not mean every external provider account is connected or every provider action is enabled. API access, app review, scopes, account type, rate limits and organisation configuration apply. See the provider capability boundaries below before making procurement or rollout assumptions.

## What organisations can do

### Workspace governance

- Separate workspaces and brands for departments, subsidiaries, clients or campaigns.
- Assign roles and manage workspace membership.
- Apply workspace-scoped database policies and role-checked server operations.
- Review protected operational and administrative activity.

### Content and publishing

- Prepare platform-specific copy and content variants in Content Studio.
- Plan content with the calendar and publishing queue.
- Organise work into campaigns and generate UTM-tagged organic landing-page links.
- Dispatch only through provider paths and account capabilities enabled for the connected account.
- Validate supported destinations and content formats before scheduling through the publishing capability guard.

The publishing capability guard is a preflight control. It does not expand provider API permissions or turn unsupported provider paths into supported publishing. Actual publication still depends on the provider adapter, account eligibility, granted scopes, media requirements, configured publishing worker and successful provider response.

### Conversations and customer operations

- Work supported Instagram, Facebook Messenger and WhatsApp Business conversations through workspace-scoped inbox workflows.
- Assign conversations, set priority and status, record internal handoff notes, configure first-response targets and use saved replies.
- Maintain provider-specific CRM stages, tags, notes and a bounded interaction timeline.
- Use AI-assisted triage, routing and reply drafts where configured, with human review and safety guards.

### Analytics and reporting

- Review supported Meta and LinkedIn organic insights and campaign snapshots.
- Trigger TikTok and YouTube analytics for eligible connected accounts.
- Export selected operational and campaign reports while keeping manually recorded values distinct from provider-reported values.

## Provider capability boundaries

| Provider | Current documented path | Important limitation |
|---|---|---|
| Instagram | Professional-account connection, supported publishing, conversations/comments and reviewed reply workflows | Meta scopes and app permissions must be granted; some actions are permission-gated and publishing formats are limited by the active provider adapter |
| Facebook Pages | Page connection, Messenger workflows, supported comment/insight features | Do not assume general Page publishing dispatch without verifying the enabled account path |
| LinkedIn | Organization connection, supported organic publishing and post insights | LinkedIn product access and organization scopes are required; publishing format support depends on the active adapter |
| TikTok | OAuth, manually triggered video metrics and explicit-consent creator-inbox transfer | Direct public/scheduled publishing is not claimed |
| YouTube | Channel analytics and optional explicit-consent private upload | Public/scheduled publishing and monetisation reporting are not claimed |
| WhatsApp Business | Cloud API connection, webhook-backed conversation and consent/media workflows | Meta approval, customer consent and optional media scanner configuration apply; WhatsApp is not a social-feed publishing destination |

A successful OAuth connection is not proof that publishing or all analytics permissions are available. Provider capabilities must be verified with the actual authorised account and returned provider responses.

## AI and cost model

The application supports an optional OpenAI-compatible inference endpoint through `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and `LOCAL_AI_API_KEY`. An organisation may operate a local/self-hosted model to avoid a required hosted-AI subscription. This does not make inference cost-free: compute, hosting, maintenance, bandwidth and security remain the organisation's responsibility. No paid AI provider is bundled or required by this application baseline.

AI suggestions are not equivalent to approval. The product uses deterministic safety controls and human review for supported reply workflows. It does not claim general AI auto-publishing or AI auto-reply.

## Security architecture

- Supabase authentication and server-side user checks.
- Workspace membership and database Row Level Security for tenant separation.
- Role-checked server actions and protected database RPCs.
- Server-side encrypted provider-token storage; provider secrets are not browser variables.
- Webhook signature/hash checks, deduplication and bounded event processing where implemented.
- Human approval for sensitive publishing, replies and payment-review actions.

These controls describe implementation patterns, not an independent security certification. This repository does not claim SOC 2, ISO 27001, NDPA/GDPR certification or a completed independent penetration test.

## Free / no-new-subscription deployment posture

This code release adds no paid SDK, paid monitoring product, paid AI API or new external SaaS dependency. The application can use an organisation-operated local AI endpoint. Existing hosting, database, Redis, email, media scanning and social-provider accounts remain subject to their own free-tier quotas, terms, limits and operational requirements. Confirm actual usage before promising zero operating cost.

## Local development

Requirements: Node.js 22 or a compatible supported Node release, npm, and a Supabase project with the required migrations applied.

1. Copy `.env.example` to your local environment file and set the required values.
2. Install dependencies with `npm install`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Start locally with `npm run dev`.

There is currently no committed `package-lock.json` in the public main branch. Dependency resolution is therefore not yet reproducible with `npm ci`; generate and review a lockfile as a separate release-engineering task before institutional procurement.

## Required deployment configuration

Review `.env.example` for the complete variable inventory. Key groups include:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `NEXT_PUBLIC_SITE_URL` plus optional `NEXT_PUBLIC_APP_URL` for canonical callback URLs.
- Server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Provider OAuth credentials and webhook verification secrets.
- `SOCIAL_PUBLISH_CRON_SECRET` for the publishing worker.
- `CRON_SECRET` for the daily subscription lifecycle processor.
- `NEXT_PUBLIC_FLW_PUBLIC_KEY`, `FLW_SECRET_HASH` and `BILLING_PLATFORM_ADMIN_EMAILS` for Flutterwave public-key checkout and manual review.

Never commit real secrets or prefix server-only credentials with `NEXT_PUBLIC_`.

## Release verification

The build pipeline runs module-specific source audits and tests for provider variants, campaigns, inbox workflows, AI safety, WhatsApp, billing, subscriptions and lifecycle processing. A green source audit is not the same as live provider verification. Before launch, also verify the deployed release, Supabase migrations, provider app review, account permissions, webhook delivery, backups and the organisation's own privacy/security obligations.

For the v6.8.4 publishing capability guard specifically, review `RELEASE-NOTES-v6.8.4.md` and `docs/PUBLISHING-VERIFICATION-PLAN-v6.8.4.md` in the release package. The guard validates eligible destination/content combinations before scheduling; it does not guarantee that an external provider will accept or publish the post.

## Organisation onboarding

1. Agree workspace/brand boundaries and role ownership.
2. Connect only organisation-owned provider accounts and grant minimum scopes.
3. Confirm content approval, response escalation and inbox ownership.
4. Choose a hosted or self-managed AI inference endpoint, or leave AI execution disabled.
5. Test publishing and inbox actions with non-customer test content/accounts.
6. Review reporting sources, manual metrics and export fields.
7. Complete legal, privacy, security, retention, backup and incident-response reviews before a production rollout.

See `docs/ORGANIZATION-CAPABILITY-MATRIX-v6.7.0.md`, `docs/ORGANIZATION-DEMO-GUIDE-v6.7.0.md` and `docs/ORGANIZATION-READINESS-AUDIT-v6.7.0.md`.
