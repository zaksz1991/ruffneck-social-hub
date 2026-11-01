-- RuffNeck Social Hub v4.6.0 — official WhatsApp Cloud API and guarded unified inbox.
-- Apply once after 0032_instagram_comment_reply_sending.sql.
-- Tokens are encrypted by the app before this migration receives them.

alter table public.provider_webhook_events drop constraint if exists provider_webhook_events_provider_check;
alter table public.provider_webhook_events add constraint provider_webhook_events_provider_check
  check (provider in ('instagram','facebook','whatsapp'));

alter table public.inbox_conversation_workflows drop constraint if exists inbox_conversation_workflows_provider_check;
alter table public.inbox_conversation_workflows add constraint inbox_conversation_workflows_provider_check
  check (provider in ('instagram','facebook','whatsapp'));

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  participant_provider_id text not null check (length(btrim(participant_provider_id)) between 8 and 20),
  participant_name text check (participant_name is null or length(btrim(participant_name)) between 1 and 120),
  last_message_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, participant_provider_id),
  unique (id, workspace_id)
);
create index if not exists whatsapp_conversations_workspace_recent_idx on public.whatsapp_conversations(workspace_id, last_message_at desc);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  provider_message_id text not null check (length(btrim(provider_message_id)) between 1 and 255),
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text' check (message_type in ('text','image','video','audio','document','sticker','location','contacts','interactive','button','order','template','system')),
  message_text text not null check (length(message_text) between 1 and 10000),
  attachment_types text[] not null default '{}',
  delivery_status text not null default 'received' check (delivery_status in ('received','accepted','sent','delivered','read','failed','unknown')),
  provider_sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  status_updated_at timestamptz,
  safe_error_code text,
  constraint whatsapp_messages_conversation_workspace_fk foreign key (conversation_id, workspace_id)
    references public.whatsapp_conversations(id, workspace_id) on delete cascade,
  unique (social_account_id, provider_message_id)
);
create index if not exists whatsapp_messages_conversation_recent_idx on public.whatsapp_messages(conversation_id, provider_sent_at desc, received_at desc);
create index if not exists whatsapp_messages_provider_id_idx on public.whatsapp_messages(provider_message_id);

create table if not exists public.whatsapp_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  source_last_message_id uuid not null references public.whatsapp_messages(id) on delete restrict,
  draft_type text not null default 'text' check (draft_type in ('text','template')),
  draft_text text not null check (length(btrim(draft_text)) between 1 and 4096),
  template_name text,
  template_language text,
  template_components jsonb not null default '[]'::jsonb check (jsonb_typeof(template_components) = 'array' and jsonb_array_length(template_components) <= 10),
  model text not null default 'human-authored',
  status text not null default 'draft' check (status in ('draft','reviewed','sent','discarded')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_reply_drafts_conversation_workspace_fk foreign key (conversation_id, workspace_id)
    references public.whatsapp_conversations(id, workspace_id) on delete cascade,
  constraint whatsapp_reply_drafts_review_state_check check ((status in ('reviewed','sent') and reviewed_by is not null and reviewed_at is not null) or (status not in ('reviewed','sent'))),
  constraint whatsapp_reply_drafts_sent_state_check check ((status = 'sent' and sent_at is not null) or (status <> 'sent' and sent_at is null)),
  constraint whatsapp_reply_drafts_template_fields_check check (
    (draft_type = 'text' and template_name is null and template_language is null)
    or (draft_type = 'template' and coalesce(template_name ~ '^[a-z0-9_]{1,512}$', false) and coalesce(template_language ~ '^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})?$', false))
  )
);
create index if not exists whatsapp_reply_drafts_conversation_recent_idx on public.whatsapp_reply_drafts(conversation_id, created_at desc);

