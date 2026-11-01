-- RuffNeck Social Hub v4.7.0 — WhatsApp CRM and AI conversation intelligence.
-- Apply once after 0033_whatsapp_cloud_api_inbox.sql.
-- WhatsApp identities remain scoped to one workspace-connected account; no cross-provider identity merging.

alter table public.inbox_customer_profiles drop constraint if exists inbox_customer_profiles_provider_check;
alter table public.inbox_customer_profiles add constraint inbox_customer_profiles_provider_check
  check (provider in ('instagram', 'facebook', 'whatsapp'));

alter table public.inbox_ai_triage drop constraint if exists inbox_ai_triage_provider_check;
alter table public.inbox_ai_triage add constraint inbox_ai_triage_provider_check
  check (provider in ('instagram', 'facebook', 'whatsapp'));

create or replace function public.save_inbox_customer_profile(
  target_provider text,
  target_conversation_id uuid,
  target_display_label text,
  target_relationship_stage text,
  target_tags text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  target_social_account_id uuid;
  target_participant_provider_id text;
  actor_role text;
  clean_label text := nullif(pg_catalog.btrim(coalesce(target_display_label, '')), '');
  clean_tags text[] := array[]::text[];
  saved_profile_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook', 'whatsapp') or target_conversation_id is null then
    raise exception 'Choose a valid supported conversation' using errcode = '22023';
  end if;
  if clean_label is not null and pg_catalog.length(clean_label) not between 2 and 100 then
    raise exception 'Customer label must contain 2 to 100 characters' using errcode = '22023';
  end if;
  if target_relationship_stage is null or target_relationship_stage not in ('lead', 'prospect', 'customer', 'vip', 'at_risk', 'former_customer') then
    raise exception 'Customer relationship stage is invalid' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(coalesce(target_tags, array[]::text[])) > 12 then
    raise exception 'A customer may have at most 12 tags' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(coalesce(target_tags, array[]::text[])) as t(value)
    where t.value is null
       or pg_catalog.length(pg_catalog.btrim(t.value)) not between 1 and 24
       or pg_catalog.btrim(t.value) !~ '^[[:alnum:]][[:alnum:] _-]{0,23}$'
  ) then
    raise exception 'Customer tags may contain letters, numbers, spaces, underscores and hyphens only' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.array_agg(distinct pg_catalog.lower(pg_catalog.btrim(t.value))), array[]::text[])
    into clean_tags
    from pg_catalog.unnest(coalesce(target_tags, array[]::text[])) as t(value);

  if target_provider = 'instagram' then
    select c.workspace_id, c.social_account_id, c.participant_provider_id
      into target_workspace_id, target_social_account_id, target_participant_provider_id
      from public.instagram_conversations c
      where c.id = target_conversation_id;
  elsif target_provider = 'facebook' then
    select c.workspace_id, c.social_account_id, c.participant_provider_id
      into target_workspace_id, target_social_account_id, target_participant_provider_id
      from public.facebook_conversations c
      where c.id = target_conversation_id;
  else
    select c.workspace_id, c.social_account_id, c.participant_provider_id
      into target_workspace_id, target_social_account_id, target_participant_provider_id
      from public.whatsapp_conversations c
      where c.id = target_conversation_id;
  end if;
  if target_workspace_id is null or target_social_account_id is null or target_participant_provider_id is null then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  select m.role::text into actor_role
    from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot manage customer records' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.social_accounts a
    where a.id = target_social_account_id
      and a.workspace_id = target_workspace_id
      and a.provider = target_provider
  ) then
    raise exception 'Conversation account does not match its workspace or provider' using errcode = '22023';
  end if;

  insert into public.inbox_customer_profiles (
    workspace_id, provider, social_account_id, conversation_id, participant_provider_id,
    display_label, relationship_stage, tags, created_by, updated_by
  ) values (
    target_workspace_id, target_provider, target_social_account_id, target_conversation_id, target_participant_provider_id,
    clean_label, target_relationship_stage, clean_tags, actor_id, actor_id
  )
  on conflict (workspace_id, provider, social_account_id, participant_provider_id)
  do update set
    conversation_id = excluded.conversation_id,
    display_label = excluded.display_label,
    relationship_stage = excluded.relationship_stage,
    tags = excluded.tags,
    updated_by = actor_id,
    updated_at = pg_catalog.now()
  returning id into saved_profile_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.customer_profile.saved', 'inbox_customer_profile',
    saved_profile_id::text, 'success',
    pg_catalog.jsonb_build_object('provider', target_provider, 'relationship_stage', target_relationship_stage, 'tag_count', pg_catalog.cardinality(clean_tags))
  );
  return saved_profile_id;
end;
$$;
revoke all on function public.save_inbox_customer_profile(text, uuid, text, text, text[]) from public, anon;
grant execute on function public.save_inbox_customer_profile(text, uuid, text, text, text[]) to authenticated;

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
  if target_provider is null or target_provider not in ('instagram', 'facebook', 'whatsapp') or target_conversation_id is null
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
  elsif target_provider = 'facebook' then
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
  else
    select c.workspace_id into target_workspace_id
    from public.whatsapp_conversations c where c.id = target_conversation_id;
    select m.direction, m.provider_sent_at, m.received_at
      into source_direction, source_sent_at, source_received_at
    from public.whatsapp_messages m
    where m.id = target_source_last_message_id and m.conversation_id = target_conversation_id;
    if not found or source_direction <> 'inbound' then
      raise exception 'The source customer message is unavailable' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.whatsapp_messages m
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

comment on function public.save_inbox_customer_profile(text, uuid, text, text, text[]) is 'Workspace-role-checked CRM enrolment for Instagram, Facebook Messenger and WhatsApp conversations; identities remain provider/account scoped.';
comment on function public.save_inbox_ai_triage(text, uuid, uuid, text, text, text, boolean, numeric, text, text, text) is 'Advisory AI triage for Instagram, Facebook Messenger and WhatsApp; rejects stale source messages and never sends replies or mutates workflow automatically.';
