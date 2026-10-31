/**
 * RuffNeck Social Hub uses a shared Supabase project with other RuffNeck apps.
 * Never derive this app's production email-confirmation destination from the
 * shared Supabase Site URL. Use this application's canonical Vercel origin.
 */
export const SOCIAL_HUB_PRODUCTION_ORIGIN = 'https://ruffneck-social-hub.vercel.app';
export const SOCIAL_HUB_AUTH_CALLBACK = `${SOCIAL_HUB_PRODUCTION_ORIGIN}/auth/callback`;

/**
 * Return the email confirmation callback for this application.
 * Production is deliberately pinned to Social Hub; local development remains
 * configurable and defaults to localhost.
 */
export function getSignupEmailRedirectTo(options?: {
  nodeEnv?: string;
  siteUrl?: string;
}): string {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === 'production') return SOCIAL_HUB_AUTH_CALLBACK;

  const configuredSiteUrl = options?.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL;
  const baseUrl = configuredSiteUrl?.trim() || 'http://localhost:3000';
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('The authentication callback URL must use HTTPS outside local development.');
  }

  return new URL('/auth/callback', parsed).toString();
}
