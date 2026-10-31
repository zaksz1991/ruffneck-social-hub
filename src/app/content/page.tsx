import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createContentDraft,
  reviewContentItem,
  submitContentForReview,
  updateContentDraft,
} from '@/app/actions/content';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canCreateContent, canReviewContent } from '@/lib/content/validation';

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string; timezone: string };
type ContentItem = {
  id: string;
  workspace_id: string;
  brand_id: string;
  created_by: string;
  title: string;
  body: string;
  status: 'draft' | 'in_review' | 'approved' | 'archived';
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
};
type Review = { id: string; content_id: string; decision: string; note: string; created_at: string };

const statusLabel: Record<ContentItem['status'], string> = {
  draft: 'Draft',
  in_review: 'Awaiting review',
  approved: 'Approved',
  archived: 'Archived',
};

const errors: Record<string, string> = {
  input: 'Some submitted fields were invalid. Review the form and try again.',
  title: 'Titles must contain 2–160 characters.',
  body: 'Post copy must contain 1–5,000 characters.',
  create: 'The draft could not be created. Check your workspace role and selected brand.',
  update: 'The draft could not be updated. Only draft content can be edited.',
  submit: 'The item could not be submitted. It may no longer be a draft or your role may not permit submission.',
  review: 'The review action could not be completed. Confirm the item is awaiting review and your role can approve it.',
};

