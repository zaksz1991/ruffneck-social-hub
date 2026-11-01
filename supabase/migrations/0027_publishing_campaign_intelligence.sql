-- RuffNeck Social Hub v4.0.0 — workspace campaign planning and manually
-- recorded provider performance snapshots. Provider metrics are NOT fetched
-- by this migration; rows are explicitly entered by an authorised team member.

create unique index if not exists content_items_workspace_id_unique_idx
  on public.content_items (workspace_id, id);
create unique index if not exists social_accounts_workspace_id_unique_idx
  on public.social_accounts (workspace_id, id);
create unique index if not exists publishing_jobs_workspace_id_unique_idx
  on public.publishing_jobs (workspace_id, id);

create table if not exists public.publishing_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  objective text not null check (objective in ('awareness','engagement','traffic','lead_generation','sales','community','announcement')),
  status text not null default 'planned' check (status in ('planned','active','paused','completed')),
  start_date date not null,
  end_date date,
  landing_page_url text,
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(utm_campaign) between 2 and 72),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, brand_id) references public.brands(workspace_id, id) on delete cascade,
  check (end_date is null or end_date >= start_date),
  check (landing_page_url is null or (landing_page_url ~* '^https://[^/@[:space:]]+([/?#]|$)' and landing_page_url !~ '[[:space:]]' and char_length(landing_page_url) <= 2048))
);

create index if not exists publishing_campaigns_workspace_status_idx
  on public.publishing_campaigns(workspace_id, status, start_date desc);
create unique index if not exists publishing_campaigns_unique_utm_campaign_idx
  on public.publishing_campaigns(workspace_id, brand_id, utm_campaign);

create table if not exists public.campaign_content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null,
  content_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, content_id),
  foreign key (workspace_id, campaign_id) references public.publishing_campaigns(workspace_id, id) on delete cascade,
  foreign key (workspace_id, content_id) references public.content_items(workspace_id, id) on delete cascade
);

create index if not exists campaign_content_items_content_idx
  on public.campaign_content_items(workspace_id, content_id);

create table if not exists public.campaign_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null,
  publishing_job_id uuid not null,
  social_account_id uuid not null,
  snapshot_date date not null,
  impressions bigint not null default 0 check (impressions between 0 and 1000000000000),
  reach bigint not null default 0 check (reach between 0 and 1000000000000),
  likes bigint not null default 0 check (likes between 0 and 1000000000000),
  comments bigint not null default 0 check (comments between 0 and 1000000000000),
  shares bigint not null default 0 check (shares between 0 and 1000000000000),
  saves bigint not null default 0 check (saves between 0 and 1000000000000),
  clicks bigint not null default 0 check (clicks between 0 and 1000000000000),
  leads bigint not null default 0 check (leads between 0 and 1000000000000),
  conversions bigint not null default 0 check (conversions between 0 and 1000000000000),
  source text not null default 'manual' check (source = 'manual'),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, publishing_job_id, snapshot_date),
  foreign key (workspace_id, campaign_id) references public.publishing_campaigns(workspace_id, id) on delete cascade,
  foreign key (workspace_id, publishing_job_id) references public.publishing_jobs(workspace_id, id) on delete cascade,
  foreign key (workspace_id, social_account_id) references public.social_accounts(workspace_id, id) on delete cascade
);

create index if not exists campaign_metric_snapshots_latest_idx
  on public.campaign_metric_snapshots(workspace_id, campaign_id, publishing_job_id, snapshot_date desc);

alter table public.publishing_campaigns enable row level security;
alter table public.campaign_content_items enable row level security;
alter table public.campaign_metric_snapshots enable row level security;

create policy publishing_campaigns_member_read on public.publishing_campaigns
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy campaign_content_items_member_read on public.campaign_content_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy campaign_metric_snapshots_member_read on public.campaign_metric_snapshots
  for select to authenticated using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.publishing_campaigns from anon, authenticated;
revoke insert, update, delete on public.campaign_content_items from anon, authenticated;
revoke insert, update, delete on public.campaign_metric_snapshots from anon, authenticated;
grant select on public.publishing_campaigns to authenticated;
grant select on public.campaign_content_items to authenticated;
grant select on public.campaign_metric_snapshots to authenticated;

