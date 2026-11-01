-- v3.7.0: deterministic, human-triggered inbox routing automation.
-- Apply once after 0024_ai_reply_safety_and_language_guardrails.sql.
-- Rules update internal workflow metadata only. They never create or send social replies.

create table if not exists public.inbox_routing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  enabled boolean not null default true,
  rule_order integer not null default 100 check (rule_order between 1 and 10000),
  provider_scope text not null default 'all' check (provider_scope in ('all', 'instagram', 'facebook')),
  condition_intent text check (condition_intent is null or condition_intent in (
    'general_inquiry', 'pricing', 'product_or_service_question', 'order_or_delivery_status',
    'technical_support', 'complaint', 'refund_or_cancellation', 'partnership', 'spam_or_unqualified', 'other'
  )),
  condition_sentiment text check (condition_sentiment is null or condition_sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  condition_priority text check (condition_priority is null or condition_priority in ('low', 'normal', 'high', 'urgent')),
  condition_escalation_required boolean,
  condition_keyword text check (condition_keyword is null or length(btrim(condition_keyword)) between 1 and 100),
  min_ai_confidence numeric(4,3) not null default 0.700 check (min_ai_confidence between 0 and 1),
  assign_to uuid references auth.users(id) on delete set null,
  set_priority text check (set_priority is null or set_priority in ('low', 'normal', 'high', 'urgent')),
  set_status text check (set_status is null or set_status in ('open', 'pending')),
  stop_after_match boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_routing_rules_has_condition check (
    condition_intent is not null or condition_sentiment is not null or condition_priority is not null
    or condition_escalation_required is not null or condition_keyword is not null
  ),
  constraint inbox_routing_rules_has_action check (assign_to is not null or set_priority is not null or set_status is not null),
  constraint inbox_routing_rules_name_workspace_unique unique (workspace_id, name)
);

create index if not exists inbox_routing_rules_workspace_order_idx
  on public.inbox_routing_rules(workspace_id, enabled, rule_order, created_at);

-- The applied-event ledger makes each rule/message pair idempotent. Dry-runs do not reserve an event.
create table if not exists public.inbox_routing_applied_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_id uuid not null references public.inbox_routing_rules(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  conversation_id uuid not null,
  source_last_message_id uuid not null,
  applied_by uuid not null references auth.users(id) on delete restrict,
  applied_at timestamptz not null default now(),
  unique (workspace_id, rule_id, provider, conversation_id, source_last_message_id)
);
create index if not exists inbox_routing_applied_events_workspace_recent_idx
  on public.inbox_routing_applied_events(workspace_id, applied_at desc);

-- Logs contain only safe identifiers and outcomes, never the message body or customer profile.
create table if not exists public.inbox_routing_execution_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_id uuid references public.inbox_routing_rules(id) on delete set null,
  rule_name text not null check (length(rule_name) between 1 and 80),
  provider text not null check (provider in ('instagram', 'facebook')),
  conversation_id uuid not null,
  source_last_message_id uuid not null,
  outcome text not null check (outcome in ('would_apply', 'applied', 'skipped')),
  reason_code text not null check (length(reason_code) between 1 and 64),
  dry_run boolean not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inbox_routing_execution_logs_workspace_recent_idx
  on public.inbox_routing_execution_logs(workspace_id, created_at desc);

alter table public.inbox_routing_rules enable row level security;
alter table public.inbox_routing_applied_events enable row level security;
alter table public.inbox_routing_execution_logs enable row level security;
revoke all on public.inbox_routing_rules, public.inbox_routing_applied_events, public.inbox_routing_execution_logs from public, anon, authenticated;
grant select on public.inbox_routing_rules, public.inbox_routing_applied_events, public.inbox_routing_execution_logs to authenticated;

