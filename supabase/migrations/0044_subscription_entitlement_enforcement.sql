-- RuffNeck Social Hub v6.1.0 — enforce plan limits at the database boundary.
-- Apply after 0043_billing_subscription_foundation.sql.
-- Enforced in this release: connected social accounts, brands, workspace members,
-- and monthly AI content-generation requests (core draft + platform-variant generation).
-- Client-workspace capacity remains informational until a client-workspace relationship exists.
-- AI quota scope in this release: content draft and one multi-platform variant batch.
-- Roles allowed to reserve AI content usage match content creation: owner/admin/manager/publisher.

create table if not exists public.workspace_ai_generation_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  generation_type text not null check (generation_type in ('content_draft','provider_variants')),
  usage_month date not null,
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  unique (workspace_id, request_id)
);

create index if not exists workspace_ai_generation_usage_month_idx
  on public.workspace_ai_generation_usage(workspace_id, usage_month, status, created_at desc);

alter table public.workspace_ai_generation_usage enable row level security;
revoke all on table public.workspace_ai_generation_usage from public, anon, authenticated;
revoke all on table public.workspace_ai_generation_usage from service_role;

create or replace function public.get_effective_workspace_billing_plan(target_workspace_id uuid)
returns public.billing_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan public.billing_plans%rowtype;
begin
  if target_workspace_id is null then
    raise exception 'Workspace is required' using errcode = '22023';
  end if;

  select p.* into selected_plan
  from public.workspace_subscriptions s
  join public.billing_plans p on p.id = s.plan_id
  where s.workspace_id = target_workspace_id
    and s.status in ('active','past_due')
    and s.current_period_ends_at > pg_catalog.now()
  order by s.current_period_ends_at desc, s.updated_at desc
  limit 1;

  if not found then
    select p.* into selected_plan
    from public.billing_plans p
    where p.code = 'free' and p.is_active = true
    limit 1;
  end if;

  if not found then
    raise exception 'The Free fallback billing plan is missing' using errcode = '55000';
  end if;
  return selected_plan;
end;
$$;

create or replace function public.enforce_workspace_resource_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_plan public.billing_plans%rowtype;
  current_count integer := 0;
  resource_limit integer := 0;
  resource_key text := '';
  target_workspace_id uuid;
begin
  target_workspace_id := new.workspace_id;
  if target_workspace_id is null then
    raise exception 'Workspace is required for this resource' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and tg_table_name = 'brands' and old.workspace_id = new.workspace_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'workspace_members' and old.workspace_id = new.workspace_id then
    return new;
  end if;
  if tg_table_name = 'social_accounts' then
    if new.connection_state is distinct from 'connected' then return new; end if;
    if tg_op = 'UPDATE' and old.workspace_id = new.workspace_id and old.connection_state = 'connected' then
      return new;
    end if;
  end if;

  -- Serialize resource creation for a workspace so parallel inserts cannot race past a cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace_id::text, 6101));
  perform 1 from public.workspaces w where w.id = target_workspace_id for update;
  if not found then raise exception 'Workspace does not exist' using errcode = '22023'; end if;
  select * into effective_plan from public.get_effective_workspace_billing_plan(target_workspace_id);

  if tg_table_name = 'brands' then
    resource_key := 'brands';
    resource_limit := effective_plan.max_brands;
    select pg_catalog.count(*)::integer into current_count
    from public.brands b
    where b.workspace_id = target_workspace_id;
  elsif tg_table_name = 'social_accounts' then
    resource_key := 'connected_accounts';
    resource_limit := effective_plan.max_connected_accounts;
    select pg_catalog.count(*)::integer into current_count
    from public.social_accounts a
    where a.workspace_id = target_workspace_id
      and a.connection_state = 'connected';
  elsif tg_table_name = 'workspace_members' then
    resource_key := 'team_members';
    resource_limit := effective_plan.max_team_members;
    select pg_catalog.count(*)::integer into current_count
    from public.workspace_members m
    where m.workspace_id = target_workspace_id;
  else
    raise exception 'Unsupported plan-limited resource table: %', tg_table_name using errcode = '22023';
  end if;

  if current_count >= resource_limit then
    raise exception 'subscription_limit:%:%:%', resource_key, current_count, resource_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- New records and moves into a different workspace are checked. Existing records remain accessible.