create table if not exists public.whatsapp_message_send_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  draft_id uuid not null unique references public.whatsapp_reply_drafts(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  status text not null check (status in ('dispatching','succeeded','failed','unknown')),
  provider_message_id text,
  safe_error_code text,
  template_opt_in_confirmed_at timestamptz,
  template_opt_in_confirmed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint whatsapp_send_attempts_template_opt_in_check check ((template_opt_in_confirmed_at is null) = (template_opt_in_confirmed_by is null)),
  constraint whatsapp_send_attempts_conversation_workspace_fk foreign key (conversation_id, workspace_id)
    references public.whatsapp_conversations(id, workspace_id) on delete cascade
);
create index if not exists whatsapp_send_attempts_conversation_recent_idx on public.whatsapp_message_send_attempts(conversation_id, created_at desc);

create table if not exists public.whatsapp_message_status_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  provider_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  safe_error_code text,
  received_at timestamptz not null default now(),
  unique (social_account_id, provider_message_id, status, occurred_at)
);
create index if not exists whatsapp_message_status_events_recent_idx on public.whatsapp_message_status_events(social_account_id, provider_message_id, occurred_at desc);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_reply_drafts enable row level security;
alter table public.whatsapp_message_send_attempts enable row level security;
alter table public.whatsapp_message_status_events enable row level security;
revoke all on public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_reply_drafts,
  public.whatsapp_message_send_attempts, public.whatsapp_message_status_events from public, anon, authenticated;
grant select on public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_reply_drafts, public.whatsapp_message_send_attempts to authenticated;
grant select on public.whatsapp_message_status_events to authenticated;
create policy whatsapp_conversations_workspace_read on public.whatsapp_conversations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy whatsapp_messages_workspace_read on public.whatsapp_messages for select to authenticated using (public.is_workspace_member(workspace_id));
create policy whatsapp_drafts_workspace_read on public.whatsapp_reply_drafts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy whatsapp_attempts_workspace_read on public.whatsapp_message_send_attempts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy whatsapp_status_workspace_read on public.whatsapp_message_status_events for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.store_whatsapp_connection(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_waba_id text,
  target_phone_number_id text,
  target_display_phone_number text,
  target_verified_name text,
  target_granted_scopes text[],
  target_token_ciphertext text,
  target_token_iv text,
  target_token_auth_tag text,
  target_token_expires_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); actor_role text; account_id uuid; existing public.social_accounts%rowtype;
  clean_scopes text[]; clean_name text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_workspace_id is null or target_brand_id is null or target_waba_id !~ '^\d{5,30}$'
    or target_phone_number_id !~ '^\d{5,30}$' or target_display_phone_number is null
    or length(btrim(target_display_phone_number)) not between 3 and 80
    or target_verified_name is null or length(btrim(target_verified_name)) not between 1 and 120
    or target_token_ciphertext is null or length(target_token_ciphertext) not between 4 and 16384
    or target_token_iv is null or length(target_token_iv) not between 12 and 32
    or target_token_auth_tag is null or length(target_token_auth_tag) not between 20 and 32
    or target_token_expires_at is null or target_token_expires_at <= pg_catalog.now() then
    raise exception 'WhatsApp account input is invalid' using errcode = '22023';
  end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then raise exception 'Workspace role cannot connect providers' using errcode = '42501'; end if;
  if not exists (select 1 from public.brands b where b.id = target_brand_id and b.workspace_id = target_workspace_id) then
    raise exception 'Brand does not belong to workspace' using errcode = '22023';
  end if;
  select coalesce(array(select distinct s from pg_catalog.unnest(coalesce(target_granted_scopes,array[]::text[])) u(s)
    where s in ('whatsapp_business_management','whatsapp_business_messaging')),array[]::text[]) into clean_scopes;
  if not ('whatsapp_business_management' = any(clean_scopes) and 'whatsapp_business_messaging' = any(clean_scopes)) then
    raise exception 'WhatsApp Business Management and Messaging permissions are required' using errcode = '22023';
  end if;
  select * into existing from public.social_accounts a where a.provider='whatsapp' and a.provider_account_id=target_phone_number_id for update;
  clean_name := pg_catalog.btrim(target_verified_name);
  if found then
    if existing.workspace_id <> target_workspace_id or existing.brand_id <> target_brand_id then
      raise exception 'WhatsApp phone number is already connected to another workspace or brand' using errcode = '23505';
    end if;
    account_id := existing.id;
    update public.social_accounts set display_name=clean_name, connection_state='connected', granted_scopes=clean_scopes,
      capabilities=pg_catalog.jsonb_build_object('messaging',true,'messaging_send',true,'webhook_messages_subscribed',true,
        'waba_id',target_waba_id,'phone_number_id',target_phone_number_id,'display_phone_number',target_display_phone_number,
        'verified_name',clean_name,'business_profile_verified',true,'api_mode','cloud_api'),
      token_secret_ref='social_account_token_vault:'||account_id::text where id=account_id;
  else
    insert into public.social_accounts(workspace_id,brand_id,provider,provider_account_id,display_name,connection_state,granted_scopes,capabilities,token_secret_ref)
    values(target_workspace_id,target_brand_id,'whatsapp',target_phone_number_id,clean_name,'connected',clean_scopes,
      pg_catalog.jsonb_build_object('messaging',true,'messaging_send',true,'webhook_messages_subscribed',true,
        'waba_id',target_waba_id,'phone_number_id',target_phone_number_id,'display_phone_number',target_display_phone_number,
        'verified_name',clean_name,'business_profile_verified',true,'api_mode','cloud_api'),'social_account_token_vault:new') returning id into account_id;
    update public.social_accounts set token_secret_ref='social_account_token_vault:'||account_id::text where id=account_id;
  end if;
  insert into public.social_account_token_vault(social_account_id,ciphertext,iv,auth_tag,token_expires_at,updated_at)
  values(account_id,target_token_ciphertext,target_token_iv,target_token_auth_tag,target_token_expires_at,pg_catalog.now())
  on conflict(social_account_id) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,
    token_expires_at=excluded.token_expires_at,updated_at=pg_catalog.now();
  insert into public.audit_events(workspace_id,actor_user_id,event_type,resource_type,resource_id,outcome,safe_metadata)
  values(target_workspace_id,actor_id,'integration.whatsapp.connected','social_account',account_id::text,'success',
    pg_catalog.jsonb_build_object('brand_id',target_brand_id,'waba_id',target_waba_id,'phone_number_id',target_phone_number_id,'granted_scopes',clean_scopes));
  return account_id;
