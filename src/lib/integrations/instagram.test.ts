import { describe, expect, it } from 'vitest';
import { buildInstagramAuthorizationUrl, getInstagramCallbackUrl, getInstagramRequestedScopes } from './instagram';

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
    expect(url.searchParams.get('scope')?.split(',')).toEqual(getInstagramRequestedScopes(false));
    expect(url.searchParams.get('enable_fb_login')).toBe('0');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('refuses insecure production callback origins', () => {
    expect(() => getInstagramCallbackUrl('http://example.com')).toThrow();
  });
  it('requests comment management only when explicitly enabled', () => {
    expect(getInstagramRequestedScopes(false)).not.toContain('instagram_business_manage_comments');
    expect(getInstagramRequestedScopes(true)).toContain('instagram_business_manage_comments');
    const url = new URL(buildInstagramAuthorizationUrl({ clientId: 'app', redirectUri: 'https://example.com/callback', state: 'state', includeCommentManagement: true }));
    expect(url.searchParams.get('scope')).toContain('instagram_business_manage_comments');
  });

});
