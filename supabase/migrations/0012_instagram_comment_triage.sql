-- v1.5.0: workspace-isolated Instagram comment triage and unsent AI reply drafts.
-- This migration does not send replies, hide comments, delete comments, or change Instagram state.

create table if not exists public.instagram_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  provider_comment_id text not null check (length(provider_comment_id) between 1 and 255),
  media_provider_id text not null check (length(media_provider_id) between 1 and 255),
  parent_provider_comment_id text check (parent_provider_comment_id is null or length(parent_provider_comment_id) between 1 and 255),
  commenter_provider_id text check (commenter_provider_id is null or length(commenter_provider_id) between 1 and 255),
  commenter_username text check (commenter_username is null or length(commenter_username) between 1 and 100),
  comment_text text not null check (length(btrim(comment_text)) between 1 and 5000),
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  triage_status text not null default 'new' check (triage_status in ('new','reviewed','ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, provider_comment_id),
  unique (id, workspace_id)
);

create index if not exists instagram_comments_workspace_recent_idx
  on public.instagram_comments(workspace_id, provider_created_at desc);
create index if not exists instagram_comments_account_media_idx
  on public.instagram_comments(social_account_id, media_provider_id, provider_created_at desc);
create index if not exists instagram_comments_workspace_triage_idx
  on public.instagram_comments(workspace_id, triage_status, provider_created_at desc);

create table if not exists public.instagram_comment_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instagram_comment_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  draft_text text not null check (length(btrim(draft_text)) between 1 and 6000),
  model text not null check (length(model) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','reviewed','discarded')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_comment_reply_drafts_comment_workspace_fk
    foreign key (instagram_comment_id, workspace_id)
    references public.instagram_comments(id, workspace_id) on delete cascade,
  constraint instagram_comment_reply_drafts_review_state_check check (
    (status = 'reviewed' and reviewed_at is not null and reviewed_by is not null)
    or (status <> 'reviewed' and reviewed_at is null and reviewed_by is null)
  )
);

create index if not exists instagram_comment_reply_drafts_comment_recent_idx
  on public.instagram_comment_reply_drafts(instagram_comment_id, created_at desc);
create index if not exists instagram_comment_reply_drafts_workspace_recent_idx
  on public.instagram_comment_reply_drafts(workspace_id, created_at desc);

alter table public.instagram_comments enable row level security;
alter table public.instagram_comment_reply_drafts enable row level security;
revoke all on public.instagram_comments, public.instagram_comment_reply_drafts from public, anon, authenticated;
grant select on public.instagram_comments, public.instagram_comment_reply_drafts to authenticated;

create policy instagram_comments_workspace_read on public.instagram_comments
for select to authenticated using (public.is_workspace_member(workspace_id));
create policy instagram_comment_reply_drafts_workspace_read on public.instagram_comment_reply_drafts
for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.set_instagram_comment_triage_status(
  target_comment_id uuid,
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
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_status is null or target_status not in ('new','reviewed','ignored') then
    raise exception 'Invalid comment triage status' using errcode = '22023';
  end if;

  select c.workspace_id into target_workspace_id
  from public.instagram_comments c
  where c.id = target_comment_id
  for update;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Comment access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id
      and m.role in ('owner','admin','manager','publisher','client_approver')
  ) then
    raise exception 'Your workspace role cannot update comment triage' using errcode = '42501';
  end if;

  update public.instagram_comments
  set triage_status = target_status, updated_at = pg_catalog.now()
  where id = target_comment_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'instagram.comment.triage_updated', 'instagram_comment',
    target_comment_id::text, 'success', pg_catalog.jsonb_build_object('triage_status', target_status)
  );
end;
$$;

create or replace function public.create_instagram_comment_reply_draft(
  target_comment_id uuid,
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
  from public.instagram_comments c
  where c.id = target_comment_id;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Comment access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id
      and m.role in ('owner','admin','manager','publisher','client_approver')
  ) then
    raise exception 'Your workspace role cannot create comment reply drafts' using errcode = '42501';
  end if;

  insert into public.instagram_comment_reply_drafts (
    workspace_id, instagram_comment_id, created_by, updated_by, draft_text, model, status
  ) values (
    target_workspace_id, target_comment_id, actor_id, actor_id,
    pg_catalog.btrim(target_draft_text), pg_catalog.btrim(target_model), 'draft'
  ) returning id into new_draft_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'instagram.comment_reply_draft.created', 'instagram_comment_reply_draft',
    new_draft_id::text, 'success', pg_catalog.jsonb_build_object('model', pg_catalog.btrim(target_model))
  );
  return new_draft_id;
end;
$$;

create or replace function public.update_instagram_comment_reply_draft(
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
  from public.instagram_comment_reply_drafts d
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
    raise exception 'Your workspace role cannot update comment reply drafts' using errcode = '42501';
  end if;

  update public.instagram_comment_reply_drafts
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
    case target_status when 'reviewed' then 'instagram.comment_reply_draft.reviewed' when 'discarded' then 'instagram.comment_reply_draft.discarded' else 'instagram.comment_reply_draft.updated' end,
    'instagram_comment_reply_draft', target_draft_id::text, 'success', '{}'::jsonb
  );
end;
$$;

