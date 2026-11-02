-- RuffNeck Social Hub v5.8.0 — persistent, human-controlled campaign experiments.
-- Apply after migration 0041. No publishing, scheduling, messaging or ad mutation is performed.

create table if not exists public.campaign_experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.publishing_campaigns(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  hypothesis text not null check (char_length(hypothesis) between 8 and 900),
  change_to_test text not null check (char_length(change_to_test) between 2 and 900),
  primary_metric text not null check (primary_metric in ('impressions', 'reach', 'engagements', 'clicks', 'leads', 'conversions')),
  source text not null default 'manual' check (source in ('manual', 'ai_recommendation')),
  baseline_value numeric(20,4) check (baseline_value is null or baseline_value between 0 and 1000000000000),
  target_value numeric(20,4) check (target_value is null or target_value between 0 and 1000000000000),
  actual_value numeric(20,4) check (actual_value is null or actual_value between 0 and 1000000000000),
  start_date date not null,
  review_date date not null check (review_date >= start_date and review_date <= start_date + 365),
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed', 'cancelled')),
  result_notes text not null default '' check (char_length(result_notes) <= 1200),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_experiments_workspace_campaign_updated_idx
  on public.campaign_experiments (workspace_id, campaign_id, updated_at desc);
create index if not exists campaign_experiments_workspace_status_review_idx
  on public.campaign_experiments (workspace_id, status, review_date);

alter table public.campaign_experiments enable row level security;

revoke all on table public.campaign_experiments from public, anon, authenticated;
grant select on table public.campaign_experiments to authenticated;

drop policy if exists campaign_experiments_workspace_select on public.campaign_experiments;
create policy campaign_experiments_workspace_select
  on public.campaign_experiments
  for select to authenticated
  using (
    exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = campaign_experiments.workspace_id
        and m.user_id = auth.uid()
    )
  );