end; $$;
revoke all on function public.store_whatsapp_connection(uuid,uuid,text,text,text,text,text[],text,text,text,timestamptz) from public, anon;
grant execute on function public.store_whatsapp_connection(uuid,uuid,text,text,text,text,text[],text,text,text,timestamptz) to authenticated;

create or replace function public.ingest_whatsapp_message(
  target_workspace_id uuid, target_social_account_id uuid, target_participant_provider_id text,
  target_participant_name text, target_provider_message_id text, target_message_text text,
  target_attachment_types text[], target_provider_sent_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare conversation_id uuid; message_id uuid; account_provider text; clean_text text;
begin
  if target_workspace_id is null or target_social_account_id is null or target_participant_provider_id !~ '^\d{8,20}$'
    or target_provider_message_id is null or length(target_provider_message_id) not between 1 and 255
    or target_message_text is null or length(target_message_text) not between 1 and 10000
    or target_provider_sent_at is null or target_provider_sent_at > pg_catalog.now() + interval '5 minutes'
    or target_provider_sent_at < pg_catalog.now() - interval '5 years' then
    raise exception 'WhatsApp inbound message is invalid' using errcode = '22023';
  end if;
  if not exists(select 1 from public.social_accounts a where a.id=target_social_account_id and a.workspace_id=target_workspace_id
    and a.provider='whatsapp' and a.connection_state='connected' and a.capabilities->>'messaging'='true') then
    raise exception 'WhatsApp account is not active for this workspace' using errcode = '42501';
  end if;
  clean_text := pg_catalog.btrim(target_message_text);
  insert into public.whatsapp_conversations(workspace_id,social_account_id,participant_provider_id,participant_name,last_message_at)
  values(target_workspace_id,target_social_account_id,target_participant_provider_id,nullif(pg_catalog.btrim(coalesce(target_participant_name,'')),''),target_provider_sent_at)
  on conflict(social_account_id,participant_provider_id) do update set
    participant_name=coalesce(excluded.participant_name,public.whatsapp_conversations.participant_name),
    last_message_at=greatest(public.whatsapp_conversations.last_message_at,excluded.last_message_at),updated_at=pg_catalog.now()
  returning id into conversation_id;
  insert into public.whatsapp_messages(workspace_id,conversation_id,social_account_id,provider_message_id,direction,message_type,message_text,attachment_types,delivery_status,provider_sent_at)
  values(target_workspace_id,conversation_id,target_social_account_id,target_provider_message_id,'inbound',
    case when coalesce(pg_catalog.cardinality(target_attachment_types),0)>0 then target_attachment_types[1] else 'text' end,
    clean_text,coalesce(target_attachment_types,array[]::text[]),'received',target_provider_sent_at)
  on conflict(social_account_id,provider_message_id) do nothing returning id into message_id;
  return coalesce(message_id,(select m.id from public.whatsapp_messages m where m.social_account_id=target_social_account_id and m.provider_message_id=target_provider_message_id));
end; $$;
revoke all on function public.ingest_whatsapp_message(uuid,uuid,text,text,text,text,text[],timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_message(uuid,uuid,text,text,text,text,text[],timestamptz) to service_role;

create or replace function public.create_whatsapp_reply_draft(target_conversation_id uuid,target_draft_text text,target_draft_type text default 'text',target_template_name text default null,target_template_language text default null,target_template_components jsonb default '[]'::jsonb,target_model text default 'human-authored')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); target_workspace_id uuid; target_account_id uuid; latest_id uuid; saved_id uuid; actor_role text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if target_draft_text is null or pg_catalog.length(pg_catalog.btrim(target_draft_text)) not between 1 and 4096
    or target_draft_type not in ('text','template') or pg_catalog.jsonb_typeof(coalesce(target_template_components,'[]'::jsonb))<>'array'
    or pg_catalog.jsonb_array_length(coalesce(target_template_components,'[]'::jsonb))>10 then raise exception 'Draft input is invalid' using errcode='22023'; end if;
  select c.workspace_id,c.social_account_id into target_workspace_id,target_account_id from public.whatsapp_conversations c where c.id=target_conversation_id;
  if target_workspace_id is null then raise exception 'Conversation not found' using errcode='P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m where m.workspace_id=target_workspace_id and m.user_id=actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher','client_approver') then raise exception 'Workspace role cannot draft replies' using errcode='42501'; end if;
  select m.id into latest_id from public.whatsapp_messages m where m.conversation_id=target_conversation_id and m.direction='inbound'
    order by m.provider_sent_at desc,m.received_at desc limit 1;
  if latest_id is null then raise exception 'A customer message is required before creating a reply' using errcode='P0002'; end if;
  if target_draft_type='template' and (target_template_name !~ '^[a-z0-9_]{1,512}$' or target_template_language !~ '^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})?$') then
    raise exception 'Template name or language is invalid' using errcode='22023'; end if;
  insert into public.whatsapp_reply_drafts(workspace_id,conversation_id,social_account_id,source_last_message_id,draft_type,draft_text,template_name,template_language,template_components,model,created_by)
  values(target_workspace_id,target_conversation_id,target_account_id,latest_id,target_draft_type,pg_catalog.btrim(target_draft_text),target_template_name,target_template_language,
    coalesce(target_template_components,'[]'::jsonb),left(coalesce(target_model,'human-authored'),160),actor_id) returning id into saved_id;
  return saved_id;
