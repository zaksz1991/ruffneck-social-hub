-- RuffNeck Social Hub v5.0.0 — human-reviewed WhatsApp media replies.
-- Apply once after 0036_whatsapp_secure_media_storage.sql.
-- Only clean, still-retained inbound media can be reused. No public media URLs are created.

create unique index if not exists whatsapp_media_assets_reply_target_uidx
  on public.whatsapp_media_assets(id, conversation_id, workspace_id, social_account_id);

create table if not exists public.whatsapp_media_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  source_asset_id uuid not null,
  source_last_message_id uuid not null,
  media_type text not null check (media_type in ('image','video','audio','document')),
  caption text not null default '' check (length(caption) <= 1024),
  filename text not null check (length(filename) between 1 and 120),
  mime_type text not null check (length(mime_type) between 3 and 160),
  file_size bigint not null check (file_size between 1 and 16777216),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'draft' check (status in ('draft','reviewed','sent','discarded')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_media_reply_conversation_fk foreign key (conversation_id, workspace_id)
    references public.whatsapp_conversations(id, workspace_id) on delete cascade,
  constraint whatsapp_media_reply_asset_fk foreign key (source_asset_id, conversation_id, workspace_id, social_account_id)
    references public.whatsapp_media_assets(id, conversation_id, workspace_id, social_account_id) on delete cascade,
  constraint whatsapp_media_reply_source_message_fk foreign key (source_last_message_id, conversation_id, workspace_id, social_account_id)
    references public.whatsapp_messages(id, conversation_id, workspace_id, social_account_id) on delete restrict,
  constraint whatsapp_media_reply_review_state_check check (
    (status in ('reviewed','sent') and reviewed_by is not null and reviewed_at is not null)
    or (status in ('draft','discarded'))
  ),
  constraint whatsapp_media_reply_sent_state_check check ((status = 'sent' and sent_at is not null) or (status <> 'sent' and sent_at is null)),
  constraint whatsapp_media_reply_audio_caption_check check (media_type <> 'audio' or caption = ''),
  constraint whatsapp_media_reply_image_size_check check (media_type <> 'image' or file_size <= 5242880)
);
create index if not exists whatsapp_media_reply_drafts_conversation_recent_idx
  on public.whatsapp_media_reply_drafts(conversation_id, created_at desc);
create unique index if not exists whatsapp_media_reply_drafts_one_active_asset_uidx
  on public.whatsapp_media_reply_drafts(source_asset_id) where status <> 'discarded';

create table if not exists public.whatsapp_media_reply_send_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  draft_id uuid not null unique references public.whatsapp_media_reply_drafts(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  attempted_by uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('dispatching','succeeded','failed','unknown')),
  provider_media_id text check (provider_media_id is null or provider_media_id ~ '^\d{5,40}$'),
  provider_message_id text,
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[a-zA-Z0-9_-]{1,80}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint whatsapp_media_reply_attempt_conversation_fk foreign key (conversation_id, workspace_id)
    references public.whatsapp_conversations(id, workspace_id) on delete cascade
);
create index if not exists whatsapp_media_reply_attempt_conversation_recent_idx
  on public.whatsapp_media_reply_send_attempts(conversation_id, created_at desc);