drop trigger if exists enforce_brand_plan_limit on public.brands;
create trigger enforce_brand_plan_limit
before insert or update of workspace_id on public.brands
for each row execute function public.enforce_workspace_resource_plan_limit();

drop trigger if exists enforce_social_account_plan_limit on public.social_accounts;
create trigger enforce_social_account_plan_limit
before insert or update of workspace_id, connection_state on public.social_accounts
for each row execute function public.enforce_workspace_resource_plan_limit();

drop trigger if exists enforce_workspace_member_plan_limit on public.workspace_members;
create trigger enforce_workspace_member_plan_limit
before insert or update of workspace_id on public.workspace_members
for each row execute function public.enforce_workspace_resource_plan_limit();

create or replace function public.reserve_workspace_ai_generation(
  target_workspace_id uuid,
  target_request_id uuid,
  target_generation_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  effective_plan public.billing_plans%rowtype;
  existing_usage public.workspace_ai_generation_usage%rowtype;
  current_month date := pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'UTC')::date;
  used_count integer := 0;
  usage_limit integer := 0;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null or target_request_id is null or target_generation_type is null
     or target_generation_type not in ('content_draft','provider_variants') then
    raise exception 'Invalid AI generation reservation' using errcode = '22023';
  end if;
  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then
    raise exception 'A content-publishing workspace role is required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace_id::text, 6102));
  perform 1 from public.workspaces w where w.id = target_workspace_id for update;
  if not found then raise exception 'Workspace does not exist' using errcode = '22023'; end if;
  select * into effective_plan from public.get_effective_workspace_billing_plan(target_workspace_id);
  usage_limit := effective_plan.monthly_ai_generations;

  -- A crashed request cannot hold quota forever. Reservations older than 15 minutes expire.
  update public.workspace_ai_generation_usage
  set status = 'released', released_at = pg_catalog.now()
  where workspace_id = target_workspace_id and usage_month = current_month
    and status = 'reserved' and created_at < pg_catalog.now() - interval '15 minutes';

  select * into existing_usage from public.workspace_ai_generation_usage u
  where u.workspace_id = target_workspace_id and u.request_id = target_request_id
  for update;
  if found then
    if existing_usage.actor_user_id <> current_user_id then
      raise exception 'Reservation belongs to another workspace member' using errcode = '42501';
    end if;
    if existing_usage.status = 'reserved' then
      return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'reservation_already_exists',
        'used', 0, 'limit', usage_limit, 'remaining', usage_limit, 'plan_code', effective_plan.code);
    end if;
    if existing_usage.status = 'consumed' then
      return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'request_already_consumed',
        'used', 0, 'limit', usage_limit, 'remaining', usage_limit, 'plan_code', effective_plan.code);
    end if;
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'reservation_released',
      'used', 0, 'limit', usage_limit, 'remaining', usage_limit, 'plan_code', effective_plan.code);
  end if;

  select pg_catalog.count(*)::integer into used_count
  from public.workspace_ai_generation_usage u
  where u.workspace_id = target_workspace_id and u.usage_month = current_month
    and (u.status = 'consumed' or (u.status = 'reserved' and u.created_at >= pg_catalog.now() - interval '15 minutes'));

  if used_count >= usage_limit then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', used_count,
      'limit', usage_limit, 'remaining', 0, 'plan_code', effective_plan.code);
  end if;

  insert into public.workspace_ai_generation_usage (
    workspace_id, request_id, actor_user_id, generation_type, usage_month, status
  ) values (
    target_workspace_id, target_request_id, current_user_id, target_generation_type, current_month, 'reserved'
  );
  return pg_catalog.jsonb_build_object('allowed', true, 'reason', 'reserved', 'used', used_count + 1,
    'limit', usage_limit, 'remaining', greatest(0, usage_limit - used_count - 1), 'plan_code', effective_plan.code);
end;
$$;

