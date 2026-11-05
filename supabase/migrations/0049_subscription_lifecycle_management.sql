-- RuffNeck Social Hub v6.5.0 — subscription lifecycle operations.
-- Adds an auditable, human-controlled lifecycle layer on top of migration 0043.
-- No cron/background job is installed. No provider cancellation is claimed unless
-- a platform administrator has separately confirmed it in Flutterwave Dashboard.
-- A workspace cancellation request does not call Flutterwave and does not stop provider billing.

alter table public.workspace_subscriptions
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists provider_cancelled_at timestamptz,
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists lifecycle_updated_at timestamptz not null default now();

create table if not exists public.workspace_subscription_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.workspace_subscriptions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null check (event_type in (
    'subscription_started', 'payment_renewal', 'marked_past_due',
    'cancellation_requested', 'cancellation_withdrawn',
    'provider_cancellation_confirmed', 'grace_period_granted',
    'subscription_expired', 'subscription_cancelled', 'subscription_reactivated'
  )),
  actor_type text not null default 'provider_or_system'
    check (actor_type in ('workspace_admin', 'platform_admin', 'provider_or_system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  event_note text not null default '' check (char_length(event_note) <= 2000),
  event_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(event_metadata) = 'object'),
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists workspace_subscription_lifecycle_subscription_event_idx
  on public.workspace_subscription_lifecycle_events(subscription_id, event_at desc);
create index if not exists workspace_subscription_lifecycle_workspace_event_idx
  on public.workspace_subscription_lifecycle_events(workspace_id, event_at desc);

alter table public.workspace_subscription_lifecycle_events enable row level security;
-- Lifecycle notes are operational audit data. Only the platform server can read
-- them; workspace users continue to see their subscription status, not admin notes.
revoke all on table public.workspace_subscription_lifecycle_events from public, anon, authenticated, service_role;
grant select on table public.workspace_subscription_lifecycle_events to service_role;

-- Populate event history from database-side subscription changes. Direct browser
-- writes to subscriptions/events remain unavailable; only guarded RPCs and the
-- existing service-role billing functions can mutate lifecycle state.
create or replace function public.prepare_workspace_subscription_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_payment_at is distinct from old.last_payment_at
     and new.last_payment_at > old.last_payment_at then
    -- A confirmed renewal supersedes an earlier cancellation request or grace
    -- period. The payment approval function remains the authority for renewal.
    new.cancel_at_period_end := false;
    new.cancel_requested_at := null;
    new.provider_cancelled_at := null;
    new.grace_period_ends_at := null;
    new.cancelled_at := null;
    if new.status = 'past_due' then
      new.status := 'active';
    end if;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status <> 'cancelled' and new.status in ('active', 'past_due') then
    new.cancelled_at := null;
  end if;

  if new.status is distinct from old.status
     or new.cancel_at_period_end is distinct from old.cancel_at_period_end
     or new.cancel_requested_at is distinct from old.cancel_requested_at
     or new.provider_cancelled_at is distinct from old.provider_cancelled_at
     or new.grace_period_ends_at is distinct from old.grace_period_ends_at
     or new.current_period_ends_at is distinct from old.current_period_ends_at
     or new.last_payment_at is distinct from old.last_payment_at then
    new.lifecycle_updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_workspace_subscription_lifecycle_update() from public, anon, authenticated;

drop trigger if exists workspace_subscription_lifecycle_prepare
  on public.workspace_subscriptions;
create trigger workspace_subscription_lifecycle_prepare
  before update on public.workspace_subscriptions
  for each row execute function public.prepare_workspace_subscription_lifecycle_update();

create or replace function public.record_workspace_subscription_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_event_type text;
  actor_text text;
  actor_id uuid;
  chosen_actor_type text;
  chosen_note text;
  old_status text;
  new_status text;
begin
  actor_text := nullif(current_setting('ruffneck.lifecycle_actor_id', true), '');
  if actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor_id := actor_text::uuid;
  end if;
  chosen_actor_type := coalesce(nullif(current_setting('ruffneck.lifecycle_actor_type', true), ''), 'provider_or_system');
  if chosen_actor_type not in ('workspace_admin', 'platform_admin', 'provider_or_system') then
    chosen_actor_type := 'provider_or_system';
  end if;
  chosen_note := pg_catalog.left(coalesce(current_setting('ruffneck.lifecycle_note', true), ''), 2000);

  if tg_op = 'INSERT' then
    chosen_event_type := 'subscription_started';
    insert into public.workspace_subscription_lifecycle_events (
      subscription_id, workspace_id, event_type, actor_type, actor_user_id,
      event_note, event_metadata
    ) values (
      new.id, new.workspace_id, chosen_event_type, chosen_actor_type, actor_id,
      chosen_note,
      pg_catalog.jsonb_build_object('status', new.status, 'plan_id', new.plan_id,
        'billing_interval', new.billing_interval, 'period_ends_at', new.current_period_ends_at)
    );
    return new;
  end if;

  old_status := old.status;
  new_status := new.status;
  if new.last_payment_at is distinct from old.last_payment_at
     and new.last_payment_at > old.last_payment_at then
    chosen_event_type := 'payment_renewal';
  elsif new.status is distinct from old.status then
    chosen_event_type := case new.status
      when 'past_due' then 'marked_past_due'
      when 'expired' then 'subscription_expired'
      when 'cancelled' then 'subscription_cancelled'
      when 'active' then 'subscription_reactivated'
      else null end;
  elsif new.provider_cancelled_at is distinct from old.provider_cancelled_at
        and new.provider_cancelled_at is not null then
    chosen_event_type := 'provider_cancellation_confirmed';
  elsif new.cancel_at_period_end is distinct from old.cancel_at_period_end then
    chosen_event_type := case when new.cancel_at_period_end
      then 'cancellation_requested' else 'cancellation_withdrawn' end;
  elsif new.grace_period_ends_at is distinct from old.grace_period_ends_at
        and new.grace_period_ends_at is not null then
    chosen_event_type := 'grace_period_granted';
  else
    return new;
  end if;

  if chosen_event_type is not null then
    insert into public.workspace_subscription_lifecycle_events (
      subscription_id, workspace_id, event_type, actor_type, actor_user_id,
      event_note, event_metadata
    ) values (
      new.id, new.workspace_id, chosen_event_type, chosen_actor_type, actor_id,
      chosen_note,
      pg_catalog.jsonb_build_object(
        'old_status', old_status,
        'new_status', new_status,
        'cancel_at_period_end', new.cancel_at_period_end,
        'period_ends_at', new.current_period_ends_at,
        'grace_period_ends_at', new.grace_period_ends_at
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_workspace_subscription_lifecycle_event() from public, anon, authenticated;

drop trigger if exists workspace_subscription_lifecycle_event
  on public.workspace_subscriptions;
create trigger workspace_subscription_lifecycle_event
  after insert or update on public.workspace_subscriptions
  for each row execute function public.record_workspace_subscription_lifecycle_event();

-- Workspace owners/admins can request an end-of-period cancellation or withdraw
-- their request before the provider cancellation is confirmed. This does not
-- call Flutterwave and does not stop recurring provider billing by itself.
create or replace function public.request_workspace_subscription_cancellation(
  target_subscription_id uuid,
  target_cancel boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  member_role text;
  subscription_row public.workspace_subscriptions%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_subscription_id is null or target_cancel is null then
    raise exception 'A subscription and cancellation choice are required' using errcode = '22023';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  join public.workspace_subscriptions s on s.workspace_id = m.workspace_id
  where s.id = target_subscription_id and m.user_id = actor_id;
  if member_role is null or member_role not in ('owner', 'admin') then
    raise exception 'Only workspace owners and admins can manage subscription cancellation' using errcode = '42501';
  end if;

  select * into subscription_row
  from public.workspace_subscriptions s
  where s.id = target_subscription_id
  for update;
  if not found then
    raise exception 'Subscription not found' using errcode = 'P0002';
  end if;
  if subscription_row.status not in ('active', 'past_due') then
    raise exception 'Only active or past-due subscriptions can be changed' using errcode = '55000';
  end if;
  if not target_cancel and subscription_row.provider_cancelled_at is not null then
    raise exception 'The provider cancellation is already confirmed; contact billing support to restore the provider plan' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', actor_id::text, true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'workspace_admin', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_note', '', true);

  update public.workspace_subscriptions
  set cancel_at_period_end = target_cancel,
      cancel_requested_at = case when target_cancel then coalesce(cancel_requested_at, now()) else null end,
      updated_at = now()
  where id = target_subscription_id;
  return true;
end;
$$;

-- Platform administrators call the following functions through the server-only
-- service-role client after a separate Flutterwave Dashboard inspection.
create or replace function public.confirm_workspace_subscription_provider_cancellation(
  target_subscription_id uuid,
  target_actor_id uuid,
  target_confirmation_phrase text,
  target_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_actor_id is null or target_confirmation_phrase is distinct from 'CANCELLED IN FLUTTERWAVE'
     or target_note is null or pg_catalog.char_length(pg_catalog.btrim(target_note)) not between 20 and 2000
     or pg_catalog.strpos(target_note, target_subscription_id::text) = 0 then
    raise exception 'Provider-dashboard confirmation and a subscription-specific note are required' using errcode = '22023';
  end if;
  select * into subscription_row from public.workspace_subscriptions s
  where s.id = target_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  if subscription_row.status not in ('active', 'past_due') or subscription_row.cancel_at_period_end is not true then
    raise exception 'A cancellation request must exist before provider cancellation can be confirmed' using errcode = '55000';
  end if;
  if subscription_row.provider_cancelled_at is not null then return true; end if;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', target_actor_id::text, true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'platform_admin', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_note', pg_catalog.btrim(target_note), true);

  update public.workspace_subscriptions
  set provider_cancelled_at = now(),
      cancel_requested_at = coalesce(cancel_requested_at, now()),
      updated_at = now()
  where id = target_subscription_id;
  return true;
end;
$$;

create or replace function public.mark_workspace_subscription_past_due(
  target_subscription_id uuid,
  target_actor_id uuid,
  target_confirmation_phrase text,
  target_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_actor_id is null or target_confirmation_phrase is distinct from 'MARK PAST DUE'
     or target_note is null or pg_catalog.char_length(pg_catalog.btrim(target_note)) not between 20 and 2000
     or pg_catalog.strpos(target_note, target_subscription_id::text) = 0 then
    raise exception 'Dashboard review confirmation and a subscription-specific note are required' using errcode = '22023';
  end if;
  select * into subscription_row from public.workspace_subscriptions s
  where s.id = target_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  if subscription_row.status <> 'active'
     or subscription_row.cancel_at_period_end is true
     or subscription_row.current_period_ends_at > now() then
    raise exception 'Only an active, non-cancelling subscription whose paid period has ended can be marked past due' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', target_actor_id::text, true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'platform_admin', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_note', pg_catalog.btrim(target_note), true);

  update public.workspace_subscriptions
  set status = 'past_due',
      grace_period_ends_at = now() + interval '5 days',
      updated_at = now()
  where id = target_subscription_id;
  return true;
end;
$$;

create or replace function public.grant_workspace_subscription_grace_period(
  target_subscription_id uuid,
  target_actor_id uuid,
  target_days integer,
  target_confirmation_phrase text,
  target_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_actor_id is null or target_days is null or target_days not between 1 and 30
     or target_confirmation_phrase is distinct from 'GRANT GRACE'
     or target_note is null or pg_catalog.char_length(pg_catalog.btrim(target_note)) not between 20 and 2000
     or pg_catalog.strpos(target_note, target_subscription_id::text) = 0 then
    raise exception 'A 1–30 day grace period, confirmation phrase and subscription-specific note are required' using errcode = '22023';
  end if;
  select * into subscription_row from public.workspace_subscriptions s
  where s.id = target_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  if subscription_row.status <> 'past_due' then
    raise exception 'Grace periods can only be granted to past-due subscriptions' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', target_actor_id::text, true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'platform_admin', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_note', pg_catalog.btrim(target_note), true);

  update public.workspace_subscriptions
  set grace_period_ends_at = greatest(coalesce(grace_period_ends_at, now()), now())
    + (target_days::double precision * interval '1 day'),
    updated_at = now()
  where id = target_subscription_id;
  return true;
end;
$$;

create or replace function public.expire_workspace_subscription(
  target_subscription_id uuid,
  target_actor_id uuid,
  target_confirmation_phrase text,
  target_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_actor_id is null or target_confirmation_phrase is distinct from 'EXPIRE'
     or target_note is null or pg_catalog.char_length(pg_catalog.btrim(target_note)) not between 20 and 2000
     or pg_catalog.strpos(target_note, target_subscription_id::text) = 0 then
    raise exception 'Expiry confirmation and a subscription-specific note are required' using errcode = '22023';
  end if;
  select * into subscription_row from public.workspace_subscriptions s
  where s.id = target_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  if subscription_row.status <> 'past_due'
     or subscription_row.cancel_at_period_end is true
     or subscription_row.grace_period_ends_at is null
     or subscription_row.grace_period_ends_at > now() then
    raise exception 'The subscription must be past due, not in scheduled cancellation, and have an elapsed grace period before expiry' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', target_actor_id::text, true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'platform_admin', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_note', pg_catalog.btrim(target_note), true);

  update public.workspace_subscriptions
  set status = 'expired', updated_at = now()
  where id = target_subscription_id;
  return true;
end;
$$;

create or replace function public.finalize_workspace_subscription_cancellation(
  target_subscription_id uuid,
  target_actor_id uuid,
  target_confirmation_phrase text,
  target_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.workspace_subscriptions%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_actor_id is null or target_confirmation_phrase is distinct from 'FINALIZE CANCELLATION'
     or target_note is null or pg_catalog.char_length(pg_catalog.btrim(target_note)) not between 20 and 2000
     or pg_catalog.strpos(target_note, target_subscription_id::text) = 0 then
    raise exception 'Cancellation confirmation and a subscription-specific note are required' using errcode = '22023';
  end if;
  select * into subscription_row from public.workspace_subscriptions s
  where s.id = target_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  if subscription_row.status not in ('active', 'past_due')
     or subscription_row.cancel_at_period_end is not true
     or subscription_row.provider_cancelled_at is null
     or subscription_row.current_period_ends_at > now() then
    raise exception 'Cancellation can be finalized only after provider cancellation is confirmed and the paid period has ended' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', target_actor_id::text, true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'platform_admin', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_note', pg_catalog.btrim(target_note), true);

  update public.workspace_subscriptions
  set status = 'cancelled', cancel_at_period_end = false, updated_at = now()
  where id = target_subscription_id;
  return true;
end;
$$;

-- Preserve the existing manual-approval renewal contract while clearing stale
-- cancellation/grace state whenever a newer approved renewal is recorded.
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
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
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
    upper(target_currency), subscription_row.customer_email, subscription_row.provider_plan_id,
    subscription_row.billing_interval, 'successful', target_paid_at
  ) on conflict do nothing;
  update public.workspace_subscriptions set
    current_period_ends_at = next_period_end,
    last_payment_at = target_paid_at,
    status = 'active',
    cancel_at_period_end = false,
    cancel_requested_at = null,
    provider_cancelled_at = null,
    grace_period_ends_at = null,
    cancelled_at = null,
    updated_at = now()
  where id = subscription_row.id;
  return true;
end;
$$;

-- Tight execute permissions: customer requests run under the authenticated
-- session; all platform-admin lifecycle changes run through the server key.
revoke all on function public.request_workspace_subscription_cancellation(uuid, boolean)
  from public, anon;
grant execute on function public.request_workspace_subscription_cancellation(uuid, boolean)
  to authenticated;

revoke all on function public.confirm_workspace_subscription_provider_cancellation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_workspace_subscription_provider_cancellation(uuid, uuid, text, text)
  to service_role;
revoke all on function public.mark_workspace_subscription_past_due(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_workspace_subscription_past_due(uuid, uuid, text, text)
  to service_role;
revoke all on function public.grant_workspace_subscription_grace_period(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_workspace_subscription_grace_period(uuid, uuid, integer, text, text)
  to service_role;
revoke all on function public.expire_workspace_subscription(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.expire_workspace_subscription(uuid, uuid, text, text)
  to service_role;
revoke all on function public.finalize_workspace_subscription_cancellation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_workspace_subscription_cancellation(uuid, uuid, text, text)
  to service_role;
revoke all on function public.record_workspace_subscription_renewal(uuid, text, text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_workspace_subscription_renewal(uuid, text, text, numeric, text, timestamptz)
  to service_role;

comment on table public.workspace_subscription_lifecycle_events is
  'Append-only operational history for workspace subscription cancellation, renewal, grace-period and expiry transitions. Event writes are created by database triggers.';
comment on function public.request_workspace_subscription_cancellation(uuid, boolean) is
  'Workspace owner/admin records or withdraws an end-of-period cancellation request. It does not call Flutterwave or stop provider billing.';
comment on function public.confirm_workspace_subscription_provider_cancellation(uuid, uuid, text, text) is
  'Platform-admin-only confirmation that the recurring provider plan was separately cancelled in Flutterwave Dashboard.';
comment on function public.mark_workspace_subscription_past_due(uuid, uuid, text, text) is
  'Platform-admin-only status change after the paid subscription period elapsed and the provider dashboard was checked for a renewal.';
comment on function public.grant_workspace_subscription_grace_period(uuid, uuid, integer, text, text) is
  'Platform-admin-only extension of the access grace window for a past-due subscription.';
comment on function public.expire_workspace_subscription(uuid, uuid, text, text) is
  'Platform-admin-only expiry after the recorded grace period ended and the provider dashboard was checked.';
comment on function public.finalize_workspace_subscription_cancellation(uuid, uuid, text, text) is
  'Finalizes a requested cancellation only after provider cancellation has been confirmed and the paid term has ended.';
