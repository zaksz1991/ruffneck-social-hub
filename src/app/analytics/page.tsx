import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import './analytics.css';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type Job = { id: string; social_account_id: string; state: string; created_at: string; delivered_at: string | null };
type Account = { id: string; provider: string; display_name: string | null };
const providerNames: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook Pages', linkedin: 'LinkedIn Pages', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', whatsapp: 'WhatsApp Business' };
const stateNames: Record<string, string> = { queued: 'Queued', claimed: 'Claimed', dispatching: 'Dispatching', succeeded: 'Published', retryable: 'Retry scheduled', failed: 'Failed', needs_review: 'Needs review', cancelled: 'Cancelled' };
const dateLabel = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ workspace?: string; range?: string }> }) {
  const params = await searchParams;
  const rangeDays = ['7', '30', '90'].includes(params.range ?? '') ? Number(params.range) : 30;
  const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="analytics-empty-screen"><section><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/><h1>Sign in to view analytics</h1><p>Publishing operations data is private to each workspace.</p><Link href="/login">Sign in securely</Link></section></main>;
  const { data: membershipData } = await supabase.from('workspace_members').select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipData ?? []) as Membership[];
  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspaceData } = workspaceIds.length ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true }) : { data: [] };
  const workspaces = (workspaceData ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0] ?? null;
  let jobs: Job[] = []; let accounts: Account[] = []; let loadError = false;
  if (activeWorkspace) {
    const [jobResult, accountResult] = await Promise.all([
      supabase.from('publishing_jobs').select('id,social_account_id,state,created_at,delivered_at').eq('workspace_id', activeWorkspace.id).gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
      supabase.from('social_accounts').select('id,provider,display_name').eq('workspace_id', activeWorkspace.id),
    ]);
    loadError = Boolean(jobResult.error || accountResult.error);
    jobs = (jobResult.data ?? []) as Job[]; accounts = (accountResult.data ?? []) as Account[];
  }
  const accountById = new Map(accounts.map((item) => [item.id, item]));
  const rows = jobs.map((job) => ({ ...job, provider: accountById.get(job.social_account_id)?.provider ?? 'unknown' }));
  const total = rows.length;
  const published = rows.filter((job) => job.state === 'succeeded').length;
  const pending = rows.filter((job) => ['queued', 'claimed', 'dispatching', 'retryable'].includes(job.state)).length;
  const attention = rows.filter((job) => ['failed', 'needs_review'].includes(job.state)).length;
  const completionRate = total ? Math.round(published / total * 100) : 0;
  const providers = [...new Set(rows.map((job) => job.provider))].sort();
  const byProvider = providers.map((provider) => { const group = rows.filter((job) => job.provider === provider); return { provider, total: group.length, published: group.filter((job) => job.state === 'succeeded').length, attention: group.filter((job) => ['failed', 'needs_review'].includes(job.state)).length }; });
  const stateCounts = ['queued', 'claimed', 'dispatching', 'retryable', 'succeeded', 'failed', 'needs_review', 'cancelled'].map((state) => ({ state, count: rows.filter((job) => job.state === state).length })).filter((item) => item.count > 0);
  const pointCount = Math.min(rangeDays, 30);
  const dayBuckets = Array.from({ length: pointCount }, (_, index) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (pointCount - 1 - index)); const key = day.toISOString().slice(0, 10); const createdRows = rows.filter((job) => job.created_at.slice(0, 10) === key); const publishedRows = rows.filter((job) => job.state === 'succeeded' && job.delivered_at?.slice(0, 10) === key); return { key, label: dateLabel(key), created: createdRows.length, published: publishedRows.length }; });
  const maxDaily = Math.max(1, ...dayBuckets.flatMap((item) => [item.created, item.published]));
  return <main className="analytics-shell">
    <header className="analytics-topbar"><Link href="/" className="analytics-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav aria-label="Workspace navigation"><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing Queue</Link><span>Analytics</span><Link href="/channels">Channels</Link></nav><Link href="/" className="analytics-back">Back to dashboard</Link></header>
    <section className="analytics-main">
      <div className="analytics-heading"><div><span className="eyebrow">CROSS-PLATFORM OPERATIONS</span><h1>Publishing analytics</h1><p>Track real queue activity and confirmed publication outcomes across connected networks.</p></div>{activeWorkspace && <div className="analytics-workspace"><small>ACTIVE WORKSPACE</small><strong>{activeWorkspace.name}</strong></div>}</div>
      <div className="analytics-workspace-switcher"><span>Workspace</span>{workspaces.map((workspace) => <Link key={workspace.id} href={`/analytics?workspace=${workspace.id}&range=${rangeDays}`} className={workspace.id === activeWorkspace?.id ? 'selected' : ''}>{workspace.name}</Link>)}</div>
      <div className="analytics-toolbar"><div><strong>Reporting period</strong><span>Queue records created in the selected period · maximum 1,000 records</span></div><div className="analytics-ranges">{[7, 30, 90].map((days) => <Link key={days} href={`/analytics?${activeWorkspace ? `workspace=${activeWorkspace.id}&` : ''}range=${days}`} className={rangeDays === days ? 'selected' : ''}>{days} days</Link>)}{activeWorkspace && <a className="analytics-export" href={`/api/analytics/export?workspace=${encodeURIComponent(activeWorkspace.id)}&range=${rangeDays}`}>Export CSV</a>}</div></div>
      {loadError && <p className="analytics-alert" role="alert">Some publishing data could not be loaded. Displayed figures may be incomplete.</p>}
      {!activeWorkspace ? <section className="analytics-empty"><h2>No workspace available</h2><p>Create or join a workspace before viewing publishing analytics.</p><Link href="/">Return to overview</Link></section> : <>
        <section className="analytics-metrics" aria-label="Publishing metrics"><article><span>Queue records</span><strong>{total}</strong><small>Created in selected period</small></article><article><span>Confirmed published</span><strong>{published}</strong><small>Provider confirmed success</small></article><article><span>Pending operations</span><strong>{pending}</strong><small>Queued, claimed or awaiting retry</small></article><article><span>Needs attention</span><strong>{attention}</strong><small>Failed or manual review</small></article></section>
        <section className="analytics-grid">
          <article className="analytics-card"><div className="analytics-card-heading"><div><span className="eyebrow">DELIVERY OUTCOMES</span><h2>Confirmed publishing rate</h2></div><strong className="analytics-rate">{completionRate}%</strong></div><div className="analytics-progress"><span style={{ width: `${completionRate}%` }}/></div><p>{published} of {total} queue records have a confirmed successful provider response. This is an operational delivery rate, not an engagement or reach metric.</p><div className="analytics-legend"><span><i className="published-dot"/> Published</span><span><i className="attention-dot"/> Needs attention</span><span><i className="pending-dot"/> Other states</span></div></article>
          <article className="analytics-card"><div className="analytics-card-heading"><div><span className="eyebrow">QUEUE STATUS</span><h2>State distribution</h2></div></div>{stateCounts.length ? <div className="analytics-state-list">{stateCounts.map((item) => <div key={item.state}><span>{stateNames[item.state] ?? item.state}</span><strong>{item.count}</strong><i style={{ width: `${Math.max(3, total ? item.count / total * 100 : 0)}%` }}/></div>)}</div> : <p className="analytics-muted">No queue records in this period.</p>}</article>
          <article className="analytics-card analytics-wide"><div className="analytics-card-heading"><div><span className="eyebrow">NETWORK BREAKDOWN</span><h2>Publishing by platform</h2></div><span className="analytics-data-label">CONNECTED PROVIDERS ONLY</span></div>{byProvider.length ? <div className="analytics-provider-list">{byProvider.map((item) => <div className="analytics-provider-row" key={item.provider}><div className={`analytics-provider-icon provider-${item.provider.replace(/[^a-z0-9_-]/g, '')}`}>{item.provider === 'facebook' ? 'f' : item.provider === 'instagram' ? '◎' : item.provider === 'linkedin' ? 'in' : '•'}</div><div className="analytics-provider-name"><strong>{providerNames[item.provider] ?? item.provider}</strong><small>{item.total} queue records</small></div><div className="analytics-provider-stat"><strong>{item.published}</strong><small>Published</small></div><div className="analytics-provider-stat"><strong>{item.attention}</strong><small>Attention</small></div><div className="analytics-provider-bar"><i style={{ width: `${item.total ? item.published / item.total * 100 : 0}%` }}/></div></div>)}</div> : <p className="analytics-muted">No publishing activity in this period.</p>}</article>
          <article className="analytics-card analytics-wide"><div className="analytics-card-heading"><div><span className="eyebrow">ACTIVITY TREND</span><h2>Daily queue activity</h2></div><span className="analytics-data-label">UP TO 30 DAILY POINTS</span></div><div className="analytics-chart" role="img" aria-label="Daily queue records created and confirmed published"><div className="analytics-chart-bars">{dayBuckets.map((item) => <div className="analytics-chart-day" key={item.key} title={`${item.label}: ${item.created} queue records, ${item.published} published`}><div className="analytics-bar-track"><i className="analytics-bar-created" style={{ height: `${item.created / maxDaily * 100}%` }}/><i className="analytics-bar-published" style={{ height: `${item.published / maxDaily * 100}%` }}/></div><small>{item.label}</small></div>)}</div></div><div className="analytics-legend"><span><i className="pending-dot"/> Queue records created</span><span><i className="published-dot"/> Confirmed published</span></div></article>
        </section>
        <p className="analytics-footnote">Data source: RuffNeck Social Hub publishing queue and provider-confirmed job results. Reach, impressions, clicks, audience growth and engagement are excluded because provider analytics APIs are not yet connected. Reports are capped at 1,000 queue records per workspace.</p>
      </>}
    </section>
  </main>;
}
