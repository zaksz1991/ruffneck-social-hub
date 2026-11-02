-- RuffNeck Social Hub v6.0.0 — workspace subscriptions and Flutterwave billing foundation.
-- Apply after migration 0042. Checkout remains disabled until real Flutterwave plan IDs and approved prices are configured.

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  price_amount numeric(12,2) not null check (price_amount >= 0 and price_amount <= 1000000000),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','yearly')),
  max_connected_accounts integer not null check (max_connected_accounts between 1 and 1000),
  max_brands integer not null check (max_brands between 1 and 500),
  max_team_members integer not null check (max_team_members between 1 and 500),
  max_client_workspaces integer not null check (max_client_workspaces between 1 and 500),
  monthly_ai_generations integer not null check (monthly_ai_generations between 0 and 1000000),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  display_order integer not null default 0,
  is_active boolean not null default true,
  checkout_enabled boolean not null default false,
  flutterwave_payment_plan_id text check (flutterwave_payment_plan_id is null or flutterwave_payment_plan_id ~ '^[0-9]{1,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.billing_plans (
  code, name, description, price_amount, currency, billing_interval,
  max_connected_accounts, max_brands, max_team_members, max_client_workspaces,
  monthly_ai_generations, features, display_order, is_active, checkout_enabled
) values
  ('free', 'Free', 'A practical starting point for an individual brand.', 0, 'NGN', 'monthly', 2, 1, 1, 1, 30,
   '{"analytics":"basic","client_approval":false,"agency_reporting":false}'::jsonb, 1, true, false),
  ('starter', 'Starter', 'For a small business managing a growing social presence.', 5000, 'NGN', 'monthly', 5, 1, 2, 1, 150,
   '{"analytics":"standard","client_approval":false,"agency_reporting":false}'::jsonb, 2, true, false),
  ('professional', 'Professional', 'For teams managing several brands and campaigns.', 15000, 'NGN', 'monthly', 15, 5, 5, 5, 600,
   '{"analytics":"advanced","client_approval":true,"agency_reporting":true}'::jsonb, 3, true, false),
  ('agency', 'Agency', 'For agencies coordinating multiple client workspaces.', 40000, 'NGN', 'monthly', 50, 20, 15, 20, 2000,
   '{"analytics":"advanced","client_approval":true,"agency_reporting":true,"white_label":"future"}'::jsonb, 4, true, false)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  max_connected_accounts = excluded.max_connected_accounts,
  max_brands = excluded.max_brands,
  max_team_members = excluded.max_team_members,
  max_client_workspaces = excluded.max_client_workspaces,
  monthly_ai_generations = excluded.monthly_ai_generations,
  features = excluded.features,
  display_order = excluded.display_order,
  updated_at = now();
-- Existing administrator-approved prices and provider IDs are deliberately not overwritten by the seed.

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  status text not null check (status in ('active','past_due','cancelled','expired')),
  provider text not null default 'flutterwave' check (provider in ('flutterwave')),
  provider_plan_id text not null,
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('monthly','yearly')),
  current_period_started_at timestamptz not null,
  current_period_ends_at timestamptz not null,
  cancel_at_period_end boolean not null default false,
  last_payment_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workspace_subscriptions_one_current_per_workspace_idx
  on public.workspace_subscriptions(workspace_id)
  where status in ('active','past_due');
create index if not exists workspace_subscriptions_email_plan_idx
  on public.workspace_subscriptions(customer_email, provider_plan_id, status);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  subscription_id uuid references public.workspace_subscriptions(id) on delete set null,
  provider text not null default 'flutterwave' check (provider in ('flutterwave')),
  reference text not null unique,
  provider_transaction_id text unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  provider_plan_id text not null check (provider_plan_id ~ '^[0-9]{1,20}$'),
  billing_interval text not null check (billing_interval in ('monthly','yearly')),
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','successful','failed','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_payments_workspace_created_idx
  on public.billing_payments(workspace_id, created_at desc);

create table if not exists public.billing_webhook_events (
  event_key text primary key,
  event_type text not null,
  provider_event_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text not null default 'received' check (outcome in ('received','processed','ignored','failed')),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object')
);

alter table public.billing_plans enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_webhook_events enable row level security;

revoke all on table public.billing_plans from public, anon, authenticated;
revoke all on table public.workspace_subscriptions from public, anon, authenticated;
revoke all on table public.billing_payments from public, anon, authenticated;
revoke all on table public.billing_webhook_events from public, anon, authenticated;
grant select on table public.billing_plans to authenticated;
grant select on table public.workspace_subscriptions to authenticated;
grant select on table public.billing_payments to authenticated;
grant select on table public.billing_plans to service_role;
grant select on table public.workspace_subscriptions to service_role;
grant select, update on table public.billing_payments to service_role;
grant select, insert, update on table public.billing_webhook_events to service_role;

drop policy if exists billing_plans_authenticated_read on public.billing_plans;
create policy billing_plans_authenticated_read on public.billing_plans
  for select to authenticated using (is_active = true);
