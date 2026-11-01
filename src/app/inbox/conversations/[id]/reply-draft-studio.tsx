'use client';

import { useActionState } from 'react';
import { generateInstagramReplyDraft, updateInstagramReplyDraft, type GenerateReplyDraftState } from '@/app/actions/inbox';

type Assessment = { id: string; draft_id: string; risk_level: 'low'|'review'|'escalate'; customer_language: string; draft_language: string; language_match: boolean | null; escalation_required: boolean; flags: string[]; guidance: string; created_at: string; is_current: boolean };

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
  assessments,
  canGenerate,
  disabledReason,
}: {
  conversationId: string;
  drafts: Draft[];
  assessments: Assessment[];
  canGenerate: boolean;
  disabledReason: string;
}) {
  const [state, formAction, pending] = useActionState(generateInstagramReplyDraft, initialState);
  const assessmentMap = new Map(assessments.map((assessment) => [assessment.draft_id, assessment]));

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
          <div className="reply-playbook-grid">
            <label>
              Response tone
              <select name="tone" defaultValue="professional">
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="concise">Concise</option>
                <option value="empathetic">Empathetic</option>
              </select>
            </label>
            <label>
              Response approach
              <select name="approach" defaultValue="direct">
                <option value="direct">Answer directly</option>
                <option value="empathetic">Acknowledge and reassure</option>
                <option value="clarify">Ask a clarifying question</option>
                <option value="resolution">Suggest safe next steps</option>
                <option value="handoff">Hand off to a team member</option>
              </select>
            </label>
            <label>
              Reply language
              <select name="language" defaultValue="auto">
                <option value="auto">Match the customer's language</option>
                <option value="English">English</option>
                <option value="Hausa">Hausa</option>
                <option value="Nigerian Pidgin">Nigerian Pidgin</option>
                <option value="Yoruba">Yoruba</option>
                <option value="Igbo">Igbo</option>
                <option value="French">French</option>
              </select>
            </label>
          </div>
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
              {assessmentMap.get(draft.id) && (() => {
                const assessment = assessmentMap.get(draft.id)!;
                const flagLabels: Record<string, string> = {
                  brand_forbidden_claim: 'Brand-forbidden claim',
                  brand_escalation_trigger: 'Brand escalation trigger',
                  high_risk_customer_topic: 'High-risk customer topic',
                  possible_unverified_commitment: 'Possible unverified commitment',
                  possible_sensitive_or_internal_content: 'Possible sensitive or internal content',
                  possible_language_mismatch: 'Possible language mismatch',
                };
                return <aside className={`reply-safety-assessment risk-${assessment.risk_level}`}>
                  <div className="reply-safety-heading"><strong>AI response policy scan</strong><span>{assessment.risk_level.toUpperCase()}</span></div>
                  <div className="reply-safety-languages"><span>Customer language: <b>{assessment.customer_language}</b></span><span>Draft language: <b>{assessment.draft_language}</b></span><span>Language match: <b>{assessment.language_match === null ? 'Not confident' : assessment.language_match ? 'Likely match' : 'Possible mismatch'}</b></span></div>
                  {assessment.escalation_required && <strong className="reply-safety-escalation">Human escalation recommended</strong>}
                  {assessment.flags.length > 0 && <div className="reply-safety-flags">{assessment.flags.map((flag) => <span key={flag}>{flagLabels[flag] ?? flag}</span>)}</div>}
                  <p>{assessment.guidance}</p>
                  {!assessment.is_current && <strong className="reply-safety-stale">This scan no longer matches the edited draft. Recheck every claim and language choice before approval.</strong>}
                  {assessment.is_current && <small>Fingerprint matches the current draft · {new Date(assessment.created_at).toLocaleString()}</small>}
                </aside>;
              })()}
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
