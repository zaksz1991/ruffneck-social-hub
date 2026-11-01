import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createContentDraft,
  reviewContentItem,
  submitContentForReview,
  updateContentDraft,
  createContentVariant,
  updateContentVariant,
  submitContentVariantForReview,
  reviewContentVariant,
} from '@/app/actions/content';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canCreateContent, canReviewContent } from '@/lib/content/validation';
import AiContentGenerator from './ai-content-generator';
import AiProviderVariantGenerator from './ai-provider-variant-generator';

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string; timezone: string };
type ContentItem = {
  id: string;
  workspace_id: string;
  brand_id: string;
  created_by: string;
  title: string;
  body: string;
  media_refs: unknown;
  status: 'draft' | 'in_review' | 'approved' | 'archived';
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
};
type Review = { id: string; content_id: string; decision: string; note: string; created_at: string };
type ContentVariant = {
  id: string; content_id: string; provider: 'instagram' | 'facebook' | 'linkedin';
  variant_name: string; body: string; media_refs: unknown;
  status: 'draft' | 'in_review' | 'approved' | 'changes_requested';
  created_by: string; last_reviewed_at: string | null; updated_at: string;
};
type VariantReview = { id: string; variant_id: string; decision: string; note: string; created_at: string };

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
  media: 'Use one public HTTPS image URL, or leave the image field blank.',
  'variant-provider': 'Choose Instagram, Facebook or LinkedIn. Other providers do not have an active publishing worker.',
  'variant-name': 'Variant names must contain 2–60 characters.',
  'variant-body': 'Variant copy must contain 1–5,000 characters.',
  'variant-media': 'Use one public HTTPS image URL, or leave the image field blank.',
  'variant-duplicate': 'A variant with that name already exists for this provider and master content.',
  'variant-create': 'The provider variant could not be created. Confirm the master content is approved and your role can create variants.',
  'variant-update': 'The provider variant could not be updated. Only draft variants or variants returned for changes can be edited.',
  'variant-submit': 'The provider variant could not be submitted for review.',
  'variant-review': 'The provider variant review could not be completed. Confirm it is awaiting review and your role can approve it.',
};