create or replace function public.complete_workspace_ai_generation(
  target_workspace_id uuid,
  target_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_status text;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.workspace_ai_generation_usage
  set status = 'consumed', consumed_at = pg_catalog.now()
  where workspace_id = target_workspace_id and request_id = target_request_id
    and actor_user_id = current_user_id and status = 'reserved';
  if found then return true; end if;
  select u.status into existing_status from public.workspace_ai_generation_usage u
  where u.workspace_id = target_workspace_id and u.request_id = target_request_id
    and u.actor_user_id = current_user_id;
  return existing_status = 'consumed';
end;
$$;

create or replace function public.release_workspace_ai_generation(
  target_workspace_id uuid,
  target_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.workspace_ai_generation_usage
  set status = 'released', released_at = pg_catalog.now()
  where workspace_id = target_workspace_id and request_id = target_request_id
    and actor_user_id = current_user_id and status = 'reserved';
  return found;
end;
$$;

create or replace function public.get_workspace_entitlement_snapshot(target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  effective_plan public.billing_plans%rowtype;
  current_month date := pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'UTC')::date;
  connected_count integer := 0;
  brand_count integer := 0;
  member_count integer := 0;
  ai_count integer := 0;
  active_subscription_status text := 'free';
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = current_user_id
  ) then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;
  select * into effective_plan from public.get_effective_workspace_billing_plan(target_workspace_id);
  select s.status into active_subscription_status
  from public.workspace_subscriptions s
  where s.workspace_id = target_workspace_id and s.status in ('active','past_due')
    and s.current_period_ends_at > pg_catalog.now()
  order by s.current_period_ends_at desc, s.updated_at desc limit 1;

  select pg_catalog.count(*)::integer into connected_count
  from public.social_accounts a where a.workspace_id = target_workspace_id and a.connection_state = 'connected';
  select pg_catalog.count(*)::integer into brand_count
  from public.brands b where b.workspace_id = target_workspace_id;
  select pg_catalog.count(*)::integer into member_count
  from public.workspace_members m where m.workspace_id = target_workspace_id;
  select pg_catalog.count(*)::integer into ai_count
  from public.workspace_ai_generation_usage u
  where u.workspace_id = target_workspace_id and u.usage_month = current_month
    and (u.status = 'consumed' or (u.status = 'reserved' and u.created_at >= pg_catalog.now() - interval '15 minutes'));

  return pg_catalog.jsonb_build_object(
    'plan_code', effective_plan.code,
    'plan_name', effective_plan.name,
    'subscription_status', coalesce(active_subscription_status, 'free'),
    'usage_month', current_month,
    'connected_accounts', pg_catalog.jsonb_build_object('used', connected_count, 'limit', effective_plan.max_connected_accounts),
    'brands', pg_catalog.jsonb_build_object('used', brand_count, 'limit', effective_plan.max_brands),
    'team_members', pg_catalog.jsonb_build_object('used', member_count, 'limit', effective_plan.max_team_members),
    'ai_generations', pg_catalog.jsonb_build_object('used', ai_count, 'limit', effective_plan.monthly_ai_generations),
    'client_workspace_limit', effective_plan.max_client_workspaces,
    'client_workspace_enforcement', 'not_implemented'
  );
end;
$$;

revoke all on function public.get_effective_workspace_billing_plan(uuid) from public, anon, authenticated;
revoke all on function public.enforce_workspace_resource_plan_limit() from public, anon, authenticated;
revoke all on function public.reserve_workspace_ai_generation(uuid, uuid, text) from public, anon;
revoke all on function public.complete_workspace_ai_generation(uuid, uuid) from public, anon;
revoke all on function public.release_workspace_ai_generation(uuid, uuid) from public, anon;
revoke all on function public.get_workspace_entitlement_snapshot(uuid) from public, anon;
grant execute on function public.reserve_workspace_ai_generation(uuid, uuid, text) to authenticated;
grant execute on function public.complete_workspace_ai_generation(uuid, uuid) to authenticated;
grant execute on function public.release_workspace_ai_generation(uuid, uuid) to authenticated;
grant execute on function public.get_workspace_entitlement_snapshot(uuid) to authenticated;

comment on table public.workspace_ai_generation_usage is 'Workspace-scoped monthly AI content-generation usage. Reservations expire after 15 minutes unless completed; released failures do not consume quota.';
comment on function public.get_workspace_entitlement_snapshot(uuid) is 'Returns the authenticated workspace member a safe plan and usage snapshot; never exposes billing provider secrets.';
