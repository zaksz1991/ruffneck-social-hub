/**
 * Middleware routing policy.
 *
 * API route handlers own API authentication and machine-to-machine verification.
 * The middleware must not convert webhook/worker requests into login redirects.
 */
export type RequestBoundaryDecision =
  | 'delegate-api'
  | 'allow-public-page'
  | 'allow-authenticated-page'
  | 'redirect-to-login'
  | 'redirect-to-home';

function isPathOrChild(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function getRequestBoundaryDecision(
  pathname: string,
  authenticated: boolean,
): RequestBoundaryDecision {
  // Every API handler must enforce its own user session, OAuth state, webhook
  // signature, or service bearer secret. Middleware does not gate API routes.
  if (isPathOrChild(pathname, '/api')) return 'delegate-api';

  const isLoginOrSignup = pathname === '/login' || pathname === '/signup';
  if (isLoginOrSignup) return authenticated ? 'redirect-to-home' : 'allow-public-page';

  if (isPathOrChild(pathname, '/auth') || isPathOrChild(pathname, '/invite')) {
    return 'allow-public-page';
  }

  return authenticated ? 'allow-authenticated-page' : 'redirect-to-login';
}