end; $$;
revoke all on function public.create_whatsapp_reply_draft(uuid,text,text,text,text,jsonb,text) from public, anon;
grant execute on function public.create_whatsapp_reply_draft(uuid,text,text,text,text,jsonb,text) to authenticated;

create or replace function public.review_whatsapp_reply_draft(target_draft_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); d public.whatsapp_reply_drafts%rowtype; actor_role text; latest_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into d from public.whatsapp_reply_drafts where id=target_draft_id for update;
  if not found or d.status<>'draft' then raise exception 'Draft is not available for review' using errcode='P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m where m.workspace_id=d.workspace_id and m.user_id=actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then raise exception 'Workspace role cannot review replies' using errcode='42501'; end if;
  select m.id into latest_id from public.whatsapp_messages m where m.conversation_id=d.conversation_id and m.direction='inbound'
    order by m.provider_sent_at desc,m.received_at desc limit 1;
  if latest_id is distinct from d.source_last_message_id then raise exception 'Conversation changed; create a fresh draft' using errcode='40001'; end if;
  update public.whatsapp_reply_drafts set status='reviewed',reviewed_by=actor_id,reviewed_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=target_draft_id;
  return true;
end; $$;
revoke all on function public.review_whatsapp_reply_draft(uuid) from public, anon;
grant execute on function public.review_whatsapp_reply_draft(uuid) to authenticated;

