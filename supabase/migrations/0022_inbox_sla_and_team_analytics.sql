-- v3.3.0: workspace-configurable first-response SLAs and inbox team analytics.
-- Metrics are based on each conversation's first inbound message and first
-- subsequent outbound message. No message text or customer identifiers are returned.

create table if not exists public.inbox_sla_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  low_minutes integer not null default 1440 check (low_minutes between 5 and 10080),
  normal_minutes integer not null default 480 check (normal_minutes between 5 and 10080),
  high_minutes integer not null default 120 check (high_minutes between 5 and 10080),
  urgent_minutes integer not null default 30 check (urgent_minutes between 5 and 10080),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_conversations_sla_cohort_idx
  on public.instagram_conversations (workspace_id, created_at, id);
create index if not exists facebook_conversations_sla_cohort_idx
  on public.facebook_conversations (workspace_id, created_at, id);
create index if not exists instagram_messages_sla_inbound_idx
  on public.instagram_messages (workspace_id, conversation_id, provider_sent_at)
  where direction = 'inbound';
create index if not exists instagram_messages_sla_outbound_idx
  on public.instagram_messages (conversation_id, provider_sent_at)
  where direction = 'outbound';
create index if not exists facebook_messages_sla_inbound_idx
  on public.facebook_messages (workspace_id, conversation_id, provider_sent_at)
  where direction = 'inbound';
create index if not exists facebook_messages_sla_outbound_idx
  on public.facebook_messages (conversation_id, provider_sent_at)
  where direction = 'outbound';

alter table public.inbox_sla_policies enable row level security;
revoke all on public.inbox_sla_policies from public, anon, authenticated;
grant select on public.inbox_sla_policies to authenticated;

drop policy if exists inbox_sla_policies_workspace_read on public.inbox_sla_policies;
create policy inbox_sla_policies_workspace_read on public.inbox_sla_policies
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.save_inbox_sla_policy(
  target_workspace_id uuid,
  target_low_minutes integer,
  target_normal_minutes integer,
  target_high_minutes integer,
  target_urgent_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null
     or target_low_minutes not between 5 and 10080
     or target_normal_minutes not between 5 and 10080
     or target_high_minutes not between 5 and 10080
     or target_urgent_minutes not between 5 and 10080 then
    raise exception 'SLA targets must be between 5 minutes and 7 days' using errcode = '22023';
  end if;

  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can change SLA targets' using errcode = '42501';
  end if;

  insert into public.inbox_sla_policies (
    workspace_id, low_minutes, normal_minutes, high_minutes, urgent_minutes, created_by, updated_by
  ) values (
    target_workspace_id, target_low_minutes, target_normal_minutes,
    target_high_minutes, target_urgent_minutes, actor_id, actor_id
  )
  on conflict (workspace_id) do update set
    low_minutes = excluded.low_minutes,
    normal_minutes = excluded.normal_minutes,
    high_minutes = excluded.high_minutes,
    urgent_minutes = excluded.urgent_minutes,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.now();

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.sla_policy.updated', 'inbox_sla_policy',
    target_workspace_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'low_minutes', target_low_minutes,
      'normal_minutes', target_normal_minutes,
      'high_minutes', target_high_minutes,
      'urgent_minutes', target_urgent_minutes
    )
  );
end;
$$;