create or replace function public.create_publishing_campaign(
  target_workspace_id uuid,
  target_brand_id uuid,
  campaign_name text,
  campaign_objective text,
  campaign_start_date date,
  campaign_end_date date,
  campaign_landing_page_url text,
  campaign_utm_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  brand_workspace_id uuid;
  clean_name text := btrim(campaign_name);
  clean_url text := nullif(btrim(campaign_landing_page_url), '');
  raw_slug text := lower(btrim(campaign_utm_slug));
  clean_slug text;
  new_campaign_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin','manager','publisher') then
    raise exception 'Your workspace role cannot create campaigns' using errcode = '42501';
  end if;

  select b.workspace_id into brand_workspace_id
  from public.brands b
  where b.id = target_brand_id and b.workspace_id = target_workspace_id;
  if brand_workspace_id is null then
    raise exception 'Choose a brand from this workspace' using errcode = '22023';
  end if;
  if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 120 then
    raise exception 'Campaign name must contain 2 to 120 characters' using errcode = '22023';
  end if;
  if campaign_objective not in ('awareness','engagement','traffic','lead_generation','sales','community','announcement') then
    raise exception 'Choose a supported campaign objective' using errcode = '22023';
  end if;
  if campaign_start_date is null
     or campaign_start_date < current_date - 1825
     or campaign_start_date > current_date + 730
     or (campaign_end_date is not null and (campaign_end_date < campaign_start_date or campaign_end_date > current_date + 730)) then
    raise exception 'Choose a valid campaign date range' using errcode = '22023';
  end if;
  if raw_slug is null or raw_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(raw_slug) < 2 or char_length(raw_slug) > 72 then
    raise exception 'Campaign tracking name is invalid' using errcode = '22023';
  end if;
  -- A short random suffix keeps same-name campaigns distinguishable in UTM reports.
  clean_slug := left(raw_slug, 63) || '-' || substring(gen_random_uuid()::text from 1 for 8);
  if clean_url is not null and (char_length(clean_url) > 2048 or clean_url !~* '^https://[^/@[:space:]]+([/?#]|$)' or clean_url ~ '[[:space:]]') then
    raise exception 'Landing page must be a valid HTTPS URL' using errcode = '22023';
  end if;

  insert into public.publishing_campaigns(
    workspace_id, brand_id, name, objective, status, start_date, end_date,
    landing_page_url, utm_campaign, created_by
  ) values (
    target_workspace_id, target_brand_id, clean_name, campaign_objective, 'planned',
    campaign_start_date, campaign_end_date, clean_url, clean_slug, current_user_id
  ) returning id into new_campaign_id;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, current_user_id, 'campaign.created', 'publishing_campaign', new_campaign_id::text, 'success',
    jsonb_build_object('objective', campaign_objective, 'status', 'planned'));
  return new_campaign_id;
end;
$$;

