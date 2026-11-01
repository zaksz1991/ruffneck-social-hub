export const ACTIVE_VARIANT_PROVIDERS = ['instagram', 'facebook', 'linkedin'] as const;
export type ActiveVariantProvider = (typeof ACTIVE_VARIANT_PROVIDERS)[number];

export type ProviderVariantInput = {
  provider: ActiveVariantProvider;
  name: string;
  body: string;
  mediaRefs: string[];
};

export type ProviderVariantValidation =
  | { ok: true; value: ProviderVariantInput }
  | { ok: false; reason: 'provider' | 'name' | 'body' | 'media' };

export function validateProviderVariantInput(input: {
  provider: unknown;
  name: unknown;
  body: unknown;
  mediaUrl: unknown;
}): ProviderVariantValidation {
  const provider = typeof input.provider === 'string' ? input.provider.trim() : '';
  if (!ACTIVE_VARIANT_PROVIDERS.includes(provider as ActiveVariantProvider)) {
    return { ok: false, reason: 'provider' };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 60) return { ok: false, reason: 'name' };

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length < 1 || body.length > 5000) return { ok: false, reason: 'body' };

  const mediaUrl = typeof input.mediaUrl === 'string' ? input.mediaUrl.trim() : '';
  if (!mediaUrl) return { ok: true, value: { provider: provider as ActiveVariantProvider, name, body, mediaRefs: [] } };
  if (mediaUrl.length > 2048) return { ok: false, reason: 'media' };

  try {
    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return { ok: false, reason: 'media' };
    return {
      ok: true,
      value: { provider: provider as ActiveVariantProvider, name, body, mediaRefs: [parsed.toString()] },
    };
  } catch {
    return { ok: false, reason: 'media' };
  }
}

export function isApprovedVariantForProvider(
  variant: { provider: string; status: string; contentId: string },
  expected: { provider: string; contentId: string },
): boolean {
  return variant.status === 'approved'
    && variant.provider === expected.provider
    && variant.contentId === expected.contentId;
}
