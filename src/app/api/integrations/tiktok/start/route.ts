import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createProviderOAuthState } from '@/lib/integrations/provider-oauth-state';
import { buildTikTokAuthorizationUrl, getTikTokCallbackUrl } from '@/lib/integrations/tiktok';
import { readTokenEncryptionKey } from '@/lib/integrations/token-crypto';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rsh_tiktok_oauth_state';
const COOKIE_PATH = '/api/integrations/tiktok';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function channelError(request: NextRequest, reason: string, workspaceId?: string) {
  const destination = new URL('/channels', request.url);
  destination.searchParams.set('error', reason);
  if (workspaceId && UUID.test(workspaceId)) destination.searchParams.set('workspace', workspaceId);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspace') ?? '';
  const brandId = request.nextUrl.searchParams.get('brand') ?? '';
  if (!UUID.test(workspaceId) || !UUID.test(brandId)) return channelError(request, 'selection');

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientKey || !clientSecret || !siteUrl) return channelError(request, 'tiktok_configuration', workspaceId);

  let encryptionKey: Buffer;
  let redirectUri: string;
  try {
    encryptionKey = readTokenEncryptionKey();
    redirectUri = getTikTokCallbackUrl(siteUrl);
  } catch {
    return channelError(request, 'tiktok_configuration', workspaceId);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=%2Fchannels', request.url));

  const { data: membership } = await supabase
    .from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return channelError(request, 'permission', workspaceId);
  }

  const { data: brand } = await supabase.from('brands').select('id')
    .eq('id', brandId).eq('workspace_id', workspaceId).maybeSingle();
  if (!brand) return channelError(request, 'selection', workspaceId);

  const state = createProviderOAuthState({
    version: 1,
    purpose: 'provider_connect',
    provider: 'tiktok',
    userId: user.id,
    workspaceId,
    brandId,
    nonce: randomBytes(32).toString('base64url'),
    expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
  }, encryptionKey);
  const authorizationUrl = buildTikTokAuthorizationUrl({ clientKey, redirectUri, state });
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 10 * 60,
  });
  return response;
}
