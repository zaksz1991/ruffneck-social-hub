import { describe, expect, it } from 'vitest';
import { buildInstagramAuthorizationUrl, getInstagramCallbackUrl, INSTAGRAM_REQUESTED_SCOPES } from './instagram';

describe('Instagram Business Login configuration', () => {
  it('uses the exact Social Hub callback path', () => {
    expect(getInstagramCallbackUrl('https://ruffneck-social-hub.vercel.app')).toBe(
      'https://ruffneck-social-hub.vercel.app/api/integrations/instagram/callback',
    );
  });

  it('requests only the basic and content-publishing scopes', () => {
    const url = new URL(buildInstagramAuthorizationUrl({
      clientId: 'instagram-app-id',
      redirectUri: 'https://ruffneck-social-hub.vercel.app/api/integrations/instagram/callback',
      state: 'signed-state',
    }));
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('scope')?.split(',')).toEqual([...INSTAGRAM_REQUESTED_SCOPES]);
    expect(url.searchParams.get('enable_fb_login')).toBe('0');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('refuses insecure production callback origins', () => {
    expect(() => getInstagramCallbackUrl('http://example.com')).toThrow();
  });
});
