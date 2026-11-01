-- RuffNeck Social Hub v4.3.0 — official TikTok connection, video analytics,
-- and consent-based transfer of approved videos to the TikTok app inbox.
-- Apply after migrations 0001 through 0029.
-- No direct-post or scheduled TikTok publishing capability is granted here.

begin;

create or replace function public.store_tiktok_account_connection(
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
  clean_scopes text[];
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  can_list boolean;
  can_upload boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_provider_account_id is null or target_provider_account_id !~ '^[A-Za-z0-9_-]{1,128}$'
     or target_display_name is null or pg_catalog.length(pg_catalog.btrim(target_display_name)) not between 1 and 120 then
    raise exception 'TikTok account identity is invalid' using errcode = '22023';
  end if;
  if target_token_ciphertext is null or pg_catalog.length(target_token_ciphertext) not between 4 and 16384
     or target_token_iv is null or pg_catalog.length(target_token_iv) not between 12 and 32
     or target_token_auth_tag is null or pg_catalog.length(target_token_auth_tag) not between 20 and 32 then
    raise exception 'Encrypted TikTok credential payload is invalid' using errcode = '22023';
  end if;
  if target_token_expires_at is null or target_token_expires_at <= pg_catalog.now()
     or target_token_expires_at > pg_catalog.now() + interval '8 days' then
    raise exception 'TikTok access-token expiry is invalid' using errcode = '22023';
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

  clean_scopes := array(
    select distinct scope_name
    from pg_catalog.unnest(coalesce(target_granted_scopes, array[]::text[])) as u(scope_name)
    where scope_name in ('user.info.basic', 'video.list', 'video.upload')
  );
  if not ('user.info.basic' = any(clean_scopes)) then
    raise exception 'TikTok basic profile permission is required' using errcode = '22023';
  end if;
  can_list := 'video.list' = any(clean_scopes);
  can_upload := 'video.upload' = any(clean_scopes);

  select * into existing_account
  from public.social_accounts a
  where a.provider = 'tiktok' and a.provider_account_id = target_provider_account_id
  for update;

  if found then
    if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
      raise exception 'This TikTok account is already connected to another workspace or brand' using errcode = '23505';
    end if;
    account_id := existing_account.id;
    update public.social_accounts
    set display_name = pg_catalog.btrim(target_display_name),
        connection_state = 'connected',
        granted_scopes = clean_scopes,
        capabilities = pg_catalog.jsonb_build_object(
          'profile_read', true,
          'insights', can_list,
          'content_upload', can_upload,
          'content_publish', false,
          'comments', false,
          'messaging', false,
          'direct_post_enabled', false,
          'video_list_enabled', can_list,
          'inbox_upload_enabled', can_upload
        ),
        token_secret_ref = 'social_account_token_vault:' || account_id::text
    where id = account_id;
  else
    insert into public.social_accounts (
      workspace_id, brand_id, provider, provider_account_id, display_name,
      connection_state, granted_scopes, capabilities, token_secret_ref
    ) values (
      target_workspace_id, target_brand_id, 'tiktok', target_provider_account_id,
      pg_catalog.btrim(target_display_name), 'connected', clean_scopes,
      pg_catalog.jsonb_build_object(
        'profile_read', true,
        'insights', can_list,
        'content_upload', can_upload,
        'content_publish', false,
        'comments', false,
        'messaging', false,
        'direct_post_enabled', false,
        'video_list_enabled', can_list,
        'inbox_upload_enabled', can_upload
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
    target_workspace_id, current_user_id,
    'integration.tiktok.connected', 'social_account', account_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'brand_id', target_brand_id,
      'granted_scopes', clean_scopes,
      'video_list_enabled', can_list,
      'inbox_upload_enabled', can_upload,
      'direct_post_enabled', false,
      'token_expiry_recorded', true
    )
  );
  return account_id;
end;
$$;

revoke all on function public.store_tiktok_account_connection(uuid,uuid,text,text,text[],text,text,text,timestamptz) from public, anon;
grant execute on function public.store_tiktok_account_connection(uuid,uuid,text,text,text[],text,text,text,timestamptz) to authenticated;

create table if not exists public.tiktok_video_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null,
  provider_video_id text not null check (provider_video_id ~ '^[0-9]{1,32}$'),
  video_title text not null default '' check (pg_catalog.length(video_title) <= 150),
  share_url text,
  provider_created_at timestamptz not null,
  snapshot_date date not null,
  views bigint not null default 0 check (views between 0 and 1000000000000),
  likes bigint not null default 0 check (likes between 0 and 1000000000000),
  comments bigint not null default 0 check (comments between 0 and 1000000000000),
  shares bigint not null default 0 check (shares between 0 and 1000000000000),
  source text not null default 'tiktok_video_list_api' check (source = 'tiktok_video_list_api'),
  fetched_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (workspace_id, social_account_id, provider_video_id, snapshot_date),
  foreign key (workspace_id, social_account_id) references public.social_accounts(workspace_id, id) on delete cascade,
  constraint tiktok_video_analytics_share_url_check check (
    share_url is null or (share_url like 'https://www.tiktok.com/%' or share_url like 'https://tiktok.com/%')
  )
);

