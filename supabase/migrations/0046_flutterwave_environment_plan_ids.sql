-- RuffNeck Social Hub v6.1.1
-- Store separate Flutterwave payment-plan IDs for Test and Live accounts.
-- Apply after billing foundation migration 0043. Migration 0044/0045 may also
-- exist in the project; this migration only depends on the billing tables.

alter table public.billing_plans
  add column if not exists flutterwave_test_plan_id text,
  add column if not exists flutterwave_live_plan_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_plans_flutterwave_test_plan_id_format'
      and conrelid = 'public.billing_plans'::regclass
  ) then
    alter table public.billing_plans
      add constraint billing_plans_flutterwave_test_plan_id_format
      check (flutterwave_test_plan_id is null or flutterwave_test_plan_id ~ '^[0-9]{1,20}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_plans_flutterwave_live_plan_id_format'
      and conrelid = 'public.billing_plans'::regclass
  ) then
    alter table public.billing_plans
      add constraint billing_plans_flutterwave_live_plan_id_format
      check (flutterwave_live_plan_id is null or flutterwave_live_plan_id ~ '^[0-9]{1,20}$');
  end if;
end;
$$;

create unique index if not exists billing_plans_flutterwave_test_plan_id_unique
  on public.billing_plans(flutterwave_test_plan_id)
  where flutterwave_test_plan_id is not null;
create unique index if not exists billing_plans_flutterwave_live_plan_id_unique
  on public.billing_plans(flutterwave_live_plan_id)
  where flutterwave_live_plan_id is not null;


-- Any price, currency or interval edit invalidates both provider plan IDs.
-- A checkout must never continue using a plan that no longer matches the
-- price displayed in RuffNeck.
create or replace function public.invalidate_flutterwave_plan_ids_on_price_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price_amount is distinct from old.price_amount or
     new.currency is distinct from old.currency or
     new.billing_interval is distinct from old.billing_interval then
    new.flutterwave_test_plan_id := null;
    new.flutterwave_live_plan_id := null;
    new.checkout_enabled := false;
  end if;
  return new;
end;
$$;
drop trigger if exists billing_plans_invalidate_flutterwave_ids on public.billing_plans;
create trigger billing_plans_invalidate_flutterwave_ids
before update of price_amount, currency, billing_interval on public.billing_plans
for each row execute function public.invalidate_flutterwave_plan_ids_on_price_change();