create or replace function public.create_campaign_experiment(
  target_workspace_id uuid,
  target_campaign_id uuid,
  target_title text,
  target_hypothesis text,
  target_change_to_test text,
  target_primary_metric text,
  target_source text,
  target_baseline_value numeric,
  target_value_goal numeric,
  target_start_date date,
  target_review_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  new_experiment_id uuid;
  existing_count integer;
  clean_title text := pg_catalog.btrim(coalesce(target_title, ''));
  clean_hypothesis text := pg_catalog.btrim(coalesce(target_hypothesis, ''));
  clean_change text := pg_catalog.btrim(coalesce(target_change_to_test, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'analyst') then
    raise exception 'Your workspace role cannot manage campaign experiments' using errcode = '42501';
  end if;

  -- Lock the campaign row so concurrent creates cannot exceed the 100-record cap.
  perform 1
  from public.publishing_campaigns c
  where c.id = target_campaign_id and c.workspace_id = target_workspace_id
  for update;
  if not found then
    raise exception 'Campaign does not belong to this workspace' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into existing_count
  from public.campaign_experiments e
  where e.workspace_id = target_workspace_id and e.campaign_id = target_campaign_id;
  if existing_count >= 100 then
    raise exception 'This campaign already has the maximum of 100 experiments' using errcode = '22023';
  end if;

  if pg_catalog.char_length(clean_title) not between 2 and 120
     or pg_catalog.char_length(clean_hypothesis) not between 8 and 900
     or pg_catalog.char_length(clean_change) not between 2 and 900 then
    raise exception 'Experiment text fields are outside their allowed lengths' using errcode = '22023';
  end if;
  if target_primary_metric is null or target_primary_metric not in ('impressions', 'reach', 'engagements', 'clicks', 'leads', 'conversions') then
    raise exception 'Unsupported primary metric' using errcode = '22023';
  end if;
  if target_source is null or target_source not in ('manual', 'ai_recommendation') then
    raise exception 'Unsupported experiment source' using errcode = '22023';
  end if;
  if target_start_date is null or target_review_date is null
     or target_review_date < target_start_date
     or target_review_date > target_start_date + 365 then
    raise exception 'The experiment review date must fall within 365 days after its start date' using errcode = '22023';
  end if;
  if (target_baseline_value is not null and (target_baseline_value < 0 or target_baseline_value > 1000000000000))
     or (target_value_goal is not null and (target_value_goal < 0 or target_value_goal > 1000000000000)) then
    raise exception 'Metric values must be between zero and one trillion' using errcode = '22023';
  end if;

  insert into public.campaign_experiments (
    workspace_id, campaign_id, title, hypothesis, change_to_test, primary_metric,
    source, baseline_value, target_value, start_date, review_date, created_by, updated_by
  ) values (
    target_workspace_id, target_campaign_id, clean_title, clean_hypothesis, clean_change,
    target_primary_metric, target_source, target_baseline_value, target_value_goal,
    target_start_date, target_review_date, current_user_id, current_user_id
  ) returning id into new_experiment_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id, 'campaign.experiment_created', 'campaign_experiment',
    new_experiment_id::text, 'success',
    pg_catalog.jsonb_build_object('campaign_id', target_campaign_id, 'source', target_source, 'primary_metric', target_primary_metric)
  );

  return new_experiment_id;
end;
$$;

create or replace function public.update_campaign_experiment(
  target_workspace_id uuid,
  target_experiment_id uuid,
  target_status text,
  target_baseline_value numeric,
  target_value_goal numeric,
  target_actual_value numeric,
  target_review_date date,
  target_result_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  experiment_row public.campaign_experiments%rowtype;
  clean_notes text := pg_catalog.btrim(coalesce(target_result_notes, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'analyst') then
    raise exception 'Your workspace role cannot update campaign experiments' using errcode = '42501';
  end if;

  select * into experiment_row
  from public.campaign_experiments e
  where e.id = target_experiment_id and e.workspace_id = target_workspace_id
  for update;
  if not found then
    raise exception 'Campaign experiment not found' using errcode = 'P0002';
  end if;
  if experiment_row.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled experiments are locked' using errcode = '22023';
  end if;
  if target_status is null or target_status not in ('draft', 'running', 'paused', 'completed', 'cancelled') then
    raise exception 'Unsupported experiment status' using errcode = '22023';
  end if;
  if target_status <> experiment_row.status and not (
    (experiment_row.status = 'draft' and target_status in ('running', 'cancelled'))
    or (experiment_row.status = 'running' and target_status in ('paused', 'completed', 'cancelled'))
    or (experiment_row.status = 'paused' and target_status in ('running', 'completed', 'cancelled'))
  ) then
    raise exception 'This experiment status transition is not allowed' using errcode = '22023';
  end if;
  if target_review_date is null or target_review_date < experiment_row.start_date
     or target_review_date > experiment_row.start_date + 365 then
    raise exception 'The review date must fall within 365 days after the experiment start date' using errcode = '22023';
  end if;
  if (target_baseline_value is not null and (target_baseline_value < 0 or target_baseline_value > 1000000000000))
     or (target_value_goal is not null and (target_value_goal < 0 or target_value_goal > 1000000000000))
     or (target_actual_value is not null and (target_actual_value < 0 or target_actual_value > 1000000000000)) then
    raise exception 'Metric values must be between zero and one trillion' using errcode = '22023';
  end if;
  if pg_catalog.char_length(clean_notes) > 1200 then
    raise exception 'Result notes exceed 1,200 characters' using errcode = '22023';
  end if;
  if target_status = 'completed' and target_actual_value is null then
    raise exception 'Enter the measured result before completing the experiment' using errcode = '22023';
  end if;

  update public.campaign_experiments
  set status = target_status,
      baseline_value = target_baseline_value,
      target_value = target_value_goal,
      actual_value = target_actual_value,
      review_date = target_review_date,
      result_notes = clean_notes,
      updated_by = current_user_id,
      updated_at = now(),
      completed_at = case when target_status = 'completed' then now() else null end
  where id = target_experiment_id and workspace_id = target_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id, 'campaign.experiment_updated', 'campaign_experiment',
    target_experiment_id::text, 'success',
    pg_catalog.jsonb_build_object('status', target_status, 'primary_metric', experiment_row.primary_metric)
  );

  return target_experiment_id;
end;
$$;

revoke all on function public.create_campaign_experiment(uuid, uuid, text, text, text, text, text, numeric, numeric, date, date) from public, anon;
revoke all on function public.update_campaign_experiment(uuid, uuid, text, numeric, numeric, numeric, date, text) from public, anon;
grant execute on function public.create_campaign_experiment(uuid, uuid, text, text, text, text, text, numeric, numeric, date, date) to authenticated;
grant execute on function public.update_campaign_experiment(uuid, uuid, text, numeric, numeric, numeric, date, text) to authenticated;

comment on table public.campaign_experiments is
  'Workspace-scoped human-controlled campaign experiments sourced from manual planning or reviewed AI opportunities. No platform actions are executed.';
