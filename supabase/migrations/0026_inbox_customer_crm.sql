-- RuffNeck Social Hub v3.9.0: workspace-scoped CRM records for verified inbox participants.
-- A profile is scoped to one connected social account and provider participant ID.
-- The system never merges identities across providers or connected accounts automatically.

create table if not exists public.inbox_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  conversation_id uuid not null,
  participant_provider_id text not null check (length(btrim(participant_provider_id)) between 1 and 128),
  display_label text check (display_label is null or length(btrim(display_label)) between 2 and 100),
  relationship_stage text not null default 'lead'
    check (relationship_stage in ('lead', 'prospect', 'customer', 'vip', 'at_risk', 'former_customer')),
  tags text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, social_account_id, participant_provider_id),
  unique (workspace_id, provider, conversation_id),
  unique (id, workspace_id),
  constraint inbox_customer_profile_tags_limit check (cardinality(tags) <= 12)
);

create index if not exists inbox_customer_profiles_workspace_updated_idx
  on public.inbox_customer_profiles(workspace_id, updated_at desc);
create index if not exists inbox_customer_profiles_workspace_stage_idx
  on public.inbox_customer_profiles(workspace_id, relationship_stage, updated_at desc);

create table if not exists public.inbox_customer_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  note_text text not null check (length(btrim(note_text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint inbox_customer_notes_profile_workspace_fk
    foreign key (profile_id, workspace_id)
    references public.inbox_customer_profiles(id, workspace_id) on delete cascade
);
create index if not exists inbox_customer_notes_profile_recent_idx
  on public.inbox_customer_notes(profile_id, created_at desc);

alter table public.inbox_customer_profiles enable row level security;
alter table public.inbox_customer_notes enable row level security;
revoke all on public.inbox_customer_profiles, public.inbox_customer_notes from public, anon, authenticated;
grant select on public.inbox_customer_profiles, public.inbox_customer_notes to authenticated;

create policy inbox_customer_profiles_workspace_read
  on public.inbox_customer_profiles for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Internal CRM notes are visible only to operational roles, not analysts or client approvers.
create policy inbox_customer_notes_operational_read
  on public.inbox_customer_notes for select to authenticated
  using (exists (
    select 1 from public.workspace_members m
    where m.workspace_id = inbox_customer_notes.workspace_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'manager', 'publisher')
  ));

create or replace function public.save_inbox_customer_profile(
  target_provider text,
  target_conversation_id uuid,
  target_display_label text,
  target_relationship_stage text,
  target_tags text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  target_social_account_id uuid;
  target_participant_provider_id text;
  actor_role text;
  clean_label text := nullif(pg_catalog.btrim(coalesce(target_display_label, '')), '');
  clean_tags text[] := array[]::text[];
  saved_profile_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook') or target_conversation_id is null then
    raise exception 'Choose a valid supported conversation' using errcode = '22023';
  end if;
  if clean_label is not null and pg_catalog.length(clean_label) not between 2 and 100 then
    raise exception 'Customer label must contain 2 to 100 characters' using errcode = '22023';
  end if;
  if target_relationship_stage is null or target_relationship_stage not in ('lead', 'prospect', 'customer', 'vip', 'at_risk', 'former_customer') then
    raise exception 'Customer relationship stage is invalid' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(coalesce(target_tags, array[]::text[])) > 12 then
    raise exception 'A customer may have at most 12 tags' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(coalesce(target_tags, array[]::text[])) as t(value)
    where t.value is null
       or pg_catalog.length(pg_catalog.btrim(t.value)) not between 1 and 24
       or pg_catalog.btrim(t.value) !~ '^[[:alnum:]][[:alnum:] _-]{0,23}$'
  ) then
    raise exception 'Customer tags may contain letters, numbers, spaces, underscores and hyphens only' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.array_agg(distinct pg_catalog.lower(pg_catalog.btrim(t.value))), array[]::text[])
    into clean_tags
    from pg_catalog.unnest(coalesce(target_tags, array[]::text[])) as t(value);

  if target_provider = 'instagram' then
    select c.workspace_id, c.social_account_id, c.participant_provider_id
      into target_workspace_id, target_social_account_id, target_participant_provider_id
      from public.instagram_conversations c
      where c.id = target_conversation_id;
  else
    select c.workspace_id, c.social_account_id, c.participant_provider_id
      into target_workspace_id, target_social_account_id, target_participant_provider_id
      from public.facebook_conversations c
      where c.id = target_conversation_id;
  end if;
  if target_workspace_id is null or target_social_account_id is null or target_participant_provider_id is null then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  select m.role::text into actor_role
    from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot manage customer records' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.social_accounts a
    where a.id = target_social_account_id
      and a.workspace_id = target_workspace_id
      and a.provider = target_provider
  ) then
    raise exception 'Conversation account does not match its workspace or provider' using errcode = '22023';
  end if;

  insert into public.inbox_customer_profiles (
    workspace_id, provider, social_account_id, conversation_id, participant_provider_id,
    display_label, relationship_stage, tags, created_by, updated_by
  ) values (
    target_workspace_id, target_provider, target_social_account_id, target_conversation_id, target_participant_provider_id,
    clean_label, target_relationship_stage, clean_tags, actor_id, actor_id
  )
  on conflict (workspace_id, provider, social_account_id, participant_provider_id)
  do update set
    conversation_id = excluded.conversation_id,
    display_label = excluded.display_label,
    relationship_stage = excluded.relationship_stage,
    tags = excluded.tags,
    updated_by = actor_id,
    updated_at = pg_catalog.now()
  returning id into saved_profile_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.customer_profile.saved', 'inbox_customer_profile',
    saved_profile_id::text, 'success',
    pg_catalog.jsonb_build_object('provider', target_provider, 'relationship_stage', target_relationship_stage, 'tag_count', pg_catalog.cardinality(clean_tags))
  );
  return saved_profile_id;
end;
$$;
revoke all on function public.save_inbox_customer_profile(text, uuid, text, text, text[]) from public, anon;
grant execute on function public.save_inbox_customer_profile(text, uuid, text, text, text[]) to authenticated;

create or replace function public.add_inbox_customer_note(
  target_profile_id uuid,
  target_note_text text
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
  clean_note text := pg_catalog.btrim(coalesce(target_note_text, ''));
  saved_note_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_profile_id is null or pg_catalog.length(clean_note) not between 1 and 2000 then
    raise exception 'Customer note must contain 1 to 2,000 characters' using errcode = '22023';
  end if;
  select p.workspace_id into target_workspace_id
    from public.inbox_customer_profiles p where p.id = target_profile_id;
  if target_workspace_id is null then raise exception 'Customer profile not found' using errcode = 'P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot add internal customer notes' using errcode = '42501';
  end if;

  insert into public.inbox_customer_notes(workspace_id, profile_id, author_user_id, note_text)
    values (target_workspace_id, target_profile_id, actor_id, clean_note)
    returning id into saved_note_id;
  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.customer_note.added', 'inbox_customer_note',
    saved_note_id::text, 'success', pg_catalog.jsonb_build_object('profile_id', target_profile_id)
  );
  return saved_note_id;
end;
$$;
revoke all on function public.add_inbox_customer_note(uuid, text) from public, anon;
grant execute on function public.add_inbox_customer_note(uuid, text) to authenticated;

comment on table public.inbox_customer_profiles is
  'Manual CRM metadata for a participant within one provider-connected social account. Identities are not auto-merged across accounts or providers.';
comment on table public.inbox_customer_notes is
  'Append-only internal notes visible only to workspace operational roles; never sent to social providers.';
