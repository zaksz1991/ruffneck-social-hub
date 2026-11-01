export type SecurityHeader = { key: string; value: string };

/** Security headers that do not impose an unreviewed Content Security Policy. */
export function getSecurityHeaders(isProduction: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ];
  if (isProduction) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
  }
  return headers;
}
