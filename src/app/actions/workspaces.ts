'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function cleanText(value: FormDataEntryValue | null, min = 2, max = 120) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : null;
}

export async function createWorkspace(formData: FormData) {
  const name = cleanText(formData.get('name'));
  if (!name) redirect('/?error=workspace-name');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await supabase.rpc('create_additional_workspace', { workspace_name: name });
  if (error || !data) redirect('/?error=workspace-create');
  revalidatePath('/');
  redirect(`/?workspace=${encodeURIComponent(data)}`);
}

export async function createBrand(formData: FormData) {
  const name = cleanText(formData.get('name'), 2, 80);
  const workspaceId = cleanText(formData.get('workspace_id'), 36, 36);
  if (!name || !workspaceId) redirect('/?error=brand-input');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.from('brands').insert({ workspace_id: workspaceId, name });
  if (error) redirect(`/?workspace=${encodeURIComponent(workspaceId)}&error=brand-create`);
  revalidatePath('/');
  redirect(`/?workspace=${encodeURIComponent(workspaceId)}&saved=brand`);
}

export async function renameBrand(formData: FormData) {
  const name = cleanText(formData.get('name'), 2, 80);
  const brandId = cleanText(formData.get('brand_id'), 36, 36);
  const workspaceId = cleanText(formData.get('workspace_id'), 36, 36);
  if (!name || !brandId || !workspaceId) redirect('/?error=brand-input');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.from('brands').update({ name }).eq('id', brandId).eq('workspace_id', workspaceId);
  if (error) redirect(`/?workspace=${encodeURIComponent(workspaceId)}&error=brand-update`);
  revalidatePath('/');
  redirect(`/?workspace=${encodeURIComponent(workspaceId)}&saved=rename`);
}
