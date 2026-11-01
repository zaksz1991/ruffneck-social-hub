import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PROVIDER_REGISTRY, type ProviderDefinition } from '@/lib/integrations/provider-registry';
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
  configuration: 'Instagram connection is not configured. Check the Instagram app credentials in Vercel.',
  facebook_configuration: 'Facebook connection is not configured. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in Vercel.',
  linkedin_configuration: 'LinkedIn connection is not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel.',
  tiktok_configuration: 'TikTok connection is not configured. Add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and the token encryption key in Vercel.',
  tiktok_migration: 'Apply Supabase migration 0030_tiktok_video_analytics_and_inbox_uploads.sql after migration 0029, then reconnect TikTok.',
  tiktok_profile_scope: 'TikTok did not grant user.info.basic. Reconnect and approve basic profile access.',
  tiktok_identity: 'TikTok did not return a verifiable account identity.',
  tiktok_token_expiry: 'TikTok returned an unsupported access-token expiry. No account was stored.',
  tiktok_refresh_expiry: 'TikTok returned an unsupported refresh-token expiry. No account was stored.',
  tiktok_exchange: 'TikTok authorization could not be exchanged. Confirm the Login Kit app credentials and redirect URI.',
  tiktok_profile: 'TikTok profile details could not be verified.',
  tiktok_http_401: 'TikTok rejected the authorization token. Reconnect the account and verify the app credentials.',
  tiktok_http_403: 'TikTok denied this app or scope. Check TikTok developer product approval and user consent.',
  linkedin_migration: 'Apply the LinkedIn and publishing migrations in order through 0029_linkedin_organization_post_analytics.sql, then reconnect the Page.',
  linkedin_no_pages: 'LinkedIn returned no approved organization Pages for which this member is an administrator.',
  linkedin_analytics_scope: 'LinkedIn did not grant rw_organization_admin. Apply for Community Management API access in your LinkedIn developer app, then reconnect the Page to enable official post analytics.',
  linkedin_organizations: 'LinkedIn organization access could not be verified. Confirm Community Management API approval, rw_organization_admin and w_organization_social consent, and an approved administrator role.',
  linkedin_http_403: 'LinkedIn denied organization access. The app needs approved organization API access and the member must be an approved Page administrator. Analytics additionally requires rw_organization_admin.',
  linkedin_http_401: 'LinkedIn rejected the access token. Confirm the OAuth client and reconnect the account.',
  linkedin_invalid_token: 'LinkedIn rejected the access token. Reconnect the account and verify the app credentials.',
  linkedin_invalid_pages: 'LinkedIn organization data failed validation. No unverified Page was connected.',
  linkedin_token_expiry: 'LinkedIn returned an unsupported or missing access-token expiry. No account was stored.',
  encryption: 'The server-side token encryption key is missing or invalid. No provider token was stored.',
  permission: 'Your workspace role cannot connect social accounts. Ask an owner or administrator.',
  state: 'The authorization state expired or did not match. Start the connection again.',
  cancelled: 'Provider authorization was cancelled. No account was connected.',
  code: 'The provider did not return a valid authorization code.',
  session: 'Your RuffNeck session changed during authorization. Sign in and retry.',
  exchange: 'The authorization code could not be exchanged. Check the provider app configuration.',
  long_token: 'The provider did not issue a long-lived access token.',
  profile: 'The Instagram professional account profile could not be verified.',
  already_connected: 'At least one selected social account is already connected to a different brand or workspace.',
  migration: 'Apply the Instagram connection migrations before retrying.',
  facebook_migration: 'Facebook connection storage or Messenger features need a missing database migration. For an existing v2.9.0 installation, apply only migration 0018_facebook_messenger_inbox_and_replies.sql; fresh installations apply all missing migrations in order.',
  facebook_permissions: 'Meta did not grant both pages_show_list and pages_read_engagement. No Facebook Page was stored.',
  facebook_no_pages: 'Meta returned no Pages for this Facebook user. Check the Facebook profile has Page access.',
  facebook_pages: 'The Facebook Pages list could not be verified. Review Page access and Meta app permissions.',
  facebook_page_limit: 'More than 100 managed Pages were returned. Narrow the Facebook account access and retry.',
  facebook_invalid_pages: 'Meta returned Page data that failed validation. No unverified Page was connected.',
  provider_error: 'The provider returned an authorization error. Check app configuration and granted permissions.',
};