create or replace function public.update_publishing_campaign_status(
  target_campaign_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  campaign_row public.publishing_campaigns%rowtype;
  member_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into campaign_row from public.publishing_campaigns c where c.id = target_campaign_id for update;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  select m.role::text into member_role from public.workspace_members m
    where m.workspace_id = campaign_row.workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin','manager') then
    raise exception 'Your workspace role cannot change campaign status' using errcode = '42501';
  end if;
  if target_status not in ('planned','active','paused','completed') then
    raise exception 'Choose a supported campaign status' using errcode = '22023';
  end if;
  update public.publishing_campaigns set status = target_status, updated_at = now() where id = target_campaign_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (campaign_row.workspace_id, current_user_id, 'campaign.status_changed', 'publishing_campaign', target_campaign_id::text, 'success',
    jsonb_build_object('previous_status', campaign_row.status, 'status', target_status));
end;
$$;

create or replace function public.link_content_to_campaign(
  target_campaign_id uuid,
  target_content_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  campaign_row public.publishing_campaigns%rowtype;
  content_row public.content_items%rowtype;
  member_role text;
  link_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into campaign_row from public.publishing_campaigns c where c.id = target_campaign_id for update;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  select m.role::text into member_role from public.workspace_members m
    where m.workspace_id = campaign_row.workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin','manager','publisher') then
    raise exception 'Your workspace role cannot link content to campaigns' using errcode = '42501';
  end if;
  if campaign_row.status = 'completed' then
    raise exception 'Completed campaigns cannot accept new content' using errcode = '22023';
  end if;
  select * into content_row from public.content_items i
    where i.id = target_content_id and i.workspace_id = campaign_row.workspace_id;
  if not found then raise exception 'Content item not found in this workspace' using errcode = 'P0002'; end if;
  if content_row.brand_id <> campaign_row.brand_id or content_row.status = 'archived' then
    raise exception 'Campaign content must belong to the same brand and cannot be archived' using errcode = '22023';
  end if;
  insert into public.campaign_content_items(workspace_id, campaign_id, content_id, created_by)
  values (campaign_row.workspace_id, campaign_row.id, content_row.id, current_user_id)
  on conflict (workspace_id, campaign_id, content_id) do update set content_id = excluded.content_id
  returning id into link_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (campaign_row.workspace_id, current_user_id, 'campaign.content_linked', 'campaign_content', link_id::text, 'success',
    jsonb_build_object('campaign_id', campaign_row.id, 'content_id', content_row.id));
  return link_id;
end;
$$;

create or replace function public.record_campaign_metric_snapshot(
  target_campaign_id uuid,
  target_publishing_job_id uuid,
  target_snapshot_date date,
  target_impressions bigint,
  target_reach bigint,
  target_likes bigint,
  target_comments bigint,
  target_shares bigint,
  target_saves bigint,
  target_clicks bigint,
  target_leads bigint,
  target_conversions bigint
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
  if member_role is null or member_role not in ('owner','admin','manager','publisher','analyst') then
    raise exception 'Your workspace role cannot record campaign metrics' using errcode = '42501';
  end if;
  select * into job_row from public.publishing_jobs j
    where j.id = target_publishing_job_id and j.workspace_id = campaign_row.workspace_id;
  if not found or job_row.state <> 'succeeded' or job_row.brand_id <> campaign_row.brand_id then
    raise exception 'Choose a successfully published destination for this campaign brand' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.campaign_content_items l
    where l.workspace_id = campaign_row.workspace_id
      and l.campaign_id = campaign_row.id and l.content_id = job_row.content_id
  ) then
    raise exception 'The published content is not linked to this campaign' using errcode = '22023';
  end if;
  if target_snapshot_date is null or target_snapshot_date > current_date or target_snapshot_date < current_date - 365 then
    raise exception 'Snapshot date must be within the previous 365 days' using errcode = '22023';
  end if;
  if target_impressions is null or target_reach is null or target_likes is null or target_comments is null
     or target_shares is null or target_saves is null or target_clicks is null or target_leads is null or target_conversions is null
     or greatest(target_impressions,target_reach,target_likes,target_comments,target_shares,target_saves,target_clicks,target_leads,target_conversions) > 1000000000000
     or least(target_impressions,target_reach,target_likes,target_comments,target_shares,target_saves,target_clicks,target_leads,target_conversions) < 0 then
    raise exception 'Metric values must be non-negative and within the supported limit' using errcode = '22023';
  end if;

  insert into public.campaign_metric_snapshots(
    workspace_id, campaign_id, publishing_job_id, social_account_id, snapshot_date,
    impressions, reach, likes, comments, shares, saves, clicks, leads, conversions, source, recorded_by
  ) values (
    campaign_row.workspace_id, campaign_row.id, job_row.id, job_row.social_account_id, target_snapshot_date,
    target_impressions, target_reach, target_likes, target_comments, target_shares, target_saves,
    target_clicks, target_leads, target_conversions, 'manual', current_user_id
  )
  on conflict (workspace_id, campaign_id, publishing_job_id, snapshot_date)
  do update set impressions = excluded.impressions, reach = excluded.reach,
    likes = excluded.likes, comments = excluded.comments, shares = excluded.shares,
    saves = excluded.saves, clicks = excluded.clicks, leads = excluded.leads,
    conversions = excluded.conversions, source = 'manual', recorded_by = current_user_id, updated_at = now()
  returning id into snapshot_id;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (campaign_row.workspace_id, current_user_id, 'campaign.metrics_recorded', 'campaign_metric_snapshot', snapshot_id::text, 'success',
    jsonb_build_object('campaign_id', campaign_row.id, 'publishing_job_id', job_row.id, 'snapshot_date', target_snapshot_date, 'source', 'manual'));
  return snapshot_id;
end;
$$;

revoke all on function public.create_publishing_campaign(uuid,uuid,text,text,date,date,text,text) from public, anon;
revoke all on function public.update_publishing_campaign_status(uuid,text) from public, anon;
revoke all on function public.link_content_to_campaign(uuid,uuid) from public, anon;
revoke all on function public.record_campaign_metric_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) from public, anon;
grant execute on function public.create_publishing_campaign(uuid,uuid,text,text,date,date,text,text) to authenticated;
grant execute on function public.update_publishing_campaign_status(uuid,text) to authenticated;
grant execute on function public.link_content_to_campaign(uuid,uuid) to authenticated;
grant execute on function public.record_campaign_metric_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) to authenticated;

comment on table public.campaign_metric_snapshots is 'Manually entered performance snapshots for provider-confirmed publishing destinations. This table is not populated by social-platform analytics APIs.';
