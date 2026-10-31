import { createHmac, timingSafeEqual } from 'node:crypto';

export type ProviderOAuthState = {
  version: 1;
  purpose: 'provider_connect';
  provider: 'facebook';
  userId: string;
  workspaceId: string;
  brandId: string;
  nonce: string;
  expiresAt: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{40,64}$/;

function signingKey(rootKey: Buffer): Buffer {
  return createHmac('sha256', rootKey).update('ruffneck-social-hub:provider-oauth-state:v1').digest();
}

function sign(body: string, rootKey: Buffer): string {
  return createHmac('sha256', signingKey(rootKey)).update(body).digest('base64url');
}

export function createProviderOAuthState(payload: ProviderOAuthState, rootKey: Buffer): string {
  if (payload.version !== 1 || payload.purpose !== 'provider_connect' || payload.provider !== 'facebook' ||
      !UUID.test(payload.userId) || !UUID.test(payload.workspaceId) || !UUID.test(payload.brandId) ||
      !NONCE.test(payload.nonce) || !Number.isSafeInteger(payload.expiresAt)) {
    throw new Error('Invalid provider OAuth state payload.');
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, rootKey)}`;
}

export function verifyProviderOAuthState(
  state: string | null,
  cookieState: string | null,
  rootKey: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): ProviderOAuthState | null {
  if (!state || !cookieState || state !== cookieState || state.length > 2_048) return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [body, suppliedSignature] = parts;
  const expected = Buffer.from(sign(body, rootKey), 'base64url');
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ProviderOAuthState;
    if (parsed.version !== 1 || parsed.purpose !== 'provider_connect' || parsed.provider !== 'facebook' ||
        !UUID.test(parsed.userId) || !UUID.test(parsed.workspaceId) || !UUID.test(parsed.brandId) ||
        !NONCE.test(parsed.nonce) || !Number.isSafeInteger(parsed.expiresAt) ||
        parsed.expiresAt <= nowSeconds || parsed.expiresAt > nowSeconds + 15 * 60) return null;
    return parsed;
  } catch {
    return null;
  }
}