create or replace function public.begin_whatsapp_message_send(target_draft_id uuid,target_template_opt_in_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); d public.whatsapp_reply_drafts%rowtype; actor_role text; latest_at timestamptz; attempt_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into d from public.whatsapp_reply_drafts where id=target_draft_id for update;
  if not found or d.status<>'reviewed' then raise exception 'Only a reviewed draft can be sent' using errcode='22023'; end if;
  select m.role::text into actor_role from public.workspace_members m where m.workspace_id=d.workspace_id and m.user_id=actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then raise exception 'Workspace role cannot send WhatsApp messages' using errcode='42501'; end if;
  select m.provider_sent_at into latest_at from public.whatsapp_messages m where m.conversation_id=d.conversation_id and m.direction='inbound'
    order by m.provider_sent_at desc,m.received_at desc limit 1;
  if latest_at is null or (select source_last_message_id from public.whatsapp_reply_drafts where id=target_draft_id)
    is distinct from (select m.id from public.whatsapp_messages m where m.conversation_id=d.conversation_id and m.direction='inbound'
      order by m.provider_sent_at desc,m.received_at desc limit 1) then raise exception 'A newer customer message exists; create a fresh draft' using errcode='40001'; end if;
  if d.draft_type='text' and (latest_at > pg_catalog.now() or pg_catalog.now()-latest_at >= interval '24 hours') then
    raise exception 'Free-form WhatsApp replies are allowed only within the 24-hour customer-service window. Use an approved template.' using errcode='22023'; end if;
  if d.draft_type='template' and coalesce(target_template_opt_in_confirmed,false) is not true then
    raise exception 'A verified customer opt-in attestation is required for template messages' using errcode='22023'; end if;
  if not exists(select 1 from public.social_accounts a where a.id=d.social_account_id and a.workspace_id=d.workspace_id and a.provider='whatsapp'
    and a.connection_state='connected' and a.capabilities->>'messaging_send'='true' and a.capabilities->>'webhook_messages_subscribed'='true') then
    raise exception 'WhatsApp connection is not active for sending' using errcode='42501'; end if;
  insert into public.whatsapp_message_send_attempts(workspace_id,conversation_id,draft_id,social_account_id,status,template_opt_in_confirmed_at,template_opt_in_confirmed_by)
  values(d.workspace_id,d.conversation_id,d.id,d.social_account_id,'dispatching',
    case when d.draft_type='template' then pg_catalog.now() else null end,
    case when d.draft_type='template' then actor_id else null end) returning id into attempt_id;
  return attempt_id;
exception when unique_violation then raise exception 'This draft already has a send attempt and cannot be retried' using errcode='23505';
end; $$;
revoke all on function public.begin_whatsapp_message_send(uuid,boolean) from public, anon;
grant execute on function public.begin_whatsapp_message_send(uuid,boolean) to authenticated;

