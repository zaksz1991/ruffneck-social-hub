'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateBrandVoiceProfile } from '@/lib/brands/voice-profile';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveBrandVoiceProfile(formData: FormData) {
  const workspaceId = typeof formData.get('workspace_id') === 'string' ? String(formData.get('workspace_id')).trim() : '';
  const brandId = typeof formData.get('brand_id') === 'string' ? String(formData.get('brand_id')).trim() : '';
  const validated = validateBrandVoiceProfile({
    tone: formData.get('tone'),
    languages: formData.get('languages'),
    approvedFacts: formData.get('approved_facts'),
    forbiddenClaims: formData.get('forbidden_claims'),
    escalationTriggers: formData.get('escalation_triggers'),
  });

  const basePath = `/brands?workspace=${encodeURIComponent(workspaceId)}`;
  if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(brandId) || !validated.ok) {
    redirect(`${basePath}&error=voice-input`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
    redirect(`${basePath}&error=voice-permission`);
  }

  const { error } = await supabase.rpc('update_brand_voice_profile', {
    target_brand_id: brandId,
    submitted_profile: validated.value,
  });
  if (error) {
    console.error('[brand.voice-profile] Update rejected:', { code: error.code });
    redirect(`${basePath}&error=voice-save`);
  }

  revalidatePath('/');
  revalidatePath('/brands');
  revalidatePath('/content');
  revalidatePath('/inbox');
  redirect(`${basePath}&saved=voice`);
}