create index if not exists tiktok_video_analytics_latest_idx
  on public.tiktok_video_analytics_snapshots(workspace_id, social_account_id, snapshot_date desc, fetched_at desc);

alter table public.tiktok_video_analytics_snapshots enable row level security;
create policy tiktok_video_analytics_member_read on public.tiktok_video_analytics_snapshots
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.tiktok_video_analytics_snapshots from anon, authenticated;
grant select on public.tiktok_video_analytics_snapshots to authenticated;

create or replace function public.record_tiktok_video_analytics_snapshot(
  target_actor_user_id uuid,
  target_social_account_id uuid,
  target_provider_video_id text,
  target_video_title text,
  target_share_url text,
  target_provider_created_at timestamptz,
  target_snapshot_date date,
  target_views bigint,
  target_likes bigint,
  target_comments bigint,
  target_shares bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := target_actor_user_id;
  account_row public.social_accounts%rowtype;
  member_role text;
  snapshot_id uuid;
begin
  -- Provider metrics are persisted only by the server-side sync action.
  -- A client cannot call this RPC with invented metric values.
  if auth.role() is distinct from 'service_role' or current_user_id is null then
    raise exception 'Server-side provider sync required' using errcode = '42501';
  end if;
  select * into account_row from public.social_accounts a
    where a.id = target_social_account_id and a.provider = 'tiktok';
  if not found then raise exception 'TikTok account not found' using errcode = 'P0002'; end if;

  select m.role::text into member_role from public.workspace_members m
    where m.workspace_id = account_row.workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin','manager','analyst') then
    raise exception 'Your workspace role cannot sync TikTok analytics' using errcode = '42501';
  end if;
  if account_row.connection_state <> 'connected'
     or coalesce((account_row.capabilities ->> 'insights')::boolean, false) is not true
     or not ('video.list' = any(coalesce(account_row.granted_scopes, array[]::text[]))) then
    raise exception 'TikTok account does not have video.list analytics access' using errcode = '22023';
  end if;
  if target_provider_video_id is null or target_provider_video_id !~ '^[0-9]{1,32}$'
     or target_video_title is null or pg_catalog.length(target_video_title) > 150
     or target_provider_created_at is null or target_provider_created_at < timestamptz '2016-01-01'
     or target_provider_created_at > pg_catalog.now() + interval '1 day' then
    raise exception 'TikTok video identity is invalid' using errcode = '22023';
  end if;
  if target_share_url is not null and target_share_url !~ '^https://(www\.)?tiktok\.com/' then
    raise exception 'TikTok share URL is invalid' using errcode = '22023';
  end if;
  if target_snapshot_date is null or target_snapshot_date > current_date
     or target_snapshot_date < current_date - 365 then
    raise exception 'TikTok snapshot date is outside the accepted range' using errcode = '22023';
  end if;
  if target_views is null or target_views not between 0 and 1000000000000
     or target_likes is null or target_likes not between 0 and 1000000000000
     or target_comments is null or target_comments not between 0 and 1000000000000
     or target_shares is null or target_shares not between 0 and 1000000000000 then
    raise exception 'TikTok metric is outside the accepted range' using errcode = '22023';
  end if;

  insert into public.tiktok_video_analytics_snapshots (
    workspace_id, social_account_id, provider_video_id, video_title, share_url,
    provider_created_at, snapshot_date, views, likes, comments, shares, fetched_at, updated_at
  ) values (
    account_row.workspace_id, account_row.id, target_provider_video_id, target_video_title,
    target_share_url, target_provider_created_at, target_snapshot_date,
    target_views, target_likes, target_comments, target_shares, pg_catalog.now(), pg_catalog.now()
  ) on conflict (workspace_id, social_account_id, provider_video_id, snapshot_date)
  do update set
    video_title = excluded.video_title,
    share_url = excluded.share_url,
    provider_created_at = excluded.provider_created_at,
    views = excluded.views,
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    fetched_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  returning id into snapshot_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    account_row.workspace_id, current_user_id, 'tiktok.video_analytics_synced',
    'tiktok_video_analytics_snapshot', snapshot_id::text, 'success',
    pg_catalog.jsonb_build_object('social_account_id', account_row.id, 'snapshot_date', target_snapshot_date)
  );
  return snapshot_id;
