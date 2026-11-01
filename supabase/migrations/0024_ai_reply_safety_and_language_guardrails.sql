-- v3.5.0: deterministic policy and language assessment for AI-generated reply drafts.
-- This table is advisory metadata only. It does not authorize or execute provider sends.

create table if not exists public.inbox_reply_safety_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'facebook')),
  conversation_id uuid not null,
  draft_id uuid not null,
  source_last_message_id uuid not null,
  risk_level text not null check (risk_level in ('low', 'review', 'escalate')),
  customer_language text not null check (customer_language in ('english','hausa','yoruba','igbo','pidgin','french','unknown')),
  draft_language text not null check (draft_language in ('english','hausa','yoruba','igbo','pidgin','french','unknown')),
  language_match boolean,
  escalation_required boolean not null default false,
  escalation_cleared_by uuid references auth.users(id) on delete set null,
  escalation_cleared_at timestamptz,
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array' and jsonb_array_length(flags) <= 12),
  guidance text not null check (length(guidance) between 1 and 700),
  draft_fingerprint text not null check (draft_fingerprint ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider, draft_id)
);

-- New Facebook drafts must receive a stored scan before the send-attempt gate accepts them.
-- Existing drafts are grandfathered to preserve decisions made before this policy existed.
alter table public.facebook_reply_drafts
  add column if not exists safety_assessed boolean not null default false;
update public.facebook_reply_drafts set safety_assessed = true where safety_assessed = false;

create index if not exists inbox_reply_safety_workspace_recent_idx
  on public.inbox_reply_safety_assessments(workspace_id, created_at desc);
create index if not exists inbox_reply_safety_conversation_idx
  on public.inbox_reply_safety_assessments(provider, conversation_id, created_at desc);

alter table public.inbox_reply_safety_assessments enable row level security;
revoke all on public.inbox_reply_safety_assessments from public, anon, authenticated;
grant select on public.inbox_reply_safety_assessments to authenticated;
create policy inbox_reply_safety_workspace_read
  on public.inbox_reply_safety_assessments for select to authenticated
  using (public.is_workspace_member(workspace_id));

