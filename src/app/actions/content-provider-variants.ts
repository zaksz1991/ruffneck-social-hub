'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canCreateContent, isUuid, validateContentInput } from '@/lib/content/validation';
import { generateLocalAiProviderVariants } from '@/lib/ai/provider-variants';
import {
  AI_PROVIDER_VARIANT_BODY_LIMITS,
  AI_PROVIDER_VARIANT_TITLE_LIMITS,
  AI_PROVIDER_VARIANT_PLATFORMS,
  type AiProviderVariantDraft,
  type AiProviderVariantPlatform,
} from '@/lib/ai/provider-variant-contract';
export type { AiProviderVariantDraft } from '@/lib/ai/provider-variant-contract';

type AiUsageReservation = { allowed?: boolean; used?: number; limit?: number; reason?: string };

export type GenerateAiProviderVariantsState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  variants?: AiProviderVariantDraft[];
  model?: string;
  workspaceId?: string;
  brandId?: string;
};

export type SaveAiProviderVariantsState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  savedCount?: number;
};
const OBJECTIVES = ['awareness', 'engagement', 'education', 'sales', 'announcement'] as const;
const TONES = ['professional', 'friendly', 'confident', 'helpful', 'concise'] as const;
const LANGUAGES = ['English', 'Hausa', 'Nigerian Pidgin', 'Yoruba', 'Igbo', 'French', 'Use the language best suited to the campaign'] as const;

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function boundedText(value: string, maximum: number): string {
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C-\u001F\u007F]/g, '').trim();
  return clean.length <= maximum ? clean : clean.slice(0, maximum + 1);
}
function validatedVariants(raw: string): AiProviderVariantDraft[] | null {
  if (!raw || raw.length > 24_000) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > AI_PROVIDER_VARIANT_PLATFORMS.length) return null;
  const seen = new Set<string>();
  const variants: AiProviderVariantDraft[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const platform = typeof record.platform === 'string' ? record.platform : '';
    if (!(AI_PROVIDER_VARIANT_PLATFORMS as readonly string[]).includes(platform) || seen.has(platform)) return null;
    seen.add(platform);
    const title = typeof record.title === 'string' ? boundedText(record.title, AI_PROVIDER_VARIANT_TITLE_LIMITS[platform as AiProviderVariantPlatform]) : '';
    const body = typeof record.body === 'string' ? boundedText(record.body, AI_PROVIDER_VARIANT_BODY_LIMITS[platform as AiProviderVariantPlatform]) : '';
    const valid = validateContentInput(title, body);
    if (!valid.ok || valid.value.title.length > AI_PROVIDER_VARIANT_TITLE_LIMITS[platform as AiProviderVariantPlatform] || valid.value.body.length > AI_PROVIDER_VARIANT_BODY_LIMITS[platform as AiProviderVariantPlatform]) return null;
    if (platform === 'youtube' && (new TextEncoder().encode(valid.value.body).length > 5000 || /[<>]/.test(`${valid.value.title}${valid.value.body}`))) return null;
    variants.push({ platform: platform as AiProviderVariantPlatform, title: valid.value.title, body: valid.value.body });
  }
  return variants;
}

async function reserveAiGeneration(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
): Promise<{ ok: true; requestId: string } | { ok: false; message: string }> {
  const requestId = crypto.randomUUID();
  const { data, error } = await supabase.rpc('reserve_workspace_ai_generation', {
    target_workspace_id: workspaceId,
    target_request_id: requestId,
    target_generation_type: 'provider_variants',
  });
  if (error) return { ok: false, message: 'The workspace AI allowance could not be checked. Confirm that Supabase migration 0044 has been applied, then retry.' };
  const result = (data ?? {}) as AiUsageReservation;
  if (result.allowed !== true) {
    if (result.reason === 'limit_reached') {
      return { ok: false, message: `This workspace has used ${Number(result.used ?? 0)} of ${Number(result.limit ?? 0)} AI content generations for the current UTC month. Review the plan on Billing & Usage.` };
    }
    return { ok: false, message: 'This AI generation request could not reserve usage. Start a new request or contact a workspace administrator.' };
  }
  return { ok: true, requestId };
}

