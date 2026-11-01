-- v3.1.0: Team inbox workflow for Instagram and Facebook Messenger.
-- Apply once after 0019_brand_voice_profiles.sql. No provider API access is added.

create table if not exists public.inbox_conversation_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  conversation_id uuid not null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_conversation_workflows_provider_conversation_unique unique (workspace_id, provider, conversation_id),
  constraint inbox_conversation_workflows_id_workspace_unique unique (id, workspace_id)
);

create index if not exists inbox_conversation_workflows_queue_idx
  on public.inbox_conversation_workflows (workspace_id, status, priority, updated_at desc);
create index if not exists inbox_conversation_workflows_assignee_idx
  on public.inbox_conversation_workflows (workspace_id, assigned_to, status, updated_at desc);

create table if not exists public.inbox_internal_notes (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  constraint inbox_internal_notes_workflow_workspace_fk
    foreign key (workflow_id, workspace_id)
    references public.inbox_conversation_workflows(id, workspace_id) on delete cascade
);

create index if not exists inbox_internal_notes_workflow_recent_idx
  on public.inbox_internal_notes (workflow_id, created_at desc);

alter table public.inbox_conversation_workflows enable row level security;
alter table public.inbox_internal_notes enable row level security;
revoke all on public.inbox_conversation_workflows, public.inbox_internal_notes from public, anon, authenticated;
grant select on public.inbox_conversation_workflows, public.inbox_internal_notes to authenticated;

drop policy if exists inbox_workflows_workspace_read on public.inbox_conversation_workflows;
create policy inbox_workflows_workspace_read on public.inbox_conversation_workflows
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists inbox_internal_notes_workspace_read on public.inbox_internal_notes;
create policy inbox_internal_notes_workspace_read on public.inbox_internal_notes
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.set_inbox_conversation_workflow(
  target_provider text,
  target_conversation_id uuid,
  target_assigned_to uuid,
  target_status text,
  target_priority text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  target_workspace_id uuid;
  effective_assignee uuid;
  workflow_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook') or target_conversation_id is null
     or target_status is null or target_status not in ('open', 'pending', 'resolved')
     or target_priority is null or target_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Conversation workflow input is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
    from public.instagram_conversations c where c.id = target_conversation_id;
  else
    select c.workspace_id into target_workspace_id
    from public.facebook_conversations c where c.id = target_conversation_id;
  end if;
  if target_workspace_id is null then raise exception 'Conversation not found' using errcode = 'P0002'; end if;

  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot update inbox workflow' using errcode = '42501';
  end if;

  if actor_role in ('owner', 'admin', 'manager') then
    effective_assignee := target_assigned_to;
    if effective_assignee is not null and not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = target_workspace_id and m.user_id = effective_assignee
    ) then
      raise exception 'Assignee must be a member of this workspace' using errcode = '22023';
    end if;
  else
    -- Publishers may update status and priority but cannot assign or reassign work.
    effective_assignee := null;
  end if;

  insert into public.inbox_conversation_workflows (
    workspace_id, provider, conversation_id, assigned_to, status, priority, updated_by
  ) values (
    target_workspace_id, target_provider, target_conversation_id, effective_assignee,
    target_status, target_priority, actor_id
  )
  on conflict (workspace_id, provider, conversation_id) do update set
    assigned_to = case when actor_role in ('owner', 'admin', 'manager')
      then excluded.assigned_to else inbox_conversation_workflows.assigned_to end,
    status = excluded.status,
    priority = excluded.priority,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into workflow_id;

  return workflow_id;
end;
$$;

create or replace function public.add_inbox_internal_note(
  target_provider text,
  target_conversation_id uuid,
  target_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  workflow_id uuid;
  note_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook') or target_conversation_id is null
     or target_body is null or pg_catalog.length(pg_catalog.btrim(target_body)) not between 1 and 3000 then
    raise exception 'Internal note input is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
    from public.instagram_conversations c where c.id = target_conversation_id;
  else
    select c.workspace_id into target_workspace_id
    from public.facebook_conversations c where c.id = target_conversation_id;
  end if;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  insert into public.inbox_conversation_workflows (
    workspace_id, provider, conversation_id, updated_by
  ) values (
    target_workspace_id, target_provider, target_conversation_id, actor_id
  )
  on conflict (workspace_id, provider, conversation_id) do update set
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into workflow_id;

  insert into public.inbox_internal_notes (workflow_id, workspace_id, author_user_id, body)
  values (workflow_id, target_workspace_id, actor_id, pg_catalog.btrim(target_body))
  returning id into note_id;
  return note_id;
end;
$$;

revoke all on function public.set_inbox_conversation_workflow(text, uuid, uuid, text, text) from public, anon;
revoke all on function public.add_inbox_internal_note(text, uuid, text) from public, anon;
grant execute on function public.set_inbox_conversation_workflow(text, uuid, uuid, text, text) to authenticated;
grant execute on function public.add_inbox_internal_note(text, uuid, text) to authenticated;

comment on table public.inbox_conversation_workflows is 'Workspace-private status, priority and assignment metadata for Instagram and Facebook conversations. No customer message content is duplicated.';
comment on table public.inbox_internal_notes is 'Private team-only notes linked to a conversation workflow. Notes are never sent to social providers.';
