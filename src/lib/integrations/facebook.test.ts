import { describe, expect, it } from 'vitest';
import {
  buildFacebookAuthorizationUrl, canPublishToFacebookPage, getFacebookGraphVersion,
  getGrantedFacebookPageScopes, normalizeFacebookPages,
} from './facebook';

describe('Facebook Pages integration helpers', () => {
  it('builds a versioned OAuth URL with requested Page scopes', () => {
    const url = buildFacebookAuthorizationUrl({ appId: '123456', redirectUri: 'https://example.com/callback', state: 'state' });
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.pathname).toBe('/v26.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toContain('pages_show_list');
    expect(url.searchParams.get('state')).toBe('state');
    expect(url.searchParams.get('scope')).not.toContain('pages_manage_posts');
  });

  it('rejects malformed Graph API versions', () => {
    expect(() => getFacebookGraphVersion('latest')).toThrow();
  });

  it('normalizes valid Pages while excluding malformed and duplicate records', () => {
    const pages = normalizeFacebookPages({ data: [
      { id: '1', name: 'Page One', access_token: 'secret-one', tasks: ['CREATE_CONTENT'] },
      { id: '1', name: 'Duplicate', access_token: 'secret-two' },
      { id: '2', name: 'Missing token' },
      { id: '3', name: 'Page Three', access_token: 'secret-three', tasks: ['MODERATE'] },
    ] });
    expect(pages.map((page) => page.id)).toEqual(['1', '3']);
  });

  it('uses only explicitly granted Page scopes', () => {
    expect(getGrantedFacebookPageScopes({ data: [
      { permission: 'pages_show_list', status: 'granted' },
      { permission: 'pages_manage_posts', status: 'declined' },
      { permission: 'email', status: 'granted' },
    ] })).toEqual(['pages_show_list']);
  });

  it('requires both the publishing permission and a suitable Page task', () => {
    expect(canPublishToFacebookPage(['pages_manage_posts'], ['CREATE_CONTENT'])).toBe(true);
    expect(canPublishToFacebookPage(['pages_manage_posts'], ['MODERATE'])).toBe(false);
    expect(canPublishToFacebookPage([], ['MANAGE'])).toBe(false);
  });
});