drop policy if exists workspace_subscriptions_member_read on public.workspace_subscriptions;
create policy workspace_subscriptions_member_read on public.workspace_subscriptions
  for select to authenticated using (
    exists (select 1 from public.workspace_members m
      where m.workspace_id = workspace_subscriptions.workspace_id and m.user_id = auth.uid())
  );
drop policy if exists billing_payments_member_read on public.billing_payments;
create policy billing_payments_member_read on public.billing_payments
  for select to authenticated using (
    exists (select 1 from public.workspace_members m
      where m.workspace_id = billing_payments.workspace_id and m.user_id = auth.uid())
  );

create or replace function public.create_workspace_billing_checkout(
  target_workspace_id uuid,
  target_plan_code text,
  target_customer_email text
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
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
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
  if not found or plan_row.price_amount <= 0 then
    raise exception 'Select an available paid plan' using errcode = '22023';
  end if;
  if plan_row.checkout_enabled is not true or plan_row.flutterwave_payment_plan_id is null then
    raise exception 'Online checkout is not configured for this plan yet' using errcode = '55000';
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
    workspace_id, plan_id, reference, amount, currency, customer_email, provider_plan_id, billing_interval, created_by, status
  ) values (
    target_workspace_id, plan_row.id, payment_reference, plan_row.price_amount, plan_row.currency, lower(target_customer_email), plan_row.flutterwave_payment_plan_id, plan_row.billing_interval, current_user_id, 'pending'
  ) returning id into new_payment_id;
  return pg_catalog.jsonb_build_object(
    'payment_id', new_payment_id,
    'reference', payment_reference,
    'amount', plan_row.price_amount,
    'currency', plan_row.currency,
    'plan_name', plan_row.name,
    'provider_plan_id', plan_row.flutterwave_payment_plan_id
  );
end;
$$;

create or replace function public.activate_workspace_billing_payment(
  target_reference text,
  target_provider_transaction_id text,
  target_paid_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.billing_payments%rowtype;
  plan_row public.billing_plans%rowtype;
  activated_subscription_id uuid;
  period_end timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into payment_row from public.billing_payments p
  where p.reference = target_reference for update;
  if not found then raise exception 'Billing payment reference not found' using errcode = 'P0002'; end if;
  if target_provider_transaction_id is null or target_provider_transaction_id !~ '^[0-9]{1,30}$' then
    raise exception 'Invalid provider transaction identifier' using errcode = '22023';
  end if;
  if payment_row.status = 'successful' then
    if payment_row.provider_transaction_id = target_provider_transaction_id then return payment_row.workspace_id; end if;
    raise exception 'This invoice was already settled by a different provider transaction' using errcode = '55000';
  end if;
  if payment_row.status <> 'pending' then raise exception 'Billing payment is not pending' using errcode = '55000'; end if;
  if target_paid_at is null or target_paid_at > now() + interval '5 minutes' then
    raise exception 'Invalid verified payment timestamp' using errcode = '22023';
  end if;
  select * into plan_row from public.billing_plans p where p.id = payment_row.plan_id;
  if not found then raise exception 'Billing plan record is missing' using errcode = '55000'; end if;
  perform 1 from public.workspaces w where w.id = payment_row.workspace_id for update;
  if exists (select 1 from public.workspace_subscriptions s
    where s.workspace_id = payment_row.workspace_id and s.status in ('active','past_due')) then
    raise exception 'A paid subscription already exists for this workspace.' using errcode = '55000';
  end if;
  period_end := case when payment_row.billing_interval = 'yearly' then target_paid_at + interval '1 year' else target_paid_at + interval '1 month' end;
  insert into public.workspace_subscriptions (
    workspace_id, plan_id, status, provider, provider_plan_id, customer_email,
    amount, currency, billing_interval, current_period_started_at,
    current_period_ends_at, last_payment_at
  ) values (
    payment_row.workspace_id, plan_row.id, 'active', 'flutterwave',
    payment_row.provider_plan_id,
    payment_row.customer_email,
    payment_row.amount, payment_row.currency, payment_row.billing_interval,
    target_paid_at, period_end, target_paid_at
  ) returning id into activated_subscription_id;
  update public.billing_payments set status = 'successful',
    provider_transaction_id = target_provider_transaction_id,
    subscription_id = activated_subscription_id, paid_at = target_paid_at, updated_at = now()
  where id = payment_row.id;
  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    payment_row.workspace_id, payment_row.created_by, 'billing.subscription_activated', 'workspace_subscription',
    activated_subscription_id::text, 'success',
    pg_catalog.jsonb_build_object('plan_code', plan_row.code, 'amount', payment_row.amount, 'currency', payment_row.currency)
  );
  return payment_row.workspace_id;
end;
$$;

