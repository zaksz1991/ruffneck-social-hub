import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { getWhatsAppGraphVersion, isWhatsAppRegistrationPin, WHATSAPP_REQUIRED_SCOPES } from '@/lib/integrations/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type JsonRecord = Record<string, unknown>;
function isObject(value: unknown): value is JsonRecord { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
async function graphJson(url: URL, token?: string, method = 'GET', requestBody?: unknown): Promise<{ ok: boolean; body: JsonRecord }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (requestBody !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(url, { method, headers, ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }), cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body: isObject(body) ? body : {} };
}
function fail(code: string, status = 400) { return NextResponse.json({ error: code }, { status }); }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expectedOrigin = new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) return fail('Request origin could not be verified.', 403);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > 16_384) return fail('Request is too large.', 413);
  const body = await request.json().catch(() => null) as JsonRecord | null;
  if (!body || typeof body.code !== 'string' || body.code.length < 8 || body.code.length > 4096 ||
      (body.registrationPin !== undefined && typeof body.registrationPin !== 'string') ||
      typeof body.workspaceId !== 'string' || typeof body.brandId !== 'string' ||
      typeof body.waba_id !== 'string' || !/^\d{5,30}$/.test(body.waba_id) ||
      typeof body.phone_number_id !== 'string' || !/^\d{5,30}$/.test(body.phone_number_id)) return fail('Invalid WhatsApp signup response.');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Sign in is required.', 401);
  const [{ data: membership }, { data: brand }] = await Promise.all([
    supabase.from('workspace_members').select('role').eq('workspace_id', body.workspaceId).eq('user_id', user.id).maybeSingle(),
    supabase.from('brands').select('id').eq('id', body.brandId).eq('workspace_id', body.workspaceId).maybeSingle(),
  ]);
  if (!membership || !['owner','admin','manager'].includes(membership.role)) return fail('Your workspace role cannot connect accounts.', 403);
  if (!brand) return fail('Selected brand does not belong to this workspace.', 400);

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret || !process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) return fail('WhatsApp connection credentials are not configured.', 503);
  let encryptionKey: Buffer;
  let version: string;
  try { encryptionKey = readTokenEncryptionKey(); version = getWhatsAppGraphVersion(); }
  catch { return fail('WhatsApp server configuration is invalid.', 503); }

  try {
    const exchangeUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    exchangeUrl.searchParams.set('client_id', appId);
    exchangeUrl.searchParams.set('client_secret', appSecret);
    exchangeUrl.searchParams.set('code', body.code);
    const exchanged = await graphJson(exchangeUrl);
    const accessToken = typeof exchanged.body.access_token === 'string' ? exchanged.body.access_token : '';
    if (!exchanged.ok || !accessToken || accessToken.length > 16_384) return fail('Meta could not exchange the Embedded Signup authorization code.', 502);

    // Resolve independent Meta reads in parallel so free-tier serverless functions
    // do not spend several serial network timeouts inside one Embedded Signup flow.
    const debugUrl = new URL(`https://graph.facebook.com/${version}/debug_token`);
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('access_token', `${appId}|${appSecret}`);

    const wabaId = body.waba_id;
    const phoneId = body.phone_number_id;
    const phoneUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}`);
    phoneUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type');
    const wabaUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/phone_numbers`);
    wabaUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,status');
    wabaUrl.searchParams.set('limit', '100');

    const [debug, phone, numbers] = await Promise.all([
      graphJson(debugUrl),
      graphJson(phoneUrl, accessToken),
      graphJson(wabaUrl, accessToken),
    ]);
    const tokenData = isObject(debug.body.data) ? debug.body.data : {};
    const tokenScopes = Array.isArray(tokenData.scopes) ? tokenData.scopes.filter((item): item is string => typeof item === 'string') : [];
    if (!debug.ok || tokenData.is_valid !== true || tokenData.app_id !== appId) return fail('Meta returned an invalid WhatsApp authorization token.', 403);
    const missingScopes = WHATSAPP_REQUIRED_SCOPES.filter((scope) => !tokenScopes.includes(scope));
    if (missingScopes.length) return fail(`Meta did not grant required permissions: ${missingScopes.join(', ')}. Reconnect and approve both WhatsApp permissions.`, 403);
    if (!phone.ok || phone.body.id !== phoneId || typeof phone.body.display_phone_number !== 'string') return fail('Meta could not verify the selected WhatsApp phone number.', 502);

    const numberRows = Array.isArray(numbers.body.data) ? numbers.body.data : [];
    const verifiedOwnership = numbers.ok && numberRows.some((item) => isObject(item) && item.id === phoneId);
    if (!verifiedOwnership) return fail('The selected phone number is not listed under the selected WhatsApp Business Account.', 403);

    const selectedPhone = numberRows.find((item) => isObject(item) && item.id === phoneId);
    const phoneStatus = isObject(selectedPhone) && typeof selectedPhone.status === 'string' ? selectedPhone.status :
      typeof phone.body.status === 'string' ? phone.body.status : 'PENDING';
    const needsRegistration = phoneStatus !== 'CONNECTED';
    const registrationPin = typeof body.registrationPin === 'string' ? body.registrationPin : '';
    if (needsRegistration && !isWhatsAppRegistrationPin(registrationPin)) {
      return fail('This phone number is not registered with Cloud API yet. Enter a six-digit two-step verification PIN and reconnect.', 400);
    }

    // Webhook subscription and phone registration are independent Meta mutations.
    const subscribeUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/subscribed_apps`);
    const registerUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/register`);
    const [subscribed, registration] = await Promise.all([
      graphJson(subscribeUrl, accessToken, 'POST'),
      needsRegistration
        ? graphJson(registerUrl, accessToken, 'POST', { messaging_product: 'whatsapp', pin: registrationPin })
        : Promise.resolve({ ok: true, body: { success: true } }),
    ]);
    if (!subscribed.ok || subscribed.body.success === false) return fail('Meta did not subscribe this WhatsApp Business Account to the app webhook. Check WhatsApp Business Management permissions.', 502);
    if (needsRegistration && (!registration.ok || registration.body.success !== true && registration.body.success !== 'true')) {
      return fail('Meta could not register this phone number. Confirm the six-digit PIN and its verification status; do not repeatedly retry a failed registration.', 502);
    }

    const encrypted = encryptProviderSecret(accessToken, encryptionKey);
    const expiresIn = typeof exchanged.body.expires_in === 'number' && exchanged.body.expires_in > 0
      ? Math.min(exchanged.body.expires_in, 366 * 24 * 60 * 60) : 60 * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const displayPhone = String(phone.body.display_phone_number).slice(0, 80);
    const verifiedName = typeof phone.body.verified_name === 'string' ? phone.body.verified_name.slice(0, 120) : displayPhone;
    const { data: accountId, error: storeError } = await supabase.rpc('store_whatsapp_connection', {
      target_workspace_id: body.workspaceId,
      target_brand_id: body.brandId,
      target_waba_id: wabaId,
      target_phone_number_id: phoneId,
      target_display_phone_number: displayPhone,
      target_verified_name: verifiedName,
      target_granted_scopes: tokenScopes,
      target_token_ciphertext: encrypted.ciphertext,
      target_token_iv: encrypted.iv,
      target_token_auth_tag: encrypted.authTag,
      target_token_expires_at: expiresAt,
    });
    if (storeError || !accountId) {
      if (storeError) console.error('[whatsapp] Secure account storage rejected:', { code: storeError.code });
      return fail(storeError?.code === '23505' ? 'This WhatsApp phone number is already connected to another brand or workspace.' : 'WhatsApp account storage failed. Apply migration 0033 and retry.', 409);
    }
    return NextResponse.json({ connected: true, accountId, displayPhone, verifiedName });
  } catch {
    return fail('WhatsApp verification could not be completed. No account was marked connected.', 502);
  }
}
