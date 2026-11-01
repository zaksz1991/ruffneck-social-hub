-- RuffNeck Social Hub v5.2.0 — evidence-backed opt-outs received outside WhatsApp.
-- Apply once after 0038_whatsapp_contact_opt_out_controls.sql.
-- This migration records external withdrawals only. It deliberately does not
-- provide a staff-controlled opt-in path; re-enablement remains customer-led
-- through the existing exact START / UNSTOP WhatsApp keyword path.

alter table public.whatsapp_contact_preferences
  add column if not exists source_channel text not null default 'whatsapp_keyword'
    check (source_channel in ('whatsapp_keyword','website_form','phone_call','email','in_person','support_ticket','other')),
  add column if not exists evidence_note text
    check (evidence_note is null or char_length(evidence_note) between 8 and 1000),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.whatsapp_contact_consent_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  participant_provider_id text not null check (participant_provider_id ~ '^[0-9]{8,20}$'),
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  action text not null check (action in ('opted_in','opted_out')),
  source_channel text not null check (source_channel in ('whatsapp_keyword','website_form','phone_call','email','in_person','support_ticket','other')),
  source_message_id uuid references public.whatsapp_messages(id) on delete set null,
  source_keyword text check (source_keyword is null or source_keyword in ('STOP','STOP ALL','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','START','UNSTOP')),
  evidence_note text check (evidence_note is null or char_length(evidence_note) between 8 and 1000),
  recorded_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now()
);
create index if not exists whatsapp_contact_consent_events_lookup_idx
  on public.whatsapp_contact_consent_events(social_account_id, participant_provider_id, created_at desc);
create index if not exists whatsapp_contact_consent_events_workspace_idx
  on public.whatsapp_contact_consent_events(workspace_id, created_at desc);

alter table public.whatsapp_contact_consent_events enable row level security;
revoke all on public.whatsapp_contact_consent_events from public, anon, authenticated;
grant select on public.whatsapp_contact_consent_events to authenticated;
create policy whatsapp_contact_consent_events_workspace_read on public.whatsapp_contact_consent_events
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Replace the v5.1 keyword recorder so on-WhatsApp requests also enter the
-- evidence ledger. Each inserted inbound keyword message is a distinct event.
create or replace function public.capture_whatsapp_contact_consent_keyword()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  preference_action text;
  participant_id text;
  keyword_value text;
  target_workspace uuid;
  target_account uuid;
  event_note text;
  occurred timestamptz;
begin
  if new.direction <> 'inbound' then return new; end if;
  preference_action := public.classify_whatsapp_consent_keyword(new.message_text);
  if preference_action is null then return new; end if;

  select c.workspace_id,c.social_account_id,c.participant_provider_id
    into target_workspace,target_account,participant_id
    from public.whatsapp_conversations c
    where c.id = new.conversation_id and c.workspace_id = new.workspace_id;
  if target_workspace is null then return new; end if;

  keyword_value := pg_catalog.upper(pg_catalog.btrim(new.message_text));
  keyword_value := pg_catalog.regexp_replace(keyword_value, '[[:space:][:punct:]]+$', '', 'g');
  occurred := coalesce(new.provider_sent_at,new.received_at,pg_catalog.now());
  event_note := case when preference_action = 'opted_out'
    then 'Customer requested opt-out using an inbound WhatsApp keyword.'
    else 'Customer requested re-enablement using an inbound WhatsApp keyword.' end;

  insert into public.whatsapp_contact_preferences(
    workspace_id,social_account_id,participant_provider_id,consent_status,
    source_message_id,source_keyword,source_channel,evidence_note,updated_by,updated_at
  ) values (
    target_workspace,target_account,participant_id,preference_action,
    new.id,left(keyword_value,24),'whatsapp_keyword',event_note,null,occurred
  )
  on conflict (social_account_id,participant_provider_id) do update set
    workspace_id = excluded.workspace_id,
    consent_status = excluded.consent_status,
    source_message_id = excluded.source_message_id,
    source_keyword = excluded.source_keyword,
    source_channel = excluded.source_channel,
    evidence_note = excluded.evidence_note,
    updated_by = null,
    updated_at = excluded.updated_at;

  insert into public.whatsapp_contact_consent_events(
    workspace_id,social_account_id,participant_provider_id,conversation_id,action,
    source_channel,source_message_id,source_keyword,evidence_note,recorded_by,occurred_at
  ) values (
    target_workspace,target_account,participant_id,new.conversation_id,preference_action,
    'whatsapp_keyword',new.id,left(keyword_value,24),event_note,null,occurred
  );
  return new;
