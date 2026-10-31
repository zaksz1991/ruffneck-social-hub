import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyProviderOAuthState } from '@/lib/integrations/provider-oauth-state';
import {
  getLinkedInVersion,
  normalizeLinkedInAdminOrganizations,
  safeLinkedInErrorCode,
  type LinkedInOrganization,
} from '@/lib/integrations/linkedin';
import { encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rsh_linkedin_oauth_state';
const COOKIE_PATH = '/api/integrations/linkedin';
type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
  } catch {
    return {};
  }
}

function finish(request: NextRequest, workspaceId: string | undefined, status: string) {
  const destination = new URL('/channels', request.url);
  if (workspaceId) destination.searchParams.set('workspace', workspaceId);
  if (status === 'connected') destination.searchParams.set('connected', 'linkedin');
  else destination.searchParams.set('error', status);
  const response = NextResponse.redirect(destination);
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

async function linkedinGet(url: URL, accessToken: string, apiVersion: string) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': apiVersion,
      accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await readJson(response) };
}

async function getAdministeredOrganizations(accessToken: string, apiVersion: string): Promise<LinkedInOrganization[]> {
  const organizations = new Map<string, LinkedInOrganization>();
  for (let page = 0; page < 4; page += 1) {
    const url = new URL('https://api.linkedin.com/rest/organizationAcls');
    url.searchParams.set('q', 'roleAssignee');
    url.searchParams.set('role', 'ADMINISTRATOR');
    url.searchParams.set('state', 'APPROVED');
    url.searchParams.set('count', '25');
    url.searchParams.set('start', String(page * 25));
    const { response, body } = await linkedinGet(url, accessToken, apiVersion);
    if (!response.ok) throw new Error(safeLinkedInErrorCode(body, response.status));
    for (const organization of normalizeLinkedInAdminOrganizations(body)) {
      if (!organizations.has(organization.id)) organizations.set(organization.id, organization);
    }
    const paging = body.paging && typeof body.paging === 'object' ? body.paging as JsonRecord : {};
    const total = typeof paging.total === 'number' ? paging.total : null;
    if (Array.isArray(body.elements) && body.elements.length < 25) break;
    if (total !== null && (page + 1) * 25 >= total) break;
  }
  return [...organizations.values()].slice(0, 100);
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  let encryptionKey: Buffer;
  try {
    encryptionKey = readTokenEncryptionKey();
  } catch {
    return finish(request, undefined, 'encryption');
  }

  const statePayload = verifyProviderOAuthState(state, cookieState, encryptionKey);
  if (!statePayload || statePayload.provider !== 'linkedin') return finish(request, undefined, 'state');
  const { workspaceId, brandId, userId } = statePayload;
  if (request.nextUrl.searchParams.has('error')) return finish(request, workspaceId, 'cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 4_096) return finish(request, workspaceId, 'code');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return finish(request, workspaceId, 'session');

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) return finish(request, workspaceId, 'linkedin_configuration');

  let redirectUri: string;
  let apiVersion: string;
  try {
    redirectUri = new URL('/api/integrations/linkedin/callback', siteUrl).toString();
    apiVersion = getLinkedInVersion();
  } catch {
    return finish(request, workspaceId, 'linkedin_configuration');
  }

  let tokenBody: JsonRecord;
  try {
    const tokenUrl = new URL('https://www.linkedin.com/oauth/v2/accessToken');
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readJson(response);
    if (!response.ok || typeof body.access_token !== 'string' || body.access_token.length < 20 || body.access_token.length > 16_384) {
      return finish(request, workspaceId, safeLinkedInErrorCode(body, response.status));
    }
    tokenBody = body;
  } catch {
    return finish(request, workspaceId, 'exchange');
  }

  if (typeof tokenBody.scope === 'string' && !tokenBody.scope.split(/[ ,]+/).includes('w_organization_social')) {
    return finish(request, workspaceId, 'linkedin_publish_scope');
  }
  const accessToken = String(tokenBody.access_token);
  const expiresIn = typeof tokenBody.expires_in === 'number' ? tokenBody.expires_in : 0;
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 366 * 24 * 60 * 60) {
    return finish(request, workspaceId, 'linkedin_token_expiry');
  }
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  let organizations: LinkedInOrganization[];
  try {
    organizations = await getAdministeredOrganizations(accessToken, apiVersion);
    if (organizations.length === 0) return finish(request, workspaceId, 'linkedin_no_pages');
  } catch (error) {
    const message = error instanceof Error && /^linkedin_[a-z0-9_-]+$/.test(error.message)
      ? error.message : 'linkedin_organizations';
    return finish(request, workspaceId, message);
  }

  const encryptedOrganizations: Array<Record<string, unknown>> = [];
  try {
    for (const organization of organizations) {
      const encrypted = encryptProviderSecret(accessToken, encryptionKey);
      encryptedOrganizations.push({
        ...organization,
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
      });
    }
  } catch {
    return finish(request, workspaceId, 'encryption');
  }

  const { error } = await supabase.rpc('store_linkedin_organization_connections', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    target_granted_scopes: ['r_organization_admin', 'w_organization_social'],
    target_organizations: encryptedOrganizations,
    target_token_expires_at: tokenExpiresAt,
  });
  if (error) {
    console.error('[integrations.linkedin] Secure connection storage rejected:', { code: error.code });
    if (error.code === '23505') return finish(request, workspaceId, 'already_connected');
    if (error.code === '42501') return finish(request, workspaceId, 'permission');
    if (error.code === 'PGRST202' || error.code === '42883') return finish(request, workspaceId, 'linkedin_migration');
    if (error.code === '22023') return finish(request, workspaceId, 'linkedin_invalid_pages');
    return finish(request, workspaceId, 'storage');
  }

  const { error: capabilityError } = await supabase.rpc('enable_linkedin_organization_publishing', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
  });
  if (capabilityError) {
    console.error('[integrations.linkedin] Publishing capability gate rejected:', { code: capabilityError.code });
    return finish(request, workspaceId, capabilityError.code === 'PGRST202' || capabilityError.code === '42883' ? 'linkedin_migration' : 'linkedin_capability');
  }

  return finish(request, workspaceId, 'connected');
}
