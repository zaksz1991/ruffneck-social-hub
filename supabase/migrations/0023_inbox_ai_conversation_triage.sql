-- v3.4.0: Local-model conversation intent, sentiment and priority suggestions.
-- Apply once after 0022_inbox_sla_and_team_analytics.sql.
-- AI triage is advisory only. This migration does not enable automatic replies or workflow mutation.

create table if not exists public.inbox_ai_triage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  conversation_id uuid not null,
  source_last_message_id uuid not null,
  intent text not null check (intent in (
    'general_inquiry', 'pricing', 'product_or_service_question', 'order_or_delivery_status',
    'technical_support', 'complaint', 'refund_or_cancellation', 'partnership',
    'spam_or_unqualified', 'other'
  )),
  sentiment text not null check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  suggested_priority text not null check (suggested_priority in ('low', 'normal', 'high', 'urgent')),
  escalation_required boolean not null default false,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  summary text not null check (length(btrim(summary)) between 1 and 280),
  reason text not null check (length(btrim(reason)) between 1 and 280),
  model text not null check (length(btrim(model)) between 1 and 160),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_ai_triage_source_unique unique (workspace_id, provider, conversation_id, source_last_message_id)
);

create index if not exists inbox_ai_triage_conversation_recent_idx
  on public.inbox_ai_triage (workspace_id, provider, conversation_id, created_at desc);

alter table public.inbox_ai_triage enable row level security;
revoke all on public.inbox_ai_triage from public, anon, authenticated;
grant select on public.inbox_ai_triage to authenticated;
drop policy if exists inbox_ai_triage_workspace_read on public.inbox_ai_triage;
create policy inbox_ai_triage_workspace_read on public.inbox_ai_triage
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.save_inbox_ai_triage(
  target_provider text,
  target_conversation_id uuid,
  target_source_last_message_id uuid,
  target_intent text,
  target_sentiment text,
  target_suggested_priority text,
  target_escalation_required boolean,
  target_confidence numeric,
  target_summary text,
  target_reason text,
  target_model text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  actor_role text;
  source_direction text;
  source_sent_at timestamptz;
  source_received_at timestamptz;
  triage_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook') or target_conversation_id is null
     or target_source_last_message_id is null
     or target_intent is null or target_intent not in (
       'general_inquiry', 'pricing', 'product_or_service_question', 'order_or_delivery_status',
       'technical_support', 'complaint', 'refund_or_cancellation', 'partnership',
       'spam_or_unqualified', 'other'
     )
     or target_sentiment is null or target_sentiment not in ('positive', 'neutral', 'negative', 'mixed')
     or target_suggested_priority is null or target_suggested_priority not in ('low', 'normal', 'high', 'urgent')
     or target_escalation_required is null
     or target_confidence is null or target_confidence < 0 or target_confidence > 1
     or target_summary is null or pg_catalog.length(pg_catalog.btrim(target_summary)) not between 1 and 280
     or target_reason is null or pg_catalog.length(pg_catalog.btrim(target_reason)) not between 1 and 280
     or target_model is null or pg_catalog.length(pg_catalog.btrim(target_model)) not between 1 and 160 then
    raise exception 'AI triage input is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
    from public.instagram_conversations c where c.id = target_conversation_id;
    select m.direction, m.provider_sent_at, m.received_at
      into source_direction, source_sent_at, source_received_at
    from public.instagram_messages m
    where m.id = target_source_last_message_id and m.conversation_id = target_conversation_id;
    if not found or source_direction <> 'inbound' then
      raise exception 'The source customer message is unavailable' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.instagram_messages m
      where m.conversation_id = target_conversation_id
        and (m.provider_sent_at, m.received_at) > (source_sent_at, source_received_at)
    ) then
      raise exception 'conversation changed while triage was running' using errcode = '40001';
    end if;
  else
    select c.workspace_id into target_workspace_id
    from public.facebook_conversations c where c.id = target_conversation_id;
    select m.direction, m.provider_sent_at, m.received_at
      into source_direction, source_sent_at, source_received_at
    from public.facebook_messages m
    where m.id = target_source_last_message_id and m.conversation_id = target_conversation_id;
    if not found or source_direction <> 'inbound' then
      raise exception 'The source customer message is unavailable' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.facebook_messages m
      where m.conversation_id = target_conversation_id
        and (m.provider_sent_at, m.received_at) > (source_sent_at, source_received_at)
    ) then
      raise exception 'conversation changed while triage was running' using errcode = '40001';
    end if;
  end if;

  if target_workspace_id is null then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher', 'client_approver') then
    raise exception 'Your workspace role cannot run AI triage' using errcode = '42501';
  end if;

  insert into public.inbox_ai_triage (
    workspace_id, provider, conversation_id, source_last_message_id,
    intent, sentiment, suggested_priority, escalation_required, confidence,
    summary, reason, model, created_by
  ) values (
    target_workspace_id, target_provider, target_conversation_id, target_source_last_message_id,
    target_intent, target_sentiment, target_suggested_priority, target_escalation_required,
    target_confidence, pg_catalog.btrim(target_summary), pg_catalog.btrim(target_reason),
    pg_catalog.btrim(target_model), actor_id
  )
  on conflict (workspace_id, provider, conversation_id, source_last_message_id)
  do update set
    intent = excluded.intent,
    sentiment = excluded.sentiment,
    suggested_priority = excluded.suggested_priority,
    escalation_required = excluded.escalation_required,
    confidence = excluded.confidence,
    summary = excluded.summary,
    reason = excluded.reason,
    model = excluded.model,
    created_by = excluded.created_by,
    updated_at = pg_catalog.now()
  returning id into triage_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.ai_triage.completed', 'inbox_ai_triage', triage_id::text,
    'success', pg_catalog.jsonb_build_object(
      'provider', target_provider,
      'intent', target_intent,
      'sentiment', target_sentiment,
      'suggested_priority', target_suggested_priority,
      'escalation_required', target_escalation_required,
      'confidence', target_confidence
    )
  );
  return triage_id;
end;
$$;

revoke all on function public.save_inbox_ai_triage(text, uuid, uuid, text, text, text, boolean, numeric, text, text, text) from public, anon;
grant execute on function public.save_inbox_ai_triage(text, uuid, uuid, text, text, text, boolean, numeric, text, text, text) to authenticated;

comment on table public.inbox_ai_triage is 'Advisory AI intent, sentiment, summary and priority assessment for the latest inbound conversation message. It never sends replies or automatically changes workflow priority.';
comment on function public.save_inbox_ai_triage(text, uuid, uuid, text, text, text, boolean, numeric, text, text, text) is 'Workspace-role-checked triage persistence. Rejects stale results when a newer conversation message arrived during inference.';