create or replace function public.inbox_reply_requires_escalation(
  target_provider text,
  target_conversation_id uuid,
  target_draft_id uuid,
  target_source_last_message_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  target_brand_id uuid;
  brand_voice jsonb := '{}'::jsonb;
  customer_text text := '';
  reply_text text := '';
  forbidden_hit boolean := false;
  trigger_hit boolean := false;
begin
  if target_provider = 'instagram' then
    select a.brand_id into target_brand_id
      from public.instagram_conversations c
      join public.social_accounts a on a.id = c.social_account_id and a.workspace_id = c.workspace_id
      where c.id = target_conversation_id;
    select m.message_text into customer_text from public.instagram_messages m
      where m.id = target_source_last_message_id and m.conversation_id = target_conversation_id and m.direction = 'inbound';
    select d.draft_text into reply_text from public.instagram_reply_drafts d
      where d.id = target_draft_id and d.conversation_id = target_conversation_id and d.source_last_message_id = target_source_last_message_id;
  elsif target_provider = 'facebook' then
    select a.brand_id into target_brand_id
      from public.facebook_conversations c
      join public.social_accounts a on a.id = c.social_account_id and a.workspace_id = c.workspace_id
      where c.id = target_conversation_id;
    select m.message_text into customer_text from public.facebook_messages m
      where m.id = target_source_last_message_id and m.conversation_id = target_conversation_id and m.direction = 'inbound';
    select d.draft_text into reply_text from public.facebook_reply_drafts d
      where d.id = target_draft_id and d.conversation_id = target_conversation_id and d.source_last_message_id = target_source_last_message_id;
  else
    return true;
  end if;

  if target_brand_id is null or customer_text is null or reply_text is null then return true; end if;
  select b.voice_profile into brand_voice from public.brands b where b.id = target_brand_id;
  brand_voice := coalesce(brand_voice, '{}'::jsonb);

  if pg_catalog.jsonb_typeof(brand_voice->'forbidden_claims') = 'array' then
    select exists (
      select 1 from pg_catalog.jsonb_array_elements_text(brand_voice->'forbidden_claims') as phrase(value)
      where pg_catalog.length(pg_catalog.btrim(phrase.value)) >= 3
        and pg_catalog.strpos(pg_catalog.lower(reply_text), pg_catalog.lower(pg_catalog.btrim(phrase.value))) > 0
    ) into forbidden_hit;
  end if;
  if pg_catalog.jsonb_typeof(brand_voice->'escalation_triggers') = 'array' then
    select exists (
      select 1 from pg_catalog.jsonb_array_elements_text(brand_voice->'escalation_triggers') as phrase(value)
      where pg_catalog.length(pg_catalog.btrim(phrase.value)) >= 3
        and pg_catalog.strpos(pg_catalog.lower(customer_text), pg_catalog.lower(pg_catalog.btrim(phrase.value))) > 0
    ) into trigger_hit;
  end if;

  return forbidden_hit or trigger_hit
    or customer_text ~* $risk$\m(password|passcode|one[- ]time code|otp|verification code|pin number|cvv|card number|bank account|bank details|hacked|fraud|identity theft|lawsuit|lawyer|police report|chargeback|refund request|medical emergency|injury|threat|blackmail|scam)\M$risk$
    or reply_text ~* $risk$\m(system prompt|api key|access token|internal instruction|private credential)\M$risk$;
end;
$$;
revoke all on function public.inbox_reply_requires_escalation(text, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.save_inbox_reply_safety_assessment(
  target_provider text,
  target_conversation_id uuid,
  target_draft_id uuid,
  target_source_last_message_id uuid,
  target_draft_text text,
  target_risk_level text,
  target_customer_language text,
  target_draft_language text,
  target_language_match boolean,
  target_escalation_required boolean,
  target_flags jsonb,
  target_guidance text,
  target_draft_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  latest_message_id uuid;
  latest_direction text;
  stored_draft_text text;
  stored_draft_status text;
  saved_id uuid;
  actor_role text;
  database_escalation_required boolean := false;
  effective_escalation_required boolean := false;
  effective_risk_level text;
  allowed_flags text[] := array[
    'brand_forbidden_claim',
    'brand_escalation_trigger',
    'high_risk_customer_topic',
    'possible_unverified_commitment',
    'possible_sensitive_or_internal_content',
    'possible_language_mismatch'
  ];
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram','facebook') then raise exception 'Provider is invalid' using errcode = '22023'; end if;
  if target_risk_level is null or target_risk_level not in ('low','review','escalate') then raise exception 'Risk level is invalid' using errcode = '22023'; end if;
  if target_customer_language is null or target_draft_language is null
    or target_customer_language not in ('english','hausa','yoruba','igbo','pidgin','french','unknown')
    or target_draft_language not in ('english','hausa','yoruba','igbo','pidgin','french','unknown') then
    raise exception 'Language value is invalid' using errcode = '22023';
  end if;
  if target_flags is null or pg_catalog.jsonb_typeof(target_flags) <> 'array'
    or pg_catalog.jsonb_array_length(target_flags) > 12 then
    raise exception 'Assessment flags are invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(target_flags) as item(flag)
    where item.flag <> all(allowed_flags)
  ) then raise exception 'Assessment contains an unknown flag' using errcode = '22023'; end if;
  if target_draft_text is null or pg_catalog.length(target_draft_text) not between 1 and 6000
    or target_guidance is null or pg_catalog.length(pg_catalog.btrim(target_guidance)) not between 1 and 700
    or target_draft_fingerprint is null or target_draft_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Assessment metadata is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
      from public.instagram_conversations c where c.id = target_conversation_id;
    select d.draft_text, d.status into stored_draft_text, stored_draft_status
      from public.instagram_reply_drafts d
      where d.id = target_draft_id and d.conversation_id = target_conversation_id
        and d.workspace_id = target_workspace_id and d.source_last_message_id = target_source_last_message_id
      for update;
    if not found then raise exception 'Instagram draft does not match the assessment source' using errcode = '22023'; end if;
    if stored_draft_status not in ('draft','reviewed') then raise exception 'Only active Instagram drafts can be assessed' using errcode = '22023'; end if;
    select m.id, m.direction into latest_message_id, latest_direction
      from public.instagram_messages m where m.conversation_id = target_conversation_id
      order by m.provider_sent_at desc, m.received_at desc limit 1;
  else
    select c.workspace_id into target_workspace_id
      from public.facebook_conversations c where c.id = target_conversation_id;
    select d.draft_text, d.status into stored_draft_text, stored_draft_status
      from public.facebook_reply_drafts d
      where d.id = target_draft_id and d.conversation_id = target_conversation_id
        and d.workspace_id = target_workspace_id and d.source_last_message_id = target_source_last_message_id
      for update;
    if not found then raise exception 'Facebook draft does not match the assessment source' using errcode = '22023'; end if;
    if stored_draft_status not in ('draft','reviewed') then raise exception 'Only active Facebook drafts can be assessed' using errcode = '22023'; end if;
    select m.id, m.direction into latest_message_id, latest_direction
      from public.facebook_messages m where m.conversation_id = target_conversation_id
      order by m.provider_sent_at desc, m.received_at desc limit 1;
  end if;

  if target_workspace_id is null or stored_draft_text is distinct from target_draft_text
    or latest_message_id is distinct from target_source_last_message_id or latest_direction is distinct from 'inbound' then
    raise exception 'Conversation or draft changed while the reply assessment was running' using errcode = '40001';
  end if;
  database_escalation_required := public.inbox_reply_requires_escalation(
    target_provider, target_conversation_id, target_draft_id, target_source_last_message_id
  );
  effective_escalation_required := target_escalation_required or database_escalation_required;
  effective_risk_level := case when effective_escalation_required then 'escalate' else target_risk_level end;
  select m.role::text into actor_role
    from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher','client_approver') then
    raise exception 'Your workspace role cannot save reply assessments' using errcode = '42501';
  end if;

  insert into public.inbox_reply_safety_assessments (
    workspace_id, provider, conversation_id, draft_id, source_last_message_id,
    risk_level, customer_language, draft_language, language_match,
    escalation_required, flags, guidance, draft_fingerprint, created_by
  ) values (
    target_workspace_id, target_provider, target_conversation_id, target_draft_id, target_source_last_message_id,
    effective_risk_level, target_customer_language, target_draft_language, target_language_match,
    effective_escalation_required, target_flags, pg_catalog.btrim(target_guidance), target_draft_fingerprint, actor_id
  )
  on conflict (provider, draft_id) do update set
    workspace_id = excluded.workspace_id,
    conversation_id = excluded.conversation_id,
    source_last_message_id = excluded.source_last_message_id,
    risk_level = excluded.risk_level,
    customer_language = excluded.customer_language,
    draft_language = excluded.draft_language,
    language_match = excluded.language_match,
    escalation_required = excluded.escalation_required,
    escalation_cleared_by = null,
    escalation_cleared_at = null,
    flags = excluded.flags,
    guidance = excluded.guidance,
    draft_fingerprint = excluded.draft_fingerprint,
    is_current = true,
    created_by = excluded.created_by,
    created_at = pg_catalog.now()
  returning id into saved_id;

  if target_provider = 'facebook' then
    -- Any refresh invalidates the previous human review. A fresh scan must be
    -- followed by a fresh review, and a high-risk result by a second-person clear.
    update public.facebook_reply_drafts
      set safety_assessed = true,
          status = case when status = 'reviewed' then 'draft' else status end,
          reviewed_by = case when status = 'reviewed' then null else reviewed_by end,
          reviewed_at = case when status = 'reviewed' then null else reviewed_at end,
          updated_at = pg_catalog.now()
      where id = target_draft_id and conversation_id = target_conversation_id;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'inbox.reply_safety.assessed', 'inbox_reply_safety_assessment', saved_id::text,
    'success', pg_catalog.jsonb_build_object(
      'provider', target_provider, 'risk_level', effective_risk_level,
      'escalation_required', effective_escalation_required,
      'flag_count', pg_catalog.jsonb_array_length(target_flags)
    )
  );
  return saved_id;
end;
$$;

revoke all on function public.save_inbox_reply_safety_assessment(text, uuid, uuid, uuid, text, text, text, text, boolean, boolean, jsonb, text, text) from public, anon;
grant execute on function public.save_inbox_reply_safety_assessment(text, uuid, uuid, uuid, text, text, text, text, boolean, boolean, jsonb, text, text) to authenticated;

comment on table public.inbox_reply_safety_assessments is
  'Deterministic policy and language signals for generated reply drafts. Advisory only; every response still requires human review and provider policies still apply.';
comment on function public.save_inbox_reply_safety_assessment(text, uuid, uuid, uuid, text, text, text, text, boolean, boolean, jsonb, text, text) is
  'Saves a workspace-role-checked reply assessment only when the locked draft text and latest inbound message match the assessment payload; database rules independently force high-risk escalation.';


create or replace function public.clear_inbox_reply_escalation(
  target_conversation_id uuid,
  target_draft_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  target_source_message_id uuid;
  target_status text;
  target_safety_assessed boolean;
  reviewer_id uuid;
  assessment_workspace_id uuid;
  assessment_source_message_id uuid;
  assessment_is_current boolean;
  latest_message_id uuid;
  latest_direction text;
  actor_role text;
  cleared_at timestamptz;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  -- Lock the draft first, then its assessment. This matches scan/edit lock order
  -- and avoids a draft/assessment deadlock during concurrent review operations.
  select d.workspace_id, d.source_last_message_id, d.status, d.safety_assessed, d.reviewed_by
    into target_workspace_id, target_source_message_id, target_status, target_safety_assessed, reviewer_id
    from public.facebook_reply_drafts d
    where d.id = target_draft_id and d.conversation_id = target_conversation_id
    for update;
  if not found then raise exception 'Reply draft is unavailable' using errcode = 'P0002'; end if;

  select a.workspace_id, a.source_last_message_id, a.escalation_cleared_at, a.is_current
    into assessment_workspace_id, assessment_source_message_id, cleared_at, assessment_is_current
    from public.inbox_reply_safety_assessments a
    where a.provider = 'facebook' and a.conversation_id = target_conversation_id
      and a.draft_id = target_draft_id and a.escalation_required = true
    for update;
  if not found or assessment_workspace_id is distinct from target_workspace_id
    or assessment_source_message_id is distinct from target_source_message_id then
    raise exception 'Current escalation assessment not found' using errcode = 'P0002';
  end if;
  if cleared_at is not null then raise exception 'Escalation has already been cleared' using errcode = '22023'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then
    raise exception 'Only an owner, admin or manager can clear a high-risk reply escalation' using errcode = '42501';
  end if;
  if not target_safety_assessed then raise exception 'Run the reply safety scan before escalation clearance' using errcode = '40001'; end if;
  if not assessment_is_current then raise exception 'The reply draft was edited after its safety scan. Generate a fresh draft before clearance' using errcode = '40001'; end if;
  if target_status <> 'reviewed' or reviewer_id is null or reviewer_id = actor_id then
    raise exception 'A different authorised team member must review the current draft before escalation clearance' using errcode = '42501';
  end if;
  select m.id, m.direction into latest_message_id, latest_direction
    from public.facebook_messages m where m.conversation_id = target_conversation_id
    order by m.provider_sent_at desc, m.received_at desc limit 1;
  if latest_message_id is distinct from target_source_message_id or latest_direction is distinct from 'inbound' then
    raise exception 'The conversation changed. Generate and review a new draft before clearing escalation' using errcode = '40001';
  end if;

  update public.inbox_reply_safety_assessments
    set escalation_cleared_by = actor_id, escalation_cleared_at = pg_catalog.now()
    where provider = 'facebook' and conversation_id = target_conversation_id and draft_id = target_draft_id
      and escalation_required = true and escalation_cleared_at is null;
  if not found then raise exception 'Escalation is already cleared or unavailable' using errcode = '22023'; end if;
  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'facebook.reply_escalation.cleared', 'facebook_reply_draft', target_draft_id::text,
    'success', pg_catalog.jsonb_build_object('reviewer_user_id', reviewer_id)
  );
end;
$$;
revoke all on function public.clear_inbox_reply_escalation(uuid, uuid) from public, anon;
grant execute on function public.clear_inbox_reply_escalation(uuid, uuid) to authenticated;


create or replace function public.invalidate_facebook_reply_safety_scan_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inbox_reply_safety_assessments
    set is_current = false, escalation_cleared_by = null, escalation_cleared_at = null
    where provider = 'facebook' and draft_id = new.id and old.draft_text is distinct from new.draft_text;
  update public.facebook_reply_drafts
    set safety_assessed = false,
        status = case when new.status = 'reviewed' then 'draft' else new.status end,
        reviewed_by = case when new.status = 'reviewed' then null else new.reviewed_by end,
        reviewed_at = case when new.status = 'reviewed' then null else new.reviewed_at end
    where id = new.id and old.draft_text is distinct from new.draft_text;
  return new;
end;
$$;

revoke all on function public.invalidate_facebook_reply_safety_scan_on_edit() from public, anon, authenticated;
drop trigger if exists facebook_reply_safety_scan_invalidate_on_edit on public.facebook_reply_drafts;
create trigger facebook_reply_safety_scan_invalidate_on_edit
  after update of draft_text on public.facebook_reply_drafts
  for each row when (old.draft_text is distinct from new.draft_text)
  execute function public.invalidate_facebook_reply_safety_scan_on_edit();

create or replace function public.enforce_facebook_reply_escalation_clearance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_conversation_id uuid;
  draft_source_message_id uuid;
  draft_has_safety_scan boolean;
  current_policy_requires_escalation boolean := false;
begin
  select d.conversation_id, d.source_last_message_id, d.safety_assessed
    into draft_conversation_id, draft_source_message_id, draft_has_safety_scan
    from public.facebook_reply_drafts d where d.id = new.draft_id for share;
  if not found then raise exception 'Reply draft is unavailable' using errcode = 'P0002'; end if;
  if new.conversation_id is distinct from draft_conversation_id then
    raise exception 'Send attempt conversation does not match its reply draft' using errcode = '22023';
  end if;
  if not draft_has_safety_scan then
    raise exception 'Run the reply safety scan after creating or editing this draft before sending' using errcode = '42501';
  end if;

  -- Re-evaluate the current brand policy at send time. A brand voice change after
  -- a scan cannot silently turn an older low-risk assessment into send approval.
  current_policy_requires_escalation := public.inbox_reply_requires_escalation(
    'facebook', draft_conversation_id, new.draft_id, draft_source_message_id
  );
  if current_policy_requires_escalation and not exists (
    select 1 from public.inbox_reply_safety_assessments a
    where a.provider = 'facebook' and a.draft_id = new.draft_id
      and a.conversation_id = draft_conversation_id
      and a.source_last_message_id = draft_source_message_id
      and a.escalation_required = true and a.escalation_cleared_at is not null and a.is_current = true
  ) then
    raise exception 'Current brand policy requires a fresh scan and a second authorised clearance before sending' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.inbox_reply_safety_assessments a
    where a.provider = 'facebook' and a.draft_id = new.draft_id
      and a.escalation_required = true
      and (a.escalation_cleared_at is null or a.is_current = false or a.source_last_message_id is distinct from draft_source_message_id)
  ) then
    raise exception 'High-risk reply requires clearance by a different owner, admin or manager before sending' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_facebook_reply_escalation_clearance() from public, anon, authenticated;
drop trigger if exists facebook_reply_escalation_clearance_guard on public.facebook_message_send_attempts;
create trigger facebook_reply_escalation_clearance_guard
  before insert on public.facebook_message_send_attempts
  for each row execute function public.enforce_facebook_reply_escalation_clearance();

comment on function public.clear_inbox_reply_escalation(uuid, uuid) is
  'Two-person control for high-risk Facebook replies: an owner/admin/manager other than the reviewer must clear escalation after the latest inbound message is rechecked.';
