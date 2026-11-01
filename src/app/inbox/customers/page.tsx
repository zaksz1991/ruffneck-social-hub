import Link from 'next/link';
import { redirect } from 'next/navigation';
import { addInboxCustomerNote, saveInboxCustomerProfile } from '@/app/actions/inbox-customers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { customerStageLabel, maskProviderParticipantId } from '@/lib/inbox/customer-crm';
import '../inbox.css';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type CustomerProfile = {
  id: string; workspace_id: string; provider: 'instagram' | 'facebook'; conversation_id: string;
  social_account_id: string; participant_provider_id: string; display_label: string | null;
  relationship_stage: string; tags: string[]; created_at: string; updated_at: string;
};
type Account = { id: string; display_name: string | null; provider_account_id: string; provider: string };
type Conversation = {
  id: string; social_account_id: string; participant_provider_id: string; last_message_at: string;
};
type Message = { id: string; direction: string; message_text: string; provider_sent_at: string };
type CustomerNote = { id: string; author_user_id: string; note_text: string; created_at: string };

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function providerLabel(provider: string): string {
  return provider === 'facebook' ? 'Facebook Messenger' : 'Instagram';
}

function actionMessage(action: string | undefined): { text: string; error?: boolean } | null {
  const messages: Record<string, { text: string; error?: boolean }> = {
    saved: { text: 'Customer record saved.' },
    note_added: { text: 'Internal note added.' },
    invalid: { text: 'The customer record details are invalid.', error: true },
    invalid_note: { text: 'Enter an internal note of no more than 2,000 characters.', error: true },
    forbidden: { text: 'Your workspace role cannot perform this CRM action.', error: true },
    save_failed: { text: 'The customer record could not be saved. Confirm migration 0026 and workspace membership.', error: true },
    note_failed: { text: 'The internal note could not be saved. Confirm migration 0026 and your operational role.', error: true },
  };
  return action ? messages[action] ?? null : null;
}

