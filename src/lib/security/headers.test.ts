import { describe, expect, it } from 'vitest';
import { getSecurityHeaders } from './headers';

describe('security headers', () => {
  it('sets baseline browser protections in every environment', () => {
    const headers = Object.fromEntries(getSecurityHeaders(false).map(({ key, value }) => [key, value]));
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('enables HSTS only in production', () => {
    const headers = Object.fromEntries(getSecurityHeaders(true).map(({ key, value }) => [key, value]));
    expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
  });
});
