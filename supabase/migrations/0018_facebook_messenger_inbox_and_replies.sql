-- RuffNeck Social Hub v3.0.0: Facebook Messenger inbox and guarded human-reviewed replies.
-- Apply once after 0017_linkedin_organization_publishing.sql.
-- Requires Meta app approval for pages_messaging and pages_manage_metadata.

alter table public.provider_webhook_events
  drop constraint if exists provider_webhook_events_provider_check;
alter table public.provider_webhook_events
  add constraint provider_webhook_events_provider_check check (provider in ('instagram', 'facebook'));

create or replace function public.store_facebook_page_connections(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_granted_scopes text[],
  target_pages jsonb,
  target_token_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  clean_scopes text[];
  page_item jsonb;
  page_id text;
  page_name text;
  page_tasks text[];
  token_ciphertext text;
  token_iv text;
  token_auth_tag text;
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  stored_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_pages is null or pg_catalog.jsonb_typeof(target_pages) <> 'array'
     or pg_catalog.jsonb_array_length(target_pages) not between 1 and 100 then
    raise exception 'Facebook Page payload must contain between 1 and 100 Pages' using errcode = '22023';
  end if;
  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Your workspace role cannot connect social accounts' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.brands b
    where b.id = target_brand_id and b.workspace_id = target_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  clean_scopes := coalesce(
    array(
      select distinct scope_name
      from pg_catalog.unnest(coalesce(target_granted_scopes, array[]::text[])) as u(scope_name)
      where scope_name in ('pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata', 'pages_messaging')
    ),
    array[]::text[]
  );
  if not ('pages_show_list' = any(clean_scopes) and 'pages_read_engagement' = any(clean_scopes)) then
    raise exception 'Facebook Pages list and read permissions are required' using errcode = '22023';
  end if;

  -- Validate the complete payload before the first write; the function is atomic.
  for page_item in select value from pg_catalog.jsonb_array_elements(target_pages) as p(value) loop
    page_id := nullif(pg_catalog.btrim(page_item->>'id'), '');
    page_name := nullif(pg_catalog.btrim(page_item->>'name'), '');
    token_ciphertext := page_item->>'token_ciphertext';
    token_iv := page_item->>'token_iv';
    token_auth_tag := page_item->>'token_auth_tag';
    if page_id is null or pg_catalog.length(page_id) > 128
       or page_name is null or pg_catalog.length(page_name) > 120
       or token_ciphertext is null or pg_catalog.length(token_ciphertext) not between 4 and 16384
       or token_iv is null or pg_catalog.length(token_iv) not between 12 and 32
       or token_auth_tag is null or pg_catalog.length(token_auth_tag) not between 20 and 32
       or pg_catalog.jsonb_typeof(page_item->'tasks') not in ('array', 'null') then
      raise exception 'Facebook Page credential payload is invalid' using errcode = '22023';
    end if;
  end loop;

  for page_item in select value from pg_catalog.jsonb_array_elements(target_pages) as p(value) loop
    page_id := pg_catalog.btrim(page_item->>'id');
    page_name := pg_catalog.btrim(page_item->>'name');
    token_ciphertext := page_item->>'token_ciphertext';
    token_iv := page_item->>'token_iv';
    token_auth_tag := page_item->>'token_auth_tag';
    page_tasks := coalesce(
      array(
        select task_name
        from pg_catalog.jsonb_array_elements_text(coalesce(page_item->'tasks', '[]'::jsonb)) as t(task_name)
        where task_name in ('CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE', 'MANAGE', 'MESSAGE', 'MESSAGING')
      ),
      array[]::text[]
    );
    select * into existing_account
    from public.social_accounts a
    where a.provider = 'facebook' and a.provider_account_id = page_id
    for update;

    if found then
      if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
        raise exception 'This Facebook Page is already connected to another workspace or brand' using errcode = '23505';
      end if;
      account_id := existing_account.id;
      update public.social_accounts
      set display_name = page_name,
          connection_state = 'connected',
          granted_scopes = clean_scopes,
          capabilities = pg_catalog.jsonb_build_object(
            'profile_read', true,
            'content_publish', false,
            'publish_permission_granted', false,
            'comments', false,
            'messaging', false,
            'insights', false,
            'page_tasks', pg_catalog.to_jsonb(page_tasks)
          ),
          token_secret_ref = 'social_account_token_vault:' || account_id::text
      where id = account_id;
    else
      insert into public.social_accounts (
        workspace_id, brand_id, provider, provider_account_id, display_name,
        connection_state, granted_scopes, capabilities, token_secret_ref
      ) values (
        target_workspace_id, target_brand_id, 'facebook', page_id, page_name,
        'connected', clean_scopes,
        pg_catalog.jsonb_build_object(
          'profile_read', true,
          'content_publish', false,
          'publish_permission_granted', false,
          'comments', false,
          'messaging', false,
          'insights', false,
          'page_tasks', pg_catalog.to_jsonb(page_tasks)
        ),
        'social_account_token_vault:new'
      ) returning id into account_id;
      update public.social_accounts
      set token_secret_ref = 'social_account_token_vault:' || account_id::text
      where id = account_id;
    end if;

    insert into public.social_account_token_vault (
      social_account_id, ciphertext, iv, auth_tag, token_expires_at, updated_at
    ) values (
      account_id, token_ciphertext, token_iv, token_auth_tag, target_token_expires_at, pg_catalog.now()
    )
    on conflict (social_account_id) do update set
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      token_expires_at = excluded.token_expires_at,
      updated_at = pg_catalog.now();

    stored_count := stored_count + 1;
  end loop;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id,
    current_user_id,
    'integration.facebook.pages_connected',
    'social_account_batch',
    null,
    'success',
    pg_catalog.jsonb_build_object(
      'brand_id', target_brand_id,
      'page_count', stored_count,
      'granted_scopes', clean_scopes,
      'token_expiry_reported_by_provider', target_token_expires_at is not null
    )
  );

  return stored_count;