const success: Record<string, string> = {
  draft: 'Draft created and saved.',
  updated: 'Draft changes saved.',
  submitted: 'Content submitted to the approval queue.',
  approved: 'Content approved. It is not published yet.',
  changes: 'Changes requested. The item has returned to draft status.',
  'variant-created': 'Provider-specific copy saved as a draft. It must be reviewed before scheduling.',
  'variant-updated': 'Provider variant changes saved as a draft.',
  'variant-submitted': 'Provider variant submitted for review.',
  'variant-approved': 'Provider variant approved and available for matching destinations.',
  'variant-changes': 'Changes requested for the provider variant.',
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
  let variants: ContentVariant[] = [];
  let variantReviews: VariantReview[] = [];
  let variantsUnavailable = false;

  if (activeWorkspace) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id)
      .maybeSingle();
    role = member?.role ?? 'member';

    const [{ data: brandRows }, { data: contentRows }, { data: reviewRows }, variantResult, variantReviewResult] = await Promise.all([
      supabase.from('brands').select('id,name,timezone').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: true }),
      supabase.from('content_items').select('id,workspace_id,brand_id,created_by,title,body,media_refs,status,created_at,updated_at,last_reviewed_at').eq('workspace_id', activeWorkspace.id).order('updated_at', { ascending: false }).limit(100),
      supabase.from('content_reviews').select('id,content_id,decision,note,created_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }).limit(40),
      supabase.from('content_variants').select('id,content_id,provider,variant_name,body,media_refs,status,created_by,last_reviewed_at,updated_at').eq('workspace_id', activeWorkspace.id).order('updated_at', { ascending: false }).limit(250),
      supabase.from('content_variant_reviews').select('id,variant_id,decision,note,created_at').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }).limit(100),
    ]);
    brands = (brandRows ?? []) as Brand[];
    items = (contentRows ?? []) as ContentItem[];
    reviews = (reviewRows ?? []) as Review[];
    variants = (variantResult.data ?? []) as ContentVariant[];
    variantReviews = (variantReviewResult.data ?? []) as VariantReview[];
    variantsUnavailable = Boolean(variantResult.error || variantReviewResult.error);
  }

  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  const reviewByContent = new Map<string, Review>();
  for (const review of reviews) {
    if (!reviewByContent.has(review.content_id)) reviewByContent.set(review.content_id, review);
  }
  const variantByContent = new Map<string, ContentVariant[]>();
  for (const variant of variants) {
    const current = variantByContent.get(variant.content_id) ?? [];
    current.push(variant);
    variantByContent.set(variant.content_id, current);
  }
  const reviewByVariant = new Map<string, VariantReview>();
  for (const review of variantReviews) {
    if (!reviewByVariant.has(review.variant_id)) reviewByVariant.set(review.variant_id, review);
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
        {variantsUnavailable && <p className="notice error">Provider variant storage is unavailable. Apply migration 0018_provider_content_variants.sql after migration 0017 to enable cross-platform copy variants.</p>}

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
                  <label>Post copy<textarea name="body" minLength={1} maxLength={5000} required rows={5} placeholder="Write the content for this brand." /></label><label>Image URL (optional)<input name="media_url" type="url" inputMode="url" placeholder="https://your-public-image-url.jpg" /></label><p className="muted-note">Instagram auto-publishing currently supports one publicly accessible HTTPS image per post.</p>
                  <div className="content-form-footer"><small>Maximum 5,000 characters. Saving does not publish anything.</small><button type="submit" className="content-primary-button">Save draft</button></div>
                </form>
              </section>
            )}
            {canCreate && brands.length > 0 && (
              <AiContentGenerator
                workspaceId={activeWorkspace.id}
                brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
                configured={Boolean(process.env.LOCAL_AI_BASE_URL?.trim() && process.env.LOCAL_AI_MODEL?.trim())}
              />
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
                    const itemVariants = variantByContent.get(item.id) ?? [];
                    const canEdit = item.status === 'draft' && (item.created_by === user.id || ['owner', 'admin', 'manager', 'publisher'].includes(role));
                    return (
                      <article className="content-item-card" key={item.id}>
                        <div className="content-item-topline"><div className="content-item-brand"><span className="content-brand-dot">{(brandNames.get(item.brand_id) ?? 'B').slice(0, 1).toUpperCase()}</span><span>{brandNames.get(item.brand_id) ?? 'Brand'}</span><i>·</i><time dateTime={item.updated_at}>{formatDate(item.updated_at)}</time></div><span className={`content-status status-${item.status}`}>{statusLabel[item.status]}</span></div>
                        <h3>{item.title}</h3>
                        <p className="content-item-copy">{item.body}</p>
                        {latestReview && <div className={`content-review-note ${latestReview.decision === 'approved' ? 'review-approved' : 'review-changes'}`}><strong>{latestReview.decision === 'approved' ? 'Latest review: approved' : 'Latest review: changes requested'}</strong>{latestReview.note && <span>{latestReview.note}</span>}<time dateTime={latestReview.created_at}>{formatDate(latestReview.created_at)}</time></div>}

                        {canEdit && (
                          <details className="content-edit-details"><summary>Edit draft</summary><form action={updateContentDraft} className="content-edit-form"><input type="hidden" name="workspace_id" value={activeWorkspace.id} /><input type="hidden" name="content_id" value={item.id} /><label>Title<input name="title" minLength={2} maxLength={160} required defaultValue={item.title} /></label><label>Post copy<textarea name="body" minLength={1} maxLength={5000} rows={4} required defaultValue={item.body} /></label><label>Image URL (optional)<input name="media_url" type="url" inputMode="url" defaultValue={Array.isArray(item.media_refs) && typeof item.media_refs[0] === 'string' ? item.media_refs[0] : ''} placeholder="https://your-public-image-url.jpg" /></label><button type="submit" className="content-secondary-button">Save changes</button></form></details>
                        )}


                        {item.status === 'approved' && !variantsUnavailable && (
                          <section className="provider-variants-panel" aria-label={`Provider variants for ${item.title}`}>
                            <div className="provider-variants-heading"><div><span className="eyebrow">CROSS-PLATFORM COPY</span><h4>Provider-specific variants</h4><p>Each platform copy has its own review. Approved variants are frozen and used by the publishing worker for that destination.</p></div><span className="provider-variants-count">{itemVariants.length} VARIANTS</span></div>
                            {itemVariants.length > 0 && (
                              <div className="provider-variant-list">
                                {itemVariants.map((variant) => {
                                  const latestVariantReview = reviewByVariant.get(variant.id);
                                  const canEditVariant = ['draft', 'changes_requested'].includes(variant.status)
                                    && (variant.created_by === user.id || ['owner', 'admin', 'manager', 'publisher'].includes(role));
                                  const mediaUrl = Array.isArray(variant.media_refs) && typeof variant.media_refs[0] === 'string' ? variant.media_refs[0] : '';
                                  return (
                                    <article className="provider-variant-card" key={variant.id}>
                                      <div className="provider-variant-topline"><strong>{variant.variant_name}</strong><span className={`content-status variant-status-${variant.status}`}>{variant.status.replaceAll('_', ' ')}</span></div>
                                      <div className="provider-variant-meta"><span>{variant.provider.toUpperCase()}</span><span>{mediaUrl ? 'One image attached' : 'Text only'}</span><time dateTime={variant.updated_at}>{formatDate(variant.updated_at)}</time></div>
                                      <p className="content-item-copy">{variant.body}</p>
                                      {latestVariantReview && <div className={`content-review-note ${latestVariantReview.decision === 'approved' ? 'review-approved' : 'review-changes'}`}><strong>{latestVariantReview.decision === 'approved' ? 'Latest variant review: approved' : 'Latest variant review: changes requested'}</strong>{latestVariantReview.note && <span>{latestVariantReview.note}</span>}<time dateTime={latestVariantReview.created_at}>{formatDate(latestVariantReview.created_at)}</time></div>}
                                      {canEditVariant && (
                                        <details className="content-edit-details"><summary>Edit provider variant</summary><form action={updateContentVariant} className="content-edit-form">
                                          <input type="hidden" name="workspace_id" value={activeWorkspace.id} />
                                          <input type="hidden" name="variant_id" value={variant.id} />
                                          <input type="hidden" name="provider" value={variant.provider} />
                                          <label>Variant name<input name="variant_name" minLength={2} maxLength={60} required defaultValue={variant.variant_name} /></label>
                                          <label>Platform copy<textarea name="body" minLength={1} maxLength={5000} rows={4} required defaultValue={variant.body} /></label>
                                          <label>Image URL (optional)<input name="media_url" type="url" inputMode="url" defaultValue={mediaUrl} placeholder="Leave blank for text-only content" /></label>
                                          <button type="submit" className="content-secondary-button">Save variant</button>
                                        </form></details>
                                      )}
                                      <div className="content-item-actions">
                                        {['draft', 'changes_requested'].includes(variant.status) && (variant.created_by === user.id || canCreate) && <form action={submitContentVariantForReview}><input type="hidden" name="workspace_id" value={activeWorkspace.id} /><input type="hidden" name="variant_id" value={variant.id} /><button type="submit" className="content-secondary-button">Submit variant for review</button></form>}
                                        {variant.status === 'in_review' && canReview && <form action={reviewContentVariant} className="content-review-form"><input type="hidden" name="workspace_id" value={activeWorkspace.id} /><input type="hidden" name="variant_id" value={variant.id} /><input name="note" maxLength={1000} placeholder="Optional review note" aria-label="Optional variant review note" /><button type="submit" name="decision" value="approved" className="content-primary-button">Approve variant</button><button type="submit" name="decision" value="changes_requested" className="content-secondary-button">Request changes</button></form>}
                                        {variant.status === 'approved' && <span className="content-approved-hint">Approved for {variant.provider}; selected explicitly during scheduling.</span>}
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            )}
                            {canCreate && (
                              <AiProviderVariantGenerator
                                workspaceId={activeWorkspace.id}
                                contentId={item.id}
                                configured={Boolean(process.env.LOCAL_AI_BASE_URL?.trim() && process.env.LOCAL_AI_MODEL?.trim())}
                              />
                            )}
                            {canCreate && <details className="provider-variant-create"><summary>Create provider variant</summary><form action={createContentVariant} className="content-edit-form">
                              <input type="hidden" name="workspace_id" value={activeWorkspace.id} />
                              <input type="hidden" name="content_id" value={item.id} />
                              <label>Platform<select name="provider" required defaultValue="instagram"><option value="instagram">Instagram Business</option><option value="facebook">Facebook Page</option><option value="linkedin">LinkedIn Organization</option></select></label>
                              <label>Variant name<input name="variant_name" minLength={2} maxLength={60} required placeholder="e.g. Instagram short caption" /></label>
                              <label>Platform copy<textarea name="body" minLength={1} maxLength={5000} rows={4} required defaultValue={item.body} /></label>
                              <label>Image URL (optional)<input name="media_url" type="url" inputMode="url" defaultValue={Array.isArray(item.media_refs) && typeof item.media_refs[0] === 'string' ? item.media_refs[0] : ''} placeholder="Leave blank for text-only content" /></label>
                              <div className="content-form-footer"><small>Instagram and Facebook currently require one image. LinkedIn currently accepts text-only posts. Variant must be approved separately.</small><button type="submit" className="content-primary-button">Save provider variant</button></div>
                            </form></details>}
                          </section>
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
            <p className="content-studio-footnote">Master content and each provider variant require human approval. An approved variant is immutable and is selected per platform when scheduling. Scheduling creates a queue record; it does not publish immediately.</p>
          </>
        )}
      </div>
    </main>
  );
}
