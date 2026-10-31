import { describe, expect, it } from 'vitest';
import {
  LINKEDIN_REQUESTED_SCOPES,
  buildLinkedInAuthorizationUrl,
  getLinkedInCallbackUrl,
  getLinkedInVersion,
  normalizeLinkedInAdminOrganizations,
  safeLinkedInErrorCode,
} from './linkedin';

describe('LinkedIn organization integration helpers', () => {
  it('builds an official authorization URL with the organization administration and publishing scopes', () => {
    const url = buildLinkedInAuthorizationUrl({
      clientId: 'client-123',
      redirectUri: 'https://ruffneck-social-hub.vercel.app/api/integrations/linkedin/callback',
      state: 'signed-state-value',
    });
    expect(url.origin).toBe('https://www.linkedin.com');
    expect(url.pathname).toBe('/oauth/v2/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('r_organization_admin w_organization_social');
    expect(url.searchParams.get('state')).toBe('signed-state-value');
    expect(LINKEDIN_REQUESTED_SCOPES).toEqual(['r_organization_admin', 'w_organization_social']);
  });

  it('validates callback URLs and the YYYYMM API version', () => {
    expect(getLinkedInCallbackUrl('https://example.com')).toBe('https://example.com/api/integrations/linkedin/callback');
    expect(() => getLinkedInCallbackUrl('http://example.com')).toThrow();
    expect(getLinkedInVersion('202610')).toBe('202610');
    expect(() => getLinkedInVersion('v2026.10')).toThrow();
  });

  it('accepts only approved administrator organization ACLs and deduplicates URNs', () => {
    const organizations = normalizeLinkedInAdminOrganizations({
      elements: [
        { role: 'ADMINISTRATOR', state: 'APPROVED', organizationTarget: 'urn:li:organization:12345', 'organization~': { localizedName: 'RuffNeck' } },
        { role: 'ADMINISTRATOR', state: 'APPROVED', organization: 'urn:li:organization:12345' },
        { role: 'ANALYST', state: 'APPROVED', organization: 'urn:li:organization:22222' },
        { role: 'ADMINISTRATOR', state: 'REQUESTED', organization: 'urn:li:organization:33333' },
        { role: 'ADMINISTRATOR', state: 'APPROVED', organization: 'not-an-organization-urn' },
      ],
    });
    expect(organizations).toHaveLength(1);
    expect(organizations[0]).toMatchObject({
      id: '12345',
      name: 'RuffNeck',
      organization_urn: 'urn:li:organization:12345',
      role: 'ADMINISTRATOR',
    });
  });

  it('uses a non-sensitive fallback label when the provider omits organization names', () => {
    const organizations = normalizeLinkedInAdminOrganizations({
      elements: [{ role: 'ADMINISTRATOR', state: 'APPROVED', organization: 'urn:li:organization:456' }],
    });
    expect(organizations[0]?.name).toBe('LinkedIn Organization 456');
  });

  it('normalizes API errors without exposing response details', () => {
    expect(safeLinkedInErrorCode({ serviceErrorCode: 65600 })).toBe('linkedin_65600');
    expect(safeLinkedInErrorCode({ message: 'private detail' }, 403)).toBe('linkedin_http_403');
    expect(safeLinkedInErrorCode({ message: 'private detail' })).toBe('linkedin_provider_error');
  });
});