function providerIcon(provider: string) {
  const icons: Record<string, string> = { facebook: 'f', instagram: '◎', tiktok: '♪', youtube: '▶', linkedin: 'in', x: '𝕏', whatsapp: '◔' };
  return icons[provider] ?? provider.slice(0, 1).toUpperCase();
}

function ProviderCard({ provider, brands, accounts, canConnect, configured }: {
  provider: ProviderDefinition;
  brands: Brand[];
  accounts: SocialAccount[];
  canConnect: boolean;
  configured: boolean;
}) {
  const isFacebook = provider.id === 'facebook';
  const isInstagram = provider.id === 'instagram';
  const isLinkedIn = provider.id === 'linkedin';
  const isTikTok = provider.id === 'tiktok';
  const active = provider.availability === 'available';
  return <article className={`platform-card ${active ? 'platform-card-available' : 'platform-card-planned'}`}>
    <div className="platform-card-top">
      <div className={`platform-icon platform-icon-${provider.id}`} aria-hidden="true">{providerIcon(provider.id)}</div>
      <div className="platform-heading"><span className="platform-overline">{active ? 'OFFICIAL API CONNECTION' : 'ROADMAP PROVIDER'}</span><h2>{provider.name}</h2><p>{provider.connectionMethod}</p></div>
      <span className={`platform-status ${active ? 'platform-status-live' : 'platform-status-planned'}`}>{active ? 'AVAILABLE' : 'PLANNED'}</span>
    </div>
    <div className="platform-capabilities">
      {active && provider.supportedSurfaces.length ? provider.supportedSurfaces.map((surface) => <span key={surface}>{surface}</span>) : <span>Provider adapter not yet enabled</span>}
    </div>
    <p className="platform-note">{provider.notes}</p>
    {active ? <div className="platform-brand-list">
      {brands.length === 0 ? <div className="platform-empty">Create a brand before connecting a social account.</div> : brands.map((brand) => {
        const existing = accounts.filter((account) => account.brand_id === brand.id && account.provider === provider.id);
        return <div className="platform-brand-row" key={`${provider.id}-${brand.id}`}>
          <div className="platform-brand-copy"><strong>{brand.name}</strong><span>{existing.length} connected {provider.accountLabel.toLowerCase()}{existing.length === 1 ? '' : 's'}</span>
            {existing.map((account) => <small key={account.id}>{account.display_name ?? account.provider_account_id} · {account.connection_state}</small>)}
          </div>
          {canConnect && configured
            ? <a className="platform-connect-button" href={`/api/integrations/${provider.id}/start?workspace=${encodeURIComponent(brand.workspace_id)}&brand=${encodeURIComponent(brand.id)}`}>Connect {isFacebook ? 'Facebook Pages' : isInstagram ? 'Instagram' : isLinkedIn ? 'LinkedIn Pages' : isTikTok ? 'TikTok' : provider.name}<span>→</span></a>
            : <span className="platform-connect-disabled">{!canConnect ? 'Manager access required' : 'App credentials required'}</span>}
        </div>;
      })}
    </div> : <div className="platform-planned-footer"><span>Integration work has not started</span><span>No fake connection controls</span></div>}
  </article>;
}

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
  const configuredInstagram = Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.NEXT_PUBLIC_SITE_URL);
  const configuredFacebook = Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.NEXT_PUBLIC_SITE_URL);
  const configuredLinkedIn = Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.NEXT_PUBLIC_SITE_URL);
  const configuredTikTok = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.NEXT_PUBLIC_SITE_URL);

  return <main className="channels-shell">
    <header className="channels-topbar">
      <Link href="/" className="channels-logo"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
      <nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing Queue</Link><Link href="/inbox">Unified Inbox</Link><Link href="/team">Team</Link></nav>
      <span className="channels-secure">MULTI-PLATFORM CHANNELS</span>
    </header>

    <div className="channels-main">
      <div className="channels-heading">
        <div><span className="channels-kicker">MULTI-NETWORK INTEGRATION LAYER</span><h1>Connected channels</h1><p>Manage each brand’s social destinations from one workspace. Every connection uses an official provider API, server-side token encryption and workspace-scoped access.</p></div>
        <div className="channels-workspace"><span>ACTIVE WORKSPACE</span><strong>{activeWorkspace?.name ?? 'No workspace'}</strong><small>{role.toUpperCase()}</small></div>
      </div>

      {workspaces.length > 1 && <div className="channels-switcher"><span>Switch workspace</span>{workspaces.map((workspace) => <Link key={workspace.id} href={`/channels?workspace=${workspace.id}`} className={workspace.id === activeWorkspace?.id ? 'selected' : ''}>{workspace.name}</Link>)}</div>}
      {params.error && <div className="channels-notice channels-error" role="alert">{errorMessages[params.error] ?? 'The provider connection could not be completed. No unverified account was marked connected.'}</div>}
      {params.connected === 'instagram' && <div className="channels-notice channels-success" role="status">Instagram professional account connected. The encrypted token is stored server-side.</div>}
      {params.connected === 'facebook' && <div className="channels-notice channels-success" role="status">Facebook Page connection completed. All verified Pages returned by Meta were assigned to the selected brand; their tokens are encrypted server-side.</div>}
      {params.connected === 'linkedin' && <div className="channels-notice channels-success" role="status">LinkedIn organization Pages connected. Only approved administrator Pages were stored; tokens are encrypted server-side. Official organic post analytics is enabled when rw_organization_admin was approved; publishing remains independently gated.</div>}
      {params.connected === 'tiktok' && <div className="channels-notice channels-success" role="status">TikTok account connected. The server encrypted the access and refresh tokens. Video analytics and TikTok inbox video transfer are enabled only when their corresponding scopes were granted; direct publishing remains disabled.</div>}

      {!activeWorkspace ? <section className="channels-empty"><h2>No workspace available</h2><p>Create or join a workspace before connecting social accounts.</p><Link href="/">Go to workspace overview</Link></section> : <>
        <section className="platform-overview">
          <div className="platform-overview-title"><div><span className="channels-kicker">ONE PROVIDER CONTRACT · MULTIPLE NETWORKS</span><h2>Platform integrations</h2><p>Only integrations that have working OAuth and secure token storage are marked available.</p></div><span>{PROVIDER_REGISTRY.filter((provider) => provider.availability === 'available').length} OF {PROVIDER_REGISTRY.length} AVAILABLE</span></div>
          <div className="platform-grid">
            {PROVIDER_REGISTRY.map((provider) => <ProviderCard
              key={provider.id}
              provider={provider}
              brands={brands}
              accounts={accounts}
              canConnect={canConnect}
              configured={provider.id === 'facebook' ? configuredFacebook : provider.id === 'instagram' ? configuredInstagram : provider.id === 'linkedin' ? configuredLinkedIn : provider.id === 'tiktok' ? configuredTikTok : false}
            />)}
          </div>
        </section>

        <section className="channels-account-section"><div className="channels-section-head"><div><span className="channels-kicker">CONNECTED DESTINATIONS</span><h2>Workspace accounts</h2><p>Connected Facebook Pages, Instagram professional accounts, TikTok creator accounts and LinkedIn organization Pages are visible only to members of the active workspace. Facebook Messenger is enabled separately and requires approved messaging scopes plus webhook subscription.</p></div><span className="channels-count">{accounts.length} ACCOUNT{accounts.length === 1 ? '' : 'S'}</span></div>
          {accountError ? <div className="channels-empty"><strong>Account list unavailable</strong><p>The account query failed. Confirm the database migrations are applied.</p></div> : accounts.length === 0 ? <div className="channels-empty"><strong>No connected accounts yet</strong><p>Connect Facebook Pages, Instagram professional accounts, TikTok creator accounts or LinkedIn organization Pages to a brand above.</p></div> : <div className="channels-account-list">{accounts.map((account) => <article className="channels-account-row" key={account.id}><div className={`channels-account-icon channels-account-icon-${account.provider}`}>{providerIcon(account.provider)}</div><div className="channels-account-copy"><strong>{account.display_name ?? account.provider_account_id}</strong><span>{account.provider.toUpperCase()} · {brands.find((brand) => brand.id === account.brand_id)?.name ?? 'Brand unavailable'}</span></div><span className={`channels-state channels-state-${account.connection_state}`}>{account.connection_state}</span><div className="channels-scopes">{account.granted_scopes.map((scope) => <small key={scope}>{scope.replaceAll('_', ' ')}</small>)}{account.provider === 'facebook' && <small>Messenger: {account.capabilities?.messaging === true && account.capabilities?.webhook_messages_subscribed === true ? 'ACTIVE' : 'NOT ENABLED'}</small>}</div></article>)}</div>}
        </section>
      </>}

      <footer className="channels-footer"><span>RUFFNECK SOCIAL HUB · MULTI-PLATFORM CONNECTIONS 4.3.0</span><span>Official APIs only · Human-governed publishing · Encrypted credentials</span></footer>
    </div>
  </main>;
}
