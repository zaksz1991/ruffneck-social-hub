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
    id: 'tiktok', name: 'TikTok', accountLabel: 'TikTok account', availability: 'planned',
    connectionMethod: 'Official TikTok OAuth', supportedSurfaces: [],
    notes: 'Not connectable in this release. No unofficial scraping or browser automation is used.',
  },
  {
    id: 'youtube', name: 'YouTube', accountLabel: 'YouTube channel', availability: 'planned',
    connectionMethod: 'Google OAuth and YouTube Data API', supportedSurfaces: [],
    notes: 'Not connectable in this release. YouTube channel and upload workflows are a separate provider milestone.',
  },
  {
    id: 'linkedin', name: 'LinkedIn Pages', accountLabel: 'LinkedIn Page', availability: 'available',
    connectionMethod: 'LinkedIn OAuth and approved organization APIs',
    supportedSurfaces: ['Managed organization Page discovery', 'Encrypted access-token storage', 'Administrator-role verification'],
    notes: 'Page connection is read-only in this release. LinkedIn Marketing API access and r_organization_admin approval are required; publishing is not enabled.',
  },
  {
    id: 'x', name: 'X', accountLabel: 'X account', availability: 'planned',
    connectionMethod: 'Official X OAuth and API', supportedSurfaces: [],
    notes: 'Not connectable in this release. API access tier and rate limits must be confirmed first.',
  },
  {
    id: 'whatsapp', name: 'WhatsApp Business', accountLabel: 'WhatsApp Business number', availability: 'planned',
    connectionMethod: 'WhatsApp Business Platform / Cloud API', supportedSurfaces: [],
    notes: 'Not connectable in this release. Business verification, phone-number registration and messaging policy setup are required.',
  },
] as const;

export function getProviderDefinition(provider: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((item) => item.id === provider);
}

export function isSupportedProvider(provider: string): provider is SocialProvider {
  return PROVIDER_REGISTRY.some((item) => item.id === provider);
}