export default async function InboxCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; profile?: string; q?: string; stage?: string; action?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim().slice(0, 80);
  const selectedStage = ['lead', 'prospect', 'customer', 'vip', 'at_risk', 'former_customer'].includes(params.stage ?? '') ? params.stage! : 'all';
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membershipsData } = await supabase.from('workspace_members').select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipsData ?? []) as Membership[];
  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspaceData } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceData ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0] ?? null;
  const membership = workspace ? memberships.find((item) => item.workspace_id === workspace.id) : null;
  if (!workspace || !membership) {
    return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox/conversations">Conversations</Link><span>Customer CRM</span></nav></header><section className="inbox-main"><h1>Customer CRM</h1><div className="inbox-empty"><h2>No workspace available</h2><p>Create or join a workspace before managing customer records.</p></div></section></main>;
  }

  const canOperate = ['owner', 'admin', 'manager', 'publisher'].includes(membership.role);
  const [profileResult, accountResult] = await Promise.all([
    supabase.from('inbox_customer_profiles')
      .select('id,workspace_id,provider,conversation_id,social_account_id,participant_provider_id,display_label,relationship_stage,tags,created_at,updated_at')
      .eq('workspace_id', workspace.id).order('updated_at', { ascending: false }).limit(200),
    supabase.from('social_accounts').select('id,display_name,provider_account_id,provider').eq('workspace_id', workspace.id),
  ]);
  const migrationUnavailable = Boolean(profileResult.error);
  const profiles = (profileResult.data ?? []) as CustomerProfile[];
  const accounts = (accountResult.data ?? []) as Account[];
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const visibleProfiles = profiles.filter((profile) => {
    const account = accountMap.get(profile.social_account_id);
    const text = `${profile.display_label ?? ''} ${profile.tags.join(' ')} ${profile.participant_provider_id.slice(-4)} ${account?.display_name ?? ''}`.toLocaleLowerCase();
    return (selectedStage === 'all' || profile.relationship_stage === selectedStage) && (!query || text.includes(query.toLocaleLowerCase()));
  });
  const selectedProfile = profiles.find((profile) => profile.id === params.profile) ?? null;
  const selectedAccount = selectedProfile ? accountMap.get(selectedProfile.social_account_id) : null;

  let timeline: Message[] = [];
  let notes: CustomerNote[] = [];
  let conversationLastMessageAt: string | null = null;
  let messageCount = 0;
  if (selectedProfile) {
    const conversationResult = selectedProfile.provider === 'instagram'
      ? await supabase.from('instagram_conversations').select('last_message_at').eq('id', selectedProfile.conversation_id).eq('workspace_id', workspace.id).maybeSingle()
      : await supabase.from('facebook_conversations').select('last_message_at').eq('id', selectedProfile.conversation_id).eq('workspace_id', workspace.id).maybeSingle();
    conversationLastMessageAt = conversationResult.data?.last_message_at ?? null;
    const messageResult = selectedProfile.provider === 'instagram'
      ? await supabase.from('instagram_messages').select('id,direction,message_text,provider_sent_at', { count: 'exact' }).eq('conversation_id', selectedProfile.conversation_id).eq('workspace_id', workspace.id).order('provider_sent_at', { ascending: false }).limit(30)
      : await supabase.from('facebook_messages').select('id,direction,message_text,provider_sent_at', { count: 'exact' }).eq('conversation_id', selectedProfile.conversation_id).eq('workspace_id', workspace.id).order('provider_sent_at', { ascending: false }).limit(30);
    timeline = ((messageResult.data ?? []) as Message[]).reverse();
    messageCount = messageResult.count ?? timeline.length;
    if (canOperate) {
      const noteResult = await supabase.from('inbox_customer_notes').select('id,author_user_id,note_text,created_at')
        .eq('profile_id', selectedProfile.id).eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(50);
      notes = (noteResult.data ?? []) as CustomerNote[];
    }
  }

  let unprofiled: Array<Conversation & { provider: 'instagram' | 'facebook' }> = [];
  if (!migrationUnavailable) {
    const [instagramResult, facebookResult] = await Promise.all([
      supabase.from('instagram_conversations').select('id,social_account_id,participant_provider_id,last_message_at').eq('workspace_id', workspace.id).order('last_message_at', { ascending: false }).limit(40),
      supabase.from('facebook_conversations').select('id,social_account_id,participant_provider_id,last_message_at').eq('workspace_id', workspace.id).order('last_message_at', { ascending: false }).limit(40),
    ]);
    const known = new Set(profiles.map((profile) => `${profile.provider}:${profile.social_account_id}:${profile.participant_provider_id}`));
    unprofiled = [
      ...((instagramResult.data ?? []) as Conversation[]).map((row) => ({ ...row, provider: 'instagram' as const })),
      ...((facebookResult.data ?? []) as Conversation[]).map((row) => ({ ...row, provider: 'facebook' as const })),
    ].filter((row) => !known.has(`${row.provider}:${row.social_account_id}:${row.participant_provider_id}`))
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
      .slice(0, 12);
  }

  const stageCounts = profiles.reduce<Record<string, number>>((result, profile) => {
    result[profile.relationship_stage] = (result[profile.relationship_stage] ?? 0) + 1;
    return result;
  }, {});
  const notice = actionMessage(params.action);

  return <main className="inbox-shell">
    <header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/sla">Inbox SLA</Link><Link href="/inbox/automation">Automation</Link><span>Customer CRM</span></nav><Link href="/inbox/conversations" className="inbox-back">Back to inbox</Link></header>
    <section className="inbox-main inbox-customer-crm-main">
      <div className="inbox-heading"><div><span className="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</span><h1>Customer CRM</h1><p>Organise inbox relationships, track interaction history and keep internal service notes alongside supported social conversations.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace.name}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox/customers?workspace=${item.id}`} className={item.id === workspace.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div></div>
      <div className="inbox-notice"><strong>Provider-scoped customer records</strong><p>Each CRM record belongs to one connected account and one provider participant. RuffNeck does not automatically merge identities across Facebook, Instagram or separate Pages. Provider identifiers are masked in the interface; contact details are not inferred or imported.</p></div>
      {notice && <div className={`reply-action-message${notice.error ? ' is-error' : ''}`} role="status">{notice.text}</div>}
      {migrationUnavailable ? <div className="inbox-inline-note"><strong>Customer CRM is not installed.</strong> Apply Supabase migration <code>0026_inbox_customer_crm.sql</code> after migration 0025. No inbox data has been changed.</div> : <>
        <div className="inbox-customer-metrics"><article><span>CRM records shown</span><strong>{profiles.length}</strong><small>Latest 200 records maximum</small></article><article><span>Customers</span><strong>{stageCounts.customer ?? 0}</strong><small>Customer-stage records in this sample</small></article><article><span>VIP</span><strong>{stageCounts.vip ?? 0}</strong><small>VIP-stage records in this sample</small></article><article><span>At risk</span><strong>{stageCounts.at_risk ?? 0}</strong><small>At-risk records in this sample</small></article></div>
        <form className="inbox-customer-filters" method="get"><input type="hidden" name="workspace" value={workspace.id}/><label>Search CRM<input name="q" defaultValue={query} placeholder="Name, tag, account or masked ID" maxLength={80}/></label><label>Relationship stage<select name="stage" defaultValue={selectedStage}><option value="all">All stages</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="vip">VIP</option><option value="at_risk">At risk</option><option value="former_customer">Former customer</option></select></label><button type="submit">Filter records</button><Link href={`/inbox/customers?workspace=${workspace.id}`}>Clear</Link></form>
        <div className="inbox-customer-layout">
          <section className="inbox-customer-list-panel"><div className="inbox-customer-panel-heading"><div><span className="eyebrow">WORKSPACE CONTACTS</span><h2>Customer records</h2></div><span className="inbox-private-pill">{visibleProfiles.length} SHOWN</span></div><p className="inbox-customer-sample-note">The list and stage counts use the latest 200 recently updated CRM records. The enrolment panel shows up to 12 recent unprofiled conversations.</p>
            {visibleProfiles.length ? <div className="inbox-customer-list">{visibleProfiles.map((profile) => { const account = accountMap.get(profile.social_account_id); return <Link key={profile.id} href={`/inbox/customers?workspace=${workspace.id}&profile=${profile.id}${query ? `&q=${encodeURIComponent(query)}` : ''}${selectedStage !== 'all' ? `&stage=${selectedStage}` : ''}`} className={`inbox-customer-card${selectedProfile?.id === profile.id ? ' is-selected' : ''}`}><div className="inbox-customer-avatar">{(profile.display_label ?? account?.display_name ?? 'C').slice(0, 1).toUpperCase()}</div><div className="inbox-customer-card-copy"><strong>{profile.display_label || maskProviderParticipantId(profile.participant_provider_id)}</strong><span>{providerLabel(profile.provider)} · {account?.display_name || 'Connected account'}</span><div className="inbox-customer-chip-row"><i className={`customer-stage stage-${profile.relationship_stage}`}>{customerStageLabel(profile.relationship_stage)}</i>{profile.tags.slice(0, 3).map((tag) => <small key={tag}>{tag}</small>)}</div></div><time>{dateTime(profile.updated_at)}</time></Link>; })}</div> : <div className="inbox-empty"><h3>No matching customer records</h3><p>Add a recent inbox participant to CRM or change the filters.</p></div>}
          </section>

          <section className="inbox-customer-detail-panel">
            {selectedProfile ? <>
              <div className="inbox-customer-detail-heading"><div><span className="eyebrow">{providerLabel(selectedProfile.provider).toUpperCase()} RELATIONSHIP</span><h2>{selectedProfile.display_label || maskProviderParticipantId(selectedProfile.participant_provider_id)}</h2><p>{selectedAccount?.display_name || selectedAccount?.provider_account_id || 'Connected account'} · Last interaction {conversationLastMessageAt ? dateTime(conversationLastMessageAt) : 'not available'}</p></div><i className={`customer-stage stage-${selectedProfile.relationship_stage}`}>{customerStageLabel(selectedProfile.relationship_stage)}</i></div>
              {canOperate ? <form action={saveInboxCustomerProfile} className="inbox-customer-profile-form"><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="provider" value={selectedProfile.provider}/><input type="hidden" name="conversation_id" value={selectedProfile.conversation_id}/><label>Internal customer label<input name="display_label" defaultValue={selectedProfile.display_label ?? ''} maxLength={100} placeholder="Add a name or internal label"/></label><label>Relationship stage<select name="relationship_stage" defaultValue={selectedProfile.relationship_stage}><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="vip">VIP</option><option value="at_risk">At risk</option><option value="former_customer">Former customer</option></select></label><label>Tags<input name="tags" defaultValue={selectedProfile.tags.join(', ')} maxLength={360} placeholder="vip, repeat buyer, follow-up"/></label><small>Up to 12 tags. Changes are saved to the workspace CRM only and are never sent to the social provider.</small><button type="submit">Save customer record</button></form> : <p className="inbox-customer-readonly">Your role can view customer relationship records but cannot update them or add internal notes.</p>}
              <div className="inbox-customer-subheading"><div><span className="eyebrow">INTERACTION HISTORY</span><h3>Recent conversation</h3></div><span>{messageCount} total messages · latest 30 shown</span></div>
              {timeline.length ? <div className="inbox-customer-timeline">{timeline.map((message) => <article key={message.id} className={message.direction === 'outbound' ? 'is-outbound' : 'is-inbound'}><div><strong>{message.direction === 'outbound' ? 'Your team' : 'Customer'}</strong><time>{dateTime(message.provider_sent_at)}</time></div><p>{message.message_text}</p></article>)}</div> : <div className="inbox-empty"><p>No text messages are available for this conversation.</p></div>}
              <div className="inbox-customer-subheading"><div><span className="eyebrow">PRIVATE TEAM CONTEXT</span><h3>Internal notes</h3></div><span>Workspace-only</span></div>
              {canOperate && <form action={addInboxCustomerNote} className="inbox-customer-note-form"><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="profile_id" value={selectedProfile.id}/><label htmlFor="customer-note">Add a private note</label><textarea id="customer-note" name="note_text" rows={3} maxLength={2000} required placeholder="Record useful service context, follow-up commitments or handover details."/><div><small>Maximum 2,000 characters. Notes are not sent to customers.</small><button type="submit">Add note</button></div></form>}
              {canOperate ? notes.length ? <div className="inbox-customer-notes">{notes.map((note) => <article key={note.id}><p>{note.note_text}</p><small>Added by team member · {dateTime(note.created_at)}</small></article>)}</div> : <div className="inbox-empty"><p>No internal notes have been added.</p></div> : null}
            </> : <div className="inbox-customer-empty-detail"><span className="eyebrow">CUSTOMER PROFILE</span><h2>Select a customer record</h2><p>Choose a record from the list to review relationship stage, tags, conversation history and internal notes.</p><div className="inbox-customer-detail-stat"><strong>{profiles.length}</strong><span>provider-scoped customer records in this workspace</span></div></div>}
          </section>
        </div>

        {canOperate && <section className="inbox-customer-unprofiled"><div className="inbox-customer-panel-heading"><div><span className="eyebrow">CRM ENROLMENT</span><h2>Recent conversation candidates</h2><p>Add or refresh a provider-scoped CRM record when the team needs to track the relationship beyond the inbox thread.</p></div><span className="inbox-private-pill">{unprofiled.length} AVAILABLE</span></div>
          {unprofiled.length ? <div className="inbox-customer-unprofiled-grid">{unprofiled.map((conversation) => { const account = accountMap.get(conversation.social_account_id); return <article key={`${conversation.provider}:${conversation.id}`}><div><strong>{maskProviderParticipantId(conversation.participant_provider_id)}</strong><span>{providerLabel(conversation.provider)} · {account?.display_name || 'Connected account'}</span><small>Last interaction {dateTime(conversation.last_message_at)}</small></div><form action={saveInboxCustomerProfile}><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="provider" value={conversation.provider}/><input type="hidden" name="conversation_id" value={conversation.id}/><input type="hidden" name="relationship_stage" value="lead"/><input type="hidden" name="display_label" value=""/><input type="hidden" name="tags" value=""/><button type="submit">Add / refresh CRM</button></form></article>; })}</div> : <div className="inbox-empty"><p>No recent conversation candidates are currently available.</p></div>}
        </section>}
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · WORKSPACE-ISOLATED CUSTOMER CRM</footer>
    </section>
  </main>;
}
