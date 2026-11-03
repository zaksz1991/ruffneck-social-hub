import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  addAgencyClientNote,
  createAgencyClient,
  updateAgencyClientProfile,
  updateAgencyClientStatus,
} from '@/app/actions/agency-clients';
import { normalizeAgencyClientUsage } from '@/lib/agency/client-management.mjs';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  workspace_id: string;
  client_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  status: 'prospect' | 'onboarding' | 'active' | 'paused' | 'closed';
  service_level: 'basic' | 'standard' | 'premium';
  monthly_retainer: number | string | null;
  retainer_currency: string;
  start_date: string | null;
  next_review_date: string | null;
  created_at: string;
};
type NoteRow = { id: string; client_id: string; note_text: string; created_at: string };

const messages: Record<string, string> = {
  created: 'Client record created.',
  profile_updated: 'Client details updated.',
  status_updated: 'Client status updated.',
  note_added: 'Internal note added.',
  limit: 'Your plan has reached its managed-client allowance. Close an inactive client or review the subscription plan.',
  permission: 'Only workspace owners, admins and managers can manage client records.',
  invalid: 'Some details are missing or invalid. Review the form and try again.',
  invalid_note: 'Enter a note containing between 2 and 2,000 characters.',
  save_error: 'The client record could not be saved. Confirm migration 0045 has been applied.',
  profile_error: 'The client details could not be updated.',
  status_error: 'The client status could not be changed.',
  note_error: 'The internal note could not be saved.',
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? 'Not set' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
function fmtMoney(value: number | string | null, currency: string): string {
  if (value === null || value === '') return 'Not recorded';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not recorded';
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en-NG')}`; }
}
function statusLabel(value: string): string { return value.replaceAll('_', ' '); }

export default async function AgencyClientsPage({ searchParams }: {
  searchParams: Promise<{ workspace?: string; search?: string; status?: string; result?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as { id: string; name: string }[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0];
  if (!workspace) {
    return <main className="agency-clients-page"><div className="agency-clients-wrap"><Link href="/" className="ac-back">← Workspace overview</Link><h1>Agency clients</h1><p>Create a workspace before managing client accounts.</p></div></main>;
  }

  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspace.id).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager'].includes(String(membership.role))) redirect('/');

  const [clientResult, usageResult] = await Promise.all([
    supabase.from('agency_clients').select('id,workspace_id,client_name,contact_name,contact_email,contact_phone,website,status,service_level,monthly_retainer,retainer_currency,start_date,next_review_date,created_at')
      .eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(250),
    supabase.rpc('get_agency_client_usage_snapshot', { p_workspace_id: workspace.id }),
  ]);
  const allClients = (clientResult.data ?? []) as ClientRow[];
  const needle = (params.search ?? '').trim().toLocaleLowerCase('en');
  const selectedStatus = ['prospect', 'onboarding', 'active', 'paused', 'closed'].includes(params.status ?? '') ? params.status : 'all';
  const clients = allClients.filter((client) => {
    const matchesText = !needle || [client.client_name, client.contact_name, client.contact_email, client.contact_phone].some((value) => value.toLocaleLowerCase('en').includes(needle));
    return matchesText && (selectedStatus === 'all' || client.status === selectedStatus);
  });
  const ids = clients.map((client) => client.id);
  let notes: NoteRow[] = [];
  if (ids.length) {
    const { data } = await supabase.from('agency_client_notes').select('id,client_id,note_text,created_at')
      .eq('workspace_id', workspace.id).in('client_id', ids).order('created_at', { ascending: false }).limit(150);
    notes = (data ?? []) as NoteRow[];
  }
  const notesByClient = new Map<string, NoteRow[]>();
  for (const note of notes) {
    const rows = notesByClient.get(note.client_id) ?? [];
    if (rows.length < 3) rows.push(note);
    notesByClient.set(note.client_id, rows);
  }
  const usage = usageResult.error ? null : normalizeAgencyClientUsage(usageResult.data);
  const result = params.result ? messages[params.result] : '';
  const dbError = Boolean(clientResult.error || usageResult.error);

  return (
    <main className="agency-clients-page">
      <div className="agency-clients-wrap">
        <header className="ac-top"><Link href={`/?workspace=${workspace.id}`} className="ac-back">← Workspace overview</Link><span className="ac-brand">RUFFNECK SOCIAL HUB</span></header>
        <section className="ac-hero">
          <span className="ac-eyebrow">AGENCY OPERATIONS</span>
          <h1>Client portfolio</h1>
          <p>Keep your agency's client information, service arrangements, review dates and internal notes in one workspace. Each record belongs to <strong>{workspace.name}</strong>.</p>
          {usage && <div className="ac-capacity"><span>Managed client allowance</span><strong>{usage.used} of {usage.limit}</strong><span>{usage.remaining} slots remaining · {usage.planCode.toUpperCase()} plan</span><div className="ac-capacity-track"><span style={{ width: `${usage.percent}%` }} /></div></div>}
        </section>

        {result && <p className={`ac-notice ${params.result === 'created' || params.result === 'profile_updated' || params.result === 'status_updated' || params.result === 'note_added' ? 'success' : 'warning'}`} role="status">{result}</p>}
        {dbError && <section className="ac-notice warning"><strong>Client management is not available yet.</strong><br />Confirm that Supabase migration <code>0045_agency_client_management.sql</code> was applied after migration 0044.</section>}

        <section className="ac-section">
          <div className="ac-section-heading"><div><span className="ac-eyebrow">NEW ACCOUNT</span><h2>Add a client</h2><p>Create an agency-side record for a business you manage.</p></div></div>
          <form action={createAgencyClient} className="ac-form">
            <input type="hidden" name="workspace_id" value={workspace.id} />
            <label>Business or client name *<input name="client_name" required minLength={2} maxLength={140} placeholder="Example: Northstar Foods" /></label>
            <label>Primary contact<input name="contact_name" maxLength={120} placeholder="Contact person's name" /></label>
            <label>Contact email<input name="contact_email" type="email" maxLength={254} placeholder="name@business.com" /></label>
            <label>Phone number<input name="contact_phone" maxLength={40} placeholder="+234 ..." /></label>
            <label>Website<input name="website" type="url" maxLength={255} placeholder="https://example.com" /></label>
            <label>Client status<select name="status" defaultValue="prospect"><option value="prospect">Prospect</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
            <label>Service level<select name="service_level" defaultValue="standard"><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
            <label>Monthly retainer (optional)<input name="monthly_retainer" type="number" min="0" max="1000000000" step="0.01" placeholder="e.g. 150000" /></label>
            <label>Currency<select name="retainer_currency" defaultValue="NGN"><option>NGN</option><option>USD</option><option>GBP</option><option>EUR</option><option>GHS</option><option>KES</option><option>ZAR</option></select></label>
            <label>Service start date<input name="start_date" type="date" /></label>
            <label>Next review date<input name="next_review_date" type="date" /></label>
            <div className="ac-submit-wrap"><button type="submit" className="ac-primary" disabled={Boolean(usage?.reached)}>Add client</button>{usage?.reached && <small>Client capacity is full. Close an inactive client or review the plan.</small>}</div>
          </form>
        </section>

        <section className="ac-section ac-portfolio">
          <div className="ac-section-heading"><div><span className="ac-eyebrow">YOUR ACCOUNTS</span><h2>Managed clients</h2><p>{allClients.filter((client) => client.status !== 'closed').length} active records · {allClients.filter((client) => client.status === 'closed').length} closed records</p></div><Link href={`/billing/usage?workspace=${workspace.id}`} className="ac-secondary">View plan usage</Link></div>
          <form method="get" className="ac-filters"><input type="hidden" name="workspace" value={workspace.id} /><label className="ac-search">Search clients<input name="search" defaultValue={params.search ?? ''} placeholder="Name, contact, email or phone" /></label><label>Status<select name="status" defaultValue={selectedStatus}><option value="all">All statuses</option><option value="prospect">Prospect</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label><button className="ac-secondary" type="submit">Filter</button><Link href={`/agency/clients?workspace=${workspace.id}`} className="ac-clear">Clear</Link></form>
          {clientResult.error ? <div className="ac-empty">Client records could not be loaded. Apply migration 0045 and refresh this page.</div> : clients.length === 0 ? <div className="ac-empty">No matching client records. Use the form above to add your first client.</div> : (
            <div className="ac-client-grid">
              {clients.map((client) => (
                <article className="ac-client-card" key={client.id}>
                  <div className="ac-client-top"><div><h3>{client.client_name}</h3><p>{client.contact_name || 'No primary contact recorded'}</p></div><span className={`ac-status status-${client.status}`}>{statusLabel(client.status)}</span></div>
                  <div className="ac-client-facts">
                    <div><span>Email</span><strong>{client.contact_email || 'Not recorded'}</strong></div>
                    <div><span>Phone</span><strong>{client.contact_phone || 'Not recorded'}</strong></div>
                    <div><span>Service</span><strong>{client.service_level}</strong></div>
                    <div><span>Monthly retainer</span><strong>{fmtMoney(client.monthly_retainer, client.retainer_currency)}</strong></div>
                    <div><span>Start date</span><strong>{fmtDate(client.start_date)}</strong></div>
                    <div><span>Next review</span><strong>{fmtDate(client.next_review_date)}</strong></div>
                  </div>
                  {client.website && <p className="ac-website">Website: {client.website}</p>}
                  <details className="ac-details"><summary>Edit client details</summary>
                    <form action={updateAgencyClientProfile} className="ac-edit-form">
                      <input type="hidden" name="workspace_id" value={workspace.id} /><input type="hidden" name="client_id" value={client.id} />
                      <label>Client name<input name="client_name" required maxLength={140} defaultValue={client.client_name} /></label>
                      <label>Contact name<input name="contact_name" maxLength={120} defaultValue={client.contact_name} /></label>
                      <label>Contact email<input name="contact_email" type="email" maxLength={254} defaultValue={client.contact_email} /></label>
                      <label>Phone<input name="contact_phone" maxLength={40} defaultValue={client.contact_phone} /></label>
                      <label>Website<input name="website" type="url" maxLength={255} defaultValue={client.website} /></label>
                      <label>Service level<select name="service_level" defaultValue={client.service_level}><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
                      <label>Monthly retainer<input name="monthly_retainer" type="number" min="0" max="1000000000" step="0.01" defaultValue={client.monthly_retainer ?? ''} /></label>
                      <label>Currency<select name="retainer_currency" defaultValue={client.retainer_currency}><option>NGN</option><option>USD</option><option>GBP</option><option>EUR</option><option>GHS</option><option>KES</option><option>ZAR</option></select></label>
                      <label>Start date<input name="start_date" type="date" defaultValue={client.start_date ?? ''} /></label>
                      <label>Next review<input name="next_review_date" type="date" defaultValue={client.next_review_date ?? ''} /></label>
                      <button type="submit" className="ac-small-button">Save details</button>
                    </form>
                  </details>
                  <form action={updateAgencyClientStatus} className="ac-status-form"><input type="hidden" name="workspace_id" value={workspace.id} /><input type="hidden" name="client_id" value={client.id} /><label>Change status<select name="status" defaultValue={client.status}><option value="prospect">Prospect</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label><button type="submit" className="ac-small-button">Update</button></form>
                  <div className="ac-notes"><h4>Internal notes</h4>{(notesByClient.get(client.id) ?? []).map((note) => <p className="ac-note" key={note.id}>{note.note_text}<small>{fmtDate(note.created_at)}</small></p>)}{!(notesByClient.get(client.id) ?? []).length && <p className="ac-muted">No notes recorded.</p>}
                    <form action={addAgencyClientNote} className="ac-note-form"><input type="hidden" name="workspace_id" value={workspace.id} /><input type="hidden" name="client_id" value={client.id} /><textarea name="note_text" required minLength={2} maxLength={2000} rows={2} placeholder="Add a private agency note..." /><button type="submit" className="ac-small-button">Add note</button></form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <footer className="ac-footer"><span>Client records are private to agency owners, admins and managers. They do not grant access to a client's separate social accounts or workspace.</span><Link href={`/billing?workspace=${workspace.id}`}>Plans & billing</Link></footer>
      </div>
      <style>{`
        .agency-clients-page{min-height:100vh;background:#f4f7fb;color:#17243c;padding:34px 20px 60px}.agency-clients-wrap{max-width:1180px;margin:0 auto}.ac-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}.ac-back{color:#425670;font-weight:750;text-decoration:none}.ac-brand{font-size:10px;font-weight:900;letter-spacing:.16em;color:#78889d}.ac-hero{max-width:780px;margin-bottom:26px}.ac-eyebrow{font-size:10px;letter-spacing:.15em;font-weight:900;color:#078da6}.ac-hero h1{font-size:clamp(34px,5vw,50px);letter-spacing:-.05em;margin:9px 0;color:#13243f}.ac-hero>p,.ac-section-heading p{color:#687991;line-height:1.65}.ac-capacity{display:grid;grid-template-columns:1fr auto;gap:8px 16px;max-width:500px;margin-top:18px;padding:15px 17px;background:#e8f3f7;border-radius:14px;color:#3f5e72;font-size:12px}.ac-capacity strong{color:#12314a}.ac-capacity>span:last-of-type{grid-column:1/-1;color:#698093}.ac-capacity-track{height:7px;grid-column:1/-1;background:#d3e2e8;border-radius:9px;overflow:hidden}.ac-capacity-track span{display:block;height:100%;background:#0b9fb0;border-radius:9px}.ac-notice{padding:13px 16px;border-radius:11px;margin:14px 0;font-size:13px;line-height:1.6}.ac-notice.success{background:#e4f8ee;color:#12623d}.ac-notice.warning{background:#fff3db;color:#80510b}.ac-section{margin-top:26px;padding:23px;background:white;border:1px solid #dfe7f0;border-radius:18px;box-shadow:0 8px 24px #172d4a08}.ac-section-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:17px}.ac-section-heading h2{font-size:23px;margin:5px 0}.ac-section-heading p{font-size:12px;margin:0}.ac-form,.ac-edit-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.ac-form label,.ac-edit-form label,.ac-filters label,.ac-status-form label{display:grid;gap:6px;color:#465a74;font-size:11px;font-weight:800}.ac-form input,.ac-form select,.ac-edit-form input,.ac-edit-form select,.ac-filters input,.ac-filters select,.ac-status-form select,.ac-note-form textarea{width:100%;min-width:0;border:1px solid #d8e1eb;border-radius:9px;padding:10px 11px;background:#fff;color:#243650;font:inherit;font-size:12px;outline-color:#0a9db2}.ac-submit-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ac-submit-wrap small{color:#a06410;font-size:11px}.ac-primary,.ac-small-button{border:0;border-radius:9px;background:#102a49;color:white;padding:11px 17px;font-size:12px;font-weight:800;cursor:pointer}.ac-primary:disabled{background:#b9c3d1;cursor:not-allowed}.ac-portfolio{margin-top:30px}.ac-secondary{display:inline-flex;align-items:center;justify-content:center;border:1px solid #cbd9e5;border-radius:9px;padding:9px 12px;background:#f4fafc;color:#1b6274;text-decoration:none;font-size:11px;font-weight:850;cursor:pointer}.ac-filters{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:18px}.ac-search{flex:1;min-width:220px}.ac-clear{font-size:11px;color:#56718b;text-decoration:none;padding:10px}.ac-client-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.ac-client-card{border:1px solid #e1e8f0;border-radius:14px;padding:17px;background:#fff;min-width:0}.ac-client-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ac-client-top h3{margin:0;font-size:18px;color:#192d49}.ac-client-top p{margin:5px 0 0;color:#6d7d91;font-size:12px}.ac-status{white-space:nowrap;border-radius:30px;padding:5px 9px;font-size:10px;font-weight:900;text-transform:capitalize}.status-prospect{background:#edf1f7;color:#586a80}.status-onboarding{background:#fff0d8;color:#835a13}.status-active{background:#e0f7eb;color:#17613e}.status-paused{background:#fff3db;color:#80510b}.status-closed{background:#f0eafa;color:#6d4e90}.ac-client-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:16px}.ac-client-facts div{display:grid;gap:4px;min-width:0}.ac-client-facts span{font-size:10px;color:#8592a2}.ac-client-facts strong{font-size:11px;color:#334a65;overflow-wrap:anywhere}.ac-website{font-size:11px;color:#526b83;overflow-wrap:anywhere}.ac-details{margin-top:15px;border-top:1px solid #edf1f5;padding-top:11px}.ac-details summary{font-size:11px;color:#1b7387;font-weight:850;cursor:pointer}.ac-edit-form{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}.ac-edit-form .ac-small-button{grid-column:1/-1;justify-self:start}.ac-status-form{display:flex;align-items:end;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid #edf1f5}.ac-status-form label{flex:1;max-width:220px}.ac-small-button{padding:9px 12px;font-size:10px}.ac-notes{margin-top:15px;padding-top:13px;border-top:1px solid #edf1f5}.ac-notes h4{font-size:12px;margin:0 0 8px}.ac-note{background:#f6f8fb;border-radius:8px;padding:9px 10px;margin:6px 0;color:#52657c;font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.ac-note small{display:block;margin-top:5px;color:#8996a6;font-size:9px}.ac-muted{color:#8996a6;font-size:11px}.ac-note-form{display:flex;align-items:start;gap:8px;margin-top:9px}.ac-note-form textarea{resize:vertical;flex:1}.ac-empty{padding:25px;border:1px dashed #cbd7e3;border-radius:12px;background:#f9fbfd;color:#718096;font-size:13px}.ac-footer{display:flex;justify-content:space-between;gap:15px;margin-top:28px;padding-top:17px;border-top:1px solid #dfe6ef;color:#7b899c;font-size:11px;line-height:1.6}.ac-footer a{white-space:nowrap;color:#1c7892;font-weight:800;text-decoration:none}@media(max-width:900px){.ac-client-grid{grid-template-columns:1fr}.ac-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.agency-clients-page{padding:22px 13px 42px}.ac-section{padding:16px}.ac-form,.ac-edit-form{grid-template-columns:1fr}.ac-client-facts{grid-template-columns:1fr 1fr}.ac-section-heading{align-items:flex-start;flex-direction:column}.ac-client-top{align-items:flex-start}.ac-footer{flex-direction:column}.ac-note-form{flex-direction:column}.ac-note-form button{align-self:flex-start}}
      `}</style>
    </main>
  );
}
