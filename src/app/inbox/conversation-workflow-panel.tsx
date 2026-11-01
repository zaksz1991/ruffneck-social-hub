import {
  addInboxInternalNote,
  updateInboxConversationWorkflow,
} from '@/app/actions/inbox';

export type InboxWorkflow = {
  id: string;
  assigned_to: string | null;
  status: 'open' | 'pending' | 'resolved';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  updated_at: string;
};
export type InboxInternalNote = {
  id: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
};
export type InboxTeammate = {
  member_user_id: string;
  member_email: string;
  member_role: string;
};

type Props = {
  provider: 'instagram' | 'facebook';
  conversationId: string;
  workflow: InboxWorkflow | null;
  notes: InboxInternalNote[];
  teammates: InboxTeammate[];
  canAssign: boolean;
  canUpdate: boolean;
  available: boolean;
  workflowAction?: string;
  noteAction?: string;
};

const statusLabels: Record<InboxWorkflow['status'], string> = {
  open: 'Open', pending: 'Pending customer', resolved: 'Resolved',
};
const priorityLabels: Record<InboxWorkflow['priority'], string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
};

export default function InboxConversationWorkflowPanel({
  provider, conversationId, workflow, notes, teammates, canAssign, canUpdate, available,
  workflowAction, noteAction,
}: Props) {
  const authorLabel = (id: string | null) => !id ? 'Former workspace member'
    : teammates.find((member) => member.member_user_id === id)?.member_email ?? `Workspace member · ${id.slice(0, 8)}`;
  const assignedLabel = workflow?.assigned_to
    ? authorLabel(workflow.assigned_to)
    : 'Unassigned';

  return <section className="inbox-workflow-panel">
    <div className="inbox-workflow-heading">
      <div><span className="eyebrow">TEAM WORKFLOW</span><h2>Ownership &amp; follow-up</h2><p>Assignment, priority and private notes stay inside this workspace.</p></div>
      <span className="inbox-private-pill">INTERNAL ONLY</span>
    </div>
    {!available ? <div className="inbox-workflow-unavailable" role="status">
      Apply Supabase migration <code>0020_unified_inbox_team_workflow.sql</code> to enable assignments, statuses, priorities and internal notes. Existing conversations and reply controls remain available.
    </div> : <>
      {workflowAction && <p className={`reply-action-message${['failed', 'invalid'].includes(workflowAction) ? ' is-error' : ''}`} role="status">
        {workflowAction === 'saved' ? 'Conversation workflow saved.' : workflowAction === 'invalid' ? 'The workflow form contains invalid values.' : 'The workflow could not be saved. Check your workspace role and migration 0020.'}
      </p>}
      {noteAction && <p className={`reply-action-message${['failed', 'invalid'].includes(noteAction) ? ' is-error' : ''}`} role="status">
        {noteAction === 'added' ? 'Internal note added. It was not sent to the customer.' : noteAction === 'invalid' ? 'Enter an internal note of 1–3,000 characters.' : 'The note could not be saved. Confirm workspace access and migration 0020.'}
      </p>}
      {canUpdate ? <form action={updateInboxConversationWorkflow} className="inbox-workflow-form">
        <input type="hidden" name="provider" value={provider}/>
        <input type="hidden" name="conversation_id" value={conversationId}/>
        <label>Assigned teammate
          {canAssign ? <select name="assigned_to" defaultValue={workflow?.assigned_to ?? ''}>
            <option value="">Unassigned</option>
            {workflow?.assigned_to && !teammates.some((member) => member.member_user_id === workflow.assigned_to) && <option value={workflow.assigned_to}>Former or unavailable teammate</option>}
            {teammates.map((member) => <option key={member.member_user_id} value={member.member_user_id}>{member.member_email} · {member.member_role.replaceAll('_', ' ')}</option>)}
          </select> : <>
            <input type="hidden" name="assigned_to" value={workflow?.assigned_to ?? ''}/>
            <span className="inbox-workflow-readonly">{assignedLabel} · assignment changes require an owner, admin or manager</span>
          </>}
        </label>
        <label>Conversation status<select name="status" defaultValue={workflow?.status ?? 'open'}>
          <option value="open">Open</option><option value="pending">Pending customer</option><option value="resolved">Resolved</option>
        </select></label>
        <label>Priority<select name="priority" defaultValue={workflow?.priority ?? 'normal'}>
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select></label>
        <button type="submit">Save workflow</button>
      </form> : <p className="inbox-workflow-unavailable">Your current workspace role can view this workflow and add internal notes, but cannot change assignment, status or priority.</p>}
      {workflow && <div className="inbox-workflow-current">
        <span className={`workflow-state state-${workflow.status}`}>{statusLabels[workflow.status]}</span>
        <span className={`workflow-priority priority-${workflow.priority}`}>{priorityLabels[workflow.priority]} priority</span>
        <span>Assigned: {assignedLabel}</span>
        <small>Updated {new Date(workflow.updated_at).toLocaleString()}</small>
      </div>}
      <div className="inbox-internal-notes">
        <div className="inbox-internal-notes-heading"><h3>Internal team notes</h3><span>{notes.length} recent</span></div>
        <form action={addInboxInternalNote} className="inbox-note-form">
          <input type="hidden" name="provider" value={provider}/>
          <input type="hidden" name="conversation_id" value={conversationId}/>
          <label htmlFor={`internal-note-${conversationId}`}>Add a private handoff note</label>
          <textarea id={`internal-note-${conversationId}`} name="body" rows={3} minLength={1} maxLength={3000} placeholder="Record context, next steps or a handoff for your team…" required/>
          <button type="submit">Add internal note</button>
        </form>
        {notes.length ? <div className="inbox-note-list">{notes.map((note) => <article key={note.id} className="inbox-note-card">
          <div><strong>{authorLabel(note.author_user_id)}</strong><time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time></div>
          <p>{note.body}</p>
        </article>)}</div> : <p className="inbox-note-empty">No internal notes yet. Notes are visible to workspace members and are never published to social channels.</p>}
      </div>
    </>}
  </section>;
}