const success: Record<string, string> = {
  draft: 'Draft created and saved.',
  updated: 'Draft changes saved.',
  submitted: 'Content submitted to the approval queue.',
  approved: 'Content approved. It is not published yet.',
  changes: 'Changes requested. The item has returned to draft status.',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
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
  let items: ContentItem[] = [];
  let reviews: Review[] = [];

  if (activeWorkspace) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id)
      .maybeSingle();
    role = member?.role ?? 'member';

    const [{ data: brandRows }, { data: contentRows }, { data: reviewRows }] = await Promise.all([
      supabase.from('brands').select('id,name,timezone').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: true }),
      supabase.from('content_items').select('id,workspace_id,brand_id,created_by,title,body,status,created_at,updated_at,last_reviewed_at').eq('workspace_id', activeWorkspace.id).order('updated_at', { ascending: false }).limit(100),
      supabase.from('content_reviews').select('id,content_id,decision,note,created_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }).limit(40),
    ]);
    brands = (brandRows ?? []) as Brand[];
    items = (contentRows ?? []) as ContentItem[];
    reviews = (reviewRows ?? []) as Review[];
  }

  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  const reviewByContent = new Map<string, Review>();
  for (const review of reviews) {
    if (!reviewByContent.has(review.content_id)) reviewByContent.set(review.content_id, review);
  }
  const canCreate = canCreateContent(role);
  const canReview = canReviewContent(role);

  return (
    <main className="content-studio-shell">
      <header className="content-studio-topbar">
        <Link href="/" className="content-studio-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
        <nav aria-label="Primary"><Link href="/">Overview</Link><span>Content Studio</span><Link href="/publishing">Publishing Queue</Link></nav>
        <Link className="content-studio-back" href="/">Back to workspace</Link>
      </header>

      <div className="content-studio-main">
        <div className="content-studio-heading">
          <div>
            <span className="eyebrow">PUBLISH &amp; ENGAGE</span>
            <h1>Content Studio</h1>
            <p>Prepare brand content, request review and record approval before publishing.</p>
          </div>
          <div className="content-workspace-chip"><span>WORKSPACE</span><strong>{activeWorkspace?.name ?? 'No workspace available'}</strong><small>{role.toUpperCase()}</small></div>
        </div>

        {params.error && <p className="notice error">{errors[params.error] ?? 'The requested content operation failed.'}</p>}
        {params.saved && <p className="notice success">{success[params.saved] ?? 'Content updated.'}</p>}

        {!activeWorkspace ? (
          <section className="content-empty-workspace"><h2>No workspace available</h2><p>Create or join a workspace before preparing content.</p><Link className="content-primary-button" href="/">Return to workspace setup</Link></section>
        ) : (
          <>
            <section className="content-stats" aria-label="Content workflow summary">
              <article><span>Total items</span><strong>{items.length}</strong></article>
              <article><span>Drafts</span><strong>{items.filter((item) => item.status === 'draft').length}</strong></article>
              <article><span>Awaiting review</span><strong>{items.filter((item) => item.status === 'in_review').length}</strong></article>
              <article><span>Approved</span><strong>{items.filter((item) => item.status === 'approved').length}</strong></article>
            </section>

            {canCreate && brands.length > 0 && (
              <section className="content-compose-card">
                <div className="content-section-heading"><div><span className="eyebrow">NEW CONTENT</span><h2>Prepare a post</h2><p>Save a draft first. Submission moves it into the workspace approval queue.</p></div><span className="content-safety-tag">HUMAN APPROVAL REQUIRED</span></div>
                <form action={createContentDraft} className="content-compose-form">
                  <input type="hidden" name="workspace_id" value={activeWorkspace.id} />
                  <label>Brand<select name="brand_id" required defaultValue={brands[0]?.id}>{brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
                  <label>Post title<input name="title" minLength={2} maxLength={160} required placeholder="Give this post a working title" /></label>
                  <label>Post copy<textarea name="body" minLength={1} maxLength={5000} required rows={5} placeholder="Write the content for this brand. Platform-specific formatting and media will be added when official channels are connected." /></label>
                  <div className="content-form-footer"><small>Maximum 5,000 characters. Saving does not publish anything.</small><button type="submit" className="content-primary-button">Save draft</button></div>
                </form>
              </section>
            )}
            {canCreate && brands.length === 0 && <p className="content-inline-warning">Add a brand to this workspace before creating content.</p>}

            <section className="content-list-section">
              <div className="content-section-heading"><div><span className="eyebrow">WORKSPACE LIBRARY</span><h2>Content workflow</h2><p>Review state is stored in Supabase and scoped to the active workspace.</p></div><span className="content-result-count">{items.length} ITEMS</span></div>
              {items.length === 0 ? (
                <div className="content-empty-state"><div className="content-empty-icon">✎</div><h3>No content yet</h3><p>Your drafts, review queue and approved items will appear here.</p></div>
              ) : (
                <div className="content-item-list">
                  {items.map((item) => {
                    const latestReview = reviewByContent.get(item.id);
                    const canEdit = item.status === 'draft' && (item.created_by === user.id || ['owner', 'admin', 'manager', 'publisher'].includes(role));
                    return (
                      <article className="content-item-card" key={item.id}>
                        <div className="content-item-topline"><div className="content-item-brand"><span className="content-brand-dot">{(brandNames.get(item.brand_id) ?? 'B').slice(0, 1).toUpperCase()}</span><span>{brandNames.get(item.brand_id) ?? 'Brand'}</span><i>·</i><time dateTime={item.updated_at}>{formatDate(item.updated_at)}</time></div><span className={`content-status status-${item.status}`}>{statusLabel[item.status]}</span></div>
                        <h3>{item.title}</h3>
                        <p className="content-item-copy">{item.body}</p>
                        {latestReview && <div className={`content-review-note ${latestReview.decision === 'approved' ? 'review-approved' : 'review-changes'}`}><strong>{latestReview.decision === 'approved' ? 'Latest review: approved' : 'Latest review: changes requested'}</strong>{latestReview.note && <span>{latestReview.note}</span>}<time dateTime={latestReview.created_at}>{formatDate(latestReview.created_at)}</time></div>}

                        {canEdit && (
                          <details className="content-edit-details"><summary>Edit draft</summary><form action={updateContentDraft} className="content-edit-form"><input type="hidden" name="workspace_id" value={activeWorkspace.id} /><input type="hidden" name="content_id" value={item.id} /><label>Title<input name="title" minLength={2} maxLength={160} required defaultValue={item.title} /></label><label>Post copy<textarea name="body" minLength={1} maxLength={5000} rows={4} required defaultValue={item.body} /></label><button type="submit" className="content-secondary-button">Save changes</button></form></details>
                        )}

                        <div className="content-item-actions">
                          {item.status === 'draft' && (item.created_by === user.id || ['owner', 'admin', 'manager', 'publisher'].includes(role)) && <form action={submitContentForReview}><input type="hidden" name="workspace_id" value={activeWorkspace.id} /><input type="hidden" name="content_id" value={item.id} /><button type="submit" className="content-secondary-button">Submit for review</button></form>}
                          {item.status === 'in_review' && canReview && <form action={reviewContentItem} className="content-review-form"><input type="hidden" name="workspace_id" value={activeWorkspace.id} /><input type="hidden" name="content_id" value={item.id} /><input name="note" maxLength={1000} placeholder="Optional review note" aria-label="Optional review note" /><button type="submit" name="decision" value="approved" className="content-primary-button">Approve</button><button type="submit" name="decision" value="changes_requested" className="content-secondary-button">Request changes</button></form>}
                          {item.status === 'approved' && <span className="content-approved-hint">Approved for a future publishing step · Not published</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <p className="content-studio-footnote">No social network is connected by this workflow. Approval records readiness only; it does not create a publishing job or send content to a platform.</p>
          </>
        )}
      </div>
    </main>
  );
}
