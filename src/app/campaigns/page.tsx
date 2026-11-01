import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createPublishingCampaign,
  linkContentToCampaign,
  recordCampaignMetricSnapshot,
  updatePublishingCampaignStatus,
} from '@/app/actions/campaigns';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { aggregateSnapshots, buildTrackedUrl } from '@/lib/campaigns/intelligence.mjs';
import './campaigns.css';

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string };
type Campaign = {
  id: string;
  brand_id: string;
  name: string;
  objective: string;
  status: string;
  start_date: string;
  end_date: string | null;
  landing_page_url: string | null;
  utm_campaign: string;
  created_at: string;
};
type ContentItem = { id: string; brand_id: string; title: string; status: string };
type CampaignLink = { campaign_id: string; content_id: string };
type PublishingJob = { id: string; content_id: string; social_account_id: string; state: string; scheduled_at: string; delivered_at: string | null };
type SocialAccount = { id: string; brand_id: string; provider: string; display_name: string | null };
type MetricSnapshot = {
  campaign_id: string;
  publishing_job_id: string;
  snapshot_date: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  leads: number;
  conversions: number;
  source: string;
  updated_at: string;
};

const OBJECTIVES: Record<string, string> = {
  awareness: 'Brand awareness', engagement: 'Engagement', traffic: 'Website traffic',
  lead_generation: 'Lead generation', sales: 'Sales', community: 'Community growth', announcement: 'Announcement',
};
const STATUS_LABELS: Record<string, string> = { planned: 'Planned', active: 'Active', paused: 'Paused', completed: 'Completed' };
const PROVIDER_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', whatsapp: 'WhatsApp',
};
const SOURCES = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'x', 'whatsapp'];
const number = (value: number) => new Intl.NumberFormat('en').format(Number.isFinite(value) ? value : 0);
const shortDate = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

