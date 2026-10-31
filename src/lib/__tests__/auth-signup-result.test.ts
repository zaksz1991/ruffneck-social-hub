import { describe, expect, it } from 'vitest';
import { classifySignupResponse } from '../auth-signup-result';

describe('classifySignupResponse', () => {
  it('does not treat a missing user as a successful registration', () => {
    expect(classifySignupResponse(null, false)).toBe('missing-user');
  });

  it('detects an obfuscated duplicate account', () => {
    expect(classifySignupResponse({ identities: [] }, false)).toBe('already-exists');
  });

  it('accepts a newly created account that still needs email verification', () => {
    expect(classifySignupResponse({ identities: [{ provider: 'email' }], email_confirmed_at: null }, false))
      .toBe('pending-verification');
  });

  it('accepts an authenticated signup response', () => {
    expect(classifySignupResponse({ identities: [{ provider: 'email' }] }, true))
      .toBe('authenticated');
  });

  it('does not label an incomplete response as successful verification', () => {
    expect(classifySignupResponse({ email_confirmed_at: null }, false))
      .toBe('unexpected-no-session');
  });
});
