-- RuffNeck Social Hub v4.5.0
-- One human-approved public reply attempt per reviewed Instagram comment draft.
-- This migration does not add automatic replies, DMs, hide/unhide, or deletion.

create unique index if not exists instagram_comment_reply_drafts_id_workspace_unique
  on public.instagram_comment_reply_drafts(id, workspace_id);

create table if not exists public.instagram_comment_reply_send_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  instagram_comment_id uuid not null,
  reply_draft_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'initiating'
    check (status in ('initiating','succeeded','failed','unknown')),
  provider_reply_id text check (provider_reply_id is null or length(provider_reply_id) between 1 and 255),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[a-z0-9_:-]{1,80}$'),
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint instagram_comment_reply_send_comment_workspace_fk
    foreign key (instagram_comment_id, workspace_id)
    references public.instagram_comments(id, workspace_id) on delete cascade,
  constraint instagram_comment_reply_send_draft_workspace_fk
    foreign key (reply_draft_id, workspace_id)
    references public.instagram_comment_reply_drafts(id, workspace_id) on delete cascade,
  constraint instagram_comment_reply_send_once unique (reply_draft_id),
  constraint instagram_comment_reply_send_completion_check check (
    (status = 'initiating' and completed_at is null)
    or (status <> 'initiating' and completed_at is not null)
  )
);

create index if not exists instagram_comment_reply_send_workspace_recent_idx
  on public.instagram_comment_reply_send_attempts(workspace_id, initiated_at desc);

alter table public.instagram_comment_reply_send_attempts enable row level security;
revoke all on public.instagram_comment_reply_send_attempts from public, anon, authenticated;
grant select on public.instagram_comment_reply_send_attempts to authenticated;
create policy instagram_comment_reply_send_workspace_read
  on public.instagram_comment_reply_send_attempts
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create or replace function public.begin_instagram_comment_reply_send(target_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  workspace_target uuid;
  account_target uuid;
  comment_target uuid;
  comment_provider_id text;
  comment_parent_id text;
  draft_target_status text;
  draft_target_text text;
  account_state text;
  account_scopes text[];
  account_capabilities jsonb;
  actor_role text;
  new_attempt_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_draft_id is null then
    raise exception 'A valid reviewed draft is required' using errcode = '22023';
  end if;

  select d.workspace_id, d.instagram_comment_id, d.status, d.draft_text,
         c.social_account_id, c.provider_comment_id, c.parent_provider_comment_id,
         a.connection_state, a.granted_scopes, a.capabilities
    into workspace_target, comment_target, draft_target_status, draft_target_text,
         account_target, comment_provider_id, comment_parent_id,
         account_state, account_scopes, account_capabilities
  from public.instagram_comment_reply_drafts d
  join public.instagram_comments c
    on c.id = d.instagram_comment_id and c.workspace_id = d.workspace_id
  join public.social_accounts a
    on a.id = c.social_account_id and a.workspace_id = c.workspace_id and a.provider = 'instagram'
  where d.id = target_draft_id
  for update of d;

  if workspace_target is null or not public.is_workspace_member(workspace_target) then
    raise exception 'Draft access denied' using errcode = '42501';
  end if;
  if draft_target_status <> 'reviewed' then
    raise exception 'Only a human-reviewed draft can be published' using errcode = '55000';
  end if;
  if pg_catalog.length(pg_catalog.btrim(draft_target_text)) not between 1 and 2200 then
    raise exception 'Instagram reply must contain 1 to 2200 characters' using errcode = '22023';
  end if;
  if comment_provider_id is null or pg_catalog.length(comment_provider_id) > 255 then
    raise exception 'Instagram comment identifier is invalid' using errcode = '22023';
  end if;
  if comment_parent_id is not null then
    raise exception 'Replies to existing comment replies are not supported by this action' using errcode = '0A000';
  end if;
  if account_state is distinct from 'connected'
     or coalesce(account_capabilities ->> 'comments', 'false') <> 'true'
     or not ('instagram_business_basic' = any(coalesce(account_scopes, array[]::text[])))
     or not ('instagram_business_manage_comments' = any(coalesce(account_scopes, array[]::text[]))) then
    raise exception 'Instagram comment-management permission is not active; reconnect the account with the required scope' using errcode = '42501';
  end if;
  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = workspace_target and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher','client_approver') then
    raise exception 'Your workspace role cannot publish comment replies' using errcode = '42501';
  end if;

  insert into public.instagram_comment_reply_send_attempts (
    workspace_id, social_account_id, instagram_comment_id, reply_draft_id,
    actor_user_id, status
  ) values (
    workspace_target, account_target, comment_target, target_draft_id,
    actor_id, 'initiating'
  ) returning id into new_attempt_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    workspace_target, actor_id, 'instagram.comment_reply_send.initiated',
    'instagram_comment_reply_draft', target_draft_id::text, 'success',
    pg_catalog.jsonb_build_object('social_account_id', account_target, 'attempt_id', new_attempt_id, 'send_status', 'initiating')
  );
  return new_attempt_id;
end;
$$;

create or replace function public.record_instagram_comment_reply_send_result(
  target_attempt_id uuid,
  target_status text,
  target_provider_reply_id text default null,
  target_safe_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_row public.instagram_comment_reply_send_attempts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_status is null or target_status not in ('succeeded','failed','unknown') then
    raise exception 'Invalid send result status' using errcode = '22023';
  end if;
  if target_provider_reply_id is not null and pg_catalog.length(target_provider_reply_id) not between 1 and 255 then
    raise exception 'Invalid provider reply identifier' using errcode = '22023';
  end if;
  if target_safe_error_code is not null and target_safe_error_code !~ '^[a-z0-9_:-]{1,80}$' then
    raise exception 'Invalid safe error code' using errcode = '22023';
  end if;

  select * into attempt_row
  from public.instagram_comment_reply_send_attempts
  where id = target_attempt_id
  for update;
  if attempt_row.id is null then
    raise exception 'Send attempt not found' using errcode = 'P0002';
  end if;
  if attempt_row.status <> 'initiating' then
    raise exception 'Send attempt is already finalized' using errcode = '55000';
  end if;

  update public.instagram_comment_reply_send_attempts
  set status = target_status,
      provider_reply_id = target_provider_reply_id,
      safe_error_code = target_safe_error_code,
      completed_at = pg_catalog.now()
  where id = target_attempt_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    attempt_row.workspace_id, attempt_row.actor_user_id,
    'instagram.comment_reply_send.' || target_status,
    'instagram_comment_reply_draft', attempt_row.reply_draft_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'attempt_id', target_attempt_id,
      'send_status', target_status,
      'social_account_id', attempt_row.social_account_id,
      'provider_reply_id', target_provider_reply_id,
      'safe_error_code', target_safe_error_code
    )
  );
end;
$$;

revoke all on function public.begin_instagram_comment_reply_send(uuid) from public, anon;
grant execute on function public.begin_instagram_comment_reply_send(uuid) to authenticated;
revoke all on function public.record_instagram_comment_reply_send_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_instagram_comment_reply_send_result(uuid, text, text, text) to service_role;

comment on table public.instagram_comment_reply_send_attempts is
  'One-time ledger for explicitly confirmed, human-reviewed public Instagram comment replies. Ambiguous outcomes are never auto-retried.';
