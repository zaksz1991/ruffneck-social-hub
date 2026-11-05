-- RuffNeck Social Hub v6.6.0 — daily, idempotent subscription lifecycle processor.
-- This processor does not call Flutterwave, does not infer a successful payment,
-- does not extend a paid period, and does not expire a subscription after grace.
-- It only (1) moves active subscriptions with elapsed paid periods and no
-- cancellation request into the existing five-day past-due grace state, and
-- (2) finalizes a cancellation after a platform admin has separately confirmed
-- provider cancellation and the paid period has ended.

create table if not exists public.workspace_subscription_lifecycle_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null default 'vercel_daily_cron'
    check (trigger_source in ('vercel_daily_cron')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  batch_size integer not null check (batch_size between 1 and 500),
  marked_past_due integer not null default 0 check (marked_past_due >= 0),
  finalized_cancellations integer not null default 0 check (finalized_cancellations >= 0),
  backlog_remaining boolean not null default false,
  outcome text not null default 'running'
    check (outcome in ('running', 'completed', 'backlog', 'failed')),
  safe_error_code text check (safe_error_code is null or safe_error_code in ('processor_error'))
);

create index if not exists workspace_subscription_lifecycle_runs_started_idx
  on public.workspace_subscription_lifecycle_runs(started_at desc);

alter table public.workspace_subscription_lifecycle_runs enable row level security;
revoke all on table public.workspace_subscription_lifecycle_runs from public, anon, authenticated;
grant select, insert, update on table public.workspace_subscription_lifecycle_runs to service_role;

create or replace function public.process_due_workspace_subscription_lifecycle_batch(
  target_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_batch_size integer := coalesce(target_batch_size, 250);
  chosen_run_id uuid;
  v_changed_past_due integer := 0;
  v_finalized_cancellations integer := 0;
  backlog boolean := false;
  as_of timestamptz := now();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if chosen_batch_size not between 1 and 500 then
    raise exception 'Batch size must be between 1 and 500' using errcode = '22023';
  end if;

  -- A transaction-scoped advisory lock prevents overlapping daily or manual invocations.
  if not pg_catalog.pg_try_advisory_xact_lock(741920665, 6500) then
    return pg_catalog.jsonb_build_object('locked', true, 'processed', false);
  end if;

  insert into public.workspace_subscription_lifecycle_runs(batch_size)
  values (chosen_batch_size)
  returning id into chosen_run_id;

  perform pg_catalog.set_config('ruffneck.lifecycle_actor_id', '', true);
  perform pg_catalog.set_config('ruffneck.lifecycle_actor_type', 'provider_or_system', true);
  perform pg_catalog.set_config(
    'ruffneck.lifecycle_note',
    'Daily subscription lifecycle processor. No provider API call or payment verification was performed.',
    true
  );

  -- A cancellation is finalized only when provider cancellation was already
  -- attested by a platform administrator and the paid-through date has passed.
  with candidates as (
    select s.id
    from public.workspace_subscriptions s
    where s.status in ('active', 'past_due')
      and s.cancel_at_period_end is true
      and s.provider_cancelled_at is not null
      and s.current_period_ends_at <= as_of
    order by s.current_period_ends_at asc, s.id asc
    for update skip locked
    limit chosen_batch_size
  )
  update public.workspace_subscriptions s
  set status = 'cancelled', cancel_at_period_end = false, updated_at = as_of
  from candidates c
  where s.id = c.id;
  get diagnostics v_finalized_cancellations = row_count;

  -- An active paid period that elapsed without a recorded, approved renewal
  -- enters the five-day grace state. A renewal approved later clears it through
  -- the existing protected record_workspace_subscription_renewal RPC.
  with candidates as (
    select s.id
    from public.workspace_subscriptions s
    where s.status = 'active'
      and s.cancel_at_period_end is not true
      and s.current_period_ends_at <= as_of
    order by s.current_period_ends_at asc, s.id asc
    for update skip locked
    limit chosen_batch_size
  )
  update public.workspace_subscriptions s
  set status = 'past_due', grace_period_ends_at = as_of + interval '5 days', updated_at = as_of
  from candidates c
  where s.id = c.id;
  get diagnostics v_changed_past_due = row_count;

  select exists (
    select 1 from public.workspace_subscriptions s
    where s.status in ('active', 'past_due')
      and s.cancel_at_period_end is true
      and s.provider_cancelled_at is not null
      and s.current_period_ends_at <= as_of
  ) or exists (
    select 1 from public.workspace_subscriptions s
    where s.status = 'active'
      and s.cancel_at_period_end is not true
      and s.current_period_ends_at <= as_of
  ) into backlog;

  update public.workspace_subscription_lifecycle_runs
  set completed_at = now(),
      marked_past_due = v_changed_past_due,
      finalized_cancellations = v_finalized_cancellations,
      backlog_remaining = backlog,
      outcome = case when backlog then 'backlog' else 'completed' end
  where id = chosen_run_id;

  return pg_catalog.jsonb_build_object(
    'locked', false,
    'processed', true,
    'run_id', chosen_run_id,
    'marked_past_due', v_changed_past_due,
    'finalized_cancellations', v_finalized_cancellations,
    'backlog_remaining', backlog,
    'as_of', as_of
  );
end;
$$;

revoke all on function public.process_due_workspace_subscription_lifecycle_batch(integer)
  from public, anon, authenticated;
grant execute on function public.process_due_workspace_subscription_lifecycle_batch(integer)
  to service_role;

comment on table public.workspace_subscription_lifecycle_runs is
  'Safe run summaries for the daily subscription lifecycle processor. No payment or provider credentials are stored.';
comment on function public.process_due_workspace_subscription_lifecycle_batch(integer) is
  'Service-role-only, idempotent batch processor. Moves ended active terms to a five-day past-due grace state and finalizes only cancellations already confirmed in Flutterwave by an administrator. Does not verify payments, contact Flutterwave, or expire grace-ended subscriptions.';
