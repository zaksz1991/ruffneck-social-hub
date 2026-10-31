import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInstagramOAuthState, verifyInstagramOAuthState } from './oauth-state';

const key = randomBytes(32);
const payload = {
  version: 1 as const,
  purpose: 'instagram_connect' as const,
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  brandId: '33333333-3333-4333-8333-333333333333',
  nonce: randomBytes(32).toString('base64url'),
  expiresAt: 1_900_000_600,
};

describe('Instagram OAuth state', () => {
  it('round-trips a signed, user/workspace/brand-bound state', () => {
    const state = createInstagramOAuthState(payload, key);
    expect(verifyInstagramOAuthState(state, state, key, 1_900_000_000)).toEqual(payload);
  });

  it('rejects a state that does not match the HttpOnly cookie', () => {
    const state = createInstagramOAuthState(payload, key);
    expect(verifyInstagramOAuthState(state, `${state}x`, key, 1_900_000_000)).toBeNull();
  });

  it('rejects tampered payloads and invalid signatures', () => {
    const state = createInstagramOAuthState(payload, key);
    const [body, signature] = state.split('.');
    const changed = `${Buffer.from(JSON.stringify({ ...payload, brandId: '44444444-4444-4444-8444-444444444444' })).toString('base64url')}.${signature}`;
    expect(verifyInstagramOAuthState(changed, changed, key, 1_900_000_000)).toBeNull();
    expect(verifyInstagramOAuthState(`${body}.${Buffer.from('bad').toString('base64url')}`, state, key, 1_900_000_000)).toBeNull();
  });

  it('rejects expired state', () => {
    const state = createInstagramOAuthState({ ...payload, expiresAt: 1_899_999_999 }, key);
    expect(verifyInstagramOAuthState(state, state, key, 1_900_000_000)).toBeNull();
  });
});
