'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function value(formData: FormData, key: string) { return String(formData.get(key) ?? '').trim(); }

export async function signIn(formData: FormData) {
  const email = value(formData, 'email').toLowerCase();
  const password = value(formData, 'password');
  if (!email || !password) redirect('/login?error=missing');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=invalid');
  redirect('/');
}

export async function signUp(formData: FormData) {
  const name = value(formData, 'name');
  const email = value(formData, 'email').toLowerCase();
  const password = value(formData, 'password');
  const workspaceName = value(formData, 'workspace');
  if (name.length < 2 || !email || password.length < 12 || workspaceName.length < 2) redirect('/signup?error=validation');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name, workspace_name: workspaceName }, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback` },
  });
  if (error) redirect('/signup?error=signup');
  if (data.session) {
    const { error: workspaceError } = await supabase.rpc('create_workspace_for_current_user', { workspace_name: workspaceName });
    if (workspaceError) redirect('/signup?error=workspace');
    redirect('/');
  }
  redirect('/login?notice=verify');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
