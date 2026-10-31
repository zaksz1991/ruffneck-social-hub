import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cancelScheduledJob, scheduleApprovedContent } from '@/app/actions/publishing';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string; timezone: string };
type ContentItem = { id: string; brand_id: string; title: string; status: string; updated_at: string };
type SocialAccount = {
  id: string;
  brand_id: string;
  provider: string;
  display_name: string | null;
  connection_state: string;
  capabilities: Record<string, unknown> | null;
};
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
  searchParams: Promise<{ workspace?: string; month?: string; error?: string; saved?: string; created?: string; failed?: string; duplicates?: string; denied?: string }>;
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
      supabase.from('content_items').select('id,brand_id,title,status,updated_at').eq('workspace_id', activeWorkspace.id).eq('status', 'approved').order('updated_at', { ascending: false }).limit(100),
      supabase.from('social_accounts').select('id,brand_id,provider,display_name,connection_state,capabilities').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }),
      supabase.from('publishing_jobs').select('id,brand_id,content_id,social_account_id,scheduled_at,state,attempts,last_error_safe').eq('workspace_id', activeWorkspace.id).order('scheduled_at', { ascending: true }).limit(100),
    ]);

    brands = (brandResult.data ?? []) as Brand[];
    approvedContent = (contentResult.data ?? []) as ContentItem[];
    accounts = (accountResult.data ?? []) as SocialAccount[];
    jobs = (jobResult.data ?? []) as PublishingJob[];
    queueReadFailed = Boolean(jobResult.error);
  }

  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const contentById = new Map(approvedContent.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const connectedAccounts = accounts.filter((account) => account.connection_state === 'connected' && account.capabilities?.content_publish === true);
  const canSchedule = roleCanSchedule(role);
  const activeJobs = jobs.filter((job) => ['queued', 'claimed', 'dispatching', 'retryable', 'needs_review'].includes(job.state));
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
  };
  const successMessages: Record<string, string> = {
    scheduled: 'Added to the publishing queue. No post has been sent to a social network.',
    cancelled: 'The queued item has been cancelled.',
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
              <div><strong>Human-approved multi-network publishing</strong><p>Approved image posts can be dispatched to Instagram Business accounts and Facebook Pages. Approved text-only posts can be dispatched to LinkedIn organization Pages when the required LinkedIn permission is granted. Other networks remain unavailable until their provider workers are implemented.</p></div>
              <span className="publishing-gate">INSTAGRAM + FACEBOOK + LINKEDIN</span>
            </section>

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
              <div className="publishing-section-heading"><div><span className="eyebrow">SCHEDULED OPERATIONS</span><h2>Queue and schedule history</h2><p>Records are stored in PostgreSQL and isolated by workspace membership.</p></div><span className="publishing-count">{jobs.length} RECORDS</span></div>
              {queueReadFailed ? (
                <div className="publishing-empty"><h3>Publishing queue migration required</h3><p>Apply migration 0005_publishing_calendar_queue.sql after migration 0004, then refresh this page.</p></div>
              ) : jobs.length === 0 ? (
                <div className="publishing-empty"><div className="publishing-empty-mark">▦</div><h3>The queue is empty</h3><p>Once approved content and connected destinations are available, scheduled items will appear here.</p></div>
              ) : (
                <div className="publishing-job-list">
                  {jobs.map((job) => {
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
            </section>
            <p className="publishing-footnote">Supported dispatch: one public HTTPS image with caption to Instagram Business or Facebook Pages. Video, carousels, other networks and automatic retry after an uncertain provider response are not supported.</p>
          </>
        )}
      </div>
    </main>
  );
}
