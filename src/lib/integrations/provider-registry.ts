export type SocialProvider = 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x' | 'whatsapp';
export type ProviderAvailability = 'available' | 'planned';

export type ProviderDefinition = {
  id: SocialProvider;
  name: string;
  accountLabel: string;
  availability: ProviderAvailability;
  connectionMethod: string;
  supportedSurfaces: string[];
  notes: string;
};

/** Central catalogue used by the channel UI and provider-facing features. */
export const PROVIDER_REGISTRY: readonly ProviderDefinition[] = [
  {
    id: 'facebook', name: 'Facebook Pages', accountLabel: 'Page', availability: 'available',
    connectionMethod: 'Facebook Login and Page access tokens',
    supportedSurfaces: ['Managed Page listing', 'Encrypted Page token storage', 'Single-image publishing via approved queue', 'Messenger inbox via signed Page webhooks', 'Local AI-assisted replies with human review and 24-hour send-window enforcement'],
    notes: 'Publishing and Messenger capabilities are separately permission-gated. Messenger replies require approved Page scopes/tasks, a verified webhook subscription, a human-reviewed draft and the standard 24-hour response window; no AI reply is sent automatically.',
  },
  {
    id: 'instagram', name: 'Instagram Business', accountLabel: 'Professional account', availability: 'available',
    connectionMethod: 'Instagram Login',
    supportedSurfaces: ['Professional profile', 'Single-image publishing', 'Publishing queue', 'Webhook inbox foundation', 'Comment triage'],
    notes: 'Some inbox and moderation operations remain permission-gated and are not sent automatically.',
  },
  {
    id: 'tiktok', name: 'TikTok', accountLabel: 'TikTok account', availability: 'available',
    connectionMethod: 'TikTok Login Kit / OAuth v2',
    supportedSurfaces: ['Official account authorization and encrypted token storage', 'Public video list analytics: views, likes, comments and shares', 'Consent-based transfer of approved videos into the creator TikTok app inbox', 'Refresh-token rotation and manual sync'],
    notes: 'TikTok API access depends on approved app products and user-granted scopes. Inbox upload transfers a video draft for the creator to finish in TikTok; this integration does not directly publish, schedule or choose public privacy settings. No scraping or browser automation is used.',
  },
  {
    id: 'youtube', name: 'YouTube', accountLabel: 'YouTube channel', availability: 'available',
    connectionMethod: 'Google OAuth, YouTube Data API v3 and YouTube Analytics API',
    supportedSurfaces: ['Google OAuth with encrypted refresh-token storage', 'Official channel and video analytics: views, watch time, average view duration, likes, comments, shares and subscriber changes', 'Human-initiated upload of approved videos as private YouTube videos', 'Upload history and duplicate/outcome-unknown protection'],
    notes: 'Analytics uses the authenticated channel owner report. Video uploads are deliberately private and manually initiated; public publishing, scheduled dispatch, comments and monetization analytics are not enabled. Google OAuth verification and YouTube API project approval may be required. Upload is capped at 64 MiB per request on this serverless deployment.',
  },
  {
    id: 'linkedin', name: 'LinkedIn Pages', accountLabel: 'LinkedIn Page', availability: 'available',
    connectionMethod: 'LinkedIn OAuth and approved organization APIs',
    supportedSurfaces: ['Managed organization Page discovery', 'Encrypted access-token storage', 'Administrator-role verification', 'Official organic organization-post analytics when approved'],
    notes: 'Post analytics uses LinkedIn Community Management organization share statistics and requires approved rw_organization_admin access and an administrator Page role. Paid/ad reporting and follower/visitor analytics are not included. Publishing permissions are independently controlled.',
  },
  {
    id: 'x', name: 'X', accountLabel: 'X account', availability: 'planned',
    connectionMethod: 'Official X OAuth and API', supportedSurfaces: [],
    notes: 'Not connectable in this release. API access tier and rate limits must be confirmed first.',
  },
  {
    id: 'whatsapp', name: 'WhatsApp Business', accountLabel: 'WhatsApp Business number', availability: 'available',
    connectionMethod: 'Meta WhatsApp Embedded Signup v4 and WhatsApp Cloud API',
    supportedSurfaces: ['Verified business phone-number connection with encrypted token storage', 'Inbound text and supported media event ingestion', 'Human-reviewed text replies inside the 24-hour customer-service window', 'Approved template messages outside the 24-hour window', 'Delivery/read receipts, contact history and unified inbox', 'AI-assisted reply drafting without automatic sending'],
    notes: 'Official Cloud API only. Meta permission approval, business eligibility and a correctly configured Embedded Signup v4 flow are required. No WhatsApp Web automation, unsolicited auto-messaging or automatic AI sending is used.',
  },
] as const;

export function getProviderDefinition(provider: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((item) => item.id === provider);
}

export function isSupportedProvider(provider: string): provider is SocialProvider {
  return PROVIDER_REGISTRY.some((item) => item.id === provider);
}
