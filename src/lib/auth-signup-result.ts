/**
 * Classifies Supabase signUp responses without treating every no-session
 * response as a successful pending registration.
 */
export type SignupUserShape = {
  identities?: unknown[] | null;
  email_confirmed_at?: string | null;
};

export type SignupResponseKind =
  | 'missing-user'
  | 'already-exists'
  | 'authenticated'
  | 'pending-verification'
  | 'unexpected-no-session';

export function classifySignupResponse(
  user: SignupUserShape | null | undefined,
  hasSession: boolean,
): SignupResponseKind {
  if (!user) return 'missing-user';

  // Supabase may return an obfuscated user with no identities when the email
  // is already registered and user enumeration protection is enabled.
  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return 'already-exists';
  }

  if (hasSession) return 'authenticated';

  // Only report a pending verification when Supabase returned an identity
  // for this signup and the account is not already confirmed.
  if (
    Array.isArray(user.identities) &&
    user.identities.length > 0 &&
    !user.email_confirmed_at
  ) {
    return 'pending-verification';
  }

  return 'unexpected-no-session';
}
