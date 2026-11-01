'use client';

import { useActionState } from 'react';
import { applyInboxAiTriagePriority, generateInboxConversationTriage, type GenerateInboxTriageState } from '@/app/actions/inbox';

type Triage = {
  id: string;
  intent: string;
  sentiment: string;
  suggested_priority: 'low' | 'normal' | 'high' | 'urgent';
  escalation_required: boolean;
  confidence: number;
  summary: string;
  reason: string;
  model: string;
  created_at: string;
};

const initialState: GenerateInboxTriageState = { status: 'idle' };
const label = (value: string) => value.replaceAll('_', ' ');

export default function ConversationAiTriage({
  provider, conversationId, triage, canGenerate, canApplyPriority, hasLatestInbound, disabledReason,
}: {
  provider: 'instagram' | 'facebook';
  conversationId: string;
  triage: Triage | null;
  canGenerate: boolean;
  canApplyPriority: boolean;
  hasLatestInbound: boolean;
  disabledReason: string;
}) {
  const [state, formAction, pending] = useActionState(generateInboxConversationTriage, initialState);
  return <section className="inbox-ai-triage">
    <div className="inbox-ai-triage-heading">
      <div><span className="eyebrow">AI-ASSISTED OPERATIONS</span><h2>Conversation intelligence</h2><p>Classifies the latest customer message and suggests a priority. It never changes workflow status or sends a reply.</p></div>
      <span className="inbox-ai-triage-badge">HUMAN DECISION REQUIRED</span>
    </div>
    <div className="inbox-ai-triage-privacy"><strong>Private inference</strong><span>The recent text history and brand voice profile are sent to your configured server-side local AI endpoint. Do not use a public endpoint for confidential customer conversations.</span></div>
    {canGenerate && hasLatestInbound ? (
      <form action={formAction} className="inbox-ai-triage-run">
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="conversation_id" value={conversationId} />
        <button type="submit" disabled={pending}>{pending ? 'Analysing conversation…' : triage ? 'Refresh AI assessment' : 'Analyse conversation'}</button>
      </form>
    ) : <p className="inbox-ai-triage-disabled">{disabledReason || (!hasLatestInbound ? 'AI triage is available after a customer message.' : 'Your role cannot run AI triage.')}</p>}
    {state.status !== 'idle' && <p className={state.status === 'error' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{state.message}</p>}
    {triage ? <div className="inbox-ai-triage-result">
      <div className="inbox-ai-triage-tags">
        <span className="triage-intent">{label(triage.intent)}</span>
        <span className={`triage-sentiment sentiment-${triage.sentiment}`}>{label(triage.sentiment)} sentiment</span>
        <span className={`triage-priority priority-${triage.suggested_priority}`}>{label(triage.suggested_priority)} priority suggested</span>
        {triage.escalation_required && <span className="triage-escalation">Human escalation recommended</span>}
      </div>
      <div className="inbox-ai-triage-summary"><strong>Conversation summary</strong><p>{triage.summary}</p></div>
      <div className="inbox-ai-triage-summary"><strong>Why this assessment</strong><p>{triage.reason}</p></div>
      <div className="inbox-ai-triage-footer"><small>Model: {triage.model} · Confidence: {Math.round(Number(triage.confidence) * 100)}% · {new Date(triage.created_at).toLocaleString()}</small>
        {canApplyPriority ? <form action={applyInboxAiTriagePriority}>
          <input type="hidden" name="provider" value={provider} />
          <input type="hidden" name="conversation_id" value={conversationId} />
          <input type="hidden" name="triage_id" value={triage.id} />
          <button type="submit">Apply suggested priority</button>
        </form> : <small>Only owners, admins, managers and publishers can apply priority changes.</small>}
      </div>
      <p className="inbox-ai-triage-footnote">Applying changes only the conversation priority. Review the assessment first. AI classifications can be wrong.</p>
    </div> : <div className="inbox-ai-triage-empty">No AI assessment has been saved for this conversation.</div>}
  </section>;
}
