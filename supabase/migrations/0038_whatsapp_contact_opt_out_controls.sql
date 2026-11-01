-- RuffNeck Social Hub v5.1.0 — WhatsApp recipient opt-out and consent controls.
-- Apply once after 0037_whatsapp_reviewed_media_replies.sql.
-- STOP/UNSUBSCRIBE keywords suppress future outbound sends. START/UNSTOP explicitly re-enable.

create table if not exists public.whatsapp_contact_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  participant_provider_id text not null check (participant_provider_id ~ '^[0-9]{8,20}$'),
  consent_status text not null check (consent_status in ('unknown','opted_in','opted_out')),
  source_message_id uuid references public.whatsapp_messages(id) on delete set null,
  source_keyword text check (source_keyword is null or source_keyword in ('STOP','STOP ALL','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','START','UNSTOP')),
  updated_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (social_account_id, participant_provider_id)
);
create index if not exists whatsapp_contact_preferences_workspace_status_idx
  on public.whatsapp_contact_preferences(workspace_id, consent_status, updated_at desc);

alter table public.whatsapp_contact_preferences enable row level security;
revoke all on public.whatsapp_contact_preferences from public, anon, authenticated;
grant select on public.whatsapp_contact_preferences to authenticated;
create policy whatsapp_contact_preferences_workspace_read on public.whatsapp_contact_preferences
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.classify_whatsapp_consent_keyword(target_message_text text)
returns text language plpgsql immutable set search_path = '' as $$
declare clean text;
begin
  clean := pg_catalog.upper(pg_catalog.btrim(coalesce(target_message_text,'')));
  clean := pg_catalog.regexp_replace(clean, '[[:space:][:punct:]]+$', '', 'g');
  if clean in ('STOP','STOP ALL','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') then return 'opted_out'; end if;
  if clean in ('START','UNSTOP') then return 'opted_in'; end if;
  return null;
end;
$$;
revoke all on function public.classify_whatsapp_consent_keyword(text) from public, anon, authenticated;
grant execute on function public.classify_whatsapp_consent_keyword(text) to service_role;

create or replace function public.capture_whatsapp_contact_consent_keyword()
returns trigger language plpgsql security definer set search_path = '' as $$
declare preference_action text; participant_id text; keyword_value text; target_workspace uuid; target_account uuid;
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
  insert into public.whatsapp_contact_preferences(
    workspace_id,social_account_id,participant_provider_id,consent_status,source_message_id,source_keyword,updated_at
  ) values (
    target_workspace,target_account,participant_id,preference_action,new.id,left(keyword_value,24),new.provider_sent_at
  )
  on conflict (social_account_id,participant_provider_id) do update set
    workspace_id = excluded.workspace_id,
    consent_status = excluded.consent_status,
    source_message_id = excluded.source_message_id,
    source_keyword = excluded.source_keyword,
    updated_at = excluded.updated_at;
  return new;
end;
$$;
revoke all on function public.capture_whatsapp_contact_consent_keyword() from public, anon, authenticated;
create trigger whatsapp_capture_contact_consent_keyword
  after insert on public.whatsapp_messages
  for each row execute function public.capture_whatsapp_contact_consent_keyword();

create or replace function public.enforce_whatsapp_recipient_opt_out()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient_id text; preference text;
begin
  select c.participant_provider_id into recipient_id
    from public.whatsapp_conversations c
    where c.id = new.conversation_id and c.workspace_id = new.workspace_id
      and c.social_account_id = new.social_account_id;
  if recipient_id is null then
    raise exception 'WhatsApp conversation recipient could not be verified' using errcode = '42501';
  end if;
  select p.consent_status into preference
    from public.whatsapp_contact_preferences p
    where p.workspace_id = new.workspace_id and p.social_account_id = new.social_account_id
      and p.participant_provider_id = recipient_id;
  if preference = 'opted_out' then
    raise exception 'WhatsApp recipient has opted out; outbound messaging is blocked' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_whatsapp_recipient_opt_out() from public, anon, authenticated;
create trigger whatsapp_block_opted_out_text_template_sends
  before insert on public.whatsapp_message_send_attempts
  for each row execute function public.enforce_whatsapp_recipient_opt_out();
create trigger whatsapp_block_opted_out_media_sends
  before insert on public.whatsapp_media_reply_send_attempts
  for each row execute function public.enforce_whatsapp_recipient_opt_out();

comment on table public.whatsapp_contact_preferences is
  'Workspace-scoped WhatsApp recipient consent state. Exact inbound STOP-family keywords suppress all outbound sends; START or UNSTOP records explicit re-opt-in.';
comment on function public.enforce_whatsapp_recipient_opt_out() is
  'Database-level fail-closed guard applied to both text/template and media send-attempt ledgers.';
