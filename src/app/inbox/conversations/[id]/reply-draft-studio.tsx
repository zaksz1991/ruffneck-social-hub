'use client';

import { useActionState } from 'react';
import { generateInstagramReplyDraft, updateInstagramReplyDraft, type GenerateReplyDraftState } from '@/app/actions/inbox';

type Draft = {
  id: string;
  draft_text: string;
  model: string;
  status: 'draft' | 'reviewed' | 'discarded';
  created_at: string;
  reviewed_at: string | null;
};

const initialState: GenerateReplyDraftState = { status: 'idle' };

export default function ReplyDraftStudio({
  conversationId,
  drafts,
  canGenerate,
  disabledReason,
}: {
  conversationId: string;
  drafts: Draft[];
  canGenerate: boolean;
  disabledReason: string;
}) {
  const [state, formAction, pending] = useActionState(generateInstagramReplyDraft, initialState);

  return (
    <section className="inbox-events reply-draft-studio">
      <div className="inbox-section-title">
        <div>
          <h2>AI-assisted reply drafts</h2>
          <p>Generate with your configured local/private model. Every draft remains unsent.</p>
        </div>
        <span>HUMAN REVIEW REQUIRED</span>
      </div>

      <div className="reply-ai-notice">
        <strong>Privacy and control</strong>
        <p>When configured, the recent thread and the brand voice profile are sent to the server-configured inference endpoint. Use a private, secured model service. No message is sent to Instagram from this feature.</p>
      </div>

      {canGenerate ? (
        <form action={formAction} className="reply-generate-form">
          <input type="hidden" name="conversation_id" value={conversationId} />
          <label>
            Response tone
            <select name="tone" defaultValue="professional">
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
              <option value="empathetic">Empathetic</option>
            </select>
          </label>
          <button type="submit" disabled={pending}>{pending ? 'Generating…' : 'Generate reply draft'}</button>
        </form>
      ) : (
        <div className="reply-inline-note">{disabledReason}</div>
      )}

      {state.status !== 'idle' && (
        <div className={state.status === 'error' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">
          {state.message}
        </div>
      )}

      <div className="reply-draft-list">
        <div className="reply-draft-list-heading"><h3>Saved drafts</h3><span>{drafts.length} total</span></div>
        {drafts.length === 0 ? (
          <div className="inbox-empty reply-empty"><p>No reply drafts have been generated for this conversation.</p></div>
        ) : drafts.map((draft) => (
          <article className="reply-draft-card" key={draft.id}>
            <div className="reply-draft-card-top">
              <span className={`reply-status status-${draft.status}`}>{draft.status === 'reviewed' ? 'HUMAN REVIEWED' : draft.status.toUpperCase()}</span>
              <small>{new Date(draft.created_at).toLocaleString()}</small>
            </div>
            <form action={updateInstagramReplyDraft} className="reply-edit-form">
              <input type="hidden" name="conversation_id" value={conversationId} />
              <input type="hidden" name="draft_id" value={draft.id} />
              <textarea
                name="draft_text"
                defaultValue={draft.draft_text}
                maxLength={6000}
                required
                readOnly={draft.status !== 'draft'}
                aria-label="Reply draft text"
              />
              <div className="reply-draft-meta"><span>Model: {draft.model}</span>{draft.reviewed_at && <span>Reviewed {new Date(draft.reviewed_at).toLocaleString()}</span>}</div>
              {draft.status === 'draft' ? (
                <div className="reply-draft-actions">
                  <button type="submit" name="decision" value="draft" className="reply-secondary">Save edits</button>
                  <button type="submit" name="decision" value="reviewed">Mark human-reviewed</button>
                  <button type="submit" name="decision" value="discarded" className="reply-discard">Discard</button>
                </div>
              ) : (
                <p className="reply-locked-note">This draft is {draft.status}. It cannot be sent from RuffNeck Social Hub.</p>
              )}
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
