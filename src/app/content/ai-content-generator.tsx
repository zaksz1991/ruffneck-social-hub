'use client';

import { useActionState, useEffect, useState } from 'react';
import { createContentDraft, generateAiContentDraft, type GenerateAiContentDraftState } from '@/app/actions/content';

type BrandOption = { id: string; name: string };

const initialState: GenerateAiContentDraftState = { status: 'idle' };

export default function AiContentGenerator({
  workspaceId,
  brands,
  configured,
}: {
  workspaceId: string;
  brands: BrandOption[];
  configured: boolean;
}) {
  const [state, generateAction, pending] = useActionState(generateAiContentDraft, initialState);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  useEffect(() => {
    if (state.status === 'success') {
      setTitle(state.title ?? '');
      setBody(state.body ?? '');
      setMediaUrl('');
    }
  }, [state.status, state.title, state.body]);

  if (!brands.length) return null;

  return (
    <section className="ai-content-generator" aria-labelledby="ai-content-generator-title">
      <div className="ai-content-generator-heading">
        <div>
          <span className="eyebrow">OPTIONAL LOCAL AI</span>
          <h2 id="ai-content-generator-title">AI campaign draft assistant</h2>
          <p>Turn a campaign brief into editable first-draft copy. The model cannot approve, schedule or publish it.</p>
        </div>
        <span className="ai-content-generator-pill">HUMAN REVIEW REQUIRED</span>
      </div>

      {!configured ? (
        <div className="ai-content-generator-unavailable" role="status">
          <strong>Local AI is not configured.</strong>
          <span>Set the existing server-side LOCAL_AI_BASE_URL and LOCAL_AI_MODEL variables to enable this assistant. LOCAL_AI_API_KEY is optional for authenticated model servers.</span>
        </div>
      ) : (
        <>
          <form action={generateAction} className="ai-content-generator-form">
            <input type="hidden" name="workspace_id" value={workspaceId} />
            <label>Brand
              <select name="brand_id" required defaultValue={brands[0].id}>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
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
            <label className="ai-content-generator-wide">Target audience (optional)
              <input name="audience" maxLength={240} placeholder="Who should this post speak to?" />
            </label>
            <label className="ai-content-generator-wide">Campaign brief
              <textarea name="brief" minLength={20} maxLength={1200} required rows={4} placeholder="Describe the product, service, announcement or idea. Include only facts the brand is comfortable publishing." />
              <small>20–1,200 characters. Do not include passwords, customer records or confidential information.</small>
            </label>
            <div className="ai-content-generator-submit">
              <span>Uses your configured local/OpenAI-compatible model endpoint. No external model is selected by RuffNeck.</span>
              <button className="content-primary-button" type="submit" disabled={pending}>{pending ? 'Generating draft…' : 'Generate draft'}</button>
            </div>
          </form>

          {state.status === 'error' && <p className="ai-content-generator-message error" role="alert">{state.message}</p>}

          {state.status === 'success' && (
            <div className="ai-content-generator-result" aria-live="polite">
              <div className="ai-content-generator-result-heading">
                <div><strong>Generated draft preview</strong><span>{state.message}</span></div>
                {state.model && <code>{state.model}</code>}
              </div>
              <form action={createContentDraft} className="ai-content-generator-edit-form">
                <input type="hidden" name="workspace_id" value={state.workspaceId ?? workspaceId} />
                <input type="hidden" name="brand_id" value={state.brandId ?? brands[0].id} />
                <label>Working title
                  <input name="title" minLength={2} maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label>Post copy
                  <textarea name="body" minLength={1} maxLength={5000} required rows={6} value={body} onChange={(event) => setBody(event.target.value)} />
                </label>
                <label>Image URL (optional)
                  <input name="media_url" type="url" inputMode="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://your-public-image-url.jpg" />
                </label>
                <div className="ai-content-generator-save">
                  <span>Review and edit the copy before saving. Saving creates a draft only.</span>
                  <button type="submit" className="content-primary-button">Save as content draft</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
