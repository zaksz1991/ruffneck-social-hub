import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { createBrand, createWorkspace, renameBrand } from '@/app/actions/workspaces';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Workspace = { id: string; name: string; created_at: string };
type Brand = { id: string; workspace_id: string; name: string; timezone: string; created_at: string };

const cards = [
  ['Connected channels', '0', 'No verified provider connections'],
  ['Scheduled content', '0', 'No publishing jobs'],
  ['Open conversations', '0', 'Inbox adapters not enabled'],
  ['AI workflows', '0', 'Approval-first foundation'],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ workspace?: string; error?: string; saved?: string }> }) {
  const params = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <main className="setup-screen"><section><p className="eyebrow">RUFFNECK SOCIAL HUB</p><h1>Connect the workspace database</h1><p>Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the hosting environment, then apply all Supabase migrations in numerical order.</p></section></main>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="setup-screen"><section><p className="eyebrow">RUFFNECK SOCIAL HUB</p><h1>Sign in to continue</h1><p>Your workspace data is available only to authenticated members.</p><Link href="/login">Open sign in</Link></section></main>;

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name,created_at').order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((w) => w.id === params.workspace) ?? workspaces[0];
  const { data: memberRow } = activeWorkspace
    ? await supabase.from('workspace_members').select('role').eq('workspace_id', activeWorkspace.id).eq('user_id', user.id).maybeSingle()
    : { data: null };
  const role = memberRow?.role ?? 'member';
  const canManage = role === 'owner' || role === 'admin';
  const { data: brandRows } = activeWorkspace
    ? await supabase.from('brands').select('id,workspace_id,name,timezone,created_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: true })
    : { data: [] };
  const brands = (brandRows ?? []) as Brand[];

  const errorMessages: Record<string, string> = {
    'workspace-name': 'Workspace names must contain 2–120 characters.',
    'workspace-create': 'Workspace creation failed. Confirm migration 0003 has been applied.',
    'brand-input': 'Enter a valid brand name.',
    'brand-create': 'Brand creation failed. Only workspace owners and admins can add brands.',
    'brand-update': 'Brand update failed. Only workspace owners and admins can rename brands.',
  };

  return <main className="app-shell">
    <aside>
      <div className="logo">R<span>UFFNECK</span><small>SOCIAL HUB</small></div>
      <p className="workspace">ACTIVE WORKSPACE<br/><b>{activeWorkspace?.name ?? 'No workspace yet'}</b><br/>{role.toUpperCase()}</p>
      <nav>
        <a className="active" href="#overview">Overview</a>
        <a href="#brands">Brands & clients</a>
        <a href="#team">Team access</a>
        <a href="#publishing">Publishing</a>
        <a href="#inbox">Unified inbox</a>
        <a href="#automation">AI automation</a>
        <a href="#channels">Connected channels</a>
      </nav>
      <footer>SECURE WORKSPACES<br/><small>Provider actions remain disabled</small></footer>
    </aside>
    <section className="dashboard">
      <header>
        <div><small>OPERATIONS / WORKSPACE MANAGEMENT</small><h1>Command centre</h1><p>Manage independent workspaces and the brands operating inside each one.</p></div>
        <div className="account-strip"><span>{user.email}</span><form action={signOut}><button type="submit">Sign out</button></form></div>
      </header>

      {params.error && <p className="notice error">{errorMessages[params.error] ?? 'The requested operation could not be completed.'}</p>}
      {params.saved && <p className="notice success">{params.saved === 'brand' ? 'Brand created.' : 'Brand name updated.'}</p>}

      <article className="hero" id="overview"><small>RUFFNECK SOCIAL HUB</small><h2>Social operations, <em>under control.</em></h2><p>One secure control plane for multiple brands, client accounts, publishing workflows and human-supervised AI.</p></article>

      <div className="section-heading"><div><h3>Workspace portfolio</h3><p>Each workspace has isolated membership and brand records.</p></div><span className="count-pill">{workspaces.length} WORKSPACE{workspaces.length === 1 ? '' : 'S'}</span></div>
      <div className="workspace-grid">
        {workspaces.map((workspace) => <Link className={`workspace-card ${workspace.id === activeWorkspace?.id ? 'selected' : ''}`} href={`/?workspace=${workspace.id}`} key={workspace.id}><small>{workspace.id === activeWorkspace?.id ? 'CURRENT WORKSPACE' : 'SWITCH WORKSPACE'}</small><strong>{workspace.name}</strong><span>Open workspace →</span></Link>)}
        <form className="create-card" action={createWorkspace}><label htmlFor="workspace-name">Create another workspace</label><input id="workspace-name" name="name" minLength={2} maxLength={120} placeholder="e.g. Client Operations" required/><button type="submit">Create workspace</button><small>Creates a separate workspace with you as owner and a primary brand.</small></form>
      </div>

      <div className="section-heading" id="brands"><div><h3>Brands & client accounts</h3><p>{activeWorkspace ? `Brands belonging to ${activeWorkspace.name}.` : 'Create a workspace before adding brands.'}</p></div><span className="count-pill">{brands.length} BRAND{brands.length === 1 ? '' : 'S'}</span></div>
      {activeWorkspace ? <>
        <div className="brand-list">{brands.map((brand) => <article className="brand-row" key={brand.id}><div><small>BRAND</small><strong>{brand.name}</strong><span>Timezone: {brand.timezone}</span></div>{canManage && <form action={renameBrand} className="rename-form"><input type="hidden" name="brand_id" value={brand.id}/><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input name="name" aria-label={`New name for ${brand.name}`} minLength={2} maxLength={80} placeholder="New brand name" required/><button type="submit">Rename</button></form>}</article>)}</div>
        {canManage && <form action={createBrand} className="inline-create"><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><label htmlFor="brand-name">Add a brand</label><input id="brand-name" name="name" minLength={2} maxLength={80} placeholder="Brand or client name" required/><button type="submit">Add brand</button></form>}
        {!canManage && <p className="muted-note">Your {role} role has read-only brand access.</p>}
      </> : <p className="empty-state">No workspace is available for this account. Complete the signup flow again or contact the workspace administrator.</p>}

      <div className="section-heading" id="team"><div><h3>Team access</h3><p>Workspace roles are enforced by database policies. Invitation delivery is not enabled yet.</p></div><span className="status-pill">INVITATIONS NEXT</span></div>
      <div className="team-summary"><div><strong>{role}</strong><span>Your role in the selected workspace</span></div><div><strong>{workspaces.length}</strong><span>Workspaces you can access</span></div><div><strong>RLS</strong><span>Database-enforced tenant boundary</span></div></div>

      <h3>Operational readiness</h3>
      <div className="rows" id="publishing"><article><b>Publishing engine</b><span>Foundation</span><p>Durable job model exists; provider adapters and dispatch are not enabled.</p></article><article id="automation"><b>AI automation</b><span>Approval-first</span><p>AI execution is disabled until policy controls and provider permissions are verified.</p></article><article id="inbox"><b>Unified inbox</b><span>Not connected</span><p>Messaging capabilities depend on official platform approvals and account eligibility.</p></article><article id="channels"><b>Connected channels</b><span>Not connected</span><p>No social provider credentials or publishing permissions are configured.</p></article></div>
      <footer>OFFICIAL APIS · TENANT ISOLATION · CONTROLLED AI · NO FABRICATED METRICS</footer>
    </section>
  </main>;
}
