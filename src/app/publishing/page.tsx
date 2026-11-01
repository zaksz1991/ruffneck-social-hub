import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cancelScheduledJob, scheduleApprovedContent } from '@/app/actions/publishing';
import { refreshTikTokInboxUploadStatus, resolveUnknownTikTokInboxUpload, uploadApprovedVideoToTikTokInbox } from '@/app/actions/tiktok';
import { validateTikTokVideoSourceUrl } from '@/lib/integrations/tiktok';
import './tiktok-publishing.css';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { summarizeQueueHealth } from '@/lib/publishing/queue-health';

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string; timezone: string };
type ContentItem = { id: string; brand_id: string; title: string; status: string; updated_at: string; media_refs: unknown };
type SocialAccount = {
  id: string;
  brand_id: string;
  provider: string;
  display_name: string | null;
  connection_state: string;
  capabilities: Record<string, unknown> | null;
  granted_scopes: string[] | null;
};
type TikTokInboxUpload = { id: string; content_id: string; social_account_id: string; status: string; safe_error_code: string | null; publish_id: string | null; provider_video_id: string | null; created_at: string; updated_at: string };
type PublishingJob = {
  id: string;
  brand_id: string;
  content_id: string;
  social_account_id: string;
  scheduled_at: string;
  state: string;
  attempts: number;
  last_error_safe: string | null;
};

const roleCanSchedule = (role: string) => ['owner', 'admin', 'manager', 'publisher'].includes(role);

const stateLabel: Record<string, string> = {
  queued: 'Queued',
  claimed: 'Claimed',
  dispatching: 'Dispatching',
  succeeded: 'Published',
  retryable: 'Retryable',
  failed: 'Failed',
  needs_review: 'Needs review',
  cancelled: 'Cancelled',
};

function localDateKey(value: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return new Date(value).toISOString().slice(0, 10); }
}

function displayDate(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
}

