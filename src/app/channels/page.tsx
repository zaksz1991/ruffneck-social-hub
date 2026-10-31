import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import './channels.css';

type Workspace = { id: string; name: string };
type Brand = { id: string; workspace_id: string; name: string; timezone: string };
type SocialAccount = {
  id: string;
  brand_id: string;
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  connection_state: string;
  granted_scopes: string[];
  capabilities: Record<string, unknown>;
  created_at: string;
};

const errorMessages: Record<string, string> = {
  selection: 'Choose a valid workspace and brand before connecting a channel.',
  configuration: 'Instagram connection is not configured yet. Add the Instagram app credentials in Vercel.',
  encryption: 'The server-side token encryption key is missing or invalid. No provider token was stored.',
  permission: 'Your workspace role cannot connect social accounts. Ask an owner or administrator.',
  state: 'The Instagram authorization state expired or did not match. Start the connection again.',
  cancelled: 'Instagram authorization was cancelled. No account was connected.',
  code: 'Instagram did not return a valid authorization code.',
  session: 'Your RuffNeck session changed during authorization. Sign in and retry.',
  exchange: 'Instagram authorization could not be exchanged. Check the Meta app configuration and try again.',
  long_token: 'Instagram did not issue a long-lived access token. No account was connected.',
  profile: 'Instagram authorization succeeded, but the professional account profile could not be verified.',
  already_connected: 'This Instagram account is already connected to a different brand or workspace.',
  migration: 'Apply Supabase migration 0007_instagram_business_connection.sql, then retry.',
  storage: 'Instagram was authorized, but secure token storage failed. The account was not marked connected.',
  provider_error: 'Instagram returned an authorization error. Check the Meta app setup and granted permissions.',
  provider_oauthexception: 'Instagram rejected the OAuth configuration. Check the Instagram app ID, secret and exact callback URL.',
};

