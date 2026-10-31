import Link from 'next/link';
import { signUp } from '@/app/actions/auth';
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="auth-shell"><section className="auth-panel"><Link className="auth-brand" href="/"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><p className="eyebrow">CREATE YOUR ORGANISATION</p><h1>Build your workspace.</h1><p className="muted">Start with one workspace. Add brands, clients and teammates as your operation grows.</p>
    {params.error && <p className="form-alert" role="alert">{params.error === 'validation' ? 'Use a valid email, a password of at least 12 characters, and names with at least 2 characters.' : 'Account creation could not be completed. Check your Supabase Auth configuration and try again.'}</p>}
    <form action={signUp} className="auth-form"><label>Your name<input name="name" autoComplete="name" minLength={2} required /></label><label>Work email<input name="email" type="email" autoComplete="email" required /></label><label>Workspace name<input name="workspace" minLength={2} maxLength={120} placeholder="Your agency or business" required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>Use at least 12 characters.</small></label><button type="submit">Create workspace</button></form>
    <p className="auth-foot">Already registered? <Link href="/login">Sign in</Link></p></section><aside className="auth-aside"><span>BUILT FOR MULTI-BRAND TEAMS</span><h2>Your clients stay separated by design.</h2><p>Workspace membership and database policies define who can access each brand and account.</p></aside></main>;
}