export default async function PublishingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; month?: string; error?: string; saved?: string; created?: string; failed?: string; duplicates?: string; denied?: string; state?: string; provider?: string; brand?: string; q?: string; page?: string; tiktok_upload?: string; tiktok_error?: string }>; 
}) {
  const params = await searchParams;
  const monthMatch = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : new Date().toISOString().slice(0, 7);
  const [calendarYear, calendarMonth] = monthMatch.split('-').map(Number);
  const monthStart = new Date(Date.UTC(calendarYear, calendarMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(calendarYear, calendarMonth, 0));
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart);
  const prevMonth = new Date(Date.UTC(calendarYear, calendarMonth - 2, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(calendarYear, calendarMonth, 1)).toISOString().slice(0, 7);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id,name')
    .order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === params.workspace) ?? workspaces[0];

  let role = 'member';
  let brands: Brand[] = [];
  let approvedContent: ContentItem[] = [];
  let accounts: SocialAccount[] = [];
  let jobs: PublishingJob[] = [];
  let queueReadFailed = false;
  const queuePage = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const queuePageSize = 25;
  let historyJobs: PublishingJob[] = [];
  let historyCount = 0;
  let tiktokUploads: TikTokInboxUpload[] = [];
  let tiktokUploadReadError = false;

  if (activeWorkspace) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id)
      .maybeSingle();
    role = member?.role ?? 'member';

    const [brandResult, contentResult, accountResult, jobResult] = await Promise.all([
      supabase.from('brands').select('id,name,timezone').eq('workspace_id', activeWorkspace.id).order('name'),
      supabase.from('content_items').select('id,brand_id,title,status,updated_at,media_refs').eq('workspace_id', activeWorkspace.id).eq('status', 'approved').order('updated_at', { ascending: false }).limit(100),
      supabase.from('social_accounts').select('id,brand_id,provider,display_name,connection_state,capabilities,granted_scopes').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }),
      supabase.from('publishing_jobs').select('id,brand_id,content_id,social_account_id,scheduled_at,state,attempts,last_error_safe').eq('workspace_id', activeWorkspace.id).order('scheduled_at', { ascending: true }).limit(100),
    ]);

    brands = (brandResult.data ?? []) as Brand[];
    approvedContent = (contentResult.data ?? []) as ContentItem[];
    accounts = (accountResult.data ?? []) as SocialAccount[];
    jobs = (jobResult.data ?? []) as PublishingJob[];
    queueReadFailed = Boolean(jobResult.error);
    const historyResult = await supabase
      .from('publishing_jobs')
      .select('id,brand_id,content_id,social_account_id,scheduled_at,state,attempts,last_error_safe', { count: 'exact' })
      .eq('workspace_id', activeWorkspace.id)
      .order('scheduled_at', { ascending: false })
      .range((queuePage - 1) * queuePageSize, queuePage * queuePageSize - 1);
    historyJobs = (historyResult.data ?? []) as PublishingJob[];
    historyCount = historyResult.count ?? 0;
    if (historyResult.error) queueReadFailed = true;
    const uploadResult = await supabase.from('tiktok_inbox_uploads').select('id,content_id,social_account_id,status,safe_error_code,publish_id,provider_video_id,created_at,updated_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }).limit(15);
    tiktokUploads = (uploadResult.data ?? []) as TikTokInboxUpload[];
    tiktokUploadReadError = Boolean(uploadResult.error);
  }

  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const contentById = new Map(approvedContent.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const connectedAccounts = accounts.filter((account) => account.connection_state === 'connected' && account.capabilities?.content_publish === true);
  const tiktokInboxAccounts = accounts.filter((account) => account.connection_state === 'connected' && account.provider === 'tiktok' && account.capabilities?.content_upload === true && account.granted_scopes?.includes('video.upload') === true);
  const verifiedTikTokHosts = (process.env.TIKTOK_VERIFIED_MEDIA_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
  const approvedTikTokVideos = approvedContent.filter((item) => {
    const refs = Array.isArray(item.media_refs) ? item.media_refs : [];
    return refs.length === 1 && validateTikTokVideoSourceUrl(refs[0], verifiedTikTokHosts).ok;
  });
  const canSchedule = roleCanSchedule(role);
  const allowedStates = ['all', 'queued', 'claimed', 'dispatching', 'succeeded', 'retryable', 'failed', 'needs_review', 'cancelled'];
  const selectedState = allowedStates.includes(params.state ?? '') ? (params.state ?? 'all') : 'all';
  const selectedProvider = accounts.some((account) => account.provider === params.provider) ? (params.provider ?? 'all') : 'all';
  const selectedBrand = brands.some((brand) => brand.id === params.brand) ? (params.brand ?? 'all') : 'all';
  const searchTerm = (params.q ?? '').trim().slice(0, 100);
  const filteredJobs = historyJobs.filter((job) => {
    const account = accounts.find((item) => item.id === job.social_account_id);
    const brand = brands.find((item) => item.id === job.brand_id);
    const content = approvedContent.find((item) => item.id === job.content_id);
    const matchesState = selectedState === 'all' || job.state === selectedState;
    const matchesProvider = selectedProvider === 'all' || account?.provider === selectedProvider;
    const matchesBrand = selectedBrand === 'all' || job.brand_id === selectedBrand;
    const haystack = [content?.title, account?.display_name, account?.provider, brand?.name, job.last_error_safe].filter(Boolean).join(' ').toLowerCase();
    return matchesState && matchesProvider && matchesBrand && (!searchTerm || haystack.includes(searchTerm.toLowerCase()));
  });
  const activeJobs = jobs.filter((job) => ['queued', 'claimed', 'dispatching', 'retryable', 'needs_review'].includes(job.state));
  const queueHealth = summarizeQueueHealth(jobs);
  const errorMessages: Record<string, string> = {
    input: 'The submitted schedule details were invalid.',
    content: 'Choose an approved content item.',
    account: 'Choose a valid destination account.',
    accounts: 'Select between one and ten connected publishing destinations.',
    datetime: 'Enter a valid date and time using the selected brand timezone.',
    duplicate: 'This content is already scheduled for that account at that time.',
    permission: 'Your workspace role does not allow this scheduling action.',
    migration: 'The publishing queue database upgrade has not been applied yet. Apply migration 0005.',
    schedule: 'The schedule could not be created. Confirm the content is approved and the channel is connected to the same brand.',
    cancel: 'The queue item could not be cancelled. It may already be processing.',
    tiktok_input: 'Select a valid approved video and TikTok destination.',
  };
  const successMessages: Record<string, string> = {
    scheduled: 'Added to the publishing queue. No post has been sent to a social network.',
    cancelled: 'The queued item has been cancelled.',
  };
  const tiktokErrorMessages: Record<string, string> = {
    permission: 'Your workspace role cannot transfer approved videos to TikTok.',
    consent: 'Confirm that you have rights to transfer this approved video.',
    content: 'Only approved content with one video media URL can be transferred.',
    account: 'Choose a connected TikTok account belonging to the approved content brand.',
    upload_scope: 'Reconnect TikTok and grant video.upload to enable native inbox video transfer.',
    url_invalid: 'The media URL must be a public HTTPS link without credentials, ports or fragments.',
    video_format: 'TikTok inbox transfer currently accepts one .mp4 or .mov file.',
    domain_unverified: 'The media hostname is not in TIKTOK_VERIFIED_MEDIA_HOSTS. Verify the domain with TikTok and add its exact hostname in Vercel.',
    duplicate: 'A transfer for this video is already pending or has an uncertain provider outcome. Check its status before trying again.',
    token: 'TikTok access could not be refreshed. Reconnect the account and retry after checking its status.',
    provider: 'TikTok rejected the video transfer. Check API product access, video URL accessibility and account scopes.',
    outcome_unknown: 'TikTok transfer outcome is unknown. Automatic retry is blocked. An owner, administrator or manager must verify TikTok and choose a manual reconciliation outcome before another transfer can be started.',
    status_unavailable: 'This transfer does not have a status that can be refreshed yet.',
    status_check: 'TikTok status could not be checked. Try again later; the original upload was not repeated.',
    upload_record: 'A secure upload record could not be created. Check migration 0030 and workspace permissions.',
    reconciliation: 'The manual reconciliation was not accepted. Confirm you are an owner, administrator or manager and refresh the transfer record.',
  };

  return (
    <main className="publishing-shell">
      <header className="publishing-topbar">
        <Link href="/" className="publishing-logo"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
        <nav aria-label="Publishing navigation"><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><span>Publishing Queue</span></nav>
        <Link href="/" className="publishing-back">Back to workspace</Link>
      </header>

      <div className="publishing-main">
        <div className="publishing-heading">
          <div>
            <span className="eyebrow">PUBLISH &amp; ENGAGE</span>
            <h1>Publishing calendar</h1>
            <p>Schedule approved content for connected brand accounts and manage the queue.</p>
          </div>
          <div className="publishing-workspace-chip"><span>WORKSPACE</span><strong>{activeWorkspace?.name ?? 'No workspace available'}</strong><small>{role.toUpperCase()}</small>{workspaces.length > 1 && <div className="publishing-workspace-options" aria-label="Switch workspace">{workspaces.map((workspace) => <Link key={workspace.id} href={`/publishing?workspace=${workspace.id}`} className={workspace.id === activeWorkspace?.id ? 'selected' : ''}>{workspace.name}</Link>)}</div>}</div>
        </div>

        {params.error && <p className="notice error">{errorMessages[params.error] ?? 'The requested publishing action failed.'}</p>}
        {params.saved === 'bulk' ? <p className={Number(params.failed ?? 0) > 0 ? 'notice error' : 'notice success'}>Created {Number(params.created ?? 0)} schedule(s); {Number(params.failed ?? 0)} destination(s) failed. {Number(params.duplicates ?? 0) > 0 ? `${Number(params.duplicates)} duplicate schedule(s) were skipped. ` : ''}{params.denied === '1' ? 'At least one destination was rejected by workspace permissions. ' : ''}Each successful destination is queued separately; nothing is published immediately.</p> : params.saved && <p className="notice success">{successMessages[params.saved] ?? 'Publishing queue updated.'}</p>}
        {params.tiktok_upload === 'sent' && <p className="notice success">The video file was transferred to the TikTok creator inbox. Open TikTok to finish the caption, privacy choices and final publishing action.</p>}
        {params.tiktok_upload === 'checked' && <p className="notice success">TikTok upload status refreshed. Check the transfer history below for the latest state.</p>}
        {params.tiktok_upload === 'reconciled' && <p className="notice success">The unknown TikTok transfer has been manually reconciled and its history updated.</p>}
        {params.tiktok_error && <p className="notice error" role="alert">{tiktokErrorMessages[params.tiktok_error] ?? 'The TikTok video transfer could not be completed. No direct public post was created.'}</p>}

        {!activeWorkspace ? (
          <section className="publishing-empty"><h2>No workspace available</h2><p>Create or join a workspace before scheduling content.</p><Link href="/" className="publishing-primary">Return to workspace setup</Link></section>
        ) : (
          <>
            <section className="publishing-stats" aria-label="Publishing queue summary">
              <article><span>Queue items</span><strong>{activeJobs.length}</strong></article>
              <article><span>Approved content</span><strong>{approvedContent.length}</strong></article>
              <article><span>Connected destinations</span><strong>{connectedAccounts.length}</strong></article>
              <article><span>Brands in workspace</span><strong>{brands.length}</strong></article>
            </section>

            <section className="publishing-health-panel" aria-label="Publishing queue health">
              <div className="publishing-health-heading"><div><span className="eyebrow">OPERATIONS HEALTH</span><h2>Queue health</h2><p>Live counts from the latest {queueHealth.totalLoaded} queue records loaded for this workspace.</p></div><span className="publishing-health-scope">LOADED RECORDS ONLY</span></div>
              <div className="publishing-health-grid">
                <article className={queueHealth.overdue ? 'health-card health-warning' : 'health-card'}><span>Overdue schedules</span><strong>{queueHealth.overdue}</strong><small>Queued or retryable with a past schedule time</small></article>
                <article className={queueHealth.attention ? 'health-card health-warning' : 'health-card'}><span>Needs attention</span><strong>{queueHealth.attention}</strong><small>Retryable, failed or needs review</small></article>
                <article className="health-card"><span>Next 24 hours</span><strong>{queueHealth.upcoming24h}</strong><small>Queued posts due in the next 24 hours</small></article>
                <article className="health-card health-positive"><span>Published</span><strong>{queueHealth.published}</strong><small>Confirmed successful records in loaded queue</small></article>
              </div>
              <p className="publishing-health-note">These are operational queue counts, not social-network reach or engagement analytics. The page currently loads up to 100 records, so older history may not be included.</p>
            </section>

            <section className="publishing-calendar-panel" aria-label={`${monthLabel} publishing calendar`}>
              <div className="publishing-calendar-heading"><div><span className="eyebrow">CONTENT OPERATIONS</span><h2>{monthLabel}</h2><p>Scheduled destinations are shown on each brand’s local calendar date.</p></div><div className="publishing-calendar-nav"><Link href={`/publishing?workspace=${activeWorkspace.id}&month=${prevMonth}`} aria-label="Previous month">‹</Link><Link href={`/publishing?workspace=${activeWorkspace.id}&month=${new Date().toISOString().slice(0, 7)}`}>This month</Link><Link href={`/publishing?workspace=${activeWorkspace.id}&month=${nextMonth}`} aria-label="Next month">›</Link><a href={`/api/publishing/calendar.ics?workspace=${activeWorkspace.id}&month=${monthMatch}`} aria-label="Download this month as an iCalendar file">Export .ics</a></div></div>
              <div className="publishing-calendar-grid">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="publishing-calendar-weekday" key={day}>{day}</div>)}
                {(() => {
                  const offset = (monthStart.getUTCDay() + 6) % 7;
                  const totalCells = Math.ceil((offset + monthEnd.getUTCDate()) / 7) * 7;
                  return Array.from({ length: totalCells }, (_, index) => {
                    const dayNumber = index - offset + 1;
                    const inMonth = dayNumber >= 1 && dayNumber <= monthEnd.getUTCDate();
                    const date = inMonth ? `${monthMatch}-${String(dayNumber).padStart(2, '0')}` : '';
                    const dayJobs = inMonth ? jobs.filter((job) => localDateKey(job.scheduled_at, brandById.get(job.brand_id)?.timezone ?? 'UTC') === date) : [];
                    return <div key={index} className={`publishing-calendar-day${inMonth ? '' : ' outside'}${date === new Date().toISOString().slice(0, 10) ? ' today' : ''}`}><span className="publishing-calendar-day-number">{inMonth ? dayNumber : ''}</span>{dayJobs.slice(0, 3).map((job) => <span key={job.id} className={`publishing-calendar-event event-${job.state}`} title={`${contentById.get(job.content_id)?.title ?? 'Scheduled post'} · ${job.state}`}>{contentById.get(job.content_id)?.title ?? 'Scheduled post'}</span>)}{dayJobs.length > 3 && <small>+{dayJobs.length - 3} more</small>}</div>;
                  });
                })()}
              </div>
              <div className="publishing-calendar-legend"><span><i className="legend-queued"/>Queued / processing</span><span><i className="legend-published"/>Published</span><span><i className="legend-attention"/>Needs attention</span><span>{jobs.filter((job) => { const key = localDateKey(job.scheduled_at, brandById.get(job.brand_id)?.timezone ?? 'UTC'); return key >= `${monthMatch}-01` && key <= `${monthMatch}-${String(monthEnd.getUTCDate()).padStart(2, '0')}`; }).length} visible schedule records in loaded queue</span></div>
            </section>

            <section className="publishing-safety-banner">
              <span className="publishing-safety-icon">✓</span>
              <div><strong>Human-approved multi-network publishing</strong><p>Approved image posts can be dispatched to Instagram Business accounts and Facebook Pages. Approved text-only posts can be dispatched to LinkedIn organization Pages when the required LinkedIn permission is granted. TikTok videos use a separate consent-based transfer into the creator inbox; final publication happens in TikTok.</p></div>
              <span className="publishing-gate">INSTAGRAM + FACEBOOK + LINKEDIN + TIKTOK INBOX</span>
            </section>

            {canSchedule && <section className="tiktok-inbox-transfer-card">
              <div className="publishing-section-heading"><div><span className="eyebrow">OFFICIAL TIKTOK CONTENT API</span><h2>Send an approved video to TikTok</h2><p>Transfer one approved video into the connected creator&apos;s TikTok inbox. This is not an automatic public post or scheduled publication.</p></div><span className="publishing-tag">HUMAN FINAL PUBLISH</span></div>
              {tiktokInboxAccounts.length === 0 ? <p className="tiktok-transfer-muted">Connect a TikTok account with the video.upload permission to enable creator-inbox transfer.</p> : approvedTikTokVideos.length === 0 ? <p className="tiktok-transfer-muted">No approved content has exactly one .mp4 or .mov media URL on a TikTok-verified host. Add a public video URL to an approved content item and configure TIKTOK_VERIFIED_MEDIA_HOSTS.</p> : <form action={uploadApprovedVideoToTikTokInbox} className="tiktok-transfer-form">
                <input type="hidden" name="workspace_id" value={activeWorkspace.id}/>
                <label>Approved video<select name="content_id" required defaultValue=""><option value="" disabled>Select approved video</option>{approvedTikTokVideos.map((item) => <option key={item.id} value={item.id}>{item.title || 'Untitled approved video'} · {brandById.get(item.brand_id)?.name ?? 'Brand'}</option>)}</select></label>
                <label>TikTok destination<select name="social_account_id" required defaultValue=""><option value="" disabled>Select connected TikTok account</option>{tiktokInboxAccounts.map((account) => <option key={account.id} value={account.id}>{account.display_name ?? 'TikTok account'} · {brandById.get(account.brand_id)?.name ?? 'Brand'}</option>)}</select></label>
                <label className="tiktok-transfer-consent"><input type="checkbox" name="transfer_consent" value="yes" required/><span>I confirm that this workspace has the rights and authorization to transfer this video file to the selected TikTok account. I understand that TikTok will place it in the creator&apos;s inbox and the creator must finish editing, choose privacy and publish inside TikTok.</span></label>
                <button type="submit" className="publishing-primary">Transfer video to TikTok inbox</button>
              </form>}
              <div className="tiktok-transfer-history"><div className="tiktok-transfer-history-heading"><strong>Recent TikTok transfers</strong><span>Latest 15 records</span></div>
                {tiktokUploadReadError ? <p className="tiktok-transfer-muted">Transfer history is unavailable. Confirm migration 0030 is applied.</p> : tiktokUploads.length === 0 ? <p className="tiktok-transfer-muted">No TikTok video transfers yet.</p> : tiktokUploads.map((upload) => <div className="tiktok-transfer-row" key={upload.id}><div><strong>{contentById.get(upload.content_id)?.title ?? 'Approved video'}</strong><span>{accountById.get(upload.social_account_id)?.display_name ?? 'TikTok account'} · {new Date(upload.updated_at).toLocaleString()}</span>{upload.safe_error_code && <small>{upload.safe_error_code}</small>}{upload.provider_video_id && <small>Published video ID: {upload.provider_video_id}</small>}</div><span className={`tiktok-transfer-state tiktok-transfer-${upload.status}`}>{upload.status.replaceAll('_', ' ')}</span>{upload.publish_id && ['send_to_user_inbox','processing_download'].includes(upload.status) && <form action={refreshTikTokInboxUploadStatus}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="upload_id" value={upload.id}/><button type="submit">Refresh status</button></form>}{upload.status === 'unknown' && ['owner','admin','manager'].includes(role) && <div className="tiktok-reconcile-actions"><form action={resolveUnknownTikTokInboxUpload}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="upload_id" value={upload.id}/><button type="submit" name="resolution" value="confirmed_not_uploaded">Verified not uploaded — allow a new transfer</button></form><form action={resolveUnknownTikTokInboxUpload}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="upload_id" value={upload.id}/><button type="submit" name="resolution" value="confirmed_in_tiktok_inbox">Verified in creator inbox</button></form><form action={resolveUnknownTikTokInboxUpload}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="upload_id" value={upload.id}/><button type="submit" name="resolution" value="confirmed_published">Verified already published</button></form></div>}</div>)}
              </div>
              <p className="tiktok-transfer-footnote">Security: the server permits only one .mp4/.mov media URL hosted on an exact hostname listed in TIKTOK_VERIFIED_MEDIA_HOSTS. TikTok must have verified that URL domain/prefix. The app does not set a caption, privacy level or publish schedule and never auto-publishes the draft. Ambiguous network outcomes are marked unknown and cannot be blindly retried.</p>
            </section>}

            {canSchedule && approvedContent.length > 0 && connectedAccounts.length > 0 && (
              <section className="publishing-compose-card">
                <div className="publishing-section-heading"><div><span className="eyebrow">NEW SCHEDULE</span><h2>Add approved content to the queue</h2><p>Create matching schedule entries for up to ten connected destinations in one operation.</p></div><span className="publishing-tag">APPROVED CONTENT ONLY</span></div>
                <form action={scheduleApprovedContent} className="publishing-form">
                  <input type="hidden" name="workspace_id" value={activeWorkspace.id} />
                  <label>Approved content
                    <select name="content_id" required defaultValue="">
                      <option value="" disabled>Select approved content</option>
                      {approvedContent.map((item) => {
                        const brand = brandById.get(item.brand_id);
                        return <option value={item.id} key={item.id}>{item.title} · {brand?.name ?? 'Brand'} ({brand?.timezone ?? 'UTC'})</option>;
                      })}
                    </select>
                  </label>
                  <label>Connected destinations (select up to 10)
                    <select name="social_account_ids" required multiple size={Math.min(Math.max(connectedAccounts.length, 3), 7)} aria-describedby="publishing-destinations-help">
                      {connectedAccounts.map((account) => <option value={account.id} key={account.id}>{account.display_name || account.provider} · {account.provider} · {brandById.get(account.brand_id)?.name ?? 'Brand'}</option>)}
                    </select>
                    <small id="publishing-destinations-help">Use Ctrl (Windows) or Command (Mac) to select multiple destinations. The database checks that every destination belongs to the selected content brand.</small>
                  </label>
                  <label>Publish date and time
                    <input type="datetime-local" name="scheduled_local" required />
                    <small>Enter the wall-clock time in the selected content brand&apos;s saved timezone. The server validates the actual UTC schedule.</small>
                  </label>
                  <div className="publishing-form-footer"><span>Instagram and Facebook support single-image posts; LinkedIn supports text-only organization posts. Match the content format to each selected destination.</span><button type="submit" className="publishing-primary">Add to queue</button></div>
                </form>
              </section>
            )}

            {canSchedule && approvedContent.length === 0 && (
              <section className="publishing-prerequisite"><strong>No approved content is available.</strong><p>Create a draft in Content Studio, submit it for review and approve it before scheduling.</p><Link href="/content">Open Content Studio</Link></section>
            )}
            {canSchedule && approvedContent.length > 0 && connectedAccounts.length === 0 && (
              <section className="publishing-prerequisite"><strong>No publishing-enabled social destinations.</strong><p>Connect a supported Instagram Business account, Facebook Page or LinkedIn organization Page and grant the required publishing permissions. A connected account without a verified publishing capability cannot enter the queue.</p><Link href="/#channels">View connected-channel setup</Link></section>
            )}
            {!canSchedule && <section className="publishing-prerequisite"><strong>Read-only publishing access.</strong><p>Your current workspace role can view queue records but cannot schedule or cancel jobs.</p></section>}

            <section className="publishing-queue-section">
              <div className="publishing-section-heading"><div><span className="eyebrow">SCHEDULED OPERATIONS</span><h2>Queue and schedule history</h2><p>Complete workspace history, loaded 25 records per page. Search and filters apply to the current page.</p></div><span className="publishing-count">{historyCount.toLocaleString()} TOTAL RECORDS</span></div>
              <form method="get" action="/publishing" className="publishing-queue-filters" aria-label="Filter publishing queue">
                <input type="hidden" name="workspace" value={activeWorkspace.id} />
                <input type="hidden" name="month" value={monthMatch} />
                <input type="hidden" name="page" value="1" />
                <label>Search<input type="search" name="q" maxLength={100} defaultValue={searchTerm} placeholder="Post, brand, account or error" /></label>
                <label>Status<select name="state" defaultValue={selectedState}>{allowedStates.map((state) => <option key={state} value={state}>{state === 'all' ? 'All statuses' : stateLabel[state] ?? state}</option>)}</select></label>
                <label>Platform<select name="provider" defaultValue={selectedProvider}><option value="all">All platforms</option>{Array.from(new Set(accounts.map((account) => account.provider))).sort().map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
                <label>Brand<select name="brand" defaultValue={selectedBrand}><option value="all">All brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
                <div className="publishing-filter-actions"><button type="submit">Apply filters</button><Link href={`/publishing?workspace=${activeWorkspace.id}&month=${monthMatch}`}>Clear</Link><a href={`/api/publishing/export?workspace=${encodeURIComponent(activeWorkspace.id)}&state=${encodeURIComponent(selectedState)}&provider=${encodeURIComponent(selectedProvider)}&brand=${encodeURIComponent(selectedBrand)}&q=${encodeURIComponent(searchTerm)}`}>Export filtered CSV</a></div>
              </form>
              {queueReadFailed ? (
                <div className="publishing-empty"><h3>Publishing queue migration required</h3><p>Apply migration 0005_publishing_calendar_queue.sql after migration 0004, then refresh this page.</p></div>
              ) : historyCount === 0 ? (
                <div className="publishing-empty"><div className="publishing-empty-mark">▦</div><h3>The queue is empty</h3><p>Once approved content and connected destinations are available, scheduled items will appear here.</p></div>
              ) : filteredJobs.length === 0 ? (
                <div className="publishing-empty"><h3>No matching queue records</h3><p>Change or clear the filters to see other scheduled operations.</p></div>
              ) : (
                <div className="publishing-job-list">
                  {filteredJobs.map((job) => {
                    const content = contentById.get(job.content_id);
                    const brand = brandById.get(job.brand_id);
                    const account = accountById.get(job.social_account_id);
                    const canCancel = canSchedule && ['queued', 'retryable', 'needs_review'].includes(job.state);
                    return (
                      <article className="publishing-job-card" key={job.id}>
                        <div className="publishing-job-date"><strong>{displayDate(job.scheduled_at, brand?.timezone ?? 'UTC')}</strong><span>{brand?.timezone ?? 'UTC'}</span></div>
                        <div className="publishing-job-copy"><span className="publishing-job-brand">{brand?.name ?? 'Brand'} · {account?.provider ?? 'Unknown provider'}</span><h3>{content?.title ?? 'Content record'}</h3><p>{account?.display_name ?? account?.provider ?? 'Destination unavailable'} · {job.attempts} dispatch attempts</p>{job.last_error_safe && <small className="publishing-safe-error">{job.last_error_safe}</small>}</div>
                        <div className="publishing-job-actions"><span className={`publishing-state publishing-state-${job.state}`}>{stateLabel[job.state] ?? job.state}</span>{canCancel && <form action={cancelScheduledJob}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="job_id" value={job.id}/><button type="submit" className="publishing-cancel">Cancel</button></form>}</div>
                      </article>
                    );
                  })}
                </div>
              )}
              {historyCount > queuePageSize && <nav className="publishing-history-pagination" aria-label="Publishing history pages"><span>Page {queuePage} of {Math.ceil(historyCount / queuePageSize).toLocaleString()}</span><div>{queuePage > 1 && <Link href={`/publishing?workspace=${activeWorkspace.id}&month=${monthMatch}&page=${queuePage - 1}&state=${selectedState}&provider=${selectedProvider}&brand=${selectedBrand}&q=${encodeURIComponent(searchTerm)}`}>Previous</Link>}{queuePage * queuePageSize < historyCount && <Link href={`/publishing?workspace=${activeWorkspace.id}&month=${monthMatch}&page=${queuePage + 1}&state=${selectedState}&provider=${selectedProvider}&brand=${selectedBrand}&q=${encodeURIComponent(searchTerm)}`}>Next</Link>}</div></nav>}
            </section>
            <p className="publishing-footnote">Scheduled queue dispatch currently supports one public HTTPS image with caption to Instagram Business or Facebook Pages and text-only LinkedIn organization posts. TikTok is a separate creator-inbox video transfer that requires explicit consent, a verified media hostname and a final manual publish action inside TikTok. It is not a scheduled queue destination.</p>
          </>
        )}
      </div>
    </main>
  );
}
