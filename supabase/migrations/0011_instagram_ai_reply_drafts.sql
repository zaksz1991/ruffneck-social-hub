-- v1.4.0: local AI-assisted Instagram response drafts with mandatory human review.
-- No provider send endpoint or automatic message dispatch is created by this migration.

create table if not exists public.instagram_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  source_last_message_id uuid references public.instagram_messages(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  draft_text text not null check (length(btrim(draft_text)) between 1 and 6000),
  model text not null check (length(model) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','reviewed','discarded')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_reply_drafts_conversation_workspace_fk
    foreign key (conversation_id, workspace_id)
    references public.instagram_conversations(id, workspace_id) on delete cascade,
  constraint instagram_reply_drafts_review_state_check check (
    (status = 'reviewed' and reviewed_at is not null)
    or (status <> 'reviewed' and reviewed_at is null and reviewed_by is null)
  )
);

create index if not exists instagram_reply_drafts_conversation_recent_idx
  on public.instagram_reply_drafts(conversation_id, created_at desc);
create index if not exists instagram_reply_drafts_workspace_recent_idx
  on public.instagram_reply_drafts(workspace_id, created_at desc);

alter table public.instagram_reply_drafts enable row level security;
revoke all on public.instagram_reply_drafts from public, anon, authenticated;
grant select on public.instagram_reply_drafts to authenticated;
create policy instagram_reply_drafts_workspace_read on public.instagram_reply_drafts
for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.create_instagram_reply_draft(
  target_conversation_id uuid,
  target_source_last_message_id uuid,
  target_draft_text text,
  target_model text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  new_draft_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_draft_text is null or pg_catalog.length(pg_catalog.btrim(target_draft_text)) not between 1 and 6000 then
    raise exception 'Draft text must contain 1 to 6000 characters' using errcode = '22023';
  end if;
  if target_model is null or pg_catalog.length(pg_catalog.btrim(target_model)) not between 1 and 160 then
    raise exception 'Model identifier is invalid' using errcode = '22023';
  end if;

  select c.workspace_id into target_workspace_id
  from public.instagram_conversations c
  where c.id = target_conversation_id;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id
      and m.role in ('owner','admin','manager','publisher','client_approver')
  ) then
    raise exception 'Your workspace role cannot create reply drafts' using errcode = '42501';
  end if;
  if target_source_last_message_id is not null and not exists (
    select 1 from public.instagram_messages m
    where m.id = target_source_last_message_id and m.conversation_id = target_conversation_id
      and m.direction = 'inbound'
  ) then
    raise exception 'Source message does not belong to this conversation' using errcode = '22023';
  end if;

  insert into public.instagram_reply_drafts (
    workspace_id, conversation_id, source_last_message_id, created_by,
    updated_by, draft_text, model, status
  ) values (
    target_workspace_id, target_conversation_id, target_source_last_message_id,
    actor_id, actor_id, pg_catalog.btrim(target_draft_text), pg_catalog.btrim(target_model), 'draft'
  ) returning id into new_draft_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'instagram.reply_draft.created', 'instagram_reply_draft',
    new_draft_id::text, 'success', pg_catalog.jsonb_build_object('model', pg_catalog.btrim(target_model))
  );
  return new_draft_id;
end;
$$;

create or replace function public.update_instagram_reply_draft(
  target_draft_id uuid,
  target_draft_text text,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  current_status text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_draft_text is null or pg_catalog.length(pg_catalog.btrim(target_draft_text)) not between 1 and 6000 then
    raise exception 'Draft text must contain 1 to 6000 characters' using errcode = '22023';
  end if;
  if target_status is null or target_status not in ('draft','reviewed','discarded') then
    raise exception 'Invalid draft status' using errcode = '22023';
  end if;

  select d.workspace_id, d.status into target_workspace_id, current_status
  from public.instagram_reply_drafts d
  where d.id = target_draft_id
  for update;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Draft access denied' using errcode = '42501';
  end if;
  if current_status <> 'draft' then
    raise exception 'Only open drafts can be changed' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id
      and m.role in ('owner','admin','manager','publisher','client_approver')
  ) then
    raise exception 'Your workspace role cannot update reply drafts' using errcode = '42501';
  end if;

  update public.instagram_reply_drafts
  set draft_text = pg_catalog.btrim(target_draft_text),
      status = target_status,
      updated_by = actor_id,
      reviewed_by = case when target_status = 'reviewed' then actor_id else null end,
      reviewed_at = case when target_status = 'reviewed' then pg_catalog.now() else null end,
      updated_at = pg_catalog.now()
  where id = target_draft_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id,
    case target_status when 'reviewed' then 'instagram.reply_draft.reviewed' when 'discarded' then 'instagram.reply_draft.discarded' else 'instagram.reply_draft.updated' end,
    'instagram_reply_draft', target_draft_id::text, 'success', '{}'::jsonb
  );
end;
$$;

revoke all on function public.create_instagram_reply_draft(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_instagram_reply_draft(uuid, uuid, text, text) to authenticated;
revoke all on function public.update_instagram_reply_draft(uuid, text, text) from public, anon;
grant execute on function public.update_instagram_reply_draft(uuid, text, text) to authenticated;

comment on table public.instagram_reply_drafts is
  'Optional local-model-generated Instagram reply drafts. Drafts require human review; this table is not connected to provider sending.';
comment on function public.create_instagram_reply_draft(uuid, uuid, text, text) is
  'Creates an unsent reply draft for a conversation accessible to the authenticated workspace member.';
comment on function public.update_instagram_reply_draft(uuid, text, text) is
  'Updates or marks a draft reviewed/discarded. It does not send a provider message.';