end;
$$;

revoke all on function public.store_facebook_page_connections(uuid, uuid, text[], jsonb, timestamptz) from public, anon;
grant execute on function public.store_facebook_page_connections(uuid, uuid, text[], jsonb, timestamptz) to authenticated;

comment on function public.store_facebook_page_connections(uuid, uuid, text[], jsonb, timestamptz) is
  'Atomically stores one or more Facebook Page connections after validating workspace role, brand ownership, explicitly granted scopes and server-encrypted Page tokens. Page access tokens are never returned to browser clients.';

create or replace function public.enable_facebook_page_messaging(
  target_workspace_id uuid,
  target_brand_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  changed_count integer := 0;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then
    raise exception 'Your workspace role cannot enable Messenger' using errcode = '42501';
  end if;
  if not exists (select 1 from public.brands b where b.id = target_brand_id and b.workspace_id = target_workspace_id) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  update public.social_accounts a
  set capabilities = coalesce(a.capabilities, '{}'::jsonb) || jsonb_build_object(
    'messaging', true,
    'messaging_permission_granted', true,
    'messaging_send', (coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MESSAGE"]'::jsonb
      or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MANAGE"]'::jsonb)
  )
  where a.workspace_id = target_workspace_id and a.brand_id = target_brand_id
    and a.provider = 'facebook' and a.connection_state = 'connected'
    and 'pages_messaging' = any(coalesce(a.granted_scopes, array[]::text[]))
    and 'pages_manage_metadata' = any(coalesce(a.granted_scopes, array[]::text[]))
    and (
      coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MESSAGE"]'::jsonb
      or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MESSAGING"]'::jsonb
      or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MODERATE"]'::jsonb
      or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MANAGE"]'::jsonb
    );
  get diagnostics changed_count = row_count;

  update public.social_accounts a
  set capabilities = coalesce(a.capabilities, '{}'::jsonb) || jsonb_build_object(
    'messaging', false, 'messaging_permission_granted', false, 'messaging_send', false, 'webhook_messages_subscribed', false
  )
  where a.workspace_id = target_workspace_id and a.brand_id = target_brand_id
    and a.provider = 'facebook' and a.connection_state = 'connected'
    and not (
      'pages_messaging' = any(coalesce(a.granted_scopes, array[]::text[]))
      and 'pages_manage_metadata' = any(coalesce(a.granted_scopes, array[]::text[]))
      and (
        coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MESSAGE"]'::jsonb
        or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MESSAGING"]'::jsonb
        or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MODERATE"]'::jsonb
        or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MANAGE"]'::jsonb
      )
    );

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, actor_id, 'integration.facebook.messenger_capability_checked', 'social_account_batch', null,
    'success', jsonb_build_object('brand_id', target_brand_id, 'enabled_page_count', changed_count));
  return changed_count;
end;
$$;
revoke all on function public.enable_facebook_page_messaging(uuid, uuid) from public, anon;
grant execute on function public.enable_facebook_page_messaging(uuid, uuid) to authenticated;

create or replace function public.record_facebook_page_messaging_subscription(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_page_id text,
  target_subscribed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = target_workspace_id
    and m.user_id = actor_id and m.role in ('owner','admin','manager')) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  update public.social_accounts a
  set capabilities = coalesce(a.capabilities, '{}'::jsonb) || jsonb_build_object(
    'webhook_messages_subscribed', coalesce(target_subscribed, false)
  )
  where a.workspace_id = target_workspace_id and a.brand_id = target_brand_id
    and a.provider = 'facebook' and a.provider_account_id = target_page_id;
  if not found then raise exception 'Connected Facebook Page not found' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.record_facebook_page_messaging_subscription(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.record_facebook_page_messaging_subscription(uuid, uuid, text, boolean) to authenticated;

create table if not exists public.facebook_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  participant_provider_id text not null check (length(participant_provider_id) between 1 and 128),
  last_message_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, participant_provider_id),
  unique (id, workspace_id)
);
create index if not exists facebook_conversations_workspace_recent_idx
  on public.facebook_conversations(workspace_id, last_message_at desc);