end;
$$;

revoke all on function public.record_tiktok_video_analytics_snapshot(uuid,uuid,text,text,text,timestamptz,date,bigint,bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.record_tiktok_video_analytics_snapshot(uuid,uuid,text,text,text,timestamptz,date,bigint,bigint,bigint,bigint) to service_role;
comment on function public.record_tiktok_video_analytics_snapshot(uuid,uuid,text,text,text,timestamptz,date,bigint,bigint,bigint,bigint) is
  'Server-only persistence for metrics retrieved from TikTok Display API. The function requires the service_role JWT and rechecks the attributed workspace actor role, connected account, granted scope and metric bounds.';

create table if not exists public.tiktok_inbox_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null,
  content_id uuid not null,
  social_account_id uuid not null,
  created_by uuid not null references auth.users(id),
  publish_id text unique check (publish_id is null or pg_catalog.length(publish_id) between 8 and 64),
  status text not null default 'initiating' check (status in ('initiating','send_to_user_inbox','processing_download','publish_complete','failed','unknown')),
  provider_video_id text,
  safe_error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (workspace_id, brand_id) references public.brands(workspace_id, id) on delete cascade,
  foreign key (workspace_id, content_id) references public.content_items(workspace_id, id) on delete cascade,
  foreign key (workspace_id, social_account_id) references public.social_accounts(workspace_id, id) on delete cascade,
  constraint tiktok_inbox_upload_video_id_check check (provider_video_id is null or provider_video_id ~ '^[0-9]{1,32}$'),
  constraint tiktok_inbox_upload_error_check check (safe_error_code is null or safe_error_code ~ '^[a-z0-9_-]{1,64}$')
);

create index if not exists tiktok_inbox_uploads_workspace_created_idx
  on public.tiktok_inbox_uploads(workspace_id, created_at desc);
create unique index if not exists tiktok_inbox_uploads_one_open_content_idx
  on public.tiktok_inbox_uploads(social_account_id, content_id)
  where status in ('initiating','send_to_user_inbox','processing_download','publish_complete','unknown');

alter table public.tiktok_inbox_uploads enable row level security;
create policy tiktok_inbox_uploads_member_read on public.tiktok_inbox_uploads
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.tiktok_inbox_uploads from anon, authenticated;
grant select on public.tiktok_inbox_uploads to authenticated;
grant select, insert, update, delete on public.tiktok_inbox_uploads to service_role;