create policy inbox_routing_rules_workspace_read on public.inbox_routing_rules
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy inbox_routing_applied_events_workspace_read on public.inbox_routing_applied_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy inbox_routing_execution_logs_workspace_read on public.inbox_routing_execution_logs
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.save_inbox_routing_rule(
  target_workspace_id uuid,
  target_rule_id uuid,
  target_name text,
  target_enabled boolean,
  target_rule_order integer,
  target_provider_scope text,
  target_condition_intent text,
  target_condition_sentiment text,
  target_condition_priority text,
  target_condition_escalation_required boolean,
  target_condition_keyword text,
  target_min_ai_confidence numeric,
  target_assign_to uuid,
  target_set_priority text,
  target_set_status text,
  target_stop_after_match boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  saved_id uuid;
  clean_name text := pg_catalog.btrim(coalesce(target_name, ''));
  clean_keyword text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(target_condition_keyword, ''))), '');
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null
     or clean_name = '' or pg_catalog.length(clean_name) > 80
     or target_rule_order is null or target_rule_order not between 1 and 10000
     or target_provider_scope is null or target_provider_scope not in ('all', 'instagram', 'facebook')
     or target_min_ai_confidence is null or target_min_ai_confidence not between 0 and 1
     or (target_condition_intent is not null and target_condition_intent not in (
       'general_inquiry', 'pricing', 'product_or_service_question', 'order_or_delivery_status',
       'technical_support', 'complaint', 'refund_or_cancellation', 'partnership', 'spam_or_unqualified', 'other'))
     or (target_condition_sentiment is not null and target_condition_sentiment not in ('positive', 'neutral', 'negative', 'mixed'))
     or (target_condition_priority is not null and target_condition_priority not in ('low', 'normal', 'high', 'urgent'))
     or (target_set_priority is not null and target_set_priority not in ('low', 'normal', 'high', 'urgent'))
     or (target_set_status is not null and target_set_status not in ('open', 'pending'))
     or (clean_keyword is not null and pg_catalog.length(clean_keyword) > 100)
     or (target_condition_intent is null and target_condition_sentiment is null and target_condition_priority is null
         and target_condition_escalation_required is null and clean_keyword is null)
     or (target_assign_to is null and target_set_priority is null and target_set_status is null) then
    raise exception 'Routing rule input is invalid' using errcode = '22023';
  end if;

  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can manage routing rules' using errcode = '42501';
  end if;
  if target_assign_to is not null and not exists (
    select 1 from public.workspace_members m where m.workspace_id = target_workspace_id and m.user_id = target_assign_to
  ) then raise exception 'Assignee must be a member of this workspace' using errcode = '22023'; end if;

  if target_rule_id is null then
    insert into public.inbox_routing_rules (
      workspace_id, name, enabled, rule_order, provider_scope, condition_intent, condition_sentiment,
      condition_priority, condition_escalation_required, condition_keyword, min_ai_confidence,
      assign_to, set_priority, set_status, stop_after_match, created_by, updated_by
    ) values (
      target_workspace_id, clean_name, coalesce(target_enabled, true), target_rule_order, target_provider_scope,
      target_condition_intent, target_condition_sentiment, target_condition_priority, target_condition_escalation_required,
      clean_keyword, target_min_ai_confidence, target_assign_to, target_set_priority, target_set_status,
      coalesce(target_stop_after_match, true), actor_id, actor_id
    ) returning id into saved_id;
  else
    update public.inbox_routing_rules r set
      name = clean_name, enabled = coalesce(target_enabled, false), rule_order = target_rule_order,
      provider_scope = target_provider_scope, condition_intent = target_condition_intent,
      condition_sentiment = target_condition_sentiment, condition_priority = target_condition_priority,
      condition_escalation_required = target_condition_escalation_required, condition_keyword = clean_keyword,
      min_ai_confidence = target_min_ai_confidence, assign_to = target_assign_to,
      set_priority = target_set_priority, set_status = target_set_status,
      stop_after_match = coalesce(target_stop_after_match, true), updated_by = actor_id, updated_at = pg_catalog.now()
    where r.id = target_rule_id and r.workspace_id = target_workspace_id
    returning r.id into saved_id;
    if saved_id is null then raise exception 'Routing rule not found' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.set_inbox_routing_rule_enabled(
  target_workspace_id uuid, target_rule_id uuid, target_enabled boolean
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
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can manage routing rules' using errcode = '42501';
  end if;
  update public.inbox_routing_rules r set enabled = target_enabled, updated_by = actor_id, updated_at = pg_catalog.now()
  where r.id = target_rule_id and r.workspace_id = target_workspace_id;
  if not found then raise exception 'Routing rule not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.delete_inbox_routing_rule(target_workspace_id uuid, target_rule_id uuid)
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
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can delete routing rules' using errcode = '42501';
  end if;
  delete from public.inbox_routing_rules r where r.id = target_rule_id and r.workspace_id = target_workspace_id;
  if not found then raise exception 'Routing rule not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.run_inbox_routing_rules(
  target_workspace_id uuid,
  target_provider_scope text default 'all',
  target_dry_run boolean default true,
  target_max_conversations integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  candidate record;
  routing_rule record;
  triage_intent text;
  triage_sentiment text;
  triage_priority text;
  triage_escalation boolean;
  triage_confidence numeric;
  matched boolean;
  event_id uuid;
  processed_count integer := 0;
  matched_count integer := 0;
  applied_count integer := 0;
  skipped_count integer := 0;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null or target_provider_scope is null
     or target_provider_scope not in ('all', 'instagram', 'facebook')
     or target_dry_run is null or target_max_conversations is null or target_max_conversations not between 1 and 100 then
    raise exception 'Routing execution input is invalid' using errcode = '22023';
  end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only workspace owners, admins and managers can run routing rules' using errcode = '42501';
  end if;

  for candidate in
    with latest_conversations as (
      select 'instagram'::text as provider, c.workspace_id, c.id as conversation_id,
             latest.id as source_last_message_id, latest.message_text, latest.provider_sent_at as last_message_at
      from public.instagram_conversations c
      join lateral (
        select m.id, m.direction, m.message_text, m.provider_sent_at, m.received_at
        from public.instagram_messages m
        where m.workspace_id = c.workspace_id and m.conversation_id = c.id
        order by m.provider_sent_at desc, m.received_at desc, m.id desc limit 1
      ) latest on latest.direction = 'inbound'
      where c.workspace_id = target_workspace_id and target_provider_scope in ('all', 'instagram')
      union all
      select 'facebook'::text as provider, c.workspace_id, c.id as conversation_id,
             latest.id as source_last_message_id, latest.message_text, latest.provider_sent_at as last_message_at
      from public.facebook_conversations c
      join lateral (
        select m.id, m.direction, m.message_text, m.provider_sent_at, m.received_at
        from public.facebook_messages m
        where m.workspace_id = c.workspace_id and m.conversation_id = c.id
        order by m.provider_sent_at desc, m.received_at desc, m.id desc limit 1
      ) latest on latest.direction = 'inbound'
      where c.workspace_id = target_workspace_id and target_provider_scope in ('all', 'facebook')
    )
    select * from latest_conversations order by last_message_at desc limit target_max_conversations
  loop
    processed_count := processed_count + 1;
    triage_intent := null; triage_sentiment := null; triage_priority := null;
    triage_escalation := null; triage_confidence := null;
    select t.intent, t.sentiment, t.suggested_priority, t.escalation_required, t.confidence
      into triage_intent, triage_sentiment, triage_priority, triage_escalation, triage_confidence
    from public.inbox_ai_triage t
    where t.workspace_id = target_workspace_id and t.provider = candidate.provider
      and t.conversation_id = candidate.conversation_id and t.source_last_message_id = candidate.source_last_message_id
    order by t.updated_at desc limit 1;

    for routing_rule in
      select r.* from public.inbox_routing_rules r
      where r.workspace_id = target_workspace_id and r.enabled = true
        and r.provider_scope in ('all', candidate.provider)
      order by r.rule_order asc, r.created_at asc
    loop
      matched := true;
      if routing_rule.condition_intent is not null and triage_intent is distinct from routing_rule.condition_intent then matched := false; end if;
      if routing_rule.condition_sentiment is not null and triage_sentiment is distinct from routing_rule.condition_sentiment then matched := false; end if;
      if routing_rule.condition_priority is not null and triage_priority is distinct from routing_rule.condition_priority then matched := false; end if;
      if routing_rule.condition_escalation_required is not null and triage_escalation is distinct from routing_rule.condition_escalation_required then matched := false; end if;
      if routing_rule.condition_keyword is not null
         and pg_catalog.strpos(pg_catalog.lower(candidate.message_text), routing_rule.condition_keyword) = 0 then matched := false; end if;
      if (routing_rule.condition_intent is not null or routing_rule.condition_sentiment is not null
          or routing_rule.condition_priority is not null or routing_rule.condition_escalation_required is not null)
         and (triage_confidence is null or triage_confidence < routing_rule.min_ai_confidence) then matched := false; end if;

      if matched then
        matched_count := matched_count + 1;
        if routing_rule.assign_to is not null and not exists (
          select 1 from public.workspace_members m
          where m.workspace_id = target_workspace_id and m.user_id = routing_rule.assign_to
        ) then
          skipped_count := skipped_count + 1;
          insert into public.inbox_routing_execution_logs (
            workspace_id, rule_id, rule_name, provider, conversation_id, source_last_message_id,
            outcome, reason_code, dry_run, actor_user_id
          ) values (
            target_workspace_id, routing_rule.id, routing_rule.name, candidate.provider, candidate.conversation_id,
            candidate.source_last_message_id, 'skipped', 'assignee_not_workspace_member', target_dry_run, actor_id
          );
        elsif exists (
          select 1 from public.inbox_routing_applied_events e
          where e.workspace_id = target_workspace_id and e.rule_id = routing_rule.id
            and e.provider = candidate.provider and e.conversation_id = candidate.conversation_id
            and e.source_last_message_id = candidate.source_last_message_id
        ) then
          skipped_count := skipped_count + 1;
          insert into public.inbox_routing_execution_logs (
            workspace_id, rule_id, rule_name, provider, conversation_id, source_last_message_id,
            outcome, reason_code, dry_run, actor_user_id
          ) values (
            target_workspace_id, routing_rule.id, routing_rule.name, candidate.provider, candidate.conversation_id,
            candidate.source_last_message_id, 'skipped', 'already_applied_for_message', target_dry_run, actor_id
          );
        elsif target_dry_run then
          insert into public.inbox_routing_execution_logs (
            workspace_id, rule_id, rule_name, provider, conversation_id, source_last_message_id,
            outcome, reason_code, dry_run, actor_user_id
          ) values (
            target_workspace_id, routing_rule.id, routing_rule.name, candidate.provider, candidate.conversation_id,
            candidate.source_last_message_id, 'would_apply', 'conditions_matched_preview_only', true, actor_id
          );
        else
          event_id := null;
          insert into public.inbox_routing_applied_events (
            workspace_id, rule_id, provider, conversation_id, source_last_message_id, applied_by
          ) values (
            target_workspace_id, routing_rule.id, candidate.provider, candidate.conversation_id,
            candidate.source_last_message_id, actor_id
          ) on conflict do nothing returning id into event_id;

          if event_id is null then
            skipped_count := skipped_count + 1;
            insert into public.inbox_routing_execution_logs (
              workspace_id, rule_id, rule_name, provider, conversation_id, source_last_message_id,
              outcome, reason_code, dry_run, actor_user_id
            ) values (
              target_workspace_id, routing_rule.id, routing_rule.name, candidate.provider, candidate.conversation_id,
              candidate.source_last_message_id, 'skipped', 'concurrent_duplicate_execution', false, actor_id
            );
          else
            insert into public.inbox_conversation_workflows (
              workspace_id, provider, conversation_id, assigned_to, status, priority, updated_by
            ) values (
              target_workspace_id, candidate.provider, candidate.conversation_id, routing_rule.assign_to,
              coalesce(routing_rule.set_status, 'open'), coalesce(routing_rule.set_priority, 'normal'), actor_id
            ) on conflict (workspace_id, provider, conversation_id) do update set
              assigned_to = coalesce(routing_rule.assign_to, inbox_conversation_workflows.assigned_to),
              status = coalesce(routing_rule.set_status, inbox_conversation_workflows.status),
              priority = coalesce(routing_rule.set_priority, inbox_conversation_workflows.priority),
              updated_by = actor_id, updated_at = pg_catalog.now();

            applied_count := applied_count + 1;
            insert into public.inbox_routing_execution_logs (
              workspace_id, rule_id, rule_name, provider, conversation_id, source_last_message_id,
              outcome, reason_code, dry_run, actor_user_id
            ) values (
              target_workspace_id, routing_rule.id, routing_rule.name, candidate.provider, candidate.conversation_id,
              candidate.source_last_message_id, 'applied', 'workflow_metadata_updated', false, actor_id
            );
          end if;
        end if;
        if routing_rule.stop_after_match then exit; end if;
      end if;
    end loop;
  end loop;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, case when target_dry_run then 'inbox.routing.previewed' else 'inbox.routing.applied' end,
    'inbox_routing_rules', target_workspace_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'provider_scope', target_provider_scope, 'dry_run', target_dry_run,
      'processed', processed_count, 'matched', matched_count, 'applied', applied_count, 'skipped', skipped_count
    )
  );

  return pg_catalog.jsonb_build_object(
    'dry_run', target_dry_run, 'processed', processed_count, 'matched', matched_count,
    'applied', applied_count, 'skipped', skipped_count
  );