const notices: Record<string, string> = {
  input: 'Check the selected workspace, brand and campaign details.',
  name: 'Campaign names must contain 2–120 characters.',
  objective: 'Choose a supported campaign objective.',
  date: 'Enter valid campaign dates.',
  date_order: 'The end date cannot be earlier than the start date.',
  date_range: 'Campaign dates must be within five years in the past and two years ahead.',
  url: 'Landing pages must be valid HTTPS URLs without embedded credentials.',
  permission: 'Your workspace role does not allow this operation.',
  create: 'The campaign could not be created. Confirm migration 0027 and workspace permissions.',
  status: 'The campaign status could not be changed.',
  link: 'Content could not be linked. It must belong to the campaign brand and cannot be archived.',
  snapshot_date: 'Choose a metric snapshot date within the previous 365 days.',
  metric_value: 'Metric values must be whole numbers between 0 and 1,000,000,000,000.',
  metrics: 'Metrics could not be recorded. Confirm that the selected publishing job succeeded and belongs to linked campaign content.',
};
const successNotices: Record<string, string> = {
  created: 'Campaign created.', linked: 'Content linked to campaign.', metrics: 'Manual performance snapshot saved.', status: 'Campaign status updated.',
};

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ workspace?: string; error?: string; saved?: string }> }) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membershipRows } = await supabase.from('workspace_members').select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipRows ?? []) as Array<{ workspace_id: string; role: string }>;
  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspaceRows } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0] ?? null;
  const role = memberships.find((item) => item.workspace_id === workspace?.id)?.role ?? 'member';
  const canOperate = ['owner', 'admin', 'manager', 'publisher'].includes(role);
  const canManage = ['owner', 'admin', 'manager'].includes(role);
  const canRecordMetrics = ['owner', 'admin', 'manager', 'publisher', 'analyst'].includes(role);

  let brands: Brand[] = [];
  let campaigns: Campaign[] = [];
  let contentItems: ContentItem[] = [];
  let campaignLinks: CampaignLink[] = [];
  let publishedJobs: PublishingJob[] = [];
  let accounts: SocialAccount[] = [];
  let metricSnapshots: MetricSnapshot[] = [];
  let loadError = false;

  if (workspace) {
    const [brandResult, campaignResult, contentResult, linkResult, jobResult, accountResult, metricsResult] = await Promise.all([
      supabase.from('brands').select('id,name').eq('workspace_id', workspace.id).order('name'),
      supabase.from('publishing_campaigns').select('id,brand_id,name,objective,status,start_date,end_date,landing_page_url,utm_campaign,created_at').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('content_items').select('id,brand_id,title,status').eq('workspace_id', workspace.id).neq('status', 'archived').order('updated_at', { ascending: false }).limit(250),
      supabase.from('campaign_content_items').select('campaign_id,content_id').eq('workspace_id', workspace.id).limit(1000),
      supabase.from('publishing_jobs').select('id,content_id,social_account_id,state,scheduled_at,delivered_at').eq('workspace_id', workspace.id).eq('state', 'succeeded').order('delivered_at', { ascending: false }).limit(1000),
      supabase.from('social_accounts').select('id,brand_id,provider,display_name').eq('workspace_id', workspace.id),
      supabase.from('campaign_metric_snapshots').select('campaign_id,publishing_job_id,snapshot_date,impressions,reach,likes,comments,shares,saves,clicks,leads,conversions,source,updated_at').eq('workspace_id', workspace.id).order('snapshot_date', { ascending: false }).limit(5000),
    ]);
    loadError = Boolean(brandResult.error || campaignResult.error || contentResult.error || linkResult.error || jobResult.error || accountResult.error || metricsResult.error);
    brands = (brandResult.data ?? []) as Brand[];
    campaigns = (campaignResult.data ?? []) as Campaign[];
    contentItems = (contentResult.data ?? []) as ContentItem[];
    campaignLinks = (linkResult.data ?? []) as CampaignLink[];
    publishedJobs = (jobResult.data ?? []) as PublishingJob[];
    accounts = (accountResult.data ?? []) as SocialAccount[];
    metricSnapshots = (metricsResult.data ?? []) as MetricSnapshot[];
  }

  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  const contentById = new Map(contentItems.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const jobById = new Map(publishedJobs.map((job) => [job.id, job]));

  return (
    <main className="campaign-shell">
      <header className="campaign-topbar">
        <Link href="/" className="campaign-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
        <nav aria-label="Workspace navigation"><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing Queue</Link><span>Campaigns</span><Link href="/analytics">Analytics</Link><Link href="/channels">Channels</Link></nav>
        <Link href="/" className="campaign-back">Back to dashboard</Link>
      </header>

      <section className="campaign-main">
        <div className="campaign-heading">
          <div><span className="eyebrow">PLAN · PUBLISH · MEASURE</span><h1>Campaign intelligence</h1><p>Organise content by campaign, create tagged landing-page links and record verified publishing performance.</p></div>
          <div className="campaign-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong><span>{role.toUpperCase()}</span></div>
        </div>

        {workspaces.length > 1 && <div className="campaign-workspaces"><span>Switch workspace</span>{workspaces.map((item) => <Link key={item.id} href={`/campaigns?workspace=${item.id}`} className={item.id === workspace?.id ? 'selected' : ''}>{item.name}</Link>)}</div>}
        {params.error && <p className="campaign-notice error">{notices[params.error] ?? 'The requested campaign operation failed.'}</p>}
        {params.saved && <p className="campaign-notice success">{successNotices[params.saved] ?? 'Campaign information updated.'}</p>}

        {!workspace ? <section className="campaign-empty"><h2>No workspace available</h2><p>Create or join a workspace before planning campaigns.</p><Link href="/">Return to workspace setup</Link></section> : <>
          <div className="campaign-summary">
            <article><span>Campaigns</span><strong>{campaigns.length}</strong><small>Workspace total, capped at 100 displayed</small></article>
            <article><span>Active campaigns</span><strong>{campaigns.filter((item) => item.status === 'active').length}</strong><small>Currently marked active</small></article>
            <article><span>Linked content</span><strong>{campaignLinks.length}</strong><small>Content-to-campaign links</small></article>
            <article><span>Published destinations</span><strong>{publishedJobs.filter((job) => campaignLinks.some((link) => link.content_id === job.content_id)).length}</strong><small>Provider-confirmed queue results</small></article>
          </div>

          {canOperate && brands.length > 0 && <section className="campaign-create-card">
            <div className="campaign-section-title"><div><span className="eyebrow">CAMPAIGN SETUP</span><h2>Create a campaign</h2><p>Set an objective, date range and optional HTTPS landing page.</p></div><span className="campaign-pill">HUMAN CONTROLLED</span></div>
            <form action={createPublishingCampaign} className="campaign-create-form">
              <input type="hidden" name="workspace_id" value={workspace.id} />
              <label>Brand<select name="brand_id" required defaultValue={brands[0]?.id}>{brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
              <label>Campaign name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Q4 product launch" /></label>
              <label>Objective<select name="objective" defaultValue="awareness">{Object.entries(OBJECTIVES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Start date<input type="date" name="start_date" required defaultValue={today} /></label>
              <label>End date (optional)<input type="date" name="end_date" /></label>
              <label className="campaign-url-field">Landing page URL (optional)<input name="landing_page_url" type="url" inputMode="url" placeholder="https://example.com/campaign" /></label>
              <div className="campaign-form-footer"><small>Creates a planned campaign. It does not publish content or launch advertisements.</small><button type="submit">Create campaign</button></div>
            </form>
          </section>}

          {loadError && <div className="campaign-notice warning"><strong>Some campaign data could not be loaded.</strong> Confirm migration 0027 is applied and your workspace role has read access. Existing rows are not replaced with sample values.</div>}
          {!canOperate && <p className="campaign-readonly-note">Your {role} role has read-only campaign access. Campaign creation and content linking are restricted to authorised publishing roles.</p>}
          {brands.length === 0 && <div className="campaign-empty"><h2>Add a brand first</h2><p>Campaigns are attached to one brand within the active workspace.</p><Link href="/brands">Open brands &amp; clients</Link></div>}

          <section className="campaign-list-section">
            <div className="campaign-section-title"><div><span className="eyebrow">WORKSPACE CAMPAIGNS</span><h2>Campaign portfolio</h2><p>Performance totals use the latest manually entered snapshot per published destination.</p></div><span className="campaign-count">{campaigns.length} CAMPAIGNS</span></div>
            {campaigns.length === 0 ? <div className="campaign-empty"><h3>No campaigns created</h3><p>Create a campaign to group approved content and measure published destinations.</p></div> : <div className="campaign-list">
              {campaigns.map((campaign) => {
                const links = campaignLinks.filter((link) => link.campaign_id === campaign.id);
                const linkedIds = new Set(links.map((link) => link.content_id));
                const linkedContent = links.map((link) => contentById.get(link.content_id)).filter((item): item is ContentItem => Boolean(item));
                const eligibleJobs = publishedJobs.filter((job) => linkedIds.has(job.content_id));
                const snapshots = metricSnapshots.filter((snapshot) => snapshot.campaign_id === campaign.id);
                const totals = aggregateSnapshots(snapshots);
                const linkedOptions = contentItems.filter((item) => item.brand_id === campaign.brand_id && !linkedIds.has(item.id));
                const trackedSources = SOURCES.map((source) => ({ source, href: buildTrackedUrl(campaign.landing_page_url, source, campaign.utm_campaign, campaign.id.slice(0, 8)) })).filter((item): item is { source: string; href: string } => Boolean(item.href));
                return <article className="campaign-card" key={campaign.id}>
                  <div className="campaign-card-top"><div><span className="eyebrow">{brandNames.get(campaign.brand_id) ?? 'Brand'}</span><h3>{campaign.name}</h3><p>{OBJECTIVES[campaign.objective] ?? campaign.objective.replaceAll('_', ' ')} · {shortDate(campaign.start_date)}{campaign.end_date ? ` – ${shortDate(campaign.end_date)}` : ' · No end date'}</p></div><span className={`campaign-status status-${campaign.status}`}>{STATUS_LABELS[campaign.status] ?? campaign.status}</span></div>
                  <div className="campaign-metrics">
                    <div><span>Published destinations</span><strong>{eligibleJobs.length}</strong></div>
                    <div><span>Impressions*</span><strong>{number(totals.impressions)}</strong></div>
                    <div><span>Engagements*</span><strong>{number(totals.engagements)}</strong></div>
                    <div><span>Link clicks*</span><strong>{number(totals.clicks)}</strong></div>
                    <div><span>Leads*</span><strong>{number(totals.leads)}</strong></div>
                    <div><span>Conversions*</span><strong>{number(totals.conversions)}</strong></div>
                  </div>
                  <div className="campaign-content-block"><div className="campaign-subheading"><strong>Campaign content</strong><span>{linkedContent.length} linked items</span></div>
                    {linkedContent.length ? <div className="campaign-content-list">{linkedContent.map((item) => <div key={item.id}><span>{item.title || 'Untitled content'}</span><small>{item.status.replaceAll('_', ' ')}</small></div>)}</div> : <p className="campaign-muted">No content linked yet.</p>}
                    {canOperate && campaign.status !== 'completed' && <form action={linkContentToCampaign} className="campaign-link-form"><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="campaign_id" value={campaign.id}/><select name="content_id" required defaultValue=""><option value="" disabled>Select same-brand content to link</option>{linkedOptions.map((item) => <option value={item.id} key={item.id}>{item.title || 'Untitled content'} · {item.status.replaceAll('_', ' ')}</option>)}</select><button type="submit" disabled={linkedOptions.length === 0}>Link content</button></form>}
                  </div>

                  {campaign.landing_page_url && <div className="campaign-utm-block"><div className="campaign-subheading"><strong>Tracked landing-page links</strong><span>UTM tags · organic social</span></div><p>Use the matching link in each platform post. Website analytics must be configured separately to measure visits and conversions.</p><div className="campaign-utm-list">{trackedSources.map((item) => <a key={item.source} href={item.href} target="_blank" rel="noopener noreferrer"><span>{PROVIDER_LABELS[item.source] ?? item.source}</span><small>Open tagged link ↗</small></a>)}</div></div>}

                  <div className="campaign-snapshot-block"><div className="campaign-subheading"><strong>Performance snapshots</strong><span>{totals.destinationsTracked} destinations tracked</span></div>
                    {snapshots.length ? <p className="campaign-muted">Latest snapshot per destination is used. {snapshots.length} stored snapshot records are available; totals above exclude superseded snapshots.</p> : <p className="campaign-muted">No performance metrics recorded. Add metrics from the platform's native insights after a post is published.</p>}
                    {canRecordMetrics && eligibleJobs.length > 0 && <details className="campaign-snapshot-details"><summary>Record or update a snapshot</summary><form action={recordCampaignMetricSnapshot} className="campaign-snapshot-form">
                      <input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="campaign_id" value={campaign.id}/>
                      <label>Published destination<select name="publishing_job_id" required defaultValue=""> <option value="" disabled>Choose a published post and platform</option>{eligibleJobs.map((job) => { const account = accountById.get(job.social_account_id); const content = contentById.get(job.content_id); return <option key={job.id} value={job.id}>{PROVIDER_LABELS[account?.provider ?? ''] ?? 'Platform'} · {content?.title ?? 'Published content'} · {account?.display_name ?? 'Connected account'}</option>; })}</select></label>
                      <label>Snapshot date<input type="date" name="snapshot_date" required defaultValue={today} max={today}/></label>
                      <div className="campaign-metric-inputs">{[['impressions','Impressions'],['reach','Reach'],['likes','Likes'],['comments','Comments'],['shares','Shares'],['saves','Saves'],['clicks','Link clicks'],['leads','Leads'],['conversions','Conversions']].map(([key,label]) => <label key={key}>{label}<input type="number" name={key} min="0" max="1000000000000" step="1" defaultValue="0" required/></label>)}</div>
                      <div className="campaign-form-footer"><small>Entering a date already recorded replaces that destination's snapshot for the same day. Source is labelled manual.</small><button type="submit">Save snapshot</button></div>
                    </form></details>}
                  </div>

                  {canManage && <form action={updatePublishingCampaignStatus} className="campaign-status-form"><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="campaign_id" value={campaign.id}/><label>Campaign status<select name="status" defaultValue={campaign.status}>{Object.entries(STATUS_LABELS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit">Update status</button></form>}
                </article>;
              })}
            </div>}
          </section>
        </>}
        <p className="campaign-footnote">* Performance figures are manually entered from the social platform's native insights. They are not live API metrics, estimates or guaranteed attribution. Each published destination is counted separately. UTM links label traffic sources but do not themselves collect analytics. The current page displays up to 100 campaigns, 250 content items, 1,000 published jobs and 5,000 metric snapshots per workspace.</p>
      </section>
    </main>
  );
}