export async function generateAiProviderVariants(
  _previousState: GenerateAiProviderVariantsState,
  formData: FormData,
): Promise<GenerateAiProviderVariantsState> {
  const workspaceId = field(formData, 'workspace_id');
  const brandId = field(formData, 'brand_id');
  const objective = field(formData, 'objective');
  const tone = field(formData, 'tone');
  const language = boundedText(field(formData, 'language'), 80);
  const audience = boundedText(field(formData, 'audience'), 240);
  const brief = boundedText(field(formData, 'brief'), 1200);
  const platforms = [...new Set(formData.getAll('platforms')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value): value is AiProviderVariantPlatform => (AI_PROVIDER_VARIANT_PLATFORMS as readonly string[]).includes(value)))];
  if (!isUuid(workspaceId) || !isUuid(brandId) ||
      !OBJECTIVES.includes(objective as typeof OBJECTIVES[number]) ||
      !TONES.includes(tone as typeof TONES[number]) ||
      !LANGUAGES.includes(language as typeof LANGUAGES[number]) ||
      brief.length < 20 || brief.length > 1200 || audience.length > 240 ||
      platforms.length < 1 || platforms.length > AI_PROVIDER_VARIANT_PLATFORMS.length) {
    return { status: 'error', message: 'Check the brand, brief and platform selections. The brief must contain 20–1,200 characters and at least one supported platform must be selected.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in before generating platform variants.' };
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !canCreateContent(membership.role)) {
    return { status: 'error', message: 'Your workspace role does not permit creating content drafts.' };
  }
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id,voice_profile')
    .eq('id', brandId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (brandError || !brand) return { status: 'error', message: 'The selected brand is not available in this workspace.' };

  const reservation = await reserveAiGeneration(supabase, workspaceId);
  if (!reservation.ok) return { status: 'error', message: reservation.message };

  let generated: Awaited<ReturnType<typeof generateLocalAiProviderVariants>>;
  try {
    generated = await generateLocalAiProviderVariants({
      objective: objective as 'awareness' | 'engagement' | 'education' | 'sales' | 'announcement',
      tone: tone as 'professional' | 'friendly' | 'confident' | 'helpful' | 'concise',
      language,
      audience,
      brief,
      platforms,
      brandVoice: brand.voice_profile,
    });
  } catch (error) {
    await supabase.rpc('release_workspace_ai_generation', {
      target_workspace_id: workspaceId,
      target_request_id: reservation.requestId,
    });
    const message = error instanceof Error ? error.message : 'The platform variants could not be generated.';
    return { status: 'error', message: message.slice(0, 220) };
  }

  const { data: completed, error: completionError } = await supabase.rpc('complete_workspace_ai_generation', {
    target_workspace_id: workspaceId,
    target_request_id: reservation.requestId,
  });
  if (completionError || completed !== true) {
    return { status: 'error', message: 'The variants were generated but their usage record could not be confirmed. The reserved allowance will reconcile automatically; retry after checking Billing & Usage.' };
  }
  return {
    status: 'success',
    message: 'Platform variants generated. Edit and select the drafts you want to save. This generation counts once, regardless of the number of selected platforms.',
    variants: generated.variants,
    model: generated.model,
    workspaceId,
    brandId,
  };
}

export async function saveAiProviderVariants(
  _previousState: SaveAiProviderVariantsState,
  formData: FormData,
): Promise<SaveAiProviderVariantsState> {
  const workspaceId = field(formData, 'workspace_id');
  const brandId = field(formData, 'brand_id');
  const variants = validatedVariants(field(formData, 'variants_json'));
  if (!isUuid(workspaceId) || !isUuid(brandId) || !variants?.length) {
    return { status: 'error', message: 'Select at least one valid edited variant before saving.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in before saving platform drafts.' };
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !canCreateContent(membership.role)) {
    return { status: 'error', message: 'Your workspace role does not permit creating content drafts.' };
  }
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id')
    .eq('id', brandId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (brandError || !brand) return { status: 'error', message: 'The selected brand is not available in this workspace.' };
  const targetVariants = variants.map((variant) => ({
    platform: variant.platform,
    title: variant.platform === 'youtube' ? variant.title : `[${variant.platform.toUpperCase()}] ${variant.title}`,
    body: variant.body,
  }));
  if (targetVariants.some((variant) => variant.title.length > (variant.platform === 'youtube' ? 100 : 160))) {
    return { status: 'error', message: 'One or more titles are too long after adding the platform label. Shorten the title and save again.' };
  }
  const { data, error } = await supabase.rpc('create_content_drafts_from_ai_variants', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    target_variants: targetVariants,
  });
  if (error) {
    console.error('[content.ai-provider-variants.save] Draft batch rejected:', { code: error.code });
    if (error.code === 'PGRST202' || error.code === '42883') {
      return { status: 'error', message: 'The platform-variant database upgrade has not been applied. Apply migrations 0040 and 0041 in order, then retry.' };
    }
    if (error.message?.includes('Unsupported target platform') || error.message?.includes('content_items_target_platform_check')) {
      return { status: 'error', message: 'Migration 0041 is required for TikTok and YouTube drafts. Apply it after migration 0040, then retry.' };
    }
    return { status: 'error', message: 'The selected variants could not be saved. Confirm your workspace role and brand, then retry.' };
  }
  const savedCount = Array.isArray(data) ? data.length : variants.length;
  revalidatePath('/content');
  revalidatePath('/publishing');
  return { status: 'success', savedCount, message: `${savedCount} platform-specific draft${savedCount === 1 ? '' : 's'} saved. They still require human review and approval.` };
}
