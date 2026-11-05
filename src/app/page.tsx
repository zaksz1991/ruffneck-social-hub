import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { createBrand, createWorkspace, renameBrand } from '@/app/actions/workspaces';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import styles from './home.module.css';

type Workspace = { id: string; name: string; created_at: string };
type Brand = { id: string; workspace_id: string; name: string; timezone: string; created_at: string };
export default async function Home({ searchParams }: { searchParams: Promise<{ workspace?: string; error?: string; saved?: string }> }) {
  const params = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <main className={styles.content}><section className={styles.panel}><p className={styles.eyebrow}>RUFFNECK SOCIAL HUB</p><h1>Connect the workspace database</h1><p className={styles.panelIntro}>Configure the Supabase project URL and public anon key, then apply the required database migrations.</p><Link className={styles.button} href="/organizations">View the organization overview</Link></section></main>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className={styles.content}><section className={styles.panel}><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" width="190" height="auto"/><p className={styles.eyebrow}>YOUR SOCIAL OPERATIONS, CONNECTED</p><h1>Sign in to continue</h1><p className={styles.panelIntro}>Workspace data is available only to authenticated members.
Explore the public organization overview before signing in.</p><div className={styles.headingActions}><Link className={styles.button} href="/login">Open sign in</Link><Link className={styles.buttonAlt} href="/organizations">For organizations</Link></div></section></main>;
  const { data: workspaceRows, error: workspaceError } = await supabase.from('workspaces').select('id,name,created_at').order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === params.workspace) ?? workspaces[0];
  const { data: memberRow } = activeWorkspace
    ? await supabase.from('workspace_members').select('role').eq('workspace_id', activeWorkspace.id).eq('user_id', user.id).maybeSingle()
    : { data: null };
  const role = memberRow?.role ?? 'member';
  const canManage = role === 'owner' || role === 'admin';
  const { data: brandRows } = activeWorkspace
    ? await supabase.from('brands').select('id,workspace_id,name,timezone,created_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: true })
    : { data: [] };
  const brands = (brandRows ?? []) as Brand[];
  let connectedChannelCount = 0;
  let queuedPublishingCount = 0;
  let channelCountAvailable = true;
  let publishingCountAvailable = true;
  if (activeWorkspace) {
    const [channelMetric, publishingMetric] = await Promise.all([
      supabase.from('social_accounts').select('id', { count: 'exact', head: true }).eq('workspace_id', activeWorkspace.id).eq('connection_state', 'connected'),
      supabase.from('publishing_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', activeWorkspace.id).in('state', ['queued', 'retryable', 'needs_review']),
    ]);
    connectedChannelCount = channelMetric.count ?? 0;
    queuedPublishingCount = publishingMetric.count ?? 0;
    channelCountAvailable = !channelMetric.error;
    publishingCountAvailable = !publishingMetric.error;
  }
  const displayName = typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim().split(/\s+/)[0]
    : (user.email ?? 'there').split('@')[0];
  const errorMessages: Record<string, string> = {
    'workspace-name': 'Workspace names must contain 2–120 characters.',
    'workspace-create': 'Workspace creation failed. Confirm migration 0003 has been applied.',
    'brand-input': 'Enter a valid brand name.',
    'brand-create': 'Brand creation failed. Only workspace owners and admins can add brands.',
    'brand-update': 'Brand update failed. Only workspace owners and admins can rename brands.',
  };
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}><span className={styles.brandMark}>R</span><span>RUFFNECK<br/>SOCIAL HUB</span></Link>
        <div>
          <span className={styles.sideLabel}>WORKSPACE</span>
          <nav className={styles.sideNav} aria-label="Workspace navigation">
            <Link href="/" aria-current="page">Overview</Link>
            <Link href="#brands">Brands</Link>
            <Link href="/team">Team access</Link>
          </nav>
        </div>
        <div>
          <span className={styles.sideLabel}>PUBLISH AND ENGAGE</span>
          <nav className={styles.sideNav} aria-label="Publishing and engagement">
            <Link href="/content">Content Studio</Link>
            <Link href="/approvals">Client approvals</Link>
            <Link href="/publishing">Publishing queue</Link>
            <Link href="/inbox">Unified inbox</Link>
            <Link href={`/inbox/customers?workspace=${activeWorkspace?.id ?? ''}`}>Customer CRM</Link>
            <Link href="/inbox/automation">Inbox automation</Link>
            <Link href={`/campaigns?workspace=${activeWorkspace?.id ?? ''}`}>Campaigns</Link>
          </nav>
        </div>
        <div>
          <span className={styles.sideLabel}>INSIGHTS AND CONNECTIONS</span>
          <nav className={styles.sideNav} aria-label="Insights and integrations">
            <Link href="/analytics">Publishing analytics</Link>
            <Link href="/channels">Connected channels</Link>
          </nav>
        </div>
        <div className={styles.sideBottom}>
          <Link href="/organizations">Organization overview</Link>
          <div className={styles.userBox}><div><strong>{user.email}</strong><small>{role.toUpperCase()} · Workspace member</small></div><form action={signOut}><button type="submit">Sign out</button></form></div>
        </div>
      </aside>
      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.crumb}>Workspace <b>/</b> Overview <b>/</b> {activeWorkspace?.name ?? 'No workspace'}</div>
          <div className={styles.topLinks}><span className={styles.secure}>ROLE-GATED WORKSPACE</span><Link href="/organizations">Organization view</Link></div>
        </header>
        <div className={styles.content}>
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>WORKSPACE CONTROL ROOM</span><h1>Welcome, {displayName}.</h1><p>Manage brands, publishing operations and supported customer conversations from one workspace.</p></div>
            <div className={styles.headingActions}><Link className={styles.button} href="/content">Create content</Link><Link className={styles.buttonAlt} href="/publishing">Open publishing queue</Link></div>
          </div>
          {params.error && <p className={`${styles.notice} ${styles.error}`} role="alert">{errorMessages[params.error] ?? 'The requested operation could not be completed.'}</p>}
          {params.saved && <p className={`${styles.notice} ${styles.success}`} role="status">{params.saved === 'brand' ? 'Brand created.' : 'Brand name updated.'}</p>}
          {workspaceError && <p className={`${styles.notice} ${styles.error}`} role="alert">Workspace information could not be loaded. Refresh the page or contact the workspace administrator.</p>}
          <article className={styles.banner}>
            <div><h2>Every brand. One clear picture.</h2><p>Plan content, coordinate people, manage supported conversations and review performance. Provider publishing and analytics depend on account permissions and the capability available for each integration.</p></div>
            <Link href="/organizations">View platform capabilities</Link>
          </article>
          <div className={styles.sectionHead}><div><h2>Workspace snapshot</h2><p>Live counts where a verified workspace query is available. Queue records are not proof of provider delivery.</p></div><span className={styles.pill}>LIVE WORKSPACE DATA</span></div>
          <div className={styles.metricGrid}>
            <article className={styles.metric}><span>Connected social accounts</span><strong>{channelCountAvailable ? connectedChannelCount : '—'}</strong><small>{channelCountAvailable ? (connectedChannelCount ? 'Accounts marked connected' : 'No connected accounts yet') : 'Connection data unavailable'}</small></article>
            <article className={styles.metric}><span>Publishing queue records</span><strong>{publishingCountAvailable ? queuedPublishingCount : '—'}</strong><small>{publishingCountAvailable ? 'Queued, retryable or awaiting review; not delivery confirmation' : 'Queue data unavailable'}</small></article>
            <article className={styles.metric}><span>Conversation operations</span><strong>Available</strong><small>Open the inbox for currently connected and supported providers.</small></article>
            <article className={styles.metric}><span>AI governance</span><strong>Human-led</strong><small>Configured AI assistance remains subject to safety checks and human decisions.</small></article>
          </div>
          <div className={styles.columns}>
            <section className={styles.panel} id="workspaces">
              <div className={styles.sectionHead}><div><h2>Workspaces</h2><p>Only workspaces available to your signed-in account are shown.</p></div><span className={styles.pill}>{workspaces.length} ACCESSIBLE</span></div>
              {workspaces.length ? <div className={styles.workspaceList}>{workspaces.map((workspace) => <Link key={workspace.id} href={`/?workspace=${workspace.id}`} className={`${styles.workspaceRow} ${workspace.id === activeWorkspace?.id ? styles.selected : ''}`}><div><b>{workspace.name}</b><small>{workspace.id === activeWorkspace?.id ? 'Current workspace' : 'Switch workspace'}</small></div><em>{workspace.id === activeWorkspace?.id ? role.toUpperCase() : 'OPEN →'}</em></Link>)}</div> : <p className={styles.empty}>No workspace is available for this account.
Complete signup or contact the workspace administrator.</p>}
              <form className={styles.createForm} action={createWorkspace}><label htmlFor="workspace-name">Create a workspace</label><input id="workspace-name" name="name" minLength={2} maxLength={120} placeholder="e.g. Client Operations" required/><button type="submit">Create workspace</button></form>
            </section>
            <section className={styles.panel} id="brands">
              <h3>Brands in {activeWorkspace?.name ?? 'this workspace'}</h3><p className={styles.panelIntro}>Brand records belong to the selected workspace. A brand record does not mean a social account is connected.</p>
              {brands.length ? <div className={styles.brandRows}>{brands.map((brand) => <div className={styles.brandRow} key={brand.id}><div><strong>{brand.name}</strong><small>Timezone: {brand.timezone}</small></div>{canManage && <form action={renameBrand} className={styles.renameForm}><input type="hidden" name="brand_id" value={brand.id}/><input type="hidden" name="workspace_id" value={activeWorkspace?.id ?? ''}/><input name="name" aria-label={`New name for ${brand.name}`} minLength={2} maxLength={80} placeholder="Rename" required/><button type="submit">Save</button></form>}</div>)}</div> : <p className={styles.empty}>No brands have been added to this workspace yet.</p>}
              {activeWorkspace && canManage && <form className={styles.createForm} action={createBrand}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><label htmlFor="brand-name">Add a brand</label><input id="brand-name" name="name" minLength={2} maxLength={80} placeholder="Brand or client name" required/><button type="submit">Add brand</button></form>}
              {activeWorkspace && !canManage && <p className={styles.panelIntro}>Your {role} role has read-only brand administration access.</p>}
            </section>
          </div>
          <div className={styles.sectionHead}><div><h2>Operational modules</h2><p>Open a module to inspect connected-account data and available actions.</p></div></div>
          <div className={styles.moduleGrid}>
            <Link href="/content" className={styles.module}><b>Content Studio</b><span>Create, adapt and save reviewable platform-specific content drafts.</span><em>OPEN STUDIO →</em></Link>
            <Link href="/approvals" className={styles.module}><b>Client approvals</b><span>Give invited client approvers a focused queue to approve submitted content or request changes.</span><em>OPEN APPROVALS →</em></Link>
            <Link href="/publishing" className={styles.module}><b>Publishing queue</b><span>Manage scheduled work and provider-specific dispatch states.</span><em>OPEN QUEUE →</em></Link>
            <Link href="/inbox" className={styles.module}><b>Unified inbox</b><span>Work supported Instagram, Facebook Messenger and WhatsApp conversations.</span><em>OPEN INBOX →</em></Link>
            <Link href="/inbox/automation" className={styles.module}><b>Inbox automation</b><span>Preview and apply controlled routing rules; workflow rules do not send replies.</span><em>OPEN AUTOMATION →</em></Link>
            <Link href={`/inbox/customers?workspace=${activeWorkspace?.id ?? ''}`} className={styles.module}><b>Customer CRM</b><span>Maintain provider-specific customer stages, tags, notes and interaction context.</span><em>OPEN CRM →</em></Link>
            <Link href={`/campaigns?workspace=${activeWorkspace?.id ?? ''}`} className={styles.module}><b>Campaign intelligence and planning</b><span>Organise campaigns, tagged links and supported performance snapshots.</span><em>OPEN CAMPAIGNS →</em></Link>
            <Link href="/analytics" className={styles.module}><b>Analytics and reporting</b><span>View supported provider insights and operational reporting with source labels. Review official Meta post insights where the connected account has the required permissions.</span><em>OPEN ANALYTICS →</em></Link>
            <Link href="/team" className={styles.module}><b>Team and access</b><span>Manage workspace membership, invitations and role-governed access.</span><em>OPEN TEAM →</em></Link>
            <Link href="/channels" className={styles.module}><b>Connected channels</b><span>Connect eligible provider accounts and review granted capabilities.</span><em>OPEN CHANNELS →</em></Link>
          </div>
          <footer className={styles.footer}><span>RUFFNECK SOCIAL HUB · OFFICIAL PROVIDER PATHWAYS · TENANT CONTROLS · HUMAN-GOVERNED AI</span><Link href="/organizations">Organization capability overview</Link></footer>
        </div>
      </section>
    </main>
  );
}
