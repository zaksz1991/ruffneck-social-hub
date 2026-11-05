/**
 * Public, organization-facing capability catalogue.
 * Keep this deliberately conservative: a capability is never described as
 * universally enabled when it requires provider approval, credentials or a
 * separate human action.
 */
export const organizationCapabilityGroups = [
  {
    title: 'Workspace governance',
    intro: 'Organise teams, client brands and operating access without mixing workspaces.',
    capabilities: [
      {
        title: 'Multi-workspace and brand separation',
        status: 'available',
        detail: 'Create separate workspaces, group brands and keep workspace records behind database-enforced membership policies.',
      },
      {
        title: 'Team roles and access controls',
        status: 'available',
        detail: 'Role-gated team administration, invitations and controlled workspace operations. Some invitation delivery remains a manual copy-and-share step.',
      },
      {
        title: 'Operational audit trails',
        status: 'available',
        detail: 'Protected workflow and administrative events record important actions without exposing private provider credentials.',
      },
    ],
  },
  {
    title: 'Content and publishing',
    intro: 'Prepare platform-specific content, organise approvals and operate a publishing queue.',
    capabilities: [
      {
        title: 'Content Studio and provider variants',
        status: 'available',
        detail: 'Prepare platform-specific copy for Facebook, Instagram, LinkedIn, TikTok and YouTube. Generated text remains editable and subject to human review.',
      },
      {
        title: 'Calendar and publishing queue',
        status: 'setup',
        detail: 'Plan and queue content. Actual dispatch depends on the provider, account connection, granted scopes, media requirements and the integration-specific publishing path.',
      },
      {
        title: 'Campaign planning and UTM links',
        status: 'available',
        detail: 'Organise campaigns by brand, objective and date range; associate content and create tagged organic landing-page links.',
      },
    ],
  },
  {
    title: 'Conversations and customer operations',
    intro: 'Coordinate supported social conversations with clear ownership and human oversight.',
    capabilities: [
      {
        title: 'Unified inbox',
        status: 'setup',
        detail: 'Workspace-scoped Instagram, Facebook Messenger and WhatsApp conversation workflows are available for connected accounts and approved permissions.',
      },
      {
        title: 'Routing, SLA and saved replies',
        status: 'available',
        detail: 'Assign conversations, set priorities and statuses, use internal handoff notes, track first-response targets and create reviewed reply drafts.',
      },
      {
        title: 'Customer CRM',
        status: 'available',
        detail: 'Maintain provider-specific relationship stages, bounded tags, internal notes and a limited interaction timeline. Cross-provider identity merging is not assumed.',
      },
      {
        title: 'AI triage and reply safety',
        status: 'manual',
        detail: 'AI can assist with intent, priority, summaries and reply drafts where configured. Safety scans, human review and send-time guards remain in control; no AI auto-send is claimed.',
      },
    ],
  },
  {
    title: 'Analytics and reporting',
    intro: 'Separate provider-reported metrics from manually entered snapshots and operational queue data.',
    capabilities: [
      {
        title: 'Campaign and provider analytics',
        status: 'setup',
        detail: 'Campaign rollups and supported Meta and LinkedIn organic insights are available with the required scopes. TikTok and YouTube analytics are manually triggered and provider-limited.',
      },
      {
        title: 'Exports and operational reporting',
        status: 'available',
        detail: 'CSV exports and bounded reporting are available in selected modules. Export scope and fields differ by report; sensitive internal notes and credentials are excluded from relevant exports.',
      },
    ],
  },
];

export const providerCapabilityMatrix = [
  {
    provider: 'Instagram',
    state: 'Connected-account workflows',
    detail: 'Professional-account connection, supported publishing, conversation/comment ingestion and reviewed reply workflows; access depends on granted Meta permissions.',
  },
  {
    provider: 'Facebook Pages',
    state: 'Pages, inbox and insights',
    detail: 'Page connection, Messenger workflows and supported comment/insight features. Do not promise general Page publishing dispatch without verifying the account-specific path.',
  },
  {
    provider: 'LinkedIn',
    state: 'Organization publishing and analytics',
    detail: 'Organization administrator discovery, supported organic publishing and organization-post insights; LinkedIn product access and scopes are required.',
  },
  {
    provider: 'TikTok',
    state: 'Analytics and creator-inbox transfer',
    detail: 'OAuth connection, manually triggered video metrics and explicit-consent video transfer to the creator inbox. Direct public/scheduled publishing is not claimed.',
  },
  {
    provider: 'YouTube',
    state: 'Analytics and private upload',
    detail: 'Channel analytics and optional, explicitly consented private upload within the configured transfer limit. Public/scheduled publishing and monetisation reporting are not claimed.',
  },
  {
    provider: 'WhatsApp Business',
    state: 'Business Cloud workflows',
    detail: 'Embedded signup, webhook-backed conversations, consent controls and reviewed media/reply operations, subject to Meta approval and media-scanner configuration.',
  },
];

export const organizationReadinessNotes = [
  'Provider account access, app review, scopes and rate limits are controlled by each platform, not by RuffNeck.',
  'AI execution requires a reachable OpenAI-compatible endpoint. A self-hosted/local model can avoid a separate hosted-AI subscription, but still needs compute and operations.',
  'Publishing queues are not proof that a provider has delivered a post. Dispatch availability is provider-specific.',
  'The current Flutterwave public-key setup uses administrator payment review; it is not automated transaction verification.',
  'No SOC 2, ISO 27001, NDPA/GDPR certification, formal SLA or independent penetration-test result is claimed by this release.',
];

export function getOrganizationCapabilitySummary() {
  const counts = { available: 0, setup: 0, manual: 0 };
  for (const group of organizationCapabilityGroups) {
    for (const capability of group.capabilities) counts[capability.status] += 1;
  }
  return { ...counts, total: counts.available + counts.setup + counts.manual };
}