create or replace function public.get_inbox_sla_report(
  target_workspace_id uuid,
  target_since timestamptz
)
returns table (
  metric_group text,
  assignee_id uuid,
  total_conversations bigint,
  responded bigint,
  awaiting_response bigint,
  closed_without_response bigint,
  responded_within_sla bigint,
  responded_late bigint,
  overdue bigint,
  at_risk bigint,
  avg_first_response_minutes numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null or target_since is null or target_since > pg_catalog.now() then
    raise exception 'A valid workspace and reporting start time are required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id
  ) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;

  return query
  with policy as (
    select p.low_minutes, p.normal_minutes, p.high_minutes, p.urgent_minutes
    from public.inbox_sla_policies p where p.workspace_id = target_workspace_id
    union all
    select 1440, 480, 120, 30
    where not exists (
      select 1 from public.inbox_sla_policies p where p.workspace_id = target_workspace_id
    )
  ),
  candidate_conversations as (
    select
      'instagram'::text as provider,
      c.id as conversation_id,
      coalesce(w.assigned_to, null::uuid) as assigned_to,
      coalesce(w.priority, 'normal') as priority,
      coalesce(w.status, 'open') as workflow_status,
      inbound.first_inbound_at,
      outbound.first_response_at
    from public.instagram_conversations c
    left join public.inbox_conversation_workflows w
      on w.workspace_id = c.workspace_id and w.provider = 'instagram' and w.conversation_id = c.id
    cross join lateral (
      select min(m.provider_sent_at) as first_inbound_at
      from public.instagram_messages m
      where m.workspace_id = target_workspace_id
        and m.conversation_id = c.id and m.direction = 'inbound'
    ) inbound
    cross join lateral (
      select min(m.provider_sent_at) as first_response_at
      from public.instagram_messages m
      where m.workspace_id = target_workspace_id
        and m.conversation_id = c.id and m.direction = 'outbound'
        and inbound.first_inbound_at is not null
        and m.provider_sent_at >= inbound.first_inbound_at
    ) outbound
    where c.workspace_id = target_workspace_id
      and c.created_at >= target_since
      and inbound.first_inbound_at is not null

    union all

    select
      'facebook'::text as provider,
      c.id as conversation_id,
      coalesce(w.assigned_to, null::uuid) as assigned_to,
      coalesce(w.priority, 'normal') as priority,
      coalesce(w.status, 'open') as workflow_status,
      inbound.first_inbound_at,
      outbound.first_response_at
    from public.facebook_conversations c
    left join public.inbox_conversation_workflows w
      on w.workspace_id = c.workspace_id and w.provider = 'facebook' and w.conversation_id = c.id
    cross join lateral (
      select min(m.provider_sent_at) as first_inbound_at
      from public.facebook_messages m
      where m.workspace_id = target_workspace_id
        and m.conversation_id = c.id and m.direction = 'inbound'
    ) inbound
    cross join lateral (
      select min(m.provider_sent_at) as first_response_at
      from public.facebook_messages m
      where m.workspace_id = target_workspace_id
        and m.conversation_id = c.id and m.direction = 'outbound'
        and inbound.first_inbound_at is not null
        and m.provider_sent_at >= inbound.first_inbound_at
    ) outbound
    where c.workspace_id = target_workspace_id
      and c.created_at >= target_since
      and inbound.first_inbound_at is not null
  ),
  measured as (
    select
      c.assigned_to,
      c.first_inbound_at,
      c.first_response_at,
      c.workflow_status,
      case c.priority
        when 'low' then p.low_minutes
        when 'high' then p.high_minutes
        when 'urgent' then p.urgent_minutes
        else p.normal_minutes
      end::numeric as target_minutes,
      case when c.first_response_at is not null
        then greatest(0, extract(epoch from (c.first_response_at - c.first_inbound_at)) / 60)
        else greatest(0, extract(epoch from (pg_catalog.now() - c.first_inbound_at)) / 60)
      end as elapsed_minutes
    from candidate_conversations c
    cross join policy p
  ),
  grouped as (
    select
      'workspace'::text as metric_group,
      null::uuid as assignee_id,
      count(*)::bigint as total_conversations,
      count(*) filter (where first_response_at is not null)::bigint as responded,
      count(*) filter (where first_response_at is null and workflow_status <> 'resolved')::bigint as awaiting_response,
      count(*) filter (where first_response_at is null and workflow_status = 'resolved')::bigint as closed_without_response,
      count(*) filter (where first_response_at is not null and elapsed_minutes <= target_minutes)::bigint as responded_within_sla,
      count(*) filter (where first_response_at is not null and elapsed_minutes > target_minutes)::bigint as responded_late,
      count(*) filter (where first_response_at is null and workflow_status <> 'resolved' and elapsed_minutes > target_minutes)::bigint as overdue,
      count(*) filter (where first_response_at is null and workflow_status <> 'resolved'
        and elapsed_minutes >= target_minutes * 0.8 and elapsed_minutes <= target_minutes)::bigint as at_risk,
      round(avg(elapsed_minutes) filter (where first_response_at is not null), 1) as avg_first_response_minutes
    from measured

    union all

    select
      'assignee'::text as metric_group,
      assigned_to as assignee_id,
      count(*)::bigint as total_conversations,
      count(*) filter (where first_response_at is not null)::bigint as responded,
      count(*) filter (where first_response_at is null and workflow_status <> 'resolved')::bigint as awaiting_response,
      count(*) filter (where first_response_at is null and workflow_status = 'resolved')::bigint as closed_without_response,
      count(*) filter (where first_response_at is not null and elapsed_minutes <= target_minutes)::bigint as responded_within_sla,
      count(*) filter (where first_response_at is not null and elapsed_minutes > target_minutes)::bigint as responded_late,
      count(*) filter (where first_response_at is null and workflow_status <> 'resolved' and elapsed_minutes > target_minutes)::bigint as overdue,
      count(*) filter (where first_response_at is null and workflow_status <> 'resolved'
        and elapsed_minutes >= target_minutes * 0.8 and elapsed_minutes <= target_minutes)::bigint as at_risk,
      round(avg(elapsed_minutes) filter (where first_response_at is not null), 1) as avg_first_response_minutes
    from measured
    group by assigned_to
  )
  select
    g.metric_group, g.assignee_id, g.total_conversations, g.responded,
    g.awaiting_response, g.closed_without_response, g.responded_within_sla, g.responded_late,
    g.overdue, g.at_risk, g.avg_first_response_minutes
  from grouped g
  order by case when g.metric_group = 'workspace' then 0 else 1 end, g.total_conversations desc;
end;
$$;

revoke all on function public.save_inbox_sla_policy(uuid, integer, integer, integer, integer) from public, anon;
revoke all on function public.get_inbox_sla_report(uuid, timestamptz) from public, anon;
grant execute on function public.save_inbox_sla_policy(uuid, integer, integer, integer, integer) to authenticated;
grant execute on function public.get_inbox_sla_report(uuid, timestamptz) to authenticated;

comment on table public.inbox_sla_policies is 'Workspace-specific first-response service targets in minutes. Defaults apply until a manager saves a custom policy.';
comment on function public.get_inbox_sla_report(uuid, timestamptz) is 'Returns aggregate first-response SLA and current-assignment metrics for workspace members. It never returns message text or customer identifiers.';
