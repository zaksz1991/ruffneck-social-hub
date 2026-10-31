-- RuffNeck Social Hub: approved-content scheduling and publishing queue.
-- Apply after 0001_core.sql through 0004_content_approval_workflow.sql.
-- This migration creates durable schedule records only. It does NOT dispatch
-- posts to social networks; a verified provider worker is a separate release gate.

create index if not exists publishing_jobs_workspace_schedule_idx
  on public.publishing_jobs (workspace_id, scheduled_at asc);

-- A repeated form submission must not create duplicate active jobs for the
-- same approved content, destination account and scheduled instant.
create unique index if not exists publishing_jobs_no_duplicate_active_idx
  on public.publishing_jobs (content_id, social_account_id, scheduled_at)
  where state in ('queued', 'claimed', 'dispatching', 'retryable', 'needs_review');

-- Browser clients may read jobs through RLS but cannot manufacture or mutate
-- queue records. All writes go through narrow SECURITY DEFINER functions.
revoke insert, update, delete on public.publishing_jobs from anon, authenticated;

create or replace function public.schedule_approved_content(
  target_content_id uuid,
  target_social_account_id uuid,
  target_scheduled_local timestamp without time zone
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  content_row public.content_items%rowtype;
  account_row public.social_accounts%rowtype;
  brand_timezone text;
  scheduled_utc timestamptz;
  new_job_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_scheduled_local is null then
    raise exception 'Choose a valid date and time' using errcode = '22023';
  end if;

  select * into content_row
  from public.content_items c
  where c.id = target_content_id
  for update;
  if not found then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;
  if content_row.status <> 'approved' then
    raise exception 'Only approved content can be scheduled' using errcode = '22023';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = content_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your role cannot schedule content' using errcode = '42501';
  end if;

  select b.timezone into brand_timezone
  from public.brands b
  where b.id = content_row.brand_id
    and b.workspace_id = content_row.workspace_id;
  if brand_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = brand_timezone
  ) then
    raise exception 'The brand has an invalid timezone. Update the brand timezone before scheduling.' using errcode = '22023';
  end if;

  select * into account_row
  from public.social_accounts a
  where a.id = target_social_account_id
    and a.workspace_id = content_row.workspace_id
    and a.brand_id = content_row.brand_id
  for update;
  if not found then
    raise exception 'Choose a social account belonging to the same workspace and brand as this content' using errcode = '22023';
  end if;
  if account_row.connection_state <> 'connected' then
    raise exception 'This social account is not connected. Reconnect it before scheduling.' using errcode = '22023';
  end if;

  -- Input is interpreted in the brand's saved IANA timezone, not the server
  -- timezone or the browser machine timezone.
  scheduled_utc := target_scheduled_local at time zone brand_timezone;
  if scheduled_utc < now() + interval '2 minutes' then
    raise exception 'Schedule time must be at least two minutes in the future' using errcode = '22023';
  end if;
  if scheduled_utc > now() + interval '90 days' then
    raise exception 'Schedule time cannot be more than 90 days ahead' using errcode = '22023';
  end if;

  insert into public.publishing_jobs (
    workspace_id,
    brand_id,
    content_id,
    social_account_id,
    scheduled_at,
    state,
    idempotency_key
  ) values (
    content_row.workspace_id,
    content_row.brand_id,
    content_row.id,
    account_row.id,
    scheduled_utc,
    'queued',
    gen_random_uuid()::text
  ) returning id into new_job_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    content_row.workspace_id,
    current_user_id,
    'publishing.job_scheduled',
    'publishing_job',
    new_job_id::text,
    'success',
    jsonb_build_object(
      'provider', account_row.provider,
      'social_account_id', account_row.id,
      'scheduled_at', scheduled_utc
    )
  );

  return new_job_id;
end;
$$;

create or replace function public.cancel_scheduled_job(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  job_row public.publishing_jobs%rowtype;
  member_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into job_row
  from public.publishing_jobs j
  where j.id = target_job_id
  for update;
  if not found then
    raise exception 'Scheduled job not found' using errcode = 'P0002';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = job_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your role cannot cancel scheduled content' using errcode = '42501';
  end if;
  if job_row.state not in ('queued', 'retryable', 'needs_review') then
    raise exception 'Only jobs waiting in the queue can be cancelled' using errcode = '22023';
  end if;

  update public.publishing_jobs
  set state = 'cancelled', updated_at = now()
  where id = target_job_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    job_row.workspace_id,
    current_user_id,
    'publishing.job_cancelled',
    'publishing_job',
    target_job_id::text,
    'success',
    jsonb_build_object('previous_state', job_row.state::text)
  );
end;
$$;

revoke all on function public.schedule_approved_content(uuid, uuid, timestamp without time zone) from public, anon;
revoke all on function public.cancel_scheduled_job(uuid) from public, anon;
grant execute on function public.schedule_approved_content(uuid, uuid, timestamp without time zone) to authenticated;
grant execute on function public.cancel_scheduled_job(uuid) to authenticated;

comment on function public.schedule_approved_content(uuid, uuid, timestamp without time zone)
  is 'Creates a tenant-checked publishing queue record for approved content and a connected same-brand social account. Does not dispatch.';
comment on function public.cancel_scheduled_job(uuid)
  is 'Cancels a queued publishing record after validating workspace membership and publishing role.';
