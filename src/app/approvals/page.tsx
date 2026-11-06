import Link from 'next/link';
import { redirect } from 'next/navigation';
import { reviewClientApproval } from '@/app/actions/client-approvals';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  canUseClientApprovalPortal,
  safeClientApprovalMediaUrl,
} from '@/lib/content/client-approval';
import {
  countApprovalAgeBands,
  filterApprovalQueue,
  getApprovalQueueAge,
  normalizeApprovalAgeFilter,
} from '@/lib/content/approval-queue-age';
import styles from './approvals.module.css';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type Brand = { id: string; name: string };
type PendingContent = {
  id: string;
  workspace_id: string;
  brand_id: string;
  title: string;
  body: string;
  media_refs: unknown;
  created_at: string;
  updated_at: string;
};
type PriorReview = {
  id: string;
  content_id: string;
  decision: string;
  note: string;
  created_at: string;
};

const errorMessages: Record<string, string> = {
  permission: 'Your current workspace role does not permit content approval.',
  decision: 'Choose approve or request changes.',
  note: 'The review note must not exceed 1,000 characters.',
  note_required: 'Add at least five characters explaining the requested changes.',
  input: 'The submitted approval request was invalid. Refresh the page and try again.',
  review: 'The approval could not be recorded. The item may have changed or may no longer be awaiting review.',
};
const successMessages: Record<string, string> = {
  approved: 'Content approved. Approval does not publish the item.',
  changes: 'Changes requested. The item has returned to the content team.',
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function roleLabel(role: string) {
  return role.replaceAll('_', ' ');
}

export default async function ClientApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string; saved?: string; age?: string }>;
}) {
  const params = await searchParams;
  const ageFilter = normalizeApprovalAgeFilter(params.age);
  const now = Date.now();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membershipRows, error: membershipListError } = await supabase
    .from('workspace_members')
    .select('workspace_id,role')
    .eq('user_id', user.id);
  const memberships = (membershipRows ?? []) as Membership[];
  const workspaceIds = memberships.map((membership) => membership.workspace_id);
  const { data: workspaceRows } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === params.workspace) ?? workspaces[0] ?? null;
  const activeMembership = activeWorkspace
    ? memberships.find((membership) => membership.workspace_id === activeWorkspace.id)
    : null;
  const role = activeMembership?.role ?? 'member';
  const canReview = canUseClientApprovalPortal(role);

  let pendingItems: PendingContent[] = [];
  let brands: Brand[] = [];
  let priorReviews: PriorReview[] = [];
  let queueError = Boolean(membershipListError);

  if (activeWorkspace && canReview) {
    const [contentResult, brandResult] = await Promise.all([
      supabase.from('content_items')
        .select('id,workspace_id,brand_id,title,body,media_refs,created_at,updated_at')
        .eq('workspace_id', activeWorkspace.id)
        .eq('status', 'in_review')
        .order('updated_at', { ascending: true })
        .limit(100),
      supabase.from('brands')
        .select('id,name')
        .eq('workspace_id', activeWorkspace.id)
        .order('name', { ascending: true }),
    ]);
    if (contentResult.error || brandResult.error) {
      queueError = true;
    } else {
      pendingItems = (contentResult.data ?? []) as PendingContent[];
      brands = (brandResult.data ?? []) as Brand[];
      const contentIds = pendingItems.map((item) => item.id);
      if (contentIds.length) {
        const { data: reviewRows, error: reviewError } = await supabase.from('content_reviews')
          .select('id,content_id,decision,note,created_at')
          .eq('workspace_id', activeWorkspace.id)
          .in('content_id', contentIds)
          .order('created_at', { ascending: false })
          .limit(200);
        if (reviewError) queueError = true;
        else priorReviews = (reviewRows ?? []) as PriorReview[];
      }
    }
  }

  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  const ageCounts = countApprovalAgeBands(pendingItems, now);
  const visibleItems = filterApprovalQueue(pendingItems, ageFilter, now);
  const latestReviewByContent = new Map<string, PriorReview>();
  for (const review of priorReviews) {
    if (!latestReviewByContent.has(review.content_id)) latestReviewByContent.set(review.content_id, review);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}><span className={styles.brandMark}>R</span><span>RUFFNECK <b>SOCIAL HUB</b></span></Link>
        <nav aria-label="Workspace navigation">
          <Link href="/">Overview</Link>
          <Link href="/content">Content Studio</Link>
          <span aria-current="page">Client approvals</span>
          <Link href="/team">Team access</Link>
        </nav>
        <Link className={styles.backLink} href="/">Back to workspace</Link>
      </header>

      <section className={styles.main}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>CONTROLLED CONTENT REVIEW</span>
            <h1>Client approvals</h1>
            <p>Review submitted brand content, record a decision and return clear feedback to the content team.</p>
          </div>
          <div className={styles.workspaceBadge}>
            <small>ACTIVE WORKSPACE</small>
            <strong>{activeWorkspace?.name ?? 'No workspace available'}</strong>
            <span>{roleLabel(role)}</span>
          </div>
        </div>

        {params.error && <p className={`${styles.notice} ${styles.error}`} role="alert">{errorMessages[params.error] ?? 'The approval request could not be completed.'}</p>}
        {params.saved && <p className={`${styles.notice} ${styles.success}`} role="status">{successMessages[params.saved] ?? 'Review decision recorded.'}</p>}

        {workspaces.length > 1 && (
          <div className={styles.workspaceSwitcher} aria-label="Select workspace">
            <span>Workspace</span>
            {workspaces.map((workspace) => (
              <Link key={workspace.id} href={`/approvals?workspace=${workspace.id}`} className={workspace.id === activeWorkspace?.id ? styles.selected : ''}>
                {workspace.name}
              </Link>
            ))}
          </div>
        )}

        {!activeWorkspace ? (
          <section className={styles.emptyState}>
            <h2>No workspace membership found</h2>
            <p>Use an invitation from the organisation that needs your content review access.</p>
            <Link href="/">Return to the workspace overview</Link>
          </section>
        ) : !canReview ? (
          <section className={styles.restrictedState}>
            <h2>Approval access is restricted</h2>
            <p>Your current role is <strong>{roleLabel(role)}</strong>. The approval queue is available to workspace owners, administrators, managers and invited client approvers.</p>
            <Link href="/">Return to the workspace</Link>
          </section>
        ) : (
          <>
            <section className={styles.summary} aria-label="Approval queue summary">
              <article><span>Awaiting decision</span><strong>{queueError ? '—' : pendingItems.length}</strong><small>Current queue · maximum 100 records</small></article>
              <article><span>Fresh · under 24 hours</span><strong>{queueError ? '—' : ageCounts.fresh}</strong><small>Recently submitted</small></article>
              <article><span>Waiting · 1–3 days</span><strong>{queueError ? '—' : ageCounts.waiting}</strong><small>Needs attention</small></article>
              <article><span>Long wait · 3+ days</span><strong>{queueError ? '—' : ageCounts.longWait}</strong><small>Oldest items first</small></article>
              <article><span>Brands in workspace</span><strong>{queueError ? '—' : brands.length}</strong><small>Brand scope for this workspace</small></article>
              <article><span>Your approval role</span><strong>Active</strong><small>{roleLabel(role)}</small></article>
            </section>

            <section className={styles.guardrail}>
              <strong>Approval is not publication.</strong>
              <p>Your decision is recorded in the workspace review history. Approved content remains in the publishing workflow and is not sent to a social platform by this action.</p>
            </section>

            <section className={styles.queue}>
              <div className={styles.queueHeading}>
                <div><span className={styles.eyebrow}>REVIEW QUEUE</span><h2>Content awaiting your decision</h2><p>Age is measured from the content item's last update. These age bands are operational triage indicators, not contractual response deadlines.</p></div>
                <span className={styles.queueCount}>{queueError ? 'DATA UNAVAILABLE' : `${visibleItems.length} OF ${pendingItems.length} SHOWN`}</span>
              </div>
              {!queueError && (
                <nav className={styles.ageFilters} aria-label="Filter approval queue by age">
                  <Link href={`/approvals?workspace=${activeWorkspace.id}`} aria-current={ageFilter === 'all' ? 'page' : undefined} className={ageFilter === 'all' ? styles.filterActive : ''}>All <b>{pendingItems.length}</b></Link>
                  <Link href={`/approvals?workspace=${activeWorkspace.id}&age=fresh`} aria-current={ageFilter === 'fresh' ? 'page' : undefined} className={ageFilter === 'fresh' ? styles.filterActive : ''}>Under 24h <b>{ageCounts.fresh}</b></Link>
                  <Link href={`/approvals?workspace=${activeWorkspace.id}&age=waiting`} aria-current={ageFilter === 'waiting' ? 'page' : undefined} className={ageFilter === 'waiting' ? styles.filterActive : ''}>1–3 days <b>{ageCounts.waiting}</b></Link>
                  <Link href={`/approvals?workspace=${activeWorkspace.id}&age=long_wait`} aria-current={ageFilter === 'long_wait' ? 'page' : undefined} className={ageFilter === 'long_wait' ? styles.filterActive : ''}>3+ days <b>{ageCounts.longWait}</b></Link>
                </nav>
              )}

              {queueError ? (
                <div className={styles.emptyState}><h3>Approval data could not be loaded</h3><p>Refresh the page. If the problem continues, confirm the workspace content and review migrations are applied.</p></div>
              ) : pendingItems.length === 0 ? (
                <div className={styles.emptyState}><h3>The approval queue is clear</h3><p>New submissions will appear here after the content team selects Submit for review.</p><Link href="/content">Open Content Studio</Link></div>
              ) : visibleItems.length === 0 ? (
                <div className={styles.emptyState}><h3>No items in this age group</h3><p>There are no pending items in the selected queue-age range.</p><Link href={`/approvals?workspace=${activeWorkspace.id}`}>Show all pending items</Link></div>
              ) : (
                <div className={styles.cards}>
                  {visibleItems.map((item) => {
                    const mediaUrl = safeClientApprovalMediaUrl(item.media_refs);
                    const priorReview = latestReviewByContent.get(item.id);
                    const age = getApprovalQueueAge(item.updated_at, now);
                    const ageClass = age.band === 'fresh' ? styles.ageFresh : age.band === 'waiting' ? styles.ageWaiting : age.band === 'long_wait' ? styles.ageLongWait : styles.ageUnknown;
                    return (
                      <article className={styles.card} key={item.id}>
                        <div className={styles.cardMeta}>
                          <span>{brandNames.get(item.brand_id) ?? 'Workspace brand'}</span>
                          <div className={styles.cardMetaRight}>
                            <span className={`${styles.ageBadge} ${ageClass}`}>{age.label}</span>
                            <time dateTime={item.updated_at}>Waiting since {formatDate(item.updated_at)}</time>
                          </div>
                        </div>
                        <h3>{item.title}</h3>
                        <p className={styles.copy}>{item.body}</p>
                        {mediaUrl && <a className={styles.mediaLink} href={mediaUrl} target="_blank" rel="noopener noreferrer">Open attached media in a new tab ↗</a>}
                        {priorReview && (
                          <aside className={styles.priorReview}>
                            <strong>Previous review: {priorReview.decision === 'changes_requested' ? 'Changes requested' : 'Approved'}</strong>
                            {priorReview.note && <p>{priorReview.note}</p>}
                            <time dateTime={priorReview.created_at}>{formatDate(priorReview.created_at)}</time>
                          </aside>
                        )}
                        <form action={reviewClientApproval} className={styles.reviewForm}>
                          <input type="hidden" name="workspace_id" value={activeWorkspace.id}/>
                          <input type="hidden" name="content_id" value={item.id}/>
                          <label>Review note <span>Required when requesting changes · up to 1,000 characters</span>
                            <textarea name="note" rows={3} maxLength={1000} placeholder="Record a reason, correction or approval context."/>
                          </label>
                          <div className={styles.actions}>
                            <button type="submit" name="decision" value="approved" className={styles.approve}>Approve content</button>
                            <button type="submit" name="decision" value="changes_requested" className={styles.changes}>Request changes</button>
                          </div>
                        </form>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        <footer className={styles.footer}>RUFFNECK SOCIAL HUB · WORKSPACE-BOUND REVIEW · HUMAN DECISIONS · NO AUTOMATIC PUBLICATION</footer>
      </section>
    </main>
  );
}