end;
$$;
revoke all on function public.capture_whatsapp_contact_consent_keyword() from public, anon, authenticated;

-- Record an opt-out that arrived through another channel. The caller cannot
-- choose a workspace, account or recipient independently of the conversation.
create or replace function public.record_whatsapp_external_opt_out(
  target_conversation_id uuid,
  target_source_channel text,
  target_evidence_note text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  target_workspace uuid;
  target_account uuid;
  participant_id text;
  actor_role text;
  clean_note text := pg_catalog.btrim(coalesce(target_evidence_note,''));
  captured_at timestamptz := pg_catalog.now();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_source_channel is null or target_source_channel not in ('website_form','phone_call','email','in_person','support_ticket','other') then
    raise exception 'Unsupported external opt-out source' using errcode = '22023';
  end if;
  if pg_catalog.char_length(clean_note) < 8 or pg_catalog.char_length(clean_note) > 1000 then
    raise exception 'Evidence reference must contain 8 to 1000 characters' using errcode = '22023';
  end if;

  select c.workspace_id,c.social_account_id,c.participant_provider_id
    into target_workspace,target_account,participant_id
    from public.whatsapp_conversations c
    join public.social_accounts a on a.id = c.social_account_id and a.provider = 'whatsapp'
    where c.id = target_conversation_id
    for update of c;
  if target_workspace is null or participant_id is null or participant_id !~ '^[0-9]{8,20}$' then
    raise exception 'WhatsApp conversation recipient could not be verified' using errcode = '22023';
  end if;

  select m.role into actor_role
    from public.workspace_members m
    where m.workspace_id = target_workspace and m.user_id = actor_id;
  if actor_role not in ('owner','admin','manager') or actor_role is null then
    raise exception 'Workspace manager permission required' using errcode = '42501';
  end if;

  insert into public.whatsapp_contact_preferences(
    workspace_id,social_account_id,participant_provider_id,consent_status,
    source_message_id,source_keyword,source_channel,evidence_note,updated_by,updated_at
  ) values (
    target_workspace,target_account,participant_id,'opted_out',
    null,null,target_source_channel,clean_note,actor_id,captured_at
  )
  on conflict (social_account_id,participant_provider_id) do update set
    workspace_id = excluded.workspace_id,
    consent_status = 'opted_out',
    source_message_id = null,
    source_keyword = null,
    source_channel = excluded.source_channel,
    evidence_note = excluded.evidence_note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.whatsapp_contact_consent_events(
    workspace_id,social_account_id,participant_provider_id,conversation_id,action,
    source_channel,evidence_note,recorded_by,occurred_at
  ) values (
    target_workspace,target_account,participant_id,target_conversation_id,'opted_out',
    target_source_channel,clean_note,actor_id,captured_at
  );
  return true;
end;
$$;
revoke all on function public.record_whatsapp_external_opt_out(uuid,text,text) from public, anon;
grant execute on function public.record_whatsapp_external_opt_out(uuid,text,text) to authenticated;

comment on table public.whatsapp_contact_consent_events is
  'Workspace-readable consent evidence ledger. Application users cannot insert, update or delete events directly.';
comment on function public.record_whatsapp_external_opt_out(uuid,text,text) is
  'Records a manager-approved external WhatsApp opt-out with evidence and audit actor; it cannot create an opt-in.';
