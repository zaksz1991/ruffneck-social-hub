export const LINKEDIN_REQUESTED_SCOPES = [
  'r_organization_admin',
  'w_organization_social',
] as const;

export type LinkedInOrganization = {
  id: string;
  name: string;
  organization_urn: string;
  role: 'ADMINISTRATOR';
};

export function getLinkedInVersion(value = process.env.LINKEDIN_API_VERSION || '202610'): string {
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error('LINKEDIN_API_VERSION must use the YYYYMM format.');
  }
  return value;
}

export function getLinkedInCallbackUrl(siteUrl: string): string {
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('The public site URL must use HTTPS.');
  }
  return new URL('/api/integrations/linkedin/callback', parsed).toString();
}

export function buildLinkedInAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): URL {
  if (!input.clientId || input.clientId.length > 256 || !input.state || input.state.length > 2048) {
    throw new Error('LinkedIn authorization parameters are invalid.');
  }
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('scope', LINKEDIN_REQUESTED_SCOPES.join(' '));
  return url;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function organizationIdFromUrn(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = /^urn:li:organization:(\d{1,20})$/.exec(value.trim());
  return match?.[1] ?? '';
}

export function normalizeLinkedInAdminOrganizations(value: unknown): LinkedInOrganization[] {
  const root = record(value);
  const elements = root && Array.isArray(root.elements) ? root.elements : [];
  const organizations = new Map<string, LinkedInOrganization>();
  for (const raw of elements) {
    const item = record(raw);
    if (!item || item.role !== 'ADMINISTRATOR' || item.state !== 'APPROVED') continue;
    const expanded = record(item['organization~']);
    const organizationObject = record(item.organization);
    const organizationUrn = typeof item.organizationTarget === 'string'
      ? item.organizationTarget
      : typeof item.organization === 'string' ? item.organization
        : typeof organizationObject?.['$URN'] === 'string' ? organizationObject['$URN'] as string : '';
    const objectId = typeof organizationObject?.id === 'string' || typeof organizationObject?.id === 'number'
      ? String(organizationObject.id) : '';
    const id = organizationIdFromUrn(organizationUrn) || (/^\d{1,20}$/.test(objectId) ? objectId : '');
    if (!id || organizations.has(id)) continue;
    const expandedName = typeof expanded?.localizedName === 'string' ? expanded.localizedName
      : typeof organizationObject?.localizedName === 'string' ? organizationObject.localizedName : '';
    const name = expandedName.trim().slice(0, 160) || `LinkedIn Organization ${id}`;
    organizations.set(id, {
      id,
      name,
      organization_urn: `urn:li:organization:${id}`,
      role: 'ADMINISTRATOR',
    });
  }
  return [...organizations.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
}

export function safeLinkedInErrorCode(value: unknown, status?: number): string {
  const root = record(value);
  const code = typeof root?.code === 'string' ? root.code : typeof root?.serviceErrorCode === 'number' ? String(root.serviceErrorCode) : '';
  if (/^[A-Za-z0-9_-]{1,32}$/.test(code)) return `linkedin_${code.toLowerCase()}`;
  if (status && Number.isInteger(status) && status >= 400 && status <= 599) return `linkedin_http_${status}`;
  return 'linkedin_provider_error';
}
