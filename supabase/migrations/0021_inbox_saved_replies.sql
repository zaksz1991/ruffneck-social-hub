-- v3.2.0: reusable workspace-owned response templates for the unified inbox.
-- Templates create ordinary unsent drafts. They do not call social provider APIs.

create table if not exists public.inbox_saved_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_scope text not null default 'all' check (provider_scope in ('all', 'instagram', 'facebook')),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 2 and 80),
  body text not null check (pg_catalog.length(pg_catalog.btrim(body)) between 1 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inbox_saved_replies_workspace_scope_title_uq
  on public.inbox_saved_replies (workspace_id, provider_scope, pg_catalog.lower(title));
create index if not exists inbox_saved_replies_workspace_scope_recent_idx
  on public.inbox_saved_replies (workspace_id, provider_scope, updated_at desc);

alter table public.inbox_saved_replies enable row level security;
revoke all on public.inbox_saved_replies from public, anon, authenticated;
grant select on public.inbox_saved_replies to authenticated;

drop policy if exists inbox_saved_replies_workspace_read on public.inbox_saved_replies;
create policy inbox_saved_replies_workspace_read on public.inbox_saved_replies
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.save_inbox_saved_reply(
  target_workspace_id uuid,
  target_saved_reply_id uuid,
  target_provider_scope text,
  target_title text,
  target_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  saved_reply_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null or target_provider_scope is null
     or target_provider_scope not in ('all', 'instagram', 'facebook')
     or target_title is null or pg_catalog.length(pg_catalog.btrim(target_title)) not between 2 and 80
     or target_body is null or pg_catalog.length(pg_catalog.btrim(target_body)) not between 1 and 2000 then
    raise exception 'Saved reply input is invalid' using errcode = '22023';
  end if;

  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can manage saved replies' using errcode = '42501';
  end if;

  if target_saved_reply_id is null then
    insert into public.inbox_saved_replies (
      workspace_id, provider_scope, title, body, created_by, updated_by
    ) values (
      target_workspace_id, target_provider_scope, pg_catalog.btrim(target_title), pg_catalog.btrim(target_body), actor_id, actor_id
    ) returning id into saved_reply_id;
  else
    update public.inbox_saved_replies
    set provider_scope = target_provider_scope,
        title = pg_catalog.btrim(target_title),
        body = pg_catalog.btrim(target_body),
        updated_by = actor_id,
        updated_at = pg_catalog.now()
    where id = target_saved_reply_id and workspace_id = target_workspace_id
    returning id into saved_reply_id;
    if saved_reply_id is null then raise exception 'Saved reply not found in this workspace' using errcode = 'P0002'; end if;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id,
    case when target_saved_reply_id is null then 'inbox.saved_reply.created' else 'inbox.saved_reply.updated' end,
    'inbox_saved_reply', saved_reply_id::text, 'success',
    pg_catalog.jsonb_build_object('provider_scope', target_provider_scope)
  );
  return saved_reply_id;
end;
$$;

create or replace function public.delete_inbox_saved_reply(target_saved_reply_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  actor_role text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select r.workspace_id into target_workspace_id from public.inbox_saved_replies r
  where r.id = target_saved_reply_id for update;
  if target_workspace_id is null then raise exception 'Saved reply not found' using errcode = 'P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can manage saved replies' using errcode = '42501';
  end if;
  delete from public.inbox_saved_replies where id = target_saved_reply_id and workspace_id = target_workspace_id;
  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.saved_reply.deleted', 'inbox_saved_reply', target_saved_reply_id::text, 'success', '{}'::jsonb
  );
end;
$$;

create or replace function public.create_inbox_saved_reply_draft(
  target_provider text,
  target_conversation_id uuid,
  target_saved_reply_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  actor_role text;
  reply_scope text;
  reply_title text;
  reply_body text;
  latest_message_id uuid;
  latest_direction text;
  new_draft_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook')
     or target_conversation_id is null or target_saved_reply_id is null then
    raise exception 'Saved reply draft input is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
    from public.instagram_conversations c where c.id = target_conversation_id for update;
  else
    select c.workspace_id into target_workspace_id
    from public.facebook_conversations c where c.id = target_conversation_id for update;
  end if;
  if target_workspace_id is null then raise exception 'Conversation not found' using errcode = 'P0002'; end if;

  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher', 'client_approver') then
    raise exception 'Your workspace role cannot create reply drafts' using errcode = '42501';
  end if;

  select r.provider_scope, r.title, r.body into reply_scope, reply_title, reply_body
  from public.inbox_saved_replies r
  where r.id = target_saved_reply_id and r.workspace_id = target_workspace_id for share;
  if reply_body is null or reply_scope not in ('all', target_provider) then
    raise exception 'Saved reply not found or unavailable for this channel' using errcode = 'P0002';
  end if;

  if target_provider = 'instagram' then
    select m.id, m.direction into latest_message_id, latest_direction
    from public.instagram_messages m where m.conversation_id = target_conversation_id
    order by m.provider_sent_at desc, m.received_at desc limit 1;
    if latest_message_id is null or latest_direction is distinct from 'inbound' then
      raise exception 'The latest conversation message must be inbound' using errcode = '22023';
    end if;
    insert into public.instagram_reply_drafts (
      workspace_id, conversation_id, source_last_message_id, created_by,
      updated_by, draft_text, model, status
    ) values (
      target_workspace_id, target_conversation_id, latest_message_id, actor_id,
      actor_id, pg_catalog.btrim(reply_body), 'saved_reply:' || reply_title, 'draft'
    ) returning id into new_draft_id;
    insert into public.audit_events (
      workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
    ) values (
      target_workspace_id, actor_id, 'instagram.reply_draft.created', 'instagram_reply_draft',
      new_draft_id::text, 'success', pg_catalog.jsonb_build_object('source', 'saved_reply', 'saved_reply_id', target_saved_reply_id)
    );
  else
    select m.id, m.direction into latest_message_id, latest_direction
    from public.facebook_messages m where m.conversation_id = target_conversation_id
    order by m.provider_sent_at desc, m.received_at desc limit 1;
    if latest_message_id is null or latest_direction is distinct from 'inbound' then
      raise exception 'The latest conversation message must be inbound' using errcode = '22023';
    end if;
    insert into public.facebook_reply_drafts (
      workspace_id, conversation_id, source_last_message_id, created_by,
      updated_by, draft_text, model, status
    ) values (
      target_workspace_id, target_conversation_id, latest_message_id, actor_id,
      actor_id, pg_catalog.btrim(reply_body), 'saved_reply:' || reply_title, 'draft'
    ) returning id into new_draft_id;
    insert into public.audit_events (
      workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
    ) values (
      target_workspace_id, actor_id, 'facebook.reply_draft.created', 'facebook_reply_draft',
      new_draft_id::text, 'success', pg_catalog.jsonb_build_object('source', 'saved_reply', 'saved_reply_id', target_saved_reply_id)
    );
  end if;

  return new_draft_id;
end;
$$;

revoke all on function public.save_inbox_saved_reply(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.delete_inbox_saved_reply(uuid) from public, anon;
revoke all on function public.create_inbox_saved_reply_draft(text, uuid, uuid) from public, anon;
grant execute on function public.save_inbox_saved_reply(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.delete_inbox_saved_reply(uuid) to authenticated;
grant execute on function public.create_inbox_saved_reply_draft(text, uuid, uuid) to authenticated;

comment on table public.inbox_saved_replies is 'Workspace-private reusable response templates. A template is copied into an unsent draft; the table never sends provider messages.';
comment on function public.save_inbox_saved_reply(uuid, uuid, text, text, text) is 'Creates or updates an inbox saved reply for a workspace owner, admin or manager.';
comment on function public.delete_inbox_saved_reply(uuid) is 'Deletes an inbox saved reply after checking workspace manager permissions.';
comment on function public.create_inbox_saved_reply_draft(text, uuid, uuid) is 'Atomically creates an unsent provider draft from a workspace saved reply, rechecking channel scope, role and latest inbound message.';