create table if not exists public.facebook_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  provider_message_id text not null check (length(provider_message_id) between 1 and 255),
  direction text not null check (direction in ('inbound','outbound')),
  message_text text not null check (length(message_text) between 1 and 10000),
  attachment_types jsonb not null default '[]'::jsonb check (jsonb_typeof(attachment_types) = 'array' and jsonb_array_length(attachment_types) <= 8),
  provider_sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint facebook_messages_conversation_workspace_fk foreign key (conversation_id, workspace_id)
    references public.facebook_conversations(id, workspace_id) on delete cascade,
  unique (social_account_id, provider_message_id)
);
create index if not exists facebook_messages_conversation_time_idx
  on public.facebook_messages(conversation_id, provider_sent_at asc);

create table if not exists public.facebook_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  source_last_message_id uuid references public.facebook_messages(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  draft_text text not null check (length(btrim(draft_text)) between 1 and 6000),
  model text not null check (length(model) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','reviewed','discarded','sent')),
  reviewed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facebook_reply_drafts_conversation_workspace_fk foreign key (conversation_id, workspace_id)
    references public.facebook_conversations(id, workspace_id) on delete cascade,
  constraint facebook_reply_drafts_review_state_check check (
    (status in ('reviewed','sent') and reviewed_at is not null and reviewed_by is not null)
    or (status in ('draft','discarded') and reviewed_at is null and reviewed_by is null)
  ),
  constraint facebook_reply_drafts_sent_state_check check ((status = 'sent' and sent_at is not null) or (status <> 'sent' and sent_at is null))
);
create index if not exists facebook_reply_drafts_conversation_recent_idx
  on public.facebook_reply_drafts(conversation_id, created_at desc);

create table if not exists public.facebook_message_send_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.facebook_conversations(id) on delete cascade,
  draft_id uuid not null unique references public.facebook_reply_drafts(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','sent','failed','needs_review')),
  provider_message_id text,
  safe_error_code text check (safe_error_code is null or length(safe_error_code) <= 64),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists facebook_message_send_attempts_workspace_recent_idx
  on public.facebook_message_send_attempts(workspace_id, created_at desc);

alter table public.facebook_conversations enable row level security;
alter table public.facebook_messages enable row level security;
alter table public.facebook_reply_drafts enable row level security;
alter table public.facebook_message_send_attempts enable row level security;
revoke all on public.facebook_conversations, public.facebook_messages, public.facebook_reply_drafts, public.facebook_message_send_attempts from public, anon, authenticated;
grant select on public.facebook_conversations, public.facebook_messages, public.facebook_reply_drafts, public.facebook_message_send_attempts to authenticated;
create policy facebook_conversations_workspace_read on public.facebook_conversations for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy facebook_messages_workspace_read on public.facebook_messages for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy facebook_reply_drafts_workspace_read on public.facebook_reply_drafts for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy facebook_message_send_attempts_workspace_read on public.facebook_message_send_attempts for select to authenticated
  using (public.is_workspace_member(workspace_id));

create or replace function public.ingest_facebook_message(
  target_workspace_id uuid,
  target_social_account_id uuid,
  target_participant_provider_id text,
  target_provider_message_id text,
  target_direction text,
  target_message_text text,
  target_attachment_types jsonb,
  target_provider_sent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  message_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if target_direction not in ('inbound','outbound') or target_workspace_id is null or target_social_account_id is null
    or target_provider_message_id is null or length(target_provider_message_id) not between 1 and 255
    or target_participant_provider_id is null or length(target_participant_provider_id) not between 1 and 128
    or target_message_text is null or length(target_message_text) not between 1 and 10000
    or target_provider_sent_at is null or target_provider_sent_at > now() + interval '5 minutes'
    or target_attachment_types is null or jsonb_typeof(target_attachment_types) <> 'array'
    or jsonb_array_length(target_attachment_types) > 8 then
    raise exception 'Facebook message payload is invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.social_accounts a where a.id = target_social_account_id
    and a.workspace_id = target_workspace_id and a.provider = 'facebook' and a.connection_state = 'connected'
    and coalesce(a.capabilities->>'messaging','false') = 'true'
    and coalesce(a.capabilities->>'webhook_messages_subscribed','false') = 'true') then
    raise exception 'Facebook Messenger is not enabled for this Page' using errcode = '42501';
  end if;

  insert into public.facebook_conversations(workspace_id, social_account_id, participant_provider_id, last_message_at)
  values (target_workspace_id, target_social_account_id, target_participant_provider_id, target_provider_sent_at)
  on conflict (social_account_id, participant_provider_id) do update set
    last_message_at = greatest(public.facebook_conversations.last_message_at, excluded.last_message_at),
    updated_at = now()
  returning id into conversation_id;

  insert into public.facebook_messages(workspace_id, conversation_id, social_account_id, provider_message_id,
    direction, message_text, attachment_types, provider_sent_at)
  values (target_workspace_id, conversation_id, target_social_account_id, target_provider_message_id,
    target_direction, target_message_text, target_attachment_types, target_provider_sent_at)
  on conflict (social_account_id, provider_message_id) do nothing
  returning id into message_id;
  if message_id is null then
    select m.id into message_id from public.facebook_messages m
    where m.social_account_id = target_social_account_id and m.provider_message_id = target_provider_message_id;
  end if;
  return message_id;
end;
$$;
revoke all on function public.ingest_facebook_message(uuid, uuid, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_facebook_message(uuid, uuid, text, text, text, text, jsonb, timestamptz) to service_role;

create or replace function public.create_facebook_reply_draft(
  target_conversation_id uuid,
  target_source_last_message_id uuid,
  target_draft_text text,
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
  new_draft_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_draft_text is null or length(btrim(target_draft_text)) not between 1 and 6000
    or target_model is null or length(btrim(target_model)) not between 1 and 160 then
    raise exception 'Draft text or model identifier is invalid' using errcode = '22023';
  end if;
  select c.workspace_id into target_workspace_id from public.facebook_conversations c where c.id = target_conversation_id;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Conversation access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = target_workspace_id and m.user_id = actor_id
    and m.role in ('owner','admin','manager','publisher','client_approver')) then
    raise exception 'Your workspace role cannot create reply drafts' using errcode = '42501';
  end if;
  if target_source_last_message_id is null or not exists (
    select 1 from public.facebook_messages m where m.id = target_source_last_message_id
      and m.conversation_id = target_conversation_id and m.direction = 'inbound'
      and m.id = (select lm.id from public.facebook_messages lm where lm.conversation_id = target_conversation_id
        order by lm.provider_sent_at desc, lm.received_at desc limit 1)
  ) then raise exception 'Reply draft must reference the latest inbound message' using errcode = '22023'; end if;

  insert into public.facebook_reply_drafts(workspace_id, conversation_id, source_last_message_id, created_by,
    updated_by, draft_text, model, status)
  values (target_workspace_id, target_conversation_id, target_source_last_message_id, actor_id,
    actor_id, btrim(target_draft_text), btrim(target_model), 'draft') returning id into new_draft_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, actor_id, 'facebook.reply_draft.created', 'facebook_reply_draft', new_draft_id::text,
    'success', jsonb_build_object('model', btrim(target_model)));
  return new_draft_id;
end;
$$;
revoke all on function public.create_facebook_reply_draft(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_facebook_reply_draft(uuid, uuid, text, text) to authenticated;

create or replace function public.update_facebook_reply_draft(
  target_draft_id uuid,
  target_draft_text text,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  current_status text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if target_draft_text is null or length(btrim(target_draft_text)) not between 1 and 6000
    or target_status not in ('draft','reviewed','discarded') then
    raise exception 'Draft update is invalid' using errcode = '22023';
  end if;
  select d.workspace_id, d.status into target_workspace_id, current_status
  from public.facebook_reply_drafts d where d.id = target_draft_id for update;
  if target_workspace_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Draft access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = target_workspace_id and m.user_id = actor_id
    and m.role in ('owner','admin','manager','publisher','client_approver')) then
    raise exception 'Your workspace role cannot update reply drafts' using errcode = '42501';
  end if;
  if current_status <> 'draft' then raise exception 'Only an unreviewed draft can be changed' using errcode = '22023'; end if;
  update public.facebook_reply_drafts set draft_text = btrim(target_draft_text), status = target_status,
    updated_by = actor_id, reviewed_by = case when target_status = 'reviewed' then actor_id else null end,
    reviewed_at = case when target_status = 'reviewed' then now() else null end, updated_at = now()
  where id = target_draft_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, actor_id,
    case target_status when 'reviewed' then 'facebook.reply_draft.reviewed' when 'discarded' then 'facebook.reply_draft.discarded' else 'facebook.reply_draft.updated' end,
    'facebook_reply_draft', target_draft_id::text, 'success', '{}'::jsonb);
end;
$$;
revoke all on function public.update_facebook_reply_draft(uuid, text, text) from public, anon;
grant execute on function public.update_facebook_reply_draft(uuid, text, text) to authenticated;

create or replace function public.begin_facebook_reply_send(target_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  target_workspace_id uuid;
  target_conversation_id uuid;
  target_social_account_id uuid;
  target_source_message_id uuid;
  target_status text;
  target_draft_text text;
  latest_message_id uuid;
  latest_direction text;
  latest_at timestamptz;
  attempt_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select d.workspace_id, d.conversation_id, d.source_last_message_id, d.status, d.draft_text, c.social_account_id
    into target_workspace_id, target_conversation_id, target_source_message_id, target_status, target_draft_text, target_social_account_id
  from public.facebook_reply_drafts d join public.facebook_conversations c on c.id = d.conversation_id
  where d.id = target_draft_id for update of d;
  if target_workspace_id is null then raise exception 'Draft not found' using errcode = '22023'; end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then
    raise exception 'Your workspace role cannot send Messenger replies' using errcode = '42501';
  end if;
  if target_status <> 'reviewed' then raise exception 'Only a human-reviewed draft can be sent' using errcode = '22023'; end if;
  if length(target_draft_text) > 2000 then raise exception 'Messenger text replies must be 2000 characters or fewer' using errcode = '22023'; end if;

  select m.id, m.direction, m.provider_sent_at into latest_message_id, latest_direction, latest_at
  from public.facebook_messages m where m.conversation_id = target_conversation_id
  order by m.provider_sent_at desc, m.received_at desc limit 1;
  if latest_message_id is null or latest_message_id <> target_source_message_id or latest_direction <> 'inbound' then
    raise exception 'The latest thread message changed; regenerate and review a new draft' using errcode = '22023';
  end if;
  if latest_at > now() or now() - latest_at >= interval '24 hours' then
    raise exception 'Meta 24-hour standard messaging window has expired' using errcode = '22023';
  end if;
  if not exists (select 1 from public.social_accounts a where a.id = target_social_account_id
    and a.workspace_id = target_workspace_id and a.provider = 'facebook' and a.connection_state = 'connected'
    and coalesce(a.capabilities->>'messaging','false') = 'true'
    and coalesce(a.capabilities->>'messaging_send','false') = 'true'
    and coalesce(a.capabilities->>'webhook_messages_subscribed','false') = 'true'
    and 'pages_messaging' = any(coalesce(a.granted_scopes, array[]::text[]))
    and 'pages_manage_metadata' = any(coalesce(a.granted_scopes, array[]::text[]))) then
    raise exception 'Facebook Messenger permissions or webhook subscription are unavailable' using errcode = '42501';
  end if;

  insert into public.facebook_message_send_attempts(workspace_id, conversation_id, draft_id, actor_user_id, status)
  values (target_workspace_id, target_conversation_id, target_draft_id, actor_id, 'pending')
  returning id into attempt_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, actor_id, 'facebook.reply_send.started', 'facebook_reply_draft', target_draft_id::text,
    'pending', jsonb_build_object('attempt_id', attempt_id));
  return attempt_id;
exception when unique_violation then
  raise exception 'A send attempt already exists for this draft. Create a new draft after checking the inbox.' using errcode = '23505';
end;
$$;
revoke all on function public.begin_facebook_reply_send(uuid) from public, anon;
grant execute on function public.begin_facebook_reply_send(uuid) to authenticated;

create or replace function public.complete_facebook_reply_send(
  target_attempt_id uuid,
  target_status text,
  target_provider_message_id text,
  target_safe_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_draft_id uuid;
  target_workspace_id uuid;
  target_actor_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if target_status not in ('sent','failed','needs_review') then raise exception 'Invalid send status' using errcode = '22023'; end if;
  update public.facebook_message_send_attempts set status = target_status,
    provider_message_id = nullif(target_provider_message_id, ''),
    safe_error_code = left(nullif(target_safe_error_code, ''), 64), completed_at = now()
  where id = target_attempt_id and status = 'pending'
  returning draft_id, workspace_id, actor_user_id into target_draft_id, target_workspace_id, target_actor_id;
  if target_draft_id is null then raise exception 'Pending send attempt not found' using errcode = '22023'; end if;
  if target_status = 'sent' then
    update public.facebook_reply_drafts set status = 'sent', sent_at = now(), updated_at = now()
    where id = target_draft_id and status = 'reviewed';
  end if;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (target_workspace_id, target_actor_id, 'facebook.reply_send.' || target_status, 'facebook_reply_draft', target_draft_id::text,
    target_status, jsonb_build_object('attempt_id', target_attempt_id, 'error_code', left(coalesce(target_safe_error_code,''),64)));
end;
$$;
revoke all on function public.complete_facebook_reply_send(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_facebook_reply_send(uuid, text, text, text) to service_role;

comment on table public.facebook_conversations is 'Normalized Facebook Messenger threads for connected Pages with approved, subscribed messaging permissions.';
comment on table public.facebook_messages is 'Normalized text-only Facebook Messenger events; attachment URLs and binary payloads are intentionally not stored.';
comment on table public.facebook_reply_drafts is 'Local AI-assisted Facebook Messenger reply drafts; human review is required before the guarded 24-hour reply send action.';
comment on table public.facebook_message_send_attempts is 'One-way send-attempt ledger. No automatic retries; uncertain provider outcomes require human reconciliation.';
