'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { classifySignupResponse } from '@/lib/auth-signup-result';

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function signIn(formData: FormData) {
  const email = value(formData, 'email').toLowerCase();
  const password = value(formData, 'password');
  if (!email || !password) redirect('/login?error=missing');

  let supabase: SupabaseServerClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error('[auth.signIn] Supabase client configuration failed:', error);
    redirect('/login?error=service');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=invalid');
  redirect('/');
}

export async function signUp(formData: FormData) {
  const name = value(formData, 'name');
  const email = value(formData, 'email').toLowerCase();
  const password = value(formData, 'password');
  const workspaceName = value(formData, 'workspace');

  if (
    name.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 ||
    workspaceName.length < 2 ||
    workspaceName.length > 120
  ) {
    redirect('/signup?error=validation');
  }

  let supabase: SupabaseServerClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error('[auth.signUp] Supabase client configuration failed:', error);
    redirect('/signup?error=config');
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  let result: Awaited<ReturnType<SupabaseServerClient['auth']['signUp']>>;
  try {
    result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, workspace_name: workspaceName },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });
  } catch (error) {
    console.error('[auth.signUp] Supabase request failed:', error);
    redirect('/signup?error=service');
  }

  const { data, error } = result;
  if (error) {
    const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
    const message = error.message.toLowerCase();
    console.error('[auth.signUp] Supabase rejected registration:', {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    if (
      code.includes('already') ||
      message.includes('already registered') ||
      message.includes('already exists')
    ) {
      redirect('/signup?error=exists');
    }
    if (error.status === 429 || code.includes('rate') || message.includes('rate limit')) {
      redirect('/signup?error=rate');
    }
    redirect('/signup?error=supabase');
  }

  const responseKind = classifySignupResponse(data.user, Boolean(data.session));
  if (responseKind === 'already-exists') {
    redirect('/signup?error=exists');
  }
  if (responseKind === 'missing-user') {
    console.error('[auth.signUp] Supabase returned neither an error nor a user.');
    redirect('/signup?error=no-user');
  }
  if (responseKind === 'unexpected-no-session') {
    console.error('[auth.signUp] Supabase returned a user without a session or a verifiable pending identity.');
    redirect('/signup?error=incomplete');
  }

  if (responseKind === 'authenticated') {
    const { error: workspaceError } = await supabase.rpc(
      'create_workspace_for_current_user',
      { workspace_name: workspaceName },
    );
    if (workspaceError) {
      console.error('[auth.signUp] Workspace provisioning failed:', {
        code: workspaceError.code,
        message: workspaceError.message,
      });
      await supabase.auth.signOut();
      redirect('/signup?error=workspace');
    }
    redirect('/');
  }

  // The user stays on the signup screen. This notice is shown only when
  // Supabase returned a real, non-empty email identity requiring verification.
  redirect('/signup?notice=verify');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
