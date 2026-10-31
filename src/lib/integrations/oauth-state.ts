import { createHmac, timingSafeEqual } from 'node:crypto';

export type InstagramOAuthState = {
  version: 1;
  purpose: 'instagram_connect';
  userId: string;
  workspaceId: string;
  brandId: string;
  nonce: string;
  expiresAt: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{40,64}$/;

function stateSigningKey(rootKey: Buffer): Buffer {
  return createHmac('sha256', rootKey).update('ruffneck-social-hub:instagram-oauth-state:v1').digest();
}

function signature(body: string, rootKey: Buffer): string {
  return createHmac('sha256', stateSigningKey(rootKey)).update(body).digest('base64url');
}

export function createInstagramOAuthState(payload: InstagramOAuthState, rootKey: Buffer): string {
  if (payload.version !== 1 || payload.purpose !== 'instagram_connect' ||
      !UUID.test(payload.userId) || !UUID.test(payload.workspaceId) || !UUID.test(payload.brandId) ||
      !NONCE.test(payload.nonce) || !Number.isSafeInteger(payload.expiresAt)) {
    throw new Error('Invalid Instagram OAuth state payload.');
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${signature(body, rootKey)}`;
}

export function verifyInstagramOAuthState(
  state: string | null,
  cookieState: string | null,
  rootKey: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): InstagramOAuthState | null {
  if (!state || !cookieState || state !== cookieState || state.length > 2_048) return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [body, suppliedSignature] = parts;
  let expected: Buffer;
  let supplied: Buffer;
  try {
    expected = Buffer.from(signature(body, rootKey), 'base64url');
    supplied = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InstagramOAuthState;
    if (parsed.version !== 1 || parsed.purpose !== 'instagram_connect' ||
        !UUID.test(parsed.userId) || !UUID.test(parsed.workspaceId) || !UUID.test(parsed.brandId) ||
        !NONCE.test(parsed.nonce) || !Number.isSafeInteger(parsed.expiresAt) ||
        parsed.expiresAt <= nowSeconds || parsed.expiresAt > nowSeconds + 15 * 60) return null;
    return parsed;
  } catch {
    return null;
  }
}