alter table public.whatsapp_media_reply_drafts enable row level security;
alter table public.whatsapp_media_reply_send_attempts enable row level security;
revoke all on public.whatsapp_media_reply_drafts, public.whatsapp_media_reply_send_attempts from public, anon, authenticated;
grant select on public.whatsapp_media_reply_drafts, public.whatsapp_media_reply_send_attempts to authenticated;
create policy whatsapp_media_reply_drafts_workspace_read on public.whatsapp_media_reply_drafts
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy whatsapp_media_reply_attempts_workspace_read on public.whatsapp_media_reply_send_attempts
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.create_whatsapp_media_reply_draft(
  target_conversation_id uuid,
  target_asset_id uuid,
  target_caption text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  asset_row public.whatsapp_media_assets%rowtype;
  latest_id uuid;
  saved_id uuid;
  media_type_value text;
  clean_caption text := pg_catalog.btrim(coalesce(target_caption,''));
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_conversation_id is null or target_asset_id is null or pg_catalog.length(clean_caption) > 1024 then
    raise exception 'Media reply input is invalid' using errcode = '22023';
  end if;
  select * into asset_row from public.whatsapp_media_assets a
    where a.id = target_asset_id and a.conversation_id = target_conversation_id for update;
  if not found then raise exception 'Media asset not found' using errcode = 'P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = asset_row.workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher','client_approver') then
    raise exception 'Workspace role cannot draft media replies' using errcode = '42501';
  end if;
  if asset_row.scan_status <> 'clean' or asset_row.storage_path is null or asset_row.actual_mime_type is null
    or asset_row.file_size is null or asset_row.content_sha256 is null
    or asset_row.retention_expires_at is null or asset_row.retention_expires_at <= pg_catalog.now() then
    raise exception 'Only clean, retained media can be sent' using errcode = '22023';
  end if;
  select m.id into latest_id from public.whatsapp_messages m
    where m.conversation_id = target_conversation_id and m.direction = 'inbound'
    order by m.provider_sent_at desc, m.received_at desc limit 1;
  if latest_id is null or latest_id is distinct from asset_row.message_id then
    raise exception 'Media must belong to the latest customer message; refresh the conversation first' using errcode = '40001';
  end if;
  media_type_value := case
    when asset_row.media_kind = 'image' and asset_row.actual_mime_type in ('image/jpeg','image/png') and asset_row.file_size <= 5242880 then 'image'
    when asset_row.media_kind = 'video' and asset_row.actual_mime_type in ('video/mp4','video/3gpp') then 'video'
    when asset_row.media_kind = 'audio' and asset_row.actual_mime_type in ('audio/aac','audio/mp4','audio/mpeg','audio/amr') then 'audio'
    when asset_row.media_kind = 'document' and asset_row.actual_mime_type in ('application/pdf','text/plain') then 'document'
    else null end;
  if media_type_value is null or asset_row.file_size > 16777216 then
    raise exception 'This media format is not enabled for outbound WhatsApp messages' using errcode = '22023';
  end if;
  if media_type_value = 'audio' and clean_caption <> '' then
    raise exception 'WhatsApp audio messages do not support captions' using errcode = '22023';
  end if;
  insert into public.whatsapp_media_reply_drafts(
    workspace_id,conversation_id,social_account_id,source_asset_id,source_last_message_id,
    media_type,caption,filename,mime_type,file_size,content_sha256,created_by
  ) values (
    asset_row.workspace_id,asset_row.conversation_id,asset_row.social_account_id,asset_row.id,latest_id,
    media_type_value,clean_caption,asset_row.original_filename,asset_row.actual_mime_type,asset_row.file_size,asset_row.content_sha256,actor_id
  ) returning id into saved_id;
  return saved_id;
end;
$$;
revoke all on function public.create_whatsapp_media_reply_draft(uuid,uuid,text) from public, anon;
grant execute on function public.create_whatsapp_media_reply_draft(uuid,uuid,text) to authenticated;

