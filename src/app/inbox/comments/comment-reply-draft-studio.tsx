'use client';

import { useActionState } from 'react';
import {
  generateInstagramCommentReplyDraft,
  updateInstagramCommentReplyDraft,
  updateInstagramCommentTriageStatus,
  type GenerateReplyDraftState,
} from '@/app/actions/inbox';

type Draft = {
  id: string;
  draft_text: string;
  model: string;
  status: 'draft' | 'reviewed' | 'discarded';
  created_at: string;
  reviewed_at: string | null;
};

const initialState: GenerateReplyDraftState = { status: 'idle' };

export default function CommentReplyDraftStudio({
  commentId,
  triageStatus,
  drafts,
  canManage,
}: {
  commentId: string;
  triageStatus: 'new' | 'reviewed' | 'ignored';
  drafts: Draft[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(generateInstagramCommentReplyDraft, initialState);

  return (
    <div className="comment-tools">
      <div className="comment-triage-row">
        <span className={`comment-triage-badge triage-${triageStatus}`}>{triageStatus.replace('_', ' ').toUpperCase()}</span>
        {canManage && (
          <form action={updateInstagramCommentTriageStatus} className="comment-triage-form">
            <input type="hidden" name="comment_id" value={commentId} />
            <select name="status" defaultValue={triageStatus} aria-label="Internal comment triage status">
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="ignored">Ignored</option>
            </select>
            <button type="submit">Update status</button>
          </form>
        )}
      </div>

      <section className="comment-ai-panel">
        <div className="comment-ai-heading">
          <div><strong>AI-assisted public reply draft</strong><p>Optional private/local model. A reviewed draft is still not posted.</p></div>
          <span>NOT SENT</span>
        </div>
        {canManage ? (
          <form action={formAction} className="comment-generate-form">
            <input type="hidden" name="comment_id" value={commentId} />
            <label>Response tone<select name="tone" defaultValue="professional">
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
              <option value="empathetic">Empathetic</option>
            </select></label>
            <button type="submit" disabled={pending}>{pending ? 'Generating…' : 'Generate draft'}</button>
          </form>
        ) : <p className="comment-readonly-note">Your workspace role is read-only for comment triage and drafting.</p>}

        {state.status !== 'idle' && <div className={state.status === 'error' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{state.message}</div>}

        <div className="comment-saved-drafts">
          <div className="reply-draft-list-heading"><h3>Saved comment reply drafts</h3><span>{drafts.length} total</span></div>
          {drafts.length === 0 ? <p className="comment-no-drafts">No AI reply drafts saved for this comment.</p> : drafts.map((draft) => (
            <article className="reply-draft-card" key={draft.id}>
              <div className="reply-draft-card-top">
                <span className={`reply-status status-${draft.status}`}>{draft.status === 'reviewed' ? 'HUMAN REVIEWED' : draft.status.toUpperCase()}</span>
                <small>{new Date(draft.created_at).toLocaleString()}</small>
              </div>
              <form action={updateInstagramCommentReplyDraft} className="reply-edit-form">
                <input type="hidden" name="draft_id" value={draft.id} />
                <textarea name="draft_text" defaultValue={draft.draft_text} maxLength={6000} required readOnly={draft.status !== 'draft'} aria-label="Public comment reply draft" />
                <div className="reply-draft-meta"><span>Model: {draft.model}</span>{draft.reviewed_at && <span>Reviewed {new Date(draft.reviewed_at).toLocaleString()}</span>}</div>
                {canManage && draft.status === 'draft' ? <div className="reply-draft-actions">
                  <button type="submit" name="decision" value="draft" className="reply-secondary">Save edits</button>
                  <button type="submit" name="decision" value="reviewed">Mark human-reviewed</button>
                  <button type="submit" name="decision" value="discarded" className="reply-discard">Discard</button>
                </div> : <p className="reply-locked-note">This is an internal draft record. It is not posted to Instagram.</p>}
              </form>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