-- Only the server-side service role may persist a plan ID after verifying the
-- provider's returned plan details. Browser users cannot write these columns.
create or replace function public.set_flutterwave_plan_for_billing(
  target_plan_code text,
  target_environment text,
  target_provider_plan_id text,
  target_expected_amount numeric,
  target_currency text,
  target_interval text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_row public.billing_plans%rowtype;
  selected_existing_id text;
  test_id text;
  live_id text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_environment is null or target_environment not in ('test','live') then
    raise exception 'Flutterwave environment must be test or live' using errcode = '22023';
  end if;
  if target_plan_code is null or target_plan_code !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'Invalid billing plan code' using errcode = '22023';
  end if;
  if target_provider_plan_id is null or target_provider_plan_id !~ '^[0-9]{1,20}$' then
    raise exception 'Invalid Flutterwave plan ID' using errcode = '22023';
  end if;
  if target_expected_amount is null or target_expected_amount <= 0 or
     target_currency is null or target_currency !~ '^[A-Z]{3}$' or
     (target_interval is null or target_interval not in ('monthly','yearly')) then
    raise exception 'Invalid expected billing plan definition' using errcode = '22023';
  end if;

  select * into plan_row
  from public.billing_plans p
  where p.code = target_plan_code and p.is_active = true
  for update;
  if not found then raise exception 'Active billing plan not found' using errcode = 'P0002'; end if;
  if plan_row.price_amount <> target_expected_amount or
     plan_row.currency <> target_currency or
     plan_row.billing_interval <> target_interval then
    raise exception 'Billing plan changed during provider setup; refresh and verify its price' using errcode = '40001';
  end if;

  if target_environment = 'test' then
    selected_existing_id := plan_row.flutterwave_test_plan_id;
  else
    selected_existing_id := plan_row.flutterwave_live_plan_id;
  end if;
  if selected_existing_id is not null and selected_existing_id <> target_provider_plan_id then
    raise exception 'A different Flutterwave plan ID is already assigned for this environment' using errcode = '55000';
  end if;

  if target_environment = 'test' then
    update public.billing_plans
      set flutterwave_test_plan_id = target_provider_plan_id,
          checkout_enabled = (target_provider_plan_id is not null or plan_row.flutterwave_live_plan_id is not null),
          updated_at = now()
    where id = plan_row.id;
  else
    update public.billing_plans
      set flutterwave_live_plan_id = target_provider_plan_id,
          checkout_enabled = (plan_row.flutterwave_test_plan_id is not null or target_provider_plan_id is not null),
          updated_at = now()
    where id = plan_row.id;
  end if;

  select flutterwave_test_plan_id, flutterwave_live_plan_id
    into test_id, live_id
  from public.billing_plans where id = plan_row.id;

  return pg_catalog.jsonb_build_object(
    'plan_code', target_plan_code,
    'environment', target_environment,
    'test_plan_configured', test_id is not null,
    'live_plan_configured', live_id is not null,
    'checkout_enabled', coalesce(test_id is not null or live_id is not null, false)
  );
end;
$$;
revoke all on function public.set_flutterwave_plan_for_billing(text, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.set_flutterwave_plan_for_billing(text, text, text, numeric, text, text) to service_role;

-- Replace the former three-argument checkout RPC with an environment-aware
-- version. Test IDs can never be used with Live credentials, or vice versa.
drop function if exists public.create_workspace_billing_checkout(uuid, text, text);
create or replace function public.create_workspace_billing_checkout(
  target_workspace_id uuid,
  target_plan_code text,
  target_customer_email text,
  target_provider_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  plan_row public.billing_plans%rowtype;
  payment_reference text;
  new_payment_id uuid;
  selected_provider_plan_id text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_provider_mode is null or target_provider_mode not in ('test','live') then
    raise exception 'A recognised Flutterwave environment is required' using errcode = '22023';
  end if;
  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin') then
    raise exception 'Only workspace owners and admins can manage billing' using errcode = '42501';
  end if;
  if target_customer_email is null or target_customer_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'A valid billing email is required' using errcode = '22023';
  end if;

  select * into plan_row from public.billing_plans p
  where p.code = target_plan_code and p.is_active = true;
  if not found or plan_row.price_amount <= 0 or
     plan_row.price_amount <> pg_catalog.trunc(plan_row.price_amount) or
     plan_row.price_amount > 2147483647 then
    raise exception 'Select an available plan with a positive whole-number amount within Flutterwave limits' using errcode = '22023';
  end if;
  selected_provider_plan_id := case
    when target_provider_mode = 'test' then plan_row.flutterwave_test_plan_id
    else plan_row.flutterwave_live_plan_id
  end;
  if selected_provider_plan_id is null then
    raise exception 'Flutterwave payment plan is not configured for this environment' using errcode = '55000';
  end if;

  perform 1 from public.workspaces w where w.id = target_workspace_id for update;
  if not found then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.workspace_subscriptions s
    where s.workspace_id = target_workspace_id and s.status in ('active','past_due')) then
    raise exception 'This workspace already has a paid subscription. Manage the current subscription before starting another.' using errcode = '55000';
  end if;
  if exists (select 1 from public.billing_payments bp
    where bp.workspace_id = target_workspace_id and bp.status = 'pending') then
    raise exception 'A checkout is already pending for this workspace. Verify its final provider status before starting another.' using errcode = '55000';
  end if;

  payment_reference := 'rnh_' || pg_catalog.replace(gen_random_uuid()::text, '-', '');
  insert into public.billing_payments (
    workspace_id, plan_id, reference, amount, currency, customer_email,
    provider_plan_id, billing_interval, created_by, status
  ) values (
    target_workspace_id, plan_row.id, payment_reference, plan_row.price_amount,
    plan_row.currency, lower(target_customer_email), selected_provider_plan_id,
    plan_row.billing_interval, current_user_id, 'pending'
  ) returning id into new_payment_id;

  return pg_catalog.jsonb_build_object(
    'payment_id', new_payment_id,
    'reference', payment_reference,
    'amount', plan_row.price_amount,
    'currency', plan_row.currency,
    'plan_name', plan_row.name,
    'provider_plan_id', selected_provider_plan_id,
    'provider_mode', target_provider_mode
  );
end;
$$;
revoke all on function public.create_workspace_billing_checkout(uuid, text, text, text) from public, anon;
grant execute on function public.create_workspace_billing_checkout(uuid, text, text, text) to authenticated;


-- Serialize plan provisioning per provider environment. This prevents two
-- platform administrators from creating duplicate same-name plans at once.
create table if not exists public.flutterwave_setup_locks (
  environment text primary key check (environment in ('test','live')),
  lock_token uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.flutterwave_setup_locks enable row level security;
revoke all on table public.flutterwave_setup_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.flutterwave_setup_locks to service_role;

create or replace function public.acquire_flutterwave_setup_lock(
  target_environment text,
  target_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_environment is null or target_environment not in ('test','live') or target_lock_token is null then
    raise exception 'Invalid Flutterwave setup lock request' using errcode = '22023';
  end if;

  insert into public.flutterwave_setup_locks(environment, lock_token, acquired_at, expires_at)
  values (target_environment, target_lock_token, now(), now() + interval '5 minutes')
  on conflict (environment) do update
    set lock_token = excluded.lock_token,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.flutterwave_setup_locks.expires_at <= now()
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;
revoke all on function public.acquire_flutterwave_setup_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_flutterwave_setup_lock(text, uuid) to service_role;

create or replace function public.release_flutterwave_setup_lock(
  target_environment text,
  target_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_environment is null or target_environment not in ('test','live') or target_lock_token is null then
    raise exception 'Invalid Flutterwave setup lock request' using errcode = '22023';
  end if;

  delete from public.flutterwave_setup_locks
  where environment = target_environment and lock_token = target_lock_token;
  get diagnostics removed = row_count;
  return removed = 1;
end;
$$;
revoke all on function public.release_flutterwave_setup_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.release_flutterwave_setup_lock(text, uuid) to service_role;

comment on column public.billing_plans.flutterwave_test_plan_id is 'Flutterwave Test account payment-plan ID; never use with Live credentials.';
comment on column public.billing_plans.flutterwave_live_plan_id is 'Flutterwave Live account payment-plan ID; never use with Test credentials.';
comment on function public.set_flutterwave_plan_for_billing(text, text, text, numeric, text, text) is 'Service-role-only write of a provider plan ID after server-side verification of amount, currency, interval and active status.';
