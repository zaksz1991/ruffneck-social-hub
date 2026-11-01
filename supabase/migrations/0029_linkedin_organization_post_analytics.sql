-- RuffNeck Social Hub v4.2.0 — LinkedIn organization post analytics.
-- Extends the existing encrypted LinkedIn connection flow with explicit
-- Community Management API analytics consent, then stores normalized,
-- provider-only organic post metrics in the shared analytics snapshot table.

begin;

alter table public.provider_analytics_snapshots
  drop constraint if exists provider_analytics_snapshots_provider_check;
alter table public.provider_analytics_snapshots
  add constraint provider_analytics_snapshots_provider_check
  check (provider in ('facebook', 'instagram', 'linkedin'));

-- LinkedIn's documented organic like count can be negative when a sponsored
-- like is later removed and LinkedIn attributes the unlike to organic stats.
-- Preserve that signed provider value rather than silently rewriting it to 0.
alter table public.provider_analytics_snapshots
  drop constraint if exists provider_analytics_snapshots_likes_check;
alter table public.provider_analytics_snapshots
  add constraint provider_analytics_snapshots_likes_check
  check (likes between -1000000000000 and 1000000000000);

create or replace function public.store_linkedin_organization_connections(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_granted_scopes text[],
  target_organizations jsonb,
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
  organization_item jsonb;
  organization_id text;
  organization_name text;
  organization_urn text;
  organization_role text;
  token_ciphertext text;
  token_iv text;
  token_auth_tag text;
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  stored_count integer := 0;
  seen_organization_ids text[] := array[]::text[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_token_expires_at is null or target_token_expires_at <= pg_catalog.now()
     or target_token_expires_at > pg_catalog.now() + interval '366 days' then
    raise exception 'LinkedIn token expiry is invalid' using errcode = '22023';
  end if;
  if target_organizations is null or pg_catalog.jsonb_typeof(target_organizations) <> 'array'
     or pg_catalog.jsonb_array_length(target_organizations) not between 1 and 100 then
    raise exception 'LinkedIn organization payload must contain between 1 and 100 organizations' using errcode = '22023';
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
    where scope_name in ('rw_organization_admin', 'w_organization_social')
  );
  if not ('rw_organization_admin' = any(clean_scopes))
     or not ('w_organization_social' = any(clean_scopes)) then
    raise exception 'LinkedIn organization analytics and publishing permissions are required' using errcode = '22023';
  end if;

  -- Validate the entire callback payload before any writes; this operation is atomic.
  for organization_item in
    select value from pg_catalog.jsonb_array_elements(target_organizations) as p(value)
  loop
    organization_id := nullif(pg_catalog.btrim(organization_item->>'id'), '');
    organization_name := nullif(pg_catalog.btrim(organization_item->>'name'), '');
    organization_urn := nullif(pg_catalog.btrim(organization_item->>'organization_urn'), '');
    organization_role := nullif(pg_catalog.btrim(organization_item->>'role'), '');
    token_ciphertext := organization_item->>'token_ciphertext';
    token_iv := organization_item->>'token_iv';
    token_auth_tag := organization_item->>'token_auth_tag';

    if organization_id is null or organization_id !~ '^[0-9]{1,20}$'
       or organization_name is null or pg_catalog.length(organization_name) > 160
       or organization_urn is null
       or organization_urn <> ('urn:li:organization:' || organization_id)
       or organization_role is null
       or organization_role <> 'ADMINISTRATOR'
       or token_ciphertext is null or pg_catalog.length(token_ciphertext) not between 4 and 32768
       or token_iv is null or pg_catalog.length(token_iv) not between 12 and 32
       or token_auth_tag is null or pg_catalog.length(token_auth_tag) not between 20 and 32 then
      raise exception 'LinkedIn organization credential payload is invalid' using errcode = '22023';
    end if;
    if organization_id = any(seen_organization_ids) then
      raise exception 'LinkedIn organization payload contains duplicate IDs' using errcode = '22023';
    end if;
    seen_organization_ids := seen_organization_ids || organization_id;
  end loop;

  for organization_item in
    select value from pg_catalog.jsonb_array_elements(target_organizations) as p(value)
  loop
    organization_id := pg_catalog.btrim(organization_item->>'id');
    organization_name := pg_catalog.btrim(organization_item->>'name');
    organization_urn := pg_catalog.btrim(organization_item->>'organization_urn');
    organization_role := pg_catalog.btrim(organization_item->>'role');
    token_ciphertext := organization_item->>'token_ciphertext';
    token_iv := organization_item->>'token_iv';
    token_auth_tag := organization_item->>'token_auth_tag';

    select * into existing_account
    from public.social_accounts a
    where a.provider = 'linkedin' and a.provider_account_id = organization_id
    for update;

    if found then
      if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
        raise exception 'This LinkedIn organization is already connected to another workspace or brand' using errcode = '23505';
      end if;
      account_id := existing_account.id;
      update public.social_accounts
      set display_name = organization_name,
          connection_state = 'connected',
          granted_scopes = clean_scopes,
          capabilities = pg_catalog.jsonb_build_object(
            'profile_read', true,
            'content_publish', false,
            'publish_permission_granted', false,
            'comments', false,
            'messaging', false,
            'insights', 'rw_organization_admin' = any(clean_scopes),
            'organization_urn', organization_urn,
            'organization_role', organization_role
          ),
          token_secret_ref = 'social_account_token_vault:' || account_id::text
      where id = account_id;
    else
      insert into public.social_accounts (
        workspace_id, brand_id, provider, provider_account_id, display_name,
        connection_state, granted_scopes, capabilities, token_secret_ref
      ) values (
        target_workspace_id, target_brand_id, 'linkedin', organization_id, organization_name,
        'connected', clean_scopes,
        pg_catalog.jsonb_build_object(
          'profile_read', true,
          'content_publish', false,
          'publish_permission_granted', false,
          'comments', false,
          'messaging', false,
          'insights', 'rw_organization_admin' = any(clean_scopes),
          'organization_urn', organization_urn,
          'organization_role', organization_role
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
      account_id, token_ciphertext, token_iv, token_auth_tag, target_token_expires_at, pg_catalog.now()
    )
    on conflict (social_account_id) do update set
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      token_expires_at = excluded.token_expires_at,
      updated_at = pg_catalog.now();

    stored_count := stored_count + 1;
  end loop;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id,
    'integration.linkedin.organizations_connected',
    'social_account_batch', null, 'success',
    pg_catalog.jsonb_build_object(
      'brand_id', target_brand_id,
      'organization_count', stored_count,
      'granted_scopes', clean_scopes,
      'publishing_enabled', false,
      'token_expiry_recorded', true
    )
  );
  return stored_count;
end;
$$;


revoke all on function public.store_linkedin_organization_connections(uuid, uuid, text[], jsonb, timestamptz) from public, anon;
grant execute on function public.store_linkedin_organization_connections(uuid, uuid, text[], jsonb, timestamptz) to authenticated;

comment on function public.store_linkedin_organization_connections(uuid, uuid, text[], jsonb, timestamptz) is
  'Atomically stores LinkedIn organization Page identities and encrypted member access tokens after validating workspace role, brand ownership, approved administrator role, and explicit rw_organization_admin and w_organization_social scopes. LinkedIn analytics is enabled only for an explicit rw_organization_admin grant.';

create or replace function public.record_linkedin_provider_analytics_snapshot(
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
    raise exception 'Choose a provider-confirmed LinkedIn post for the campaign brand' using errcode = '22023';
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
     or account_row.provider <> 'linkedin'
     or account_row.connection_state <> 'connected'
     or coalesce((account_row.capabilities ->> 'insights')::boolean, false) is not true
     or (account_row.capabilities ->> 'organization_role') is distinct from 'ADMINISTRATOR'
     or (account_row.capabilities ->> 'organization_urn') is distinct from ('urn:li:organization:' || account_row.provider_account_id)
     or not ('rw_organization_admin' = any(coalesce(account_row.granted_scopes, array[]::text[]))) then
    raise exception 'Connected LinkedIn organization does not have verified analytics access' using errcode = '22023';
  end if;

  if target_snapshot_date is null or target_snapshot_date > current_date
     or target_snapshot_date < current_date - 365 then
    raise exception 'Provider snapshot date is outside the accepted range' using errcode = '22023';
  end if;
  if target_impressions is null or target_impressions not between 0 and 1000000000000
     or target_reach is null or target_reach not between 0 and 1000000000000
     or target_likes is null or target_likes not between -1000000000000 and 1000000000000
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
    campaign_row.workspace_id, campaign_row.id, job_row.id, account_row.id, 'linkedin',
    target_snapshot_date, target_impressions, target_reach, target_likes, target_comments,
    target_shares, target_saves, target_clicks, 'provider_api', pg_catalog.now(), pg_catalog.now()
  )
  on conflict (workspace_id, campaign_id, publishing_job_id, snapshot_date)
  do update set
    social_account_id = excluded.social_account_id,
    provider = 'linkedin',
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
      'provider', 'linkedin', 'snapshot_date', target_snapshot_date, 'source', 'provider_api')
  );
  return snapshot_id;
end;
$$;

revoke all on function public.record_linkedin_provider_analytics_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint) from public, anon;
grant execute on function public.record_linkedin_provider_analytics_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint) to authenticated;

comment on table public.provider_analytics_snapshots is
  'Normalized official post metrics. Facebook and Instagram records are sourced from Meta APIs; LinkedIn records are organic organization share statistics only. LinkedIn share statistics do not include saves or paid/ad activity. Provider tokens and raw provider payloads are never stored.';

comment on function public.record_linkedin_provider_analytics_snapshot(uuid,uuid,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint) is
  'Stores a normalized LinkedIn organic organization-post snapshot only when an authenticated workspace analyst/manager has a successful same-brand campaign destination and the connected administrator Page has explicit rw_organization_admin consent.';

commit;
