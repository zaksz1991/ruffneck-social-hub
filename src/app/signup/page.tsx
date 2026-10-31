import Link from 'next/link';
import { signUp } from '@/app/actions/auth';

const errors: Record<string, string> = {
  validation: 'Enter a valid email address, a password of at least 12 characters, and names between 2 and 120 characters.',
  config: 'The application could not connect to its configured authentication service. No account was created.',
  service: 'The authentication service request failed. No successful registration was confirmed. Try again later.',
  exists: 'This email is already registered or has a pending registration. Sign in or use the account recovery process instead.',
  rate: 'The authentication service has temporarily limited registration emails. Wait before trying again.',
  supabase: 'Supabase rejected the registration. Check the authentication service logs for the exact cause.',
  'no-user': 'Supabase returned no user record. The application did not mark this registration as successful.',
  incomplete: 'Supabase returned an incomplete registration response. No verification-success message was shown.',
  workspace: 'Your account was created, but the initial workspace could not be provisioned. The application signed you out to prevent access to an incomplete workspace.',
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link className="auth-brand" href="/">
          <img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" />
        </Link>
        <p className="eyebrow">CREATE YOUR ORGANISATION</p>
        <h1>Build your workspace.</h1>
        <p className="muted">Start with one workspace. Add brands, clients and teammates as your operation grows.</p>

        {params.error && (
          <p className="form-alert" role="alert">
            {errors[params.error] ?? 'Registration could not be completed. No successful account creation was confirmed.'}
          </p>
        )}

        {params.notice === 'verify' && (
          <p className="form-success" role="status">
            Supabase accepted this registration and returned a new email identity. Check that email address for the verification link. Your workspace will be created after verification.
          </p>
        )}

        <form action={signUp} className="auth-form">
          <label>Your name<input name="name" autoComplete="name" minLength={2} required /></label>
          <label>Work email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Workspace name<input name="workspace" minLength={2} maxLength={120} placeholder="Your agency or business" required /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>Use at least 12 characters.</small></label>
          <button type="submit">Create workspace</button>
        </form>
        <p className="auth-foot">Already registered? <Link href="/login">Sign in</Link></p>
      </section>
      <aside className="auth-aside">
        <span>BUILT FOR MULTI-BRAND TEAMS</span>
        <h2>Your clients stay separated by design.</h2>
        <p>Workspace membership and database policies define who can access each brand and account.</p>
      </aside>
    </main>
  );
}
