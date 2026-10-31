import Link from 'next/link';
import { signIn } from '@/app/actions/auth';
const errors: Record<string, string> = { missing: 'Enter your email and password.', invalid: 'The email or password is incorrect.', callback: 'The verification link could not be completed. Request a new one.', workspace: 'Your account was verified, but workspace setup failed. Contact the administrator before retrying.' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const params = await searchParams;
  return <main className="auth-shell"><section className="auth-panel"><Link className="auth-brand" href="/"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><p className="eyebrow">SECURE WORKSPACE ACCESS</p><h1>Welcome back.</h1><p className="muted">Sign in to manage your brands, publishing workflow and team operations.</p>
    {params.error && <p className="form-alert" role="alert">{errors[params.error] ?? 'Sign-in failed. Try again.'}</p>}
    {params.notice === 'verify' && <p className="form-success">Check your email and verify your address before signing in. Your workspace is created during onboarding after verification.</p>}
    <form action={signIn} className="auth-form"><label>Email address<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button type="submit">Sign in securely</button></form>
    <p className="auth-foot">New to RuffNeck Social Hub? <Link href="/signup">Create an account</Link></p></section><aside className="auth-aside"><span>CONTROLLED SOCIAL OPERATIONS</span><h2>One operating layer for every brand.</h2><p>Official integrations. Tenant-level access controls. Human-governed automation.</p></aside></main>;
}