end;
$$;

revoke all on function public.save_inbox_routing_rule(uuid, uuid, text, boolean, integer, text, text, text, text, boolean, text, numeric, uuid, text, text, boolean) from public, anon;
revoke all on function public.set_inbox_routing_rule_enabled(uuid, uuid, boolean) from public, anon;
revoke all on function public.delete_inbox_routing_rule(uuid, uuid) from public, anon;
revoke all on function public.run_inbox_routing_rules(uuid, text, boolean, integer) from public, anon;
grant execute on function public.save_inbox_routing_rule(uuid, uuid, text, boolean, integer, text, text, text, text, boolean, text, numeric, uuid, text, text, boolean) to authenticated;
grant execute on function public.set_inbox_routing_rule_enabled(uuid, uuid, boolean) to authenticated;
grant execute on function public.delete_inbox_routing_rule(uuid, uuid) to authenticated;
grant execute on function public.run_inbox_routing_rules(uuid, text, boolean, integer) to authenticated;

comment on table public.inbox_routing_rules is 'Workspace-configured deterministic rules for manually triggered routing of recent inbound Instagram and Facebook conversations. Only internal assignment/status/priority metadata can change; replies are never sent.';
comment on table public.inbox_routing_applied_events is 'Idempotency ledger keyed to each rule and exact latest inbound message. A new customer message permits a fresh rule evaluation.';
comment on table public.inbox_routing_execution_logs is 'Safe execution history. Contains no message body, customer profile, prompt, or reply content.';
comment on function public.run_inbox_routing_rules(uuid, text, boolean, integer) is 'Owner/admin/manager-only, capped and human-triggered routing evaluation. Dry-run previews do not mutate workflow state or consume idempotency keys.';