revoke all on function public.set_instagram_comment_triage_status(uuid, text) from public, anon;
grant execute on function public.set_instagram_comment_triage_status(uuid, text) to authenticated;
revoke all on function public.create_instagram_comment_reply_draft(uuid, text, text) from public, anon;
grant execute on function public.create_instagram_comment_reply_draft(uuid, text, text) to authenticated;
revoke all on function public.update_instagram_comment_reply_draft(uuid, text, text) from public, anon;
grant execute on function public.update_instagram_comment_reply_draft(uuid, text, text) to authenticated;



-- Extend the existing connection RPC without changing its signature.
-- Comment capability is true only when the specific permission was requested and recorded.
create or replace function public.store_instagram_connection(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_provider_account_id text,
  target_display_name text,
  target_granted_scopes text[],
  target_token_ciphertext text,
  target_token_iv text,
  target_token_auth_tag text,
  target_token_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  clean_scopes text[];
  can_publish boolean;
  can_manage_comments boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_provider_account_id is null or length(target_provider_account_id) not between 1 and 128 then
    raise exception 'Invalid Instagram account identifier' using errcode = '22023';
  end if;
  if target_display_name is null or length(target_display_name) not between 1 and 120 then
    raise exception 'Invalid Instagram account display name' using errcode = '22023';
  end if;
  if target_token_ciphertext is null or length(target_token_ciphertext) not between 4 and 16384
     or target_token_iv is null or length(target_token_iv) not between 12 and 32
     or target_token_auth_tag is null or length(target_token_auth_tag) not between 20 and 32 then
    raise exception 'Encrypted token payload is invalid' using errcode = '22023';
  end if;
  if target_token_expires_at is null or target_token_expires_at <= pg_catalog.now() then
    raise exception 'Instagram access token is already expired' using errcode = '22023';
  end if;

  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Your workspace role cannot connect social accounts' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.brands b
    where b.id = target_brand_id and b.workspace_id = target_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  clean_scopes := coalesce(
    array(
      select distinct scope_name
      from pg_catalog.unnest(coalesce(target_granted_scopes, array[]::text[])) as u(scope_name)
      where scope_name in (
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_comments'
      )
    ),
    array[]::text[]
  );
  can_publish := 'instagram_business_content_publish' = any(clean_scopes);
  can_manage_comments := 'instagram_business_manage_comments' = any(clean_scopes);

  select * into existing_account
  from public.social_accounts a
  where a.provider = 'instagram' and a.provider_account_id = target_provider_account_id
  for update;

  if found then
    if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
      raise exception 'This Instagram account is already connected to another workspace or brand' using errcode = '23505';
    end if;
    account_id := existing_account.id;
    update public.social_accounts
    set display_name = target_display_name,
        connection_state = 'connected',
        granted_scopes = clean_scopes,
        capabilities = pg_catalog.jsonb_build_object(
          'profile_read', true,
          'content_publish', can_publish,
          'comments', can_manage_comments,
          'messaging', false,
          'insights', false
        ),
        token_secret_ref = 'social_account_token_vault:' || account_id::text
    where id = account_id;
  else
    insert into public.social_accounts (
      workspace_id, brand_id, provider, provider_account_id, display_name,
      connection_state, granted_scopes, capabilities, token_secret_ref
    ) values (
      target_workspace_id, target_brand_id, 'instagram', target_provider_account_id,
      target_display_name, 'connected', clean_scopes,
      pg_catalog.jsonb_build_object(
        'profile_read', true,
        'content_publish', can_publish,
        'comments', can_manage_comments,
        'messaging', false,
        'insights', false
      ),
      'social_account_token_vault:new'
    ) returning id into account_id;
    update public.social_accounts
    set token_secret_ref = 'social_account_token_vault:' || account_id::text
    where id = account_id;
  end if;

  insert into public.social_account_token_vault (
    social_account_id, ciphertext, iv, auth_tag, token_expires_at, updated_at
  ) values (
    account_id, target_token_ciphertext, target_token_iv, target_token_auth_tag,
    target_token_expires_at, pg_catalog.now()
  )
  on conflict (social_account_id) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    token_expires_at = excluded.token_expires_at,
    updated_at = pg_catalog.now();

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id, 'integration.instagram.connected',
    'social_account', account_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'brand_id', target_brand_id,
      'provider_account_id', target_provider_account_id,
      'granted_scopes', clean_scopes,
      'token_expires_at', target_token_expires_at
    )
  );
  return account_id;
end;
$$;

revoke all on function public.store_instagram_connection(uuid, uuid, text, text, text[], text, text, text, timestamptz) from public, anon;
grant execute on function public.store_instagram_connection(uuid, uuid, text, text, text[], text, text, text, timestamptz) to authenticated;
comment on function public.store_instagram_connection(uuid, uuid, text, text, text[], text, text, text, timestamptz) is
  'Stores encrypted Instagram OAuth credentials and capability flags derived only from allowlisted granted scopes, including comment management.';

comment on table public.instagram_comments is
  'Signature-verified Instagram comments normalized for workspace triage. Status is internal only and does not change Instagram.';
comment on table public.instagram_comment_reply_drafts is
  'Optional AI-assisted Instagram comment reply drafts. Drafts require human review and are never sent by this feature.';
