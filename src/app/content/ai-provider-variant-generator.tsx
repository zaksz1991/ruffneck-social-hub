'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  generateAiProviderVariants,
  saveAiProviderVariants,
  type AiProviderVariantDraft,
  type GenerateAiProviderVariantsState,
  type SaveAiProviderVariantsState,
} from '@/app/actions/content-provider-variants';
import { AI_PROVIDER_VARIANT_BODY_LIMITS, AI_PROVIDER_VARIANT_PLATFORMS, AI_PROVIDER_VARIANT_TITLE_LIMITS, type AiProviderVariantPlatform } from '@/lib/ai/provider-variant-contract';
import './ai-provider-variant-generator.css';

type BrandOption = { id: string; name: string };

const initialGenerateState: GenerateAiProviderVariantsState = { status: 'idle' };
const initialSaveState: SaveAiProviderVariantsState = { status: 'idle' };
const platformLabels: Record<AiProviderVariantPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export default function AiProviderVariantGenerator({
  workspaceId,
  brands,
  configured,
}: {
  workspaceId: string;
  brands: BrandOption[];
  configured: boolean;
}) {
  const [generation, generateAction, generating] = useActionState(generateAiProviderVariants, initialGenerateState);
  const [saving, saveAction, savingPending] = useActionState(saveAiProviderVariants, initialSaveState);
  const [variants, setVariants] = useState<AiProviderVariantDraft[]>([]);
  const [selected, setSelected] = useState<AiProviderVariantPlatform[]>([]);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');

  useEffect(() => {
    if (generation.status === 'success' && generation.variants) {
      setVariants(generation.variants.map((variant) => ({ ...variant })));
      setSelected(generation.variants.map((variant) => variant.platform));
      setBrandId(generation.brandId ?? brands[0]?.id ?? '');
    }
  }, [generation.status, generation.variants, generation.brandId, brands]);

  const selectedVariants = useMemo(
    () => variants.filter((variant) => selected.includes(variant.platform)),
    [variants, selected],
  );
  if (!brands.length) return null;

  function updateVariant(platform: AiProviderVariantPlatform, field: 'title' | 'body', value: string) {
    setVariants((current) => current.map((variant) => variant.platform === platform ? { ...variant, [field]: value } : variant));
  }

  function toggleSelected(platform: AiProviderVariantPlatform, checked: boolean) {
    setSelected((current) => checked
      ? [...current, platform]
      : current.filter((item) => item !== platform));
  }

  return (
    <section className="ai-provider-variants" aria-labelledby="ai-provider-variants-title">
      <div className="ai-provider-variants-heading">
        <div>
          <span className="eyebrow">PLATFORM ADAPTATION</span>
          <h2 id="ai-provider-variants-title">AI provider variant generator</h2>
          <p>Turn one campaign brief into platform-specific Facebook, Instagram, LinkedIn, TikTok and YouTube drafts. Edit each version before saving.</p>
        </div>
        <span className="ai-provider-variants-safety">DRAFTS ONLY · HUMAN APPROVAL REQUIRED</span>
      </div>

      {!configured && (
        <div className="ai-provider-variants-notice" role="status">
          <strong>Local AI is not configured.</strong>
          <span>Set the server-only LOCAL_AI_BASE_URL and LOCAL_AI_MODEL variables. LOCAL_AI_API_KEY is optional for authenticated model servers.</span>
        </div>
      )}

      <form action={generateAction} className="ai-provider-variants-form">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <label>Brand
          <select name="brand_id" value={brandId} onChange={(event) => setBrandId(event.target.value)} required>
            {brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        <label>Campaign objective
          <select name="objective" defaultValue="awareness" required>
            <option value="awareness">Brand awareness</option>
            <option value="engagement">Engagement</option>
            <option value="education">Education</option>
            <option value="sales">Sales or enquiries</option>
            <option value="announcement">Announcement</option>
          </select>
        </label>
        <label>Writing tone
          <select name="tone" defaultValue="professional" required>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="confident">Confident</option>
            <option value="helpful">Helpful</option>
            <option value="concise">Concise</option>
          </select>
        </label>
        <label>Language
          <select name="language" defaultValue="English" required>
            <option>English</option>
            <option>Hausa</option>
            <option>Nigerian Pidgin</option>
            <option>Yoruba</option>
            <option>Igbo</option>
            <option>French</option>
            <option value="Use the language best suited to the campaign">Choose based on campaign</option>
          </select>
        </label>
        <fieldset className="ai-provider-variants-platforms">
          <legend>Target platforms</legend>
          {AI_PROVIDER_VARIANT_PLATFORMS.map((platform) => (
            <label key={platform}>
              <input type="checkbox" name="platforms" value={platform} defaultChecked />
              <span>{platformLabels[platform]}</span>
            </label>
          ))}
          <small>TikTok drafts are captions; YouTube drafts contain a video title and description. Saving creates copy-only drafts and does not upload media or publish. Attach media and approve before scheduling TikTok or YouTube.</small>
        </fieldset>
        <label className="ai-provider-variants-wide">Target audience (optional)
          <input name="audience" maxLength={240} placeholder="Who should this campaign speak to?" />
        </label>
        <label className="ai-provider-variants-wide">Campaign brief
          <textarea name="brief" minLength={20} maxLength={1200} rows={4} required placeholder="Describe the offer, service, announcement or idea. Include only facts the brand is authorised to publish." />
          <small>20–1,200 characters. Do not include passwords, customer records or confidential information.</small>
        </label>
        <div className="ai-provider-variants-submit">
          <span>Uses your server-configured local/OpenAI-compatible model. Generated copy is not sent to any social network.</span>
          <button type="submit" className="content-primary-button" disabled={!configured || generating}>{generating ? 'Generating platform variants…' : 'Generate platform variants'}</button>
        </div>
      </form>

      {generation.status === 'error' && <p className="ai-provider-variants-message error" role="alert">{generation.message}</p>}
      {generation.status === 'success' && (
        <div className="ai-provider-variants-results" aria-live="polite">
          <div className="ai-provider-variants-results-heading">
            <div><strong>Editable platform drafts</strong><span>{generation.message}</span></div>
            {generation.model && <code>{generation.model}</code>}
          </div>
          <form action={saveAction}>
            <input type="hidden" name="workspace_id" value={generation.workspaceId ?? workspaceId} />
            <input type="hidden" name="brand_id" value={generation.brandId ?? brandId} />
            <input type="hidden" name="variants_json" value={JSON.stringify(selectedVariants)} />
            <div className="ai-provider-variants-card-grid">
              {variants.map((variant) => (
                <article className="ai-provider-variant-card" key={variant.platform}>
                  <div className="ai-provider-variant-card-heading">
                    <label className="ai-provider-variant-select">
                      <input type="checkbox" checked={selected.includes(variant.platform)} onChange={(event) => toggleSelected(variant.platform, event.target.checked)} />
                      <strong>{platformLabels[variant.platform]}</strong>
                    </label>
                    <span>{variant.platform === 'youtube' ? `${new TextEncoder().encode(variant.body).length}/5000 bytes` : `${variant.body.length}/${AI_PROVIDER_VARIANT_BODY_LIMITS[variant.platform]} characters`}</span>
                  </div>
                  <label>Draft title
                    <input value={variant.title} maxLength={AI_PROVIDER_VARIANT_TITLE_LIMITS[variant.platform]} onChange={(event) => updateVariant(variant.platform, 'title', event.target.value)} />
                  </label>
                  <label>Platform copy
                    <textarea value={variant.body} maxLength={AI_PROVIDER_VARIANT_BODY_LIMITS[variant.platform]} rows={7} onChange={(event) => updateVariant(variant.platform, 'body', event.target.value)} />
                  </label>
                </article>
              ))}
            </div>
            {saving.status === 'error' && <p className="ai-provider-variants-message error" role="alert">{saving.message}</p>}
            {saving.status === 'success' && <p className="ai-provider-variants-message success" role="status">{saving.message}</p>}
            <div className="ai-provider-variants-save">
              <span>{selectedVariants.length} of {variants.length} variants selected. Saving creates separate drafts and does not submit, approve, schedule or publish them.</span>
              <button type="submit" className="content-primary-button" disabled={savingPending || selectedVariants.length === 0}>{savingPending ? 'Saving drafts…' : `Save ${selectedVariants.length} selected draft${selectedVariants.length === 1 ? '' : 's'}`}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
