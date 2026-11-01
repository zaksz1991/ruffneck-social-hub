import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (name) => {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) throw new Error(`Required saved-reply file is missing: ${name}`);
  return fs.readFileSync(file, 'utf8');
};
const migration = read('supabase/migrations/0021_inbox_saved_replies.sql');
const actions = read('src/app/actions/inbox.ts');
const page = read('src/app/inbox/saved-replies/page.tsx');
const picker = read('src/app/inbox/saved-reply-picker.tsx');
const instagram = read('src/app/inbox/conversations/[id]/page.tsx');
const facebook = read('src/app/inbox/facebook/[id]/page.tsx');
const shared = read('src/lib/inbox/saved-replies.ts');
const checks = [
  ['workspace-owned template table', /workspace_id uuid not null references public\.workspaces\(id\)/.test(migration)],
  ['provider scope constrained to supported channels', /provider_scope in \('all', 'instagram', 'facebook'\)/.test(migration)],
  ['title and body database bounds', /length\(pg_catalog\.btrim\(title\)\) between 2 and 80/.test(migration) && /length\(pg_catalog\.btrim\(body\)\) between 1 and 2000/.test(migration)],
  ['workspace member read policy', /inbox_saved_replies_workspace_read[\s\S]*?public\.is_workspace_member\(workspace_id\)/.test(migration)],
  ['browser writes revoked', /revoke all on public\.inbox_saved_replies from public, anon, authenticated/.test(migration)],
  ['manager-only write RPC', /actor_role not in \('owner', 'admin', 'manager'\)/.test(migration)],
  ['security definer RPCs use empty search path', (migration.match(/security definer\nset search_path = ''/g) ?? []).length === 3],
  ['audit metadata excludes reply body', /jsonb_build_object\('provider_scope', target_provider_scope\)/.test(migration)],
  ['server actions use validated input and protected RPCs', /validateSavedReplyInput/.test(actions) && /save_inbox_saved_reply/.test(actions) && /delete_inbox_saved_reply/.test(actions)],
  ['template draft reuses existing provider draft RPCs', /create_inbox_saved_reply_draft/.test(actions) && /create_inbox_saved_reply_draft/.test(migration)],
  ['saved reply action checks latest inbound message', /latest_direction is distinct from 'inbound'/.test(migration)],
  ['draft creation locks the conversation and selected template during its transaction', /from public\.instagram_conversations c where c\.id = target_conversation_id for update/.test(migration) && /from public\.facebook_conversations c where c\.id = target_conversation_id for update/.test(migration) && /where r\.id = target_saved_reply_id and r\.workspace_id = target_workspace_id for share/.test(migration)],
  ['picker creates drafts without provider send action', /createInboxDraftFromSavedReply/.test(picker) && !/sendFacebookReplyDraft/.test(picker)],
  ['library route provides create, update and delete UI', /saveInboxSavedReply/.test(page) && /deleteInboxSavedReply/.test(page)],
  ['Instagram thread has provider-scoped picker', /SavedReplyPicker provider="instagram"/.test(instagram)],
  ['Facebook thread has provider-scoped picker', /SavedReplyPicker provider="facebook"/.test(facebook)],
  ['validation helper rejects unsupported provider scopes', /!\['all', 'instagram', 'facebook'\]\.includes\(providerScope\)/.test(shared)],
];
const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  for (const [name] of failed) console.error(`Saved-reply integration audit failed: ${name}`);
  process.exit(1);
}
console.log(`Saved-reply integration audit passed: ${checks.length} security and integration contracts checked.`);