export default async function ChannelsPage({ searchParams }: {
  searchParams: Promise<{ workspace?: string; error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="channels-shell"><section className="channels-empty"><h1>Sign in required</h1><p>Connect and manage social accounts from an authenticated workspace.</p><Link href="/login">Sign in</Link></section></main>;

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0];
  const { data: membership } = activeWorkspace
    ? await supabase.from('workspace_members').select('role').eq('workspace_id', activeWorkspace.id).eq('user_id', user.id).maybeSingle()
    : { data: null };
  const role = membership?.role ?? 'member';
  const canConnect = ['owner', 'admin', 'manager'].includes(role);
  const { data: brandRows } = activeWorkspace
    ? await supabase.from('brands').select('id,workspace_id,name,timezone').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: true })
    : { data: [] };
  const brands = (brandRows ?? []) as Brand[];
  const { data: accountRows, error: accountError } = activeWorkspace
    ? await supabase.from('social_accounts').select('id,brand_id,provider,provider_account_id,display_name,connection_state,granted_scopes,capabilities,created_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false })
    : { data: [], error: null };
  const accounts = (accountRows ?? []) as SocialAccount[];
  const configured = Boolean(
    process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET &&
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.NEXT_PUBLIC_SITE_URL,
  );

  return <main className="channels-shell">
    <header className="channels-topbar">
      <Link href="/" className="channels-logo"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
      <nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing Queue</Link><Link href="/team">Team</Link></nav>
      <span className="channels-secure">SECURE CHANNELS</span>
    </header>

    <div className="channels-main">
      <div className="channels-heading">
        <div><span className="channels-kicker">OFFICIAL PLATFORM CONNECTIONS</span><h1>Connected channels</h1><p>Connect a professional account to a specific brand. Tokens are encrypted before storage and are never exposed to browser clients.</p></div>
        <div className="channels-workspace"><span>ACTIVE WORKSPACE</span><strong>{activeWorkspace?.name ?? 'No workspace'}</strong><small>{role.toUpperCase()}</small></div>
      </div>

      {workspaces.length > 1 && <div className="channels-switcher"><span>Switch workspace</span>{workspaces.map((workspace) => <Link key={workspace.id} href={`/channels?workspace=${workspace.id}`} className={workspace.id === activeWorkspace?.id ? 'selected' : ''}>{workspace.name}</Link>)}</div>}
      {params.error && <div className="channels-notice channels-error" role="alert">{errorMessages[params.error] ?? 'The Instagram connection could not be completed. No unverified account was marked connected.'}</div>}
      {params.connected === 'instagram' && <div className="channels-notice channels-success" role="status">Instagram professional account connected. The encrypted token is stored server-side. Automatic publishing remains disabled pending the provider publishing worker and delivery tests.</div>}

      {!activeWorkspace ? <section className="channels-empty"><h2>No workspace available</h2><p>Create or join a workspace before connecting social accounts.</p><Link href="/">Go to workspace overview</Link></section> : <>
        <section className="channels-provider-card">
          <div className="channels-provider-head"><div className="instagram-mark" aria-hidden="true">◎</div><div><span className="channels-provider-label">AVAILABLE NOW · FIRST PROVIDER</span><h2>Instagram Business</h2><p>Meta Business Login for Instagram professional accounts (Business and Creator).</p></div><span className="channels-provider-status">OAUTH</span></div>
          <div className="channels-provider-details"><div><strong>Basic profile</strong><span>Read and verify connected professional account identity.</span></div><div><strong>Content publishing permission</strong><span>Requests permission for a future approved publishing worker.</span></div><div><strong>Not included in this release</strong><span>Direct messages, comment moderation, insights, stories and automatic publishing.</span></div></div>
          {!configured && <div className="channels-setup-warning"><strong>Meta app setup required</strong><p>Add the three server-side environment variables described in <code>README-INSTAGRAM-CONNECTION-UPGRADE.md</code>. Do not put app secrets in browser variables.</p></div>}
          {brands.length === 0 ? <div className="channels-setup-warning"><strong>Create a brand first</strong><p>Each connected social account must belong to a brand within this workspace.</p><Link href="/#brands">Open brand management</Link></div> : <div className="channels-connect-list">{brands.map((brand) => {
            const existing = accounts.filter((account) => account.brand_id === brand.id && account.provider === 'instagram');
            return <article className="channels-brand-row" key={brand.id}><div><strong>{brand.name}</strong><span>{brand.timezone} · {existing.length} Instagram connection{existing.length === 1 ? '' : 's'}</span>{existing.map((account) => <small className="channels-existing-account" key={account.id}>{account.display_name ?? 'Instagram account'} · {account.connection_state}</small>)}</div>{canConnect ? (configured ? <a className="channels-connect-button" href={`/api/integrations/instagram/start?workspace=${activeWorkspace.id}&brand=${brand.id}`}>Connect Instagram <span>→</span></a> : <span className="channels-readonly">Configure Meta app credentials first</span>) : <span className="channels-readonly">Manager access required</span>}</article>;
          })}</div>}
        </section>

        <section className="channels-account-section"><div className="channels-section-head"><div><span className="channels-kicker">CONNECTED DESTINATIONS</span><h2>Workspace accounts</h2><p>These accounts are visible only to members of the active workspace.</p></div><span className="channels-count">{accounts.length} ACCOUNT{accounts.length === 1 ? '' : 'S'}</span></div>
          {accountError ? <div className="channels-empty"><strong>Account list unavailable</strong><p>The account query failed. Confirm the workspace and provider migrations are applied.</p></div> : accounts.length === 0 ? <div className="channels-empty"><strong>No connected accounts yet</strong><p>Connect an Instagram professional account above. Other platforms will be added as their official OAuth integrations are completed.</p></div> : <div className="channels-account-list">{accounts.map((account) => <article className="channels-account-row" key={account.id}><div className="channels-account-icon">{account.provider === 'instagram' ? '◎' : account.provider.slice(0, 1).toUpperCase()}</div><div className="channels-account-copy"><strong>{account.display_name ?? account.provider_account_id}</strong><span>{account.provider.toUpperCase()} · {brands.find((brand) => brand.id === account.brand_id)?.name ?? 'Brand unavailable'}</span></div><span className={`channels-state channels-state-${account.connection_state}`}>{account.connection_state}</span><div className="channels-scopes">{account.granted_scopes.map((scope) => <small key={scope}>{scope.replaceAll('_', ' ')}</small>)}</div></article>)}</div>}
        </section>
      </>}

      <footer className="channels-footer"><span>RUFFNECK SOCIAL HUB · PROVIDER CONNECTIONS 0.8.0</span><span>Official APIs only · Human-governed publishing</span></footer>
    </div>
  </main>;
}