create or replace function public.review_whatsapp_media_reply_draft(target_draft_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  draft_row public.whatsapp_media_reply_drafts%rowtype;
  actor_role text;
  latest_id uuid;
  asset_row public.whatsapp_media_assets%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into draft_row from public.whatsapp_media_reply_drafts where id = target_draft_id for update;
  if not found or draft_row.status <> 'draft' then raise exception 'Media draft is not available for review' using errcode = 'P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = draft_row.workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then
    raise exception 'Workspace role cannot review media replies' using errcode = '42501';
  end if;
  if draft_row.created_by = actor_id then
    raise exception 'A different workspace operator must review this media draft' using errcode = '42501';
  end if;
  select m.id into latest_id from public.whatsapp_messages m
    where m.conversation_id = draft_row.conversation_id and m.direction = 'inbound'
    order by m.provider_sent_at desc,m.received_at desc limit 1;
  if latest_id is distinct from draft_row.source_last_message_id then
    raise exception 'Conversation changed; create a fresh media draft' using errcode = '40001';
  end if;
  select * into asset_row from public.whatsapp_media_assets a where a.id = draft_row.source_asset_id for update;
  if not found or asset_row.scan_status <> 'clean' or asset_row.retention_expires_at is null
    or asset_row.retention_expires_at <= pg_catalog.now() or asset_row.content_sha256 is distinct from draft_row.content_sha256 then
    raise exception 'Source media is no longer clean or retained' using errcode = '22023';
  end if;
  update public.whatsapp_media_reply_drafts set status = 'reviewed', reviewed_by = actor_id,
    reviewed_at = pg_catalog.now(), updated_at = pg_catalog.now() where id = target_draft_id;
  return true;
end;
$$;
revoke all on function public.review_whatsapp_media_reply_draft(uuid) from public, anon;
grant execute on function public.review_whatsapp_media_reply_draft(uuid) to authenticated;

create or replace function public.begin_whatsapp_media_reply_send(target_draft_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  draft_row public.whatsapp_media_reply_drafts%rowtype;
  actor_role text;
  latest_id uuid;
  latest_at timestamptz;
  asset_row public.whatsapp_media_assets%rowtype;
  attempt_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into draft_row from public.whatsapp_media_reply_drafts where id = target_draft_id for update;
  if not found or draft_row.status <> 'reviewed' then raise exception 'Only a reviewed media draft can be sent' using errcode = '22023'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = draft_row.workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then
    raise exception 'Workspace role cannot send WhatsApp media' using errcode = '42501';
  end if;
  select m.id,m.provider_sent_at into latest_id,latest_at from public.whatsapp_messages m
    where m.conversation_id = draft_row.conversation_id and m.direction = 'inbound'
    order by m.provider_sent_at desc,m.received_at desc limit 1;
  if latest_id is distinct from draft_row.source_last_message_id or latest_at is null
    or latest_at > pg_catalog.now() or pg_catalog.now() - latest_at >= interval '24 hours' then
    raise exception 'The source message changed or the 24-hour customer-service window is closed' using errcode = '22023';
  end if;
  select * into asset_row from public.whatsapp_media_assets a where a.id = draft_row.source_asset_id for update;
  if not found or asset_row.scan_status <> 'clean' or asset_row.retention_expires_at is null
    or asset_row.retention_expires_at <= pg_catalog.now() or asset_row.content_sha256 is distinct from draft_row.content_sha256
    or asset_row.file_size is distinct from draft_row.file_size or asset_row.actual_mime_type is distinct from draft_row.mime_type then
    raise exception 'Source media is no longer clean or retained' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.social_accounts a where a.id = draft_row.social_account_id
      and a.workspace_id = draft_row.workspace_id and a.provider = 'whatsapp'
      and a.connection_state = 'connected'
      and a.capabilities->>'messaging_send' = 'true'
      and a.capabilities->>'webhook_messages_subscribed' = 'true'
  ) then raise exception 'WhatsApp connection is not active for sending' using errcode = '42501'; end if;
  insert into public.whatsapp_media_reply_send_attempts(workspace_id,conversation_id,draft_id,social_account_id,attempted_by,status)
    values(draft_row.workspace_id,draft_row.conversation_id,draft_row.id,draft_row.social_account_id,actor_id,'dispatching')
    returning id into attempt_id;
  return attempt_id;
exception when unique_violation then
  raise exception 'This media draft already has a send attempt and cannot be retried' using errcode = '23505';
end;
$$;
revoke all on function public.begin_whatsapp_media_reply_send(uuid) from public, anon;
grant execute on function public.begin_whatsapp_media_reply_send(uuid) to authenticated;

create or replace function public.record_whatsapp_media_reply_send_result(
  target_attempt_id uuid,
  target_status text,
  target_provider_media_id text default null,
  target_provider_message_id text default null,
  target_safe_error_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  attempt_row public.whatsapp_media_reply_send_attempts%rowtype;
  draft_row public.whatsapp_media_reply_drafts%rowtype;
  clean_status text;
  message_text_value text;
begin
  if target_status not in ('succeeded','failed','unknown') or target_attempt_id is null then
    raise exception 'Media send result is invalid' using errcode = '22023';
  end if;
  select * into attempt_row from public.whatsapp_media_reply_send_attempts where id = target_attempt_id for update;
  if not found or attempt_row.status <> 'dispatching' then return false; end if;
  select * into draft_row from public.whatsapp_media_reply_drafts where id = attempt_row.draft_id for update;
  clean_status := target_status;
  if target_status = 'succeeded' and (
    target_provider_message_id is null or length(target_provider_message_id) not between 1 and 255
    or target_provider_media_id is null or target_provider_media_id !~ '^\d{5,40}$'
  ) then clean_status := 'unknown'; end if;
  update public.whatsapp_media_reply_send_attempts set
    status = clean_status,
    provider_media_id = case when target_provider_media_id ~ '^\d{5,40}$' then target_provider_media_id else null end,
    provider_message_id = case when clean_status = 'succeeded' then target_provider_message_id else null end,
    safe_error_code = nullif(left(coalesce(target_safe_error_code,''),80),''),
    completed_at = pg_catalog.now()
  where id = target_attempt_id;
  if clean_status = 'succeeded' then
    message_text_value := case when draft_row.caption <> '' then draft_row.caption
      else pg_catalog.concat('Sent ',draft_row.media_type,' attachment: ',draft_row.filename) end;
    insert into public.whatsapp_messages(
      workspace_id,conversation_id,social_account_id,provider_message_id,direction,message_type,message_text,
      attachment_types,delivery_status,provider_sent_at
    ) values (
      draft_row.workspace_id,draft_row.conversation_id,draft_row.social_account_id,target_provider_message_id,
      'outbound',draft_row.media_type,message_text_value,array[draft_row.media_type],'accepted',pg_catalog.now()
    ) on conflict(social_account_id,provider_message_id) do nothing;
    update public.whatsapp_messages m set delivery_status = e.status,status_updated_at = e.occurred_at,safe_error_code = e.safe_error_code
      from (
        select e.status,e.occurred_at,e.safe_error_code from public.whatsapp_message_status_events e
        where e.social_account_id = draft_row.social_account_id and e.provider_message_id = target_provider_message_id
        order by e.occurred_at desc,case e.status when 'failed' then 5 when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 1 end desc limit 1
      ) e
      where m.social_account_id = draft_row.social_account_id and m.provider_message_id = target_provider_message_id;
    update public.whatsapp_conversations set last_message_at = pg_catalog.now(),updated_at = pg_catalog.now()
      where id = draft_row.conversation_id;
    update public.whatsapp_media_reply_drafts set status = 'sent',sent_at = pg_catalog.now(),updated_at = pg_catalog.now()
      where id = draft_row.id;
  end if;
  return true;
end;
$$;
revoke all on function public.record_whatsapp_media_reply_send_result(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_media_reply_send_result(uuid,text,text,text,text) to service_role;

comment on table public.whatsapp_media_reply_drafts is
  'Human-reviewed WhatsApp media replies sourced only from clean, private, retained inbound media. All media sends require an open customer-service window.';
comment on table public.whatsapp_media_reply_send_attempts is
  'One irreversible attempt per reviewed media draft. An ambiguous customer-send outcome is never automatically retried.';