create or replace function public.record_whatsapp_message_send_result(target_attempt_id uuid,target_status text,target_provider_message_id text default null,target_safe_error_code text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare a public.whatsapp_message_send_attempts%rowtype; d public.whatsapp_reply_drafts%rowtype; participant_id text; clean_status text;
begin
  if target_status not in ('succeeded','failed','unknown') or target_attempt_id is null then raise exception 'Send result is invalid' using errcode='22023'; end if;
  select * into a from public.whatsapp_message_send_attempts where id=target_attempt_id for update;
  if not found or a.status<>'dispatching' then return false; end if;
  select * into d from public.whatsapp_reply_drafts where id=a.draft_id for update;
  clean_status:=target_status;
  if target_status='succeeded' and (target_provider_message_id is null or length(target_provider_message_id) not between 1 and 255) then clean_status:='unknown'; end if;
  update public.whatsapp_message_send_attempts set status=clean_status,
    provider_message_id=case when clean_status='succeeded' then target_provider_message_id else null end,
    safe_error_code=left(coalesce(target_safe_error_code,''),80),completed_at=pg_catalog.now() where id=target_attempt_id;
  if clean_status='succeeded' then
    select c.participant_provider_id into participant_id from public.whatsapp_conversations c where c.id=d.conversation_id;
    insert into public.whatsapp_messages(workspace_id,conversation_id,social_account_id,provider_message_id,direction,message_type,message_text,delivery_status,provider_sent_at)
    values(d.workspace_id,d.conversation_id,d.social_account_id,target_provider_message_id,'outbound',
      case when d.draft_type='template' then 'template' else 'text' end,d.draft_text,'accepted',pg_catalog.now())
    on conflict(social_account_id,provider_message_id) do nothing;
    update public.whatsapp_messages m set delivery_status=e.status,status_updated_at=e.occurred_at,safe_error_code=e.safe_error_code
      from (select e.status,e.occurred_at,e.safe_error_code from public.whatsapp_message_status_events e
        where e.social_account_id=d.social_account_id and e.provider_message_id=target_provider_message_id
        order by e.occurred_at desc,case e.status when 'failed' then 5 when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 1 end desc limit 1) e
      where m.social_account_id=d.social_account_id and m.provider_message_id=target_provider_message_id;
    update public.whatsapp_conversations set last_message_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=d.conversation_id;
    update public.whatsapp_reply_drafts set status='sent',sent_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=d.id;
  end if;
  return true;
end; $$;
revoke all on function public.record_whatsapp_message_send_result(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_message_send_result(uuid,text,text,text) to service_role;

create or replace function public.record_whatsapp_message_status(target_workspace_id uuid,target_social_account_id uuid,target_provider_message_id text,target_status text,target_occurred_at timestamptz,target_error_code text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare updated_id uuid;
begin
  if target_workspace_id is null or target_social_account_id is null or target_provider_message_id is null
    or length(target_provider_message_id) not between 1 and 255 or target_status not in ('sent','delivered','read','failed') or target_occurred_at is null
    or target_occurred_at > pg_catalog.now() + interval '5 minutes' or target_occurred_at < pg_catalog.now() - interval '5 years' then
    raise exception 'WhatsApp message status is invalid' using errcode='22023'; end if;
  if not exists(select 1 from public.social_accounts a where a.id=target_social_account_id and a.workspace_id=target_workspace_id and a.provider='whatsapp') then
    raise exception 'WhatsApp status account is invalid' using errcode='42501'; end if;
  insert into public.whatsapp_message_status_events(workspace_id,social_account_id,provider_message_id,status,occurred_at,safe_error_code)
  values(target_workspace_id,target_social_account_id,target_provider_message_id,target_status,target_occurred_at,left(coalesce(target_error_code,''),64)) on conflict do nothing;
  update public.whatsapp_messages m set delivery_status=target_status,status_updated_at=target_occurred_at,safe_error_code=left(coalesce(target_error_code,''),64)
  where m.social_account_id=target_social_account_id and m.provider_message_id=target_provider_message_id and m.direction='outbound'
    and (m.status_updated_at is null or target_occurred_at > m.status_updated_at or
      (target_occurred_at = m.status_updated_at and array_position(array['accepted','sent','delivered','read','failed'],target_status) >
        array_position(array['accepted','sent','delivered','read','failed'],m.delivery_status))) returning m.id into updated_id;
  return updated_id is not null;
end; $$;
revoke all on function public.record_whatsapp_message_status(uuid,uuid,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_message_status(uuid,uuid,text,text,timestamptz,text) to service_role;

comment on table public.whatsapp_messages is 'WhatsApp Cloud API message metadata and message text. Provider media URLs and access tokens are never stored here.';
comment on table public.whatsapp_message_send_attempts is 'One immutable send attempt per human-reviewed WhatsApp draft; unknown outcomes are never retried automatically. Template sends also retain the responsible operator and timestamp for their customer opt-in attestation.';
comment on function public.begin_whatsapp_message_send(uuid,boolean) is 'Atomically starts one send for a reviewed, current draft; enforces the 24-hour free-form window and records template opt-in attestation.';

-- Extend existing team workflow RPCs to WhatsApp while retaining their role and workspace checks.
create or replace function public.set_inbox_conversation_workflow(
  target_provider text,
  target_conversation_id uuid,
  target_assigned_to uuid,
  target_status text,
  target_priority text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  target_workspace_id uuid;
  effective_assignee uuid;
  workflow_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook', 'whatsapp') or target_conversation_id is null
     or target_status is null or target_status not in ('open', 'pending', 'resolved')
     or target_priority is null or target_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Conversation workflow input is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
    from public.instagram_conversations c where c.id = target_conversation_id;
  elsif target_provider = 'facebook' then
    select c.workspace_id into target_workspace_id
    from public.facebook_conversations c where c.id = target_conversation_id;
  else
    select c.workspace_id into target_workspace_id
    from public.whatsapp_conversations c where c.id = target_conversation_id;
  end if;
  if target_workspace_id is null then raise exception 'Conversation not found' using errcode = 'P0002'; end if;

  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your workspace role cannot update inbox workflow' using errcode = '42501';
  end if;

  if actor_role in ('owner', 'admin', 'manager') then
    effective_assignee := target_assigned_to;
    if effective_assignee is not null and not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = target_workspace_id and m.user_id = effective_assignee
    ) then
      raise exception 'Assignee must be a member of this workspace' using errcode = '22023';
    end if;
  else
    -- Publishers may update status and priority but cannot assign or reassign work.
    effective_assignee := null;
  end if;

  insert into public.inbox_conversation_workflows (
    workspace_id, provider, conversation_id, assigned_to, status, priority, updated_by
  ) values (
    target_workspace_id, target_provider, target_conversation_id, effective_assignee,
    target_status, target_priority, actor_id
  )
  on conflict (workspace_id, provider, conversation_id) do update set
    assigned_to = case when actor_role in ('owner', 'admin', 'manager')
      then excluded.assigned_to else inbox_conversation_workflows.assigned_to end,
    status = excluded.status,
    priority = excluded.priority,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into workflow_id;

  return workflow_id;
end;
$$;

create or replace function public.add_inbox_internal_note(
  target_provider text,
  target_conversation_id uuid,
  target_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  workflow_id uuid;
  note_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_provider is null or target_provider not in ('instagram', 'facebook', 'whatsapp') or target_conversation_id is null
     or target_body is null or pg_catalog.length(pg_catalog.btrim(target_body)) not between 1 and 3000 then
    raise exception 'Internal note input is invalid' using errcode = '22023';
  end if;

  if target_provider = 'instagram' then
    select c.workspace_id into target_workspace_id
    from public.instagram_conversations c where c.id = target_conversation_id;
  elsif target_provider = 'facebook' then
    select c.workspace_id into target_workspace_id
    from public.facebook_conversations c where c.id = target_conversation_id;
  else
    select c.workspace_id into target_workspace_id
    from public.whatsapp_conversations c where c.id = target_conversation_id;
  end if;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;

  insert into public.inbox_conversation_workflows (
    workspace_id, provider, conversation_id, updated_by
  ) values (
    target_workspace_id, target_provider, target_conversation_id, actor_id
  )
  on conflict (workspace_id, provider, conversation_id) do update set
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into workflow_id;

  insert into public.inbox_internal_notes (workflow_id, workspace_id, author_user_id, body)
  values (workflow_id, target_workspace_id, actor_id, pg_catalog.btrim(target_body))
  returning id into note_id;
  return note_id;
end;
$$;

revoke all on function public.set_inbox_conversation_workflow(text, uuid, uuid, text, text) from public, anon;
grant execute on function public.set_inbox_conversation_workflow(text, uuid, uuid, text, text) to authenticated;
revoke all on function public.add_inbox_internal_note(text, uuid, text) from public, anon;
grant execute on function public.add_inbox_internal_note(text, uuid, text) to authenticated;
