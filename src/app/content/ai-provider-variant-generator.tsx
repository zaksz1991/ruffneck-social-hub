'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  generateAiProviderVariants,
  saveAiProviderVariants,
  type AiProviderVariantDraft,
  type GenerateAiProviderVariantsState,
  type SaveAiProviderVariantsState,
} from '@/app/actions/content';

const initialGenerateState: GenerateAiProviderVariantsState = { status: 'idle' };
const initialSaveState: SaveAiProviderVariantsState = { status: 'idle' };
const providerLabels = {
  instagram: 'Instagram Business',
  facebook: 'Facebook Page',
  linkedin: 'LinkedIn Organization',
} as const;

export default function AiProviderVariantGenerator({
  workspaceId,
  contentId,
  configured,
}: {
  workspaceId: string;
  contentId: string;
  configured: boolean;
}) {
  const [generationState, generateAction, generating] = useActionState(generateAiProviderVariants, initialGenerateState);
  const [saveState, saveAction, saving] = useActionState(saveAiProviderVariants, initialSaveState);
  const [drafts, setDrafts] = useState<AiProviderVariantDraft[]>([]);
  const [savedProviders, setSavedProviders] = useState<string[]>([]);

  useEffect(() => {
    if (generationState.status === 'success' && generationState.drafts) {
      setDrafts(generationState.drafts);
      setSavedProviders([]);
    }
  }, [generationState.status, generationState.drafts]);

  useEffect(() => {
    if (saveState.status === 'success' && saveState.savedProviders?.length) {
      const saved = saveState.savedProviders;
      setSavedProviders((current) => [...new Set([...current, ...saved])]);
      setDrafts((current) => current.filter((draft) => !saved.includes(draft.provider)));
    }
  }, [saveState.status, saveState.savedProviders]);

  const remainingDrafts = useMemo(
    () => drafts.filter((draft) => !savedProviders.includes(draft.provider)),
    [drafts, savedProviders],
  );

  function updateDraft(provider: AiProviderVariantDraft['provider'], field: 'name' | 'body' | 'mediaUrl', value: string) {
    setDrafts((current) => current.map((draft) => draft.provider === provider ? { ...draft, [field]: value } : draft));
  }

  return (
    <details className="ai-provider-variant-generator">
      <summary>Generate platform versions with AI</summary>
      <div className="ai-provider-variant-body">
        <p className="ai-provider-variant-intro">Adapt this approved master post for Instagram, Facebook and LinkedIn. The outputs are editable drafts and still require separate human review.</p>
        {!configured ? (
          <div className="ai-content-generator-unavailable" role="status">
            <strong>Local AI is not configured.</strong>
            <span>Set the existing server-side LOCAL_AI_BASE_URL and LOCAL_AI_MODEL variables to enable platform adaptation.</span>
          </div>
        ) : (
          <>
            <form action={generateAction} className="ai-provider-variant-generate-form">
              <input type="hidden" name="workspace_id" value={workspaceId} />
              <input type="hidden" name="content_id" value={contentId} />
              <label>Overall writing tone
                <select name="tone" defaultValue="professional" required>
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="confident">Confident</option>
                  <option value="helpful">Helpful</option>
                  <option value="concise">Concise</option>
                </select>
              </label>
              <button type="submit" className="content-secondary-button" disabled={generating}>
                {generating ? 'Adapting approved copy…' : 'Generate 3 platform versions'}
              </button>
            </form>
            {generationState.status === 'error' && <p className="ai-content-generator-message error" role="alert">{generationState.message}</p>}
            {generationState.status === 'success' && (
              <div className="ai-provider-variant-preview" aria-live="polite">
                <div className="ai-provider-variant-status">
                  <div><strong>AI adaptation preview</strong><span>{generationState.message}</span></div>
                  {generationState.model && <code>{generationState.model}</code>}
                </div>
                {savedProviders.length > 0 && <p className="ai-provider-variant-saved">Saved as drafts: {savedProviders.map((provider) => providerLabels[provider as keyof typeof providerLabels]).join(', ')}. These are not approved or scheduled.</p>}
                {remainingDrafts.length > 0 ? (
                  <form action={saveAction} className="ai-provider-variant-save-form">
                    <input type="hidden" name="workspace_id" value={workspaceId} />
                    <input type="hidden" name="content_id" value={contentId} />
                    <input type="hidden" name="variants_json" value={JSON.stringify(remainingDrafts)} />
                    <div className="ai-provider-variant-edit-grid">
                      {remainingDrafts.map((draft) => (
                        <section className="ai-provider-variant-edit-card" key={draft.provider}>
                          <div className="ai-provider-variant-edit-heading"><strong>{providerLabels[draft.provider]}</strong><span>Unapproved draft</span></div>
                          <label>Variant name
                            <input value={draft.name} maxLength={60} minLength={2} required onChange={(event) => updateDraft(draft.provider, 'name', event.target.value)} />
                          </label>
                          <label>Platform copy
                            <textarea value={draft.body} maxLength={5000} minLength={1} rows={6} required onChange={(event) => updateDraft(draft.provider, 'body', event.target.value)} />
                            <small>{draft.body.length.toLocaleString()} / 5,000 characters</small>
                          </label>
                          {draft.provider === 'linkedin' ? (
                            <p className="ai-provider-variant-media-note">LinkedIn publishing is text-only in the current scheduler. No image will be attached.</p>
                          ) : (
                            <label>Public image URL (required)
                              <input type="url" inputMode="url" value={draft.mediaUrl} maxLength={2048} required placeholder="https://public-image-url.jpg" onChange={(event) => updateDraft(draft.provider, 'mediaUrl', event.target.value)} />
                              <small>Instagram and Facebook currently require one public HTTPS image.</small>
                            </label>
                          )}
                        </section>
                      ))}
                    </div>
                    <div className="ai-provider-variant-save-footer">
                      <span>Saving creates provider-specific drafts only. Each must be submitted for review and approved before scheduling.</span>
                      <button type="submit" className="content-primary-button" disabled={saving || remainingDrafts.length === 0}>
                        {saving ? 'Saving drafts…' : `Save ${remainingDrafts.length} provider draft${remainingDrafts.length === 1 ? '' : 's'}`}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="ai-provider-variant-complete">All generated variants have been saved as drafts. They still require review and approval.</p>
                )}
                {saveState.status === 'error' && <p className="ai-content-generator-message error" role="alert">{saveState.message}</p>}
                {saveState.failedProviders?.map((failure) => (
                  <p className="ai-provider-variant-failure" key={failure.provider}><strong>{providerLabels[failure.provider]}:</strong> {failure.reason}</p>
                ))}
                {saveState.status === 'success' && <p className="ai-provider-variant-saved" role="status">{saveState.message}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
