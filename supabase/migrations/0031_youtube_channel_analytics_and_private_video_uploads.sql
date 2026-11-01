-- RuffNeck Social Hub v4.4.0 — YouTube channel authorization, Analytics API snapshots,
-- and manually initiated private video uploads. Apply after migrations 0001–0030.
-- Scheduled/public YouTube dispatch is deliberately not enabled by this migration.

begin;

create or replace function public.store_youtube_channel_connections(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_granted_scopes text[],
  target_channels jsonb,
  target_token_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  clean_scopes text[];
  channel_item jsonb;
  channel_id text;
  channel_title text;
  uploads_playlist_id text;
  token_ciphertext text;
  token_iv text;
  token_auth_tag text;
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  stored_count integer := 0;
  seen_ids text[] := array[]::text[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_token_expires_at is null or target_token_expires_at <= pg_catalog.now()
     or target_token_expires_at > pg_catalog.now() + interval '2 days' then
    raise exception 'YouTube access-token expiry is invalid' using errcode = '22023';
  end if;
  if target_channels is null or pg_catalog.jsonb_typeof(target_channels) <> 'array'
     or pg_catalog.jsonb_array_length(target_channels) not between 1 and 50 then
    raise exception 'YouTube channel payload must contain between 1 and 50 channels' using errcode = '22023';
  end if;

  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Your workspace role cannot connect social accounts' using errcode = '42501';
  end if;
  if not exists (select 1 from public.brands b where b.id = target_brand_id and b.workspace_id = target_workspace_id) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  clean_scopes := array(
    select distinct scope_name
    from pg_catalog.unnest(coalesce(target_granted_scopes, array[]::text[])) as u(scope_name)
    where scope_name in (
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.upload'
    )
  );
  if not ('https://www.googleapis.com/auth/youtube.readonly' = any(clean_scopes))
     or not ('https://www.googleapis.com/auth/yt-analytics.readonly' = any(clean_scopes)) then
    raise exception 'YouTube read and analytics permissions are required' using errcode = '22023';
  end if;

  -- Validate all channel entries before writing any records.
  for channel_item in select value from pg_catalog.jsonb_array_elements(target_channels) as p(value)
  loop
    channel_id := nullif(pg_catalog.btrim(channel_item->>'id'), '');
    channel_title := nullif(pg_catalog.btrim(channel_item->>'title'), '');
    uploads_playlist_id := nullif(pg_catalog.btrim(channel_item->>'uploadsPlaylistId'), '');
    token_ciphertext := channel_item->>'token_ciphertext';
    token_iv := channel_item->>'token_iv';
    token_auth_tag := channel_item->>'token_auth_tag';
    if channel_id is null or channel_id !~ '^UC[A-Za-z0-9_-]{10,40}$'
       or channel_title is null or pg_catalog.length(channel_title) > 100
       or (uploads_playlist_id is not null and uploads_playlist_id !~ '^[A-Za-z0-9_-]{10,64}$')
       or token_ciphertext is null or pg_catalog.length(token_ciphertext) not between 4 and 32768
       or token_iv is null or pg_catalog.length(token_iv) not between 12 and 32
       or token_auth_tag is null or pg_catalog.length(token_auth_tag) not between 20 and 32 then
      raise exception 'YouTube channel credential payload is invalid' using errcode = '22023';
    end if;
    if channel_id = any(seen_ids) then
      raise exception 'YouTube channel payload contains duplicate IDs' using errcode = '22023';
    end if;
    seen_ids := seen_ids || channel_id;
  end loop;

  for channel_item in select value from pg_catalog.jsonb_array_elements(target_channels) as p(value)
  loop
    channel_id := pg_catalog.btrim(channel_item->>'id');
    channel_title := pg_catalog.btrim(channel_item->>'title');
    uploads_playlist_id := nullif(pg_catalog.btrim(channel_item->>'uploadsPlaylistId'), '');
    token_ciphertext := channel_item->>'token_ciphertext';
    token_iv := channel_item->>'token_iv';
    token_auth_tag := channel_item->>'token_auth_tag';

    select * into existing_account from public.social_accounts a
    where a.provider = 'youtube' and a.provider_account_id = channel_id for update;
    if found then
      if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
        raise exception 'This YouTube channel is already connected to another workspace or brand' using errcode = '23505';
      end if;
      account_id := existing_account.id;
      update public.social_accounts
      set display_name = channel_title,
          connection_state = 'connected',
          granted_scopes = clean_scopes,
          capabilities = pg_catalog.jsonb_build_object(
            'profile_read', true, 'insights', true,
            'content_upload', ('https://www.googleapis.com/auth/youtube.upload' = any(clean_scopes)),
            'content_publish', false, 'scheduled_publish', false,
            'youtube_upload_enabled', ('https://www.googleapis.com/auth/youtube.upload' = any(clean_scopes)), 'uploads_playlist_id', uploads_playlist_id
          ),
          token_secret_ref = 'social_account_token_vault:' || account_id::text
      where id = account_id;
    else
      insert into public.social_accounts (
        workspace_id, brand_id, provider, provider_account_id, display_name,
        connection_state, granted_scopes, capabilities, token_secret_ref
      ) values (
        target_workspace_id, target_brand_id, 'youtube', channel_id, channel_title,
        'connected', clean_scopes,
        pg_catalog.jsonb_build_object(
          'profile_read', true, 'insights', true,
          'content_upload', ('https://www.googleapis.com/auth/youtube.upload' = any(clean_scopes)),
          'content_publish', false, 'scheduled_publish', false,
          'youtube_upload_enabled', ('https://www.googleapis.com/auth/youtube.upload' = any(clean_scopes)), 'uploads_playlist_id', uploads_playlist_id
        ),
        'social_account_token_vault:new'
      ) returning id into account_id;
      update public.social_accounts set token_secret_ref = 'social_account_token_vault:' || account_id::text where id = account_id;
    end if;

    insert into public.social_account_token_vault (
      social_account_id, ciphertext, iv, auth_tag, token_expires_at, updated_at
    ) values (account_id, token_ciphertext, token_iv, token_auth_tag, target_token_expires_at, pg_catalog.now())
    on conflict (social_account_id) do update set
      ciphertext = excluded.ciphertext, iv = excluded.iv, auth_tag = excluded.auth_tag,
      token_expires_at = excluded.token_expires_at, updated_at = pg_catalog.now();
    stored_count := stored_count + 1;
  end loop;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id, 'integration.youtube.channels_connected', 'social_account',
    target_brand_id::text, 'success',
    pg_catalog.jsonb_build_object('brand_id', target_brand_id, 'channel_count', stored_count, 'granted_scopes', clean_scopes)
  );
  return stored_count;
end;
$$;

revoke all on function public.store_youtube_channel_connections(uuid,uuid,text[],jsonb,timestamptz) from public, anon;
grant execute on function public.store_youtube_channel_connections(uuid,uuid,text[],jsonb,timestamptz) to authenticated;

create table if not exists public.youtube_video_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null,
  provider_video_id text not null check (provider_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_title text not null default '' check (pg_catalog.length(video_title) <= 100),
  video_url text not null check (video_url like 'https://www.youtube.com/watch?v=%'),
  provider_published_at timestamptz,
  report_start_date date not null,
  report_end_date date not null,
  snapshot_date date not null,
  views bigint not null default 0 check (views between 0 and 1000000000000),
  watch_time_minutes numeric(18,3) not null default 0 check (watch_time_minutes between 0 and 1000000000000),
  average_view_duration_seconds numeric(18,3) not null default 0 check (average_view_duration_seconds between 0 and 1000000000),
  likes bigint not null default 0 check (likes between 0 and 1000000000000),
  comments bigint not null default 0 check (comments between 0 and 1000000000000),
  shares bigint not null default 0 check (shares between 0 and 1000000000000),
  subscribers_gained bigint not null default 0 check (subscribers_gained between 0 and 1000000000000),
  subscribers_lost bigint not null default 0 check (subscribers_lost between 0 and 1000000000000),
  source text not null default 'youtube_analytics_api_v2' check (source = 'youtube_analytics_api_v2'),
  fetched_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (workspace_id, social_account_id, provider_video_id, report_start_date, report_end_date, snapshot_date),
  foreign key (workspace_id, social_account_id) references public.social_accounts(workspace_id, id) on delete cascade,
  constraint youtube_report_period_check check (report_start_date <= report_end_date and report_end_date <= snapshot_date)
);

create index if not exists youtube_video_analytics_lookup_idx
  on public.youtube_video_analytics_snapshots(workspace_id, report_start_date, report_end_date, snapshot_date desc, fetched_at desc);

alter table public.youtube_video_analytics_snapshots enable row level security;
create policy youtube_video_analytics_member_read on public.youtube_video_analytics_snapshots
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.youtube_video_analytics_snapshots from anon, authenticated;
grant select on public.youtube_video_analytics_snapshots to authenticated;

create or replace function public.record_youtube_video_analytics_snapshot(
  target_actor_user_id uuid,
  target_social_account_id uuid,
  target_provider_video_id text,
  target_video_title text,
  target_video_url text,
  target_provider_published_at timestamptz,
  target_report_start_date date,
  target_report_end_date date,
  target_snapshot_date date,
  target_views bigint,
  target_watch_time_minutes numeric,
  target_average_view_duration_seconds numeric,
  target_likes bigint,
  target_comments bigint,
  target_shares bigint,
  target_subscribers_gained bigint,
  target_subscribers_lost bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.social_accounts%rowtype;
  snapshot_id uuid;
  actor_role text;
begin
  if auth.role() is distinct from 'service_role' or target_actor_user_id is null then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  select m.role::text into actor_role from public.workspace_members m
  join public.social_accounts a on a.workspace_id = m.workspace_id
  where a.id = target_social_account_id and m.user_id = target_actor_user_id
    and a.provider = 'youtube' and a.connection_state = 'connected';
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'analyst') then
    raise exception 'Your workspace role cannot record YouTube analytics' using errcode = '42501';
  end if;
  select * into account_row from public.social_accounts a where a.id = target_social_account_id and a.provider = 'youtube';
  if not found then raise exception 'YouTube account not found' using errcode = '22023'; end if;
  if target_provider_video_id is null or target_provider_video_id !~ '^[A-Za-z0-9_-]{11}$'
     or target_video_title is null or pg_catalog.length(target_video_title) > 100
     or target_video_url is null or target_video_url !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'
     or target_report_start_date is null or target_report_end_date is null or target_snapshot_date is null
     or target_report_start_date > target_report_end_date or target_report_end_date > target_snapshot_date
     or target_report_start_date < target_snapshot_date - 366
     or target_views is null or target_views not between 0 and 1000000000000
     or target_watch_time_minutes is null or target_watch_time_minutes not between 0 and 1000000000000
     or target_average_view_duration_seconds is null or target_average_view_duration_seconds not between 0 and 1000000000
     or target_likes is null or target_likes not between 0 and 1000000000000
     or target_comments is null or target_comments not between 0 and 1000000000000
     or target_shares is null or target_shares not between 0 and 1000000000000
     or target_subscribers_gained is null or target_subscribers_gained not between 0 and 1000000000000
     or target_subscribers_lost is null or target_subscribers_lost not between 0 and 1000000000000 then
    raise exception 'YouTube analytics snapshot values are invalid' using errcode = '22023';
  end if;
  insert into public.youtube_video_analytics_snapshots (
    workspace_id, social_account_id, provider_video_id, video_title, video_url,
    provider_published_at, report_start_date, report_end_date, snapshot_date,
    views, watch_time_minutes, average_view_duration_seconds, likes, comments, shares,
    subscribers_gained, subscribers_lost, fetched_at, updated_at
  ) values (
    account_row.workspace_id, target_social_account_id, target_provider_video_id, target_video_title, target_video_url,
    target_provider_published_at, target_report_start_date, target_report_end_date, target_snapshot_date,
    target_views, target_watch_time_minutes, target_average_view_duration_seconds, target_likes, target_comments, target_shares,
    target_subscribers_gained, target_subscribers_lost, pg_catalog.now(), pg_catalog.now()
  )
  on conflict (workspace_id, social_account_id, provider_video_id, report_start_date, report_end_date, snapshot_date)
  do update set
    video_title = excluded.video_title,
    video_url = excluded.video_url,
    provider_published_at = excluded.provider_published_at,
    views = excluded.views,
    watch_time_minutes = excluded.watch_time_minutes,
    average_view_duration_seconds = excluded.average_view_duration_seconds,
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    subscribers_gained = excluded.subscribers_gained,
    subscribers_lost = excluded.subscribers_lost,
    fetched_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  returning id into snapshot_id;
  return snapshot_id;
end;
$$;
revoke all on function public.record_youtube_video_analytics_snapshot(uuid,uuid,text,text,text,timestamptz,date,date,date,bigint,numeric,numeric,bigint,bigint,bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.record_youtube_video_analytics_snapshot(uuid,uuid,text,text,text,timestamptz,date,date,date,bigint,numeric,numeric,bigint,bigint,bigint,bigint,bigint) to service_role;

-- Batch persistence avoids one database round-trip per video and keeps the
-- manual sync bounded to at most fifty rows for one channel per invocation.
create or replace function public.record_youtube_video_analytics_snapshots(
  target_actor_user_id uuid,
  target_social_account_id uuid,
  target_report_start_date date,
  target_report_end_date date,
  target_snapshot_date date,
  target_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.social_accounts%rowtype;
  actor_role text;
  item jsonb;
  video_id text;
  video_title text;
  video_url text;
  published_at timestamptz;
  views_value bigint;
  watch_time_value numeric;
  average_duration_value numeric;
  likes_value bigint;
  comments_value bigint;
  shares_value bigint;
  subscribers_gained_value bigint;
  subscribers_lost_value bigint;
  saved_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' or target_actor_user_id is null then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  if target_report_start_date is null or target_report_end_date is null or target_snapshot_date is null
     or target_report_start_date > target_report_end_date or target_report_end_date > target_snapshot_date
     or target_report_start_date < target_snapshot_date - 366 then
    raise exception 'YouTube report period is invalid' using errcode = '22023';
  end if;
  if target_rows is null or pg_catalog.jsonb_typeof(target_rows) <> 'array'
     or pg_catalog.jsonb_array_length(target_rows) not between 1 and 50 then
    raise exception 'YouTube analytics batch must contain between 1 and 50 rows' using errcode = '22023';
  end if;
  select m.role::text into actor_role
  from public.workspace_members m
  join public.social_accounts a on a.workspace_id = m.workspace_id
  where a.id = target_social_account_id and m.user_id = target_actor_user_id
    and a.provider = 'youtube' and a.connection_state = 'connected';
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'analyst') then
    raise exception 'Your workspace role cannot record YouTube analytics' using errcode = '42501';
  end if;
  select * into account_row from public.social_accounts a
  where a.id = target_social_account_id and a.provider = 'youtube' and a.connection_state = 'connected';
  if not found then raise exception 'YouTube account not found' using errcode = '22023'; end if;

  for item in select value from pg_catalog.jsonb_array_elements(target_rows) as parsed(value)
  loop
    video_id := nullif(pg_catalog.btrim(item->>'provider_video_id'), '');
    video_title := coalesce(item->>'video_title', '');
    video_url := item->>'video_url';
    published_at := nullif(item->>'provider_published_at', '')::timestamptz;
    views_value := (item->>'views')::bigint;
    watch_time_value := (item->>'watch_time_minutes')::numeric;
    average_duration_value := (item->>'average_view_duration_seconds')::numeric;
    likes_value := (item->>'likes')::bigint;
    comments_value := (item->>'comments')::bigint;
    shares_value := (item->>'shares')::bigint;
    subscribers_gained_value := (item->>'subscribers_gained')::bigint;
    subscribers_lost_value := (item->>'subscribers_lost')::bigint;
    if video_id is null or video_id !~ '^[A-Za-z0-9_-]{11}$'
       or pg_catalog.length(video_title) > 100
       or video_url is null or video_url !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'
       or views_value is null or views_value not between 0 and 1000000000000
       or watch_time_value is null or watch_time_value not between 0 and 1000000000000
       or average_duration_value is null or average_duration_value not between 0 and 1000000000
       or likes_value is null or likes_value not between 0 and 1000000000000
       or comments_value is null or comments_value not between 0 and 1000000000000
       or shares_value is null or shares_value not between 0 and 1000000000000
       or subscribers_gained_value is null or subscribers_gained_value not between 0 and 1000000000000
       or subscribers_lost_value is null or subscribers_lost_value not between 0 and 1000000000000 then
      raise exception 'YouTube analytics batch row is invalid' using errcode = '22023';
    end if;
    insert into public.youtube_video_analytics_snapshots (
      workspace_id, social_account_id, provider_video_id, video_title, video_url,
      provider_published_at, report_start_date, report_end_date, snapshot_date,
      views, watch_time_minutes, average_view_duration_seconds, likes, comments, shares,
      subscribers_gained, subscribers_lost, fetched_at, updated_at
    ) values (
      account_row.workspace_id, target_social_account_id, video_id, video_title, video_url,
      published_at, target_report_start_date, target_report_end_date, target_snapshot_date,
      views_value, watch_time_value, average_duration_value, likes_value, comments_value, shares_value,
      subscribers_gained_value, subscribers_lost_value, pg_catalog.now(), pg_catalog.now()
    )
    on conflict (workspace_id, social_account_id, provider_video_id, report_start_date, report_end_date, snapshot_date)
    do update set
      video_title = excluded.video_title,
      video_url = excluded.video_url,
      provider_published_at = excluded.provider_published_at,
      views = excluded.views,
      watch_time_minutes = excluded.watch_time_minutes,
      average_view_duration_seconds = excluded.average_view_duration_seconds,
      likes = excluded.likes,
      comments = excluded.comments,
      shares = excluded.shares,
      subscribers_gained = excluded.subscribers_gained,
      subscribers_lost = excluded.subscribers_lost,
      fetched_at = pg_catalog.now(),
      updated_at = pg_catalog.now();
    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;
revoke all on function public.record_youtube_video_analytics_snapshots(uuid,uuid,date,date,date,jsonb) from public, anon, authenticated;
grant execute on function public.record_youtube_video_analytics_snapshots(uuid,uuid,date,date,date,jsonb) to service_role;

create table if not exists public.youtube_video_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  social_account_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  provider_video_id text check (provider_video_id is null or provider_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  status text not null default 'initiating' check (status in ('initiating', 'succeeded', 'failed', 'unknown')),
  privacy_status text not null default 'private' check (privacy_status = 'private'),
  provider_url text check (provider_url is null or provider_url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^youtube_[a-z0-9_-]{1,48}$'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (workspace_id, content_id, social_account_id),
  foreign key (workspace_id, social_account_id) references public.social_accounts(workspace_id, id) on delete cascade
);
create index if not exists youtube_video_uploads_recent_idx on public.youtube_video_uploads(workspace_id, created_at desc);
alter table public.youtube_video_uploads enable row level security;
create policy youtube_video_uploads_member_read on public.youtube_video_uploads
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.youtube_video_uploads from public, anon, authenticated;
grant select on public.youtube_video_uploads to authenticated;

create or replace function public.create_youtube_video_upload_request(
  target_workspace_id uuid,
  target_content_id uuid,
  target_social_account_id uuid,
  target_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  content_row public.content_items%rowtype;
  account_row public.social_accounts%rowtype;
  request_id uuid;
begin
  if auth.role() is distinct from 'service_role' or target_actor_user_id is null then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = target_actor_user_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot upload videos' using errcode = '42501';
  end if;
  select * into content_row from public.content_items c
  where c.id = target_content_id and c.workspace_id = target_workspace_id and c.status = 'approved';
  if not found then raise exception 'Only approved content can be uploaded' using errcode = '22023'; end if;
  select * into account_row from public.social_accounts a
  where a.id = target_social_account_id and a.workspace_id = target_workspace_id
    and a.brand_id = content_row.brand_id and a.provider = 'youtube'
    and a.connection_state = 'connected' and a.capabilities->>'content_upload' = 'true'
    and 'https://www.googleapis.com/auth/youtube.upload' = any(a.granted_scopes);
  if not found then raise exception 'Choose a connected YouTube channel belonging to the approved content brand' using errcode = '22023'; end if;
  if pg_catalog.jsonb_typeof(coalesce(content_row.media_refs, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(content_row.media_refs, '[]'::jsonb)) <> 1
     or pg_catalog.jsonb_typeof(coalesce(content_row.media_refs, '[]'::jsonb)->0) <> 'string' then
    raise exception 'Approved content must contain exactly one video media URL' using errcode = '22023';
  end if;

  insert into public.youtube_video_uploads(workspace_id, content_id, social_account_id, actor_user_id, status, privacy_status)
  values (target_workspace_id, target_content_id, target_social_account_id, target_actor_user_id, 'initiating', 'private')
  on conflict (workspace_id, content_id, social_account_id) do update set
    actor_user_id = excluded.actor_user_id, status = 'initiating', provider_video_id = null,
    provider_url = null, safe_error_code = null, updated_at = pg_catalog.now()
  where public.youtube_video_uploads.status = 'failed'
  returning id into request_id;
  if request_id is null then
    raise exception 'A YouTube upload already exists or has an uncertain outcome' using errcode = '23505';
  end if;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, target_actor_user_id, 'youtube.video_upload.started', 'content_item', target_content_id::text, 'started',
    pg_catalog.jsonb_build_object('social_account_id', target_social_account_id, 'privacy_status', 'private'));
  return request_id;
end;
$$;
revoke all on function public.create_youtube_video_upload_request(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_youtube_video_upload_request(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.record_youtube_video_upload_result(
  target_upload_id uuid,
  target_workspace_id uuid,
  target_actor_user_id uuid,
  target_status text,
  target_provider_video_id text,
  target_safe_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  upload_row public.youtube_video_uploads%rowtype;
begin
  if auth.role() is distinct from 'service_role' or target_actor_user_id is null then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = target_actor_user_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot update this upload' using errcode = '42501';
  end if;
  if target_status not in ('succeeded', 'failed', 'unknown')
     or (target_status = 'succeeded' and (target_provider_video_id is null or target_provider_video_id !~ '^[A-Za-z0-9_-]{11}$'))
     or (target_status <> 'succeeded' and target_provider_video_id is not null)
     or (target_safe_error_code is not null and target_safe_error_code !~ '^youtube_[a-z0-9_-]{1,48}$') then
    raise exception 'YouTube upload result is invalid' using errcode = '22023';
  end if;
  select * into upload_row from public.youtube_video_uploads u
  where u.id = target_upload_id and u.workspace_id = target_workspace_id for update;
  if not found or upload_row.actor_user_id <> target_actor_user_id or upload_row.status <> 'initiating' then
    raise exception 'YouTube upload record is not in a writable state' using errcode = '42501';
  end if;
  update public.youtube_video_uploads set
    status = target_status,
    provider_video_id = target_provider_video_id,
    provider_url = case when target_provider_video_id is null then null else 'https://www.youtube.com/watch?v=' || target_provider_video_id end,
    safe_error_code = target_safe_error_code,
    updated_at = pg_catalog.now()
  where id = target_upload_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, target_actor_user_id, 'youtube.video_upload.' || target_status, 'youtube_video_upload', target_upload_id::text, target_status,
    pg_catalog.jsonb_build_object('provider_video_id_recorded', target_provider_video_id is not null, 'safe_error_code', target_safe_error_code));
end;
$$;
revoke all on function public.record_youtube_video_upload_result(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_youtube_video_upload_result(uuid,uuid,uuid,text,text,text) to service_role;

commit;
