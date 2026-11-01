-- RuffNeck Social Hub v4.1.0 — official Meta post-insights collection.
-- This migration extends existing OAuth capability gates and stores only
-- normalized aggregate metrics. Provider tokens and raw API responses are never stored here.

-- Update the installed connection RPC definitions without replacing their
-- existing workspace, brand, token-vault and audit safeguards. Exact guards
-- make a drifted base function fail the migration instead of silently leaving
-- the analytics scope disabled.
do $migration$
declare
  function_definition text;
  updated_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.store_facebook_page_connections(uuid,uuid,text[],jsonb,timestamptz)'::pg_catalog.regprocedure
  );
  updated_definition := pg_catalog.replace(
    function_definition,
    'where scope_name in (''pages_show_list'', ''pages_read_engagement'', ''pages_manage_posts'', ''pages_manage_metadata'', ''pages_messaging'')',
    'where scope_name in (''pages_show_list'', ''pages_read_engagement'', ''pages_manage_posts'', ''pages_manage_metadata'', ''pages_messaging'', ''read_insights'')'
  );
  updated_definition := pg_catalog.replace(
    updated_definition,
    '''insights'', false',
    '''insights'', ''read_insights'' = any(clean_scopes)'
  );
  if updated_definition = function_definition
     or pg_catalog.strpos(updated_definition, 'where scope_name in (''pages_show_list'', ''pages_read_engagement'', ''pages_manage_posts'', ''pages_manage_metadata'', ''pages_messaging'', ''read_insights'')') = 0
     or pg_catalog.strpos(updated_definition, '''insights'', ''read_insights'' = any(clean_scopes)') = 0 then
    raise exception 'Facebook connection function does not match the v4.1.0 analytics migration contract';
  end if;
  execute updated_definition;

  function_definition := pg_catalog.pg_get_functiondef(
    'public.store_instagram_connection(uuid,uuid,text,text,text[],text,text,text,timestamptz)'::pg_catalog.regprocedure
  );
  updated_definition := pg_catalog.replace(
    function_definition,
    '''instagram_business_manage_comments''
      )',
    '''instagram_business_manage_comments'',
        ''instagram_business_manage_insights''
      )'
  );
  updated_definition := pg_catalog.replace(
    updated_definition,
    '''insights'', false',
    '''insights'', ''instagram_business_manage_insights'' = any(clean_scopes)'
  );
  if updated_definition = function_definition
     or pg_catalog.strpos(updated_definition, '''instagram_business_manage_comments'',
        ''instagram_business_manage_insights''
      )') = 0
     or pg_catalog.strpos(updated_definition, '''insights'', ''instagram_business_manage_insights'' = any(clean_scopes)') = 0 then
    raise exception 'Instagram connection function does not match the v4.1.0 analytics migration contract';
  end if;
  execute updated_definition;
end;
$migration$;

create table if not exists public.provider_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null,
  publishing_job_id uuid not null,
  social_account_id uuid not null,
  provider text not null check (provider in ('facebook','instagram')),
  snapshot_date date not null,
  impressions bigint not null default 0 check (impressions between 0 and 1000000000000),
  reach bigint not null default 0 check (reach between 0 and 1000000000000),
  likes bigint not null default 0 check (likes between 0 and 1000000000000),
  comments bigint not null default 0 check (comments between 0 and 1000000000000),
  shares bigint not null default 0 check (shares between 0 and 1000000000000),
  saves bigint not null default 0 check (saves between 0 and 1000000000000),
  clicks bigint not null default 0 check (clicks between 0 and 1000000000000),
  source text not null default 'provider_api' check (source = 'provider_api'),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, publishing_job_id, snapshot_date),
  foreign key (workspace_id, campaign_id) references public.publishing_campaigns(workspace_id, id) on delete cascade,
  foreign key (workspace_id, publishing_job_id) references public.publishing_jobs(workspace_id, id) on delete cascade,
  foreign key (workspace_id, social_account_id) references public.social_accounts(workspace_id, id) on delete cascade
);

create index if not exists provider_analytics_snapshots_latest_idx
  on public.provider_analytics_snapshots(workspace_id, campaign_id, publishing_job_id, snapshot_date desc, fetched_at desc);

alter table public.provider_analytics_snapshots enable row level security;
create policy provider_analytics_snapshots_member_read on public.provider_analytics_snapshots
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.provider_analytics_snapshots from anon, authenticated;
grant select on public.provider_analytics_snapshots to authenticated;

create or replace function public.record_provider_analytics_snapshot(
  target_campaign_id uuid,
  target_publishing_job_id uuid,
  target_snapshot_date date,
  target_impressions bigint,
  target_reach bigint,
  target_likes bigint,
  target_comments bigint,
  target_shares bigint,
  target_saves bigint,
  target_clicks bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  campaign_row public.publishing_campaigns%rowtype;
  job_row public.publishing_jobs%rowtype;
  account_row public.social_accounts%rowtype;
  member_role text;
  snapshot_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into campaign_row from public.publishing_campaigns c where c.id = target_campaign_id;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;

  select m.role::text into member_role from public.workspace_members m
    where m.workspace_id = campaign_row.workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin','manager','analyst') then
    raise exception 'Your workspace role cannot sync provider analytics' using errcode = '42501';
  end if;

  select * into job_row from public.publishing_jobs j
    where j.id = target_publishing_job_id and j.workspace_id = campaign_row.workspace_id;
  if not found or job_row.state <> 'succeeded' or job_row.brand_id <> campaign_row.brand_id
     or job_row.provider_post_id is null or job_row.delivered_at is null then
    raise exception 'Choose a provider-confirmed post for the campaign brand' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.campaign_content_items l
    where l.workspace_id = campaign_row.workspace_id
      and l.campaign_id = campaign_row.id and l.content_id = job_row.content_id
  ) then
    raise exception 'Published content is not linked to this campaign' using errcode = '22023';
  end if;

  select * into account_row from public.social_accounts a
    where a.id = job_row.social_account_id and a.workspace_id = campaign_row.workspace_id;
  if not found or account_row.brand_id <> campaign_row.brand_id
     or account_row.connection_state <> 'connected'
     or account_row.provider not in ('facebook','instagram')
     or coalesce((account_row.capabilities ->> 'insights')::boolean, false) is not true then
    raise exception 'Connected account does not have provider analytics access' using errcode = '22023';
  end if;
  if (account_row.provider = 'facebook' and not ('read_insights' = any(coalesce(account_row.granted_scopes, array[]::text[]))))
     or (account_row.provider = 'instagram' and not ('instagram_business_manage_insights' = any(coalesce(account_row.granted_scopes, array[]::text[])))) then
    raise exception 'Reconnect this social account and grant its provider insights permission' using errcode = '22023';
  end if;
  if account_row.provider = 'facebook'
     and not (coalesce(account_row.capabilities -> 'page_tasks', '[]'::jsonb) ? 'ANALYZE'
              or coalesce(account_row.capabilities -> 'page_tasks', '[]'::jsonb) ? 'MANAGE') then
    raise exception 'The connected Facebook Page requires the ANALYZE or MANAGE Page task' using errcode = '22023';
  end if;

  if target_snapshot_date is null or target_snapshot_date > current_date
     or target_snapshot_date < current_date - 365 then
    raise exception 'Provider snapshot date is outside the accepted range' using errcode = '22023';
  end if;
  if target_impressions is null or target_impressions not between 0 and 1000000000000
     or target_reach is null or target_reach not between 0 and 1000000000000
     or target_likes is null or target_likes not between 0 and 1000000000000
     or target_comments is null or target_comments not between 0 and 1000000000000
     or target_shares is null or target_shares not between 0 and 1000000000000
     or target_saves is null or target_saves not between 0 and 1000000000000
     or target_clicks is null or target_clicks not between 0 and 1000000000000 then
    raise exception 'Provider metric is outside the accepted range' using errcode = '22023';
  end if;

  insert into public.provider_analytics_snapshots (
    workspace_id, campaign_id, publishing_job_id, social_account_id, provider,
    snapshot_date, impressions, reach, likes, comments, shares, saves, clicks,
    source, fetched_at, updated_at
  ) values (
    campaign_row.workspace_id, campaign_row.id, job_row.id, account_row.id, account_row.provider,
    target_snapshot_date, target_impressions, target_reach, target_likes, target_comments,
    target_shares, target_saves, target_clicks, 'provider_api', pg_catalog.now(), pg_catalog.now()
  )
  on conflict (workspace_id, campaign_id, publishing_job_id, snapshot_date)
  do update set
    social_account_id = excluded.social_account_id,
    provider = excluded.provider,
    impressions = excluded.impressions,
    reach = excluded.reach,
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    saves = excluded.saves,
    clicks = excluded.clicks,
    source = 'provider_api',
    fetched_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  returning id into snapshot_id;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (
    campaign_row.workspace_id, current_user_id, 'campaign.provider_analytics_synced',
    'provider_analytics_snapshot', snapshot_id::text, 'success',
    pg_catalog.jsonb_build_object('campaign_id', campaign_row.id, 'publishing_job_id', job_row.id,
      'provider', account_row.provider, 'snapshot_date', target_snapshot_date, 'source', 'provider_api')
  );
  return snapshot_id;
end;
$$;

revoke all on function public.record_provider_analytics_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint) from public, anon;
grant execute on function public.record_provider_analytics_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint) to authenticated;

comment on table public.provider_analytics_snapshots is
  'Normalized lifetime post metrics fetched from official Meta APIs. It stores no provider tokens or raw provider payloads. Instagram views and Facebook post media views share the normalized impressions column and must be labelled as views/media views, not compared as identical metric definitions.';
comment on function public.record_provider_analytics_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint) is
  'Stores a normalized provider insights snapshot only when the caller is an authorized workspace analyst/manager and the published destination is linked to the campaign with the required Meta insights scope.';