create or replace function public.create_tiktok_inbox_upload(
  target_workspace_id uuid,
  target_content_id uuid,
  target_social_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  content_row public.content_items%rowtype;
  account_row public.social_accounts%rowtype;
  upload_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then
    raise exception 'Your workspace role cannot transfer videos to TikTok' using errcode = '42501';
  end if;
  select * into content_row from public.content_items c
    where c.id = target_content_id and c.workspace_id = target_workspace_id;
  if not found or content_row.status <> 'approved' then
    raise exception 'Only approved content can be transferred to TikTok' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(content_row.media_refs) is distinct from 'array' then
    raise exception 'TikTok inbox transfer requires exactly one video media URL' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(content_row.media_refs) <> 1
     or pg_catalog.jsonb_typeof(content_row.media_refs->0) <> 'string' then
    raise exception 'TikTok inbox transfer requires exactly one video media URL' using errcode = '22023';
  end if;
  select * into account_row from public.social_accounts a
    where a.id = target_social_account_id and a.workspace_id = target_workspace_id;
  if not found or account_row.brand_id <> content_row.brand_id
     or account_row.provider <> 'tiktok' or account_row.connection_state <> 'connected'
     or coalesce((account_row.capabilities ->> 'content_upload')::boolean, false) is not true
     or not ('video.upload' = any(coalesce(account_row.granted_scopes, array[]::text[]))) then
    raise exception 'TikTok account does not have inbox video-upload access for this content brand' using errcode = '22023';
  end if;
  insert into public.tiktok_inbox_uploads(workspace_id, brand_id, content_id, social_account_id, created_by)
  values (target_workspace_id, content_row.brand_id, content_row.id, account_row.id, current_user_id)
  returning id into upload_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, current_user_id, 'tiktok.inbox_upload_initiated', 'tiktok_inbox_upload', upload_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'social_account_id', account_row.id,
      'content_id', content_row.id,
      'publishing_mode', 'native_inbox_draft',
      'consent_confirmed', true,
      'consent_version', 'v1'
    ));
  return upload_id;
end;
$$;

revoke all on function public.create_tiktok_inbox_upload(uuid,uuid,uuid) from public, anon;
grant execute on function public.create_tiktok_inbox_upload(uuid,uuid,uuid) to authenticated;

comment on table public.tiktok_video_analytics_snapshots is
  'Normalized snapshots of public videos returned by the official TikTok Display API video.list scope. Views, likes, comments and shares are account-scoped video counters, not campaign-attributed conversions or unique audience reach.';
comment on table public.tiktok_inbox_uploads is
  'Audit and status records for explicitly consented uploads of approved videos into the creator TikTok app inbox. This does not publish, schedule or set privacy on the public TikTok account.';
comment on function public.create_tiktok_inbox_upload(uuid,uuid,uuid) is
  'Creates a workspace- and brand-validated request to transfer one approved video to the connected TikTok creator inbox. A separate server action verifies a TikTok-domain-allowlisted public HTTPS media URL before calling the official TikTok API.';


create or replace function public.resolve_unknown_tiktok_inbox_upload(
  target_workspace_id uuid,
  target_upload_id uuid,
  target_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  upload_row public.tiktok_inbox_uploads%rowtype;
  next_status text;
  safe_code text;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then
    raise exception 'Only workspace managers can reconcile an unknown TikTok transfer' using errcode = '42501';
  end if;
  if target_resolution is null or target_resolution not in ('confirmed_not_uploaded','confirmed_in_tiktok_inbox','confirmed_published') then
    raise exception 'Choose a valid manual reconciliation outcome' using errcode = '22023';
  end if;
  select * into upload_row from public.tiktok_inbox_uploads u
    where u.id = target_upload_id and u.workspace_id = target_workspace_id
    for update;
  if not found or upload_row.status <> 'unknown' then
    raise exception 'Only an unknown TikTok transfer can be reconciled' using errcode = '22023';
  end if;
  if target_resolution = 'confirmed_not_uploaded' then
    next_status := 'failed';
    safe_code := 'tiktok_manual_confirmed_not_uploaded';
  elsif target_resolution = 'confirmed_in_tiktok_inbox' then
    next_status := 'send_to_user_inbox';
    safe_code := 'tiktok_manual_confirmed_inbox_delivery';
  else
    next_status := 'publish_complete';
    safe_code := 'tiktok_manual_confirmed_published';
  end if;
  update public.tiktok_inbox_uploads
    set status = next_status, safe_error_code = safe_code, updated_at = pg_catalog.now()
    where id = upload_row.id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, current_user_id, 'tiktok.inbox_upload_manually_reconciled',
    'tiktok_inbox_upload', upload_row.id::text, 'success',
    pg_catalog.jsonb_build_object('resolution', target_resolution, 'status', next_status));
end;
$$;

revoke all on function public.resolve_unknown_tiktok_inbox_upload(uuid,uuid,text) from public, anon;
grant execute on function public.resolve_unknown_tiktok_inbox_upload(uuid,uuid,text) to authenticated;
comment on function public.resolve_unknown_tiktok_inbox_upload(uuid,uuid,text) is
  'Manager-only manual reconciliation of an ambiguous TikTok inbox transfer. Each resolution is explicit and audit logged; no provider retry is initiated.';

commit;
