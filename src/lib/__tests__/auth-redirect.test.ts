import { describe, expect, it } from 'vitest';
import {
  getSignupEmailRedirectTo,
  SOCIAL_HUB_AUTH_CALLBACK,
} from '../auth-redirect';

describe('RuffNeck Social Hub email confirmation redirect', () => {
  it('always uses the Social Hub callback in production, even if a shared Site URL is supplied', () => {
    expect(
      getSignupEmailRedirectTo({
        nodeEnv: 'production',
        siteUrl: 'https://ruffneck-entertainment.vercel.app',
      }),
    ).toBe(SOCIAL_HUB_AUTH_CALLBACK);
  });

  it('uses the configured local origin during development', () => {
    expect(
      getSignupEmailRedirectTo({
        nodeEnv: 'development',
        siteUrl: 'http://localhost:3001/',
      }),
    ).toBe('http://localhost:3001/auth/callback');
  });

  it('defaults to localhost when no development URL is configured', () => {
    expect(getSignupEmailRedirectTo({ nodeEnv: 'development', siteUrl: '' })).toBe(
      'http://localhost:3000/auth/callback',
    );
  });

  it('rejects insecure non-local development origins', () => {
    expect(() =>
      getSignupEmailRedirectTo({
        nodeEnv: 'development',
        siteUrl: 'http://socialhub.example.com',
      }),
    ).toThrow('must use HTTPS');
  });
});