create or replace function public.record_workspace_subscription_renewal(
  target_workspace_id uuid,
  target_reference text,
  target_provider_transaction_id text,
  target_amount numeric,
  target_currency text,
  target_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
  existing_payment_id uuid;
  next_period_end timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into subscription_row from public.workspace_subscriptions s
  where s.workspace_id = target_workspace_id and s.status in ('active','past_due') for update;
  if not found then raise exception 'Active subscription not found' using errcode = 'P0002'; end if;
  select id into existing_payment_id from public.billing_payments
  where provider_transaction_id = target_provider_transaction_id or reference = target_reference;
  if existing_payment_id is not null then return true; end if;
  if target_provider_transaction_id is null or target_provider_transaction_id !~ '^[0-9]{1,30}$'
     or target_reference is null or char_length(target_reference) not between 3 and 120
     or target_amount is distinct from subscription_row.amount
     or upper(coalesce(target_currency,'')) <> subscription_row.currency
     or target_paid_at is null or target_paid_at > now() + interval '5 minutes'
     or target_paid_at <= subscription_row.last_payment_at then
    raise exception 'Renewal payment does not match the active subscription' using errcode = '22023';
  end if;
  next_period_end := greatest(subscription_row.current_period_ends_at, target_paid_at)
    + case when subscription_row.billing_interval = 'yearly' then interval '1 year' else interval '1 month' end;
  insert into public.billing_payments (
    workspace_id, plan_id, subscription_id, reference, provider_transaction_id,
    amount, currency, customer_email, provider_plan_id, billing_interval, status, paid_at
  ) values (
    subscription_row.workspace_id, subscription_row.plan_id, subscription_row.id,
    target_reference, target_provider_transaction_id, target_amount,
    upper(target_currency), subscription_row.customer_email, subscription_row.provider_plan_id, subscription_row.billing_interval, 'successful', target_paid_at
  ) on conflict do nothing;
  update public.workspace_subscriptions set
    current_period_ends_at = next_period_end, last_payment_at = target_paid_at,
    status = 'active', updated_at = now()
  where id = subscription_row.id;
  return true;
end;
$$;

create or replace function public.mark_workspace_subscription_past_due_from_provider(
  target_customer_email text,
  target_provider_plan_id text,
  target_failed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_count integer;
  matching_workspace_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if target_failed_at is null then raise exception 'Verified failed-charge timestamp is required' using errcode = '22023'; end if;
  select pg_catalog.count(*)::integer, (pg_catalog.min(s.workspace_id::text))::uuid
  into matching_count, matching_workspace_id
  from public.workspace_subscriptions s
  where lower(s.customer_email) = lower(target_customer_email)
    and s.provider_plan_id = target_provider_plan_id and s.status = 'active'
    and target_failed_at > s.last_payment_at;
  if matching_count <> 1 then return false; end if;
  update public.workspace_subscriptions set status = 'past_due', updated_at = now()
  where workspace_id = matching_workspace_id and provider_plan_id = target_provider_plan_id
    and lower(customer_email) = lower(target_customer_email) and status = 'active'
    and target_failed_at > last_payment_at;
  return found;
end;
$$;

create or replace function public.cancel_workspace_subscription_from_provider(
  target_customer_email text,
  target_provider_plan_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_count integer;
  matching_workspace_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select pg_catalog.count(*)::integer, (pg_catalog.min(s.workspace_id::text))::uuid
  into matching_count, matching_workspace_id
  from public.workspace_subscriptions s
  where lower(s.customer_email) = lower(target_customer_email)
    and s.provider_plan_id = target_provider_plan_id and s.status in ('active','past_due');
  if matching_count <> 1 then return false; end if;
  update public.workspace_subscriptions set status = 'cancelled', cancel_at_period_end = false, updated_at = now()
  where workspace_id = matching_workspace_id and provider_plan_id = target_provider_plan_id
    and lower(customer_email) = lower(target_customer_email) and status in ('active','past_due');
  return found;
end;
$$;

revoke all on function public.create_workspace_billing_checkout(uuid, text, text) from public, anon;
revoke all on function public.activate_workspace_billing_payment(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_workspace_subscription_renewal(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_workspace_subscription_from_provider(text, text) from public, anon, authenticated;
revoke all on function public.mark_workspace_subscription_past_due_from_provider(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_workspace_billing_checkout(uuid, text, text) to authenticated;
grant execute on function public.activate_workspace_billing_payment(text, text, timestamptz) to service_role;
grant execute on function public.record_workspace_subscription_renewal(uuid, text, text, numeric, text, timestamptz) to service_role;
grant execute on function public.cancel_workspace_subscription_from_provider(text, text) to service_role;
grant execute on function public.mark_workspace_subscription_past_due_from_provider(text, text, timestamptz) to service_role;

comment on table public.billing_plans is 'Commercial plan catalogue. Seed prices are proposals; checkout remains disabled until prices and Flutterwave plan IDs are approved.';
comment on table public.workspace_subscriptions is 'Workspace-scoped subscription state. Plan limits are catalogued; hard quota enforcement is a separate release.';
comment on table public.billing_payments is 'Workspace billing payment ledger. Browser clients have read-only access under workspace membership RLS.';
comment on table public.billing_webhook_events is 'Server-only Flutterwave webhook idempotency journal; raw payment payloads and card data are never stored.';
