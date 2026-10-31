export const INSTAGRAM_BASE_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
] as const;

export function getInstagramRequestedScopes(enableCommentManagement = false): string[] {
  return enableCommentManagement
    ? [...INSTAGRAM_BASE_SCOPES, 'instagram_business_manage_comments']
    : [...INSTAGRAM_BASE_SCOPES];
}

export type InstagramTokenResponse = {
  access_token?: string;
  user_id?: string | number;
  expires_in?: number;
  permissions?: string[];
  error?: { message?: string; type?: string; code?: number };
};

export type InstagramProfile = {
  user_id?: string | number;
  id?: string | number;
  username?: string;
};

export function getInstagramCallbackUrl(siteUrl: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('Production site URL must use HTTPS.');
  }
  return new URL('/api/integrations/instagram/callback', base).toString();
}

export function buildInstagramAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  includeCommentManagement?: boolean;
}): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', getInstagramRequestedScopes(input.includeCommentManagement === true).join(','));
  url.searchParams.set('state', input.state);
  url.searchParams.set('enable_fb_login', '0');
  return url.toString();
}

export function safeProviderErrorCode(value: unknown): string {
  if (!value || typeof value !== 'object') return 'provider_error';
  const record = value as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object') {
    const nested = error as Record<string, unknown>;
    if (typeof nested.code === 'number') return `provider_${nested.code}`;
    if (typeof nested.type === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(nested.type)) return `provider_${nested.type.toLowerCase()}`;
  }
  return 'provider_error';
}
