import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createProviderOAuthState, verifyProviderOAuthState } from './provider-oauth-state';

const key = randomBytes(32);
const payload = {
  version: 1 as const,
  purpose: 'provider_connect' as const,
  provider: 'facebook' as const,
  userId: '123e4567-e89b-42d3-a456-426614174000',
  workspaceId: '123e4567-e89b-42d3-a456-426614174001',
  brandId: '123e4567-e89b-42d3-a456-426614174002',
  nonce: randomBytes(32).toString('base64url'),
  expiresAt: 2_000_000_000,
};

describe('provider OAuth state', () => {
  it('round-trips a signed state bound to a cookie', () => {
    const state = createProviderOAuthState(payload, key);
    expect(verifyProviderOAuthState(state, state, key, 1_900_000_000)).toEqual(payload);
  });

  it('rejects a mismatched cookie, altered state and expired state', () => {
    const state = createProviderOAuthState(payload, key);
    expect(verifyProviderOAuthState(state, 'other', key, 1_900_000_000)).toBeNull();
    expect(verifyProviderOAuthState(`${state}x`, state, key, 1_900_000_000)).toBeNull();
    expect(verifyProviderOAuthState(state, state, key, 2_000_000_001)).toBeNull();
  });
});
