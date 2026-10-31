import { describe, expect, it } from 'vitest';
import { getProviderDefinition, isSupportedProvider, PROVIDER_REGISTRY } from './provider-registry';

describe('provider registry', () => {
  it('catalogues the seven product networks without marking planned providers as available', () => {
    expect(PROVIDER_REGISTRY.map((provider) => provider.id)).toEqual([
      'facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'whatsapp',
    ]);
    expect(PROVIDER_REGISTRY.filter((provider) => provider.availability === 'available').map((provider) => provider.id))
      .toEqual(['facebook', 'instagram', 'linkedin']);
  });

  it('returns known providers and rejects unknown identifiers', () => {
    expect(getProviderDefinition('facebook')?.name).toBe('Facebook Pages');
    expect(getProviderDefinition('linkedin')?.availability).toBe('available');
    expect(isSupportedProvider('instagram')).toBe(true);
    expect(isSupportedProvider('threads')).toBe(false);
  });
});
