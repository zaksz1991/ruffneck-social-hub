import Link from 'next/link';
import { createInboxDraftFromSavedReply } from '@/app/actions/inbox';

export type InboxSavedReply = {
  id: string;
  provider_scope: 'all' | 'instagram' | 'facebook';
  title: string;
  body: string;
  updated_at: string;
};

export default function SavedReplyPicker({
  provider,
  conversationId,
  replies,
  canUse,
  hasLatestInbound,
}: {
  provider: 'instagram' | 'facebook';
  conversationId: string;
  replies: InboxSavedReply[];
  canUse: boolean;
  hasLatestInbound: boolean;
}) {
  const visibleReplies = replies.filter((reply) => reply.provider_scope === 'all' || reply.provider_scope === provider);
  return <section className="saved-reply-picker">
    <div className="saved-reply-picker-heading">
      <div><span className="eyebrow">REUSABLE RESPONSES</span><h2>Saved replies</h2><p>Choose a team-approved template to create an editable, unsent draft.</p></div>
      <Link href="/inbox/saved-replies">Manage library</Link>
    </div>
    {!canUse ? <p className="saved-reply-empty">Your workspace role does not allow creating reply drafts.</p>
      : !hasLatestInbound ? <p className="saved-reply-empty">A saved reply can be used after the latest message is received from the customer.</p>
      : visibleReplies.length === 0 ? <p className="saved-reply-empty">No saved replies are available for this channel. Add templates in the library.</p>
      : <div className="saved-reply-grid">{visibleReplies.map((reply) => <article className="saved-reply-card" key={reply.id}>
        <div><strong>{reply.title}</strong><span>{reply.provider_scope === 'all' ? 'All channels' : reply.provider_scope.toUpperCase()}</span></div>
        <p>{reply.body}</p>
        <form action={createInboxDraftFromSavedReply}>
          <input type="hidden" name="provider" value={provider}/>
          <input type="hidden" name="conversation_id" value={conversationId}/>
          <input type="hidden" name="saved_reply_id" value={reply.id}/>
          <button type="submit">Create reply draft</button>
        </form>
      </article>)}</div>}
    <p className="saved-reply-safety">Creating a draft does not send a message. Facebook replies still require human review, valid Page permissions and the active response window. Instagram replies remain unsent drafts.</p>
  </section>;
}
