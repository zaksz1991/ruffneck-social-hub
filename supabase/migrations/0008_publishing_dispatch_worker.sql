-- RuffNeck Social Hub 0.9.0: leased publishing worker and delivery state.
-- Apply after migrations 0001 through 0007. Dispatch is server-only.

alter table public.publishing_jobs
  add column if not exists next_attempt_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists provider_media_id text,
  add column if not exists worker_started_at timestamptz;

create index if not exists publishing_jobs_due_attempt_idx
  on public.publishing_jobs (scheduled_at, next_attempt_at)
  where state in ('queued', 'retryable');

-- Only service_role may claim jobs. SKIP LOCKED prevents concurrent workers
-- from claiming the same row. A stale lease is moved to needs_review because
-- the provider may have accepted a post before the worker lost its response.
create or replace function public.claim_due_publishing_jobs(
  target_worker_id text,
  target_limit integer default 5
)
returns table (
  job_id uuid,
  workspace_id uuid,
  brand_id uuid,
  content_id uuid,
  social_account_id uuid,
  provider text,
  provider_account_id text,
  caption text,
  media_refs jsonb,
  idempotency_key text,
  attempts integer,
  max_attempts integer,
  ciphertext text,
  iv text,
  auth_tag text,
  token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_worker_id is null or length(target_worker_id) not between 8 and 120 then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if target_limit is null or target_limit not between 1 and 10 then
    raise exception 'Batch size must be between 1 and 10' using errcode = '22023';
  end if;

  update public.publishing_jobs j
  set state = 'needs_review',
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = 'worker_lease_expired',
      last_error_safe = 'Worker lease expired; verify the provider before retrying.',
      updated_at = pg_catalog.now()
  where j.state in ('claimed', 'dispatching')
    and j.lease_expires_at < pg_catalog.now();

  return query
  with due as (
    select j.id
    from public.publishing_jobs j
    join public.social_accounts a on a.id = j.social_account_id
    join public.content_items ci on ci.id = j.content_id
    join public.social_account_token_vault v on v.social_account_id = a.id
    where j.state in ('queued', 'retryable')
      and j.scheduled_at <= pg_catalog.now()
      and (j.next_attempt_at is null or j.next_attempt_at <= pg_catalog.now())
      and j.attempts < j.max_attempts
      and a.connection_state = 'connected'
      and coalesce((a.capabilities ->> 'content_publish')::boolean, false) = true
      and ci.status = 'approved'
    order by j.scheduled_at asc
    for update of j skip locked
    limit target_limit
  ), claimed as (
    update public.publishing_jobs j
    set state = 'claimed',
        attempts = j.attempts + 1,
        lease_owner = target_worker_id,
        lease_expires_at = pg_catalog.now() + interval '4 minutes',
        worker_started_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    from due
    where j.id = due.id
    returning j.*
  )
  select c.id, c.workspace_id, c.brand_id, c.content_id, c.social_account_id,
         a.provider, a.provider_account_id, ci.body, ci.media_refs,
         c.idempotency_key, c.attempts, c.max_attempts,
         v.ciphertext, v.iv, v.auth_tag, v.token_expires_at
  from claimed c
  join public.social_accounts a on a.id = c.social_account_id
  join public.content_items ci on ci.id = c.content_id
  join public.social_account_token_vault v on v.social_account_id = a.id
  where a.connection_state = 'connected'
    and ci.status = 'approved'
    and coalesce((a.capabilities ->> 'content_publish')::boolean, false) = true;
end;
$$;

create or replace function public.finish_publishing_job(
  target_job_id uuid,
  target_worker_id text,
  target_state public.job_state,
  target_provider_post_id text default null,
  target_error_code text default null,
  target_error_safe text default null,
  target_retry_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.publishing_jobs%rowtype;
begin
  if target_state not in ('succeeded', 'retryable', 'failed', 'needs_review') then
    raise exception 'Invalid worker completion state' using errcode = '22023';
  end if;
  select * into job_row from public.publishing_jobs
  where id = target_job_id and lease_owner = target_worker_id
  for update;
  if not found then
    raise exception 'Publishing lease not found' using errcode = 'P0002';
  end if;
  if job_row.state not in ('claimed', 'dispatching') then
    raise exception 'Publishing job is not owned by this worker' using errcode = '22023';
  end if;
  if target_state = 'retryable' and (target_retry_at is null or job_row.attempts >= job_row.max_attempts) then
    target_state := 'failed';
  end if;

  update public.publishing_jobs
  set state = target_state,
      provider_post_id = coalesce(target_provider_post_id, provider_post_id),
      delivered_at = case when target_state = 'succeeded' then pg_catalog.now() else delivered_at end,
      last_error_code = target_error_code,
      last_error_safe = left(target_error_safe, 240),
      next_attempt_at = case when target_state = 'retryable' then target_retry_at else null end,
      lease_owner = null,
      lease_expires_at = null,
      updated_at = pg_catalog.now()
  where id = target_job_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    job_row.workspace_id, null,
    'publishing.job_' || target_state::text,
    'publishing_job', target_job_id::text,
    case when target_state = 'succeeded' then 'success' else 'system' end,
    pg_catalog.jsonb_build_object(
      'attempt', job_row.attempts,
      'provider_post_id_present', target_provider_post_id is not null,
      'error_code', target_error_code
    )
  );
end;
$$;

revoke all on function public.claim_due_publishing_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.finish_publishing_job(uuid, text, public.job_state, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_publishing_jobs(text, integer) to service_role;
grant execute on function public.finish_publishing_job(uuid, text, public.job_state, text, text, text, timestamptz) to service_role;

comment on function public.claim_due_publishing_jobs(text, integer) is
  'Server-only queue claim. Expired leases move to needs_review to avoid accidental duplicate posts.';
comment on function public.finish_publishing_job(uuid, text, public.job_state, text, text, text, timestamptz) is
  'Server-only worker completion with lease ownership validation and audit event.';


-- Media-aware draft RPCs. The worker currently accepts exactly one public HTTPS image.
create or replace function public.create_content_draft_with_media(
  target_workspace_id uuid,
  target_brand_id uuid,
  content_title text,
  content_body text,
  target_media_refs jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  clean_title text := btrim(coalesce(content_title, ''));
  clean_body text := btrim(coalesce(content_body, ''));
  new_content_id uuid;
  media_url text;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into member_role from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner','admin','manager','publisher') then
    raise exception 'You do not have permission to create content in this workspace' using errcode = '42501';
  end if;
  if char_length(clean_title) not between 2 and 160 or char_length(clean_body) not between 1 and 5000 then
    raise exception 'Invalid content title or body' using errcode = '22023';
  end if;
  if not exists(select 1 from public.brands b where b.id = target_brand_id and b.workspace_id = target_workspace_id) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(target_media_refs, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(target_media_refs, '[]'::jsonb)) > 1 then
    raise exception 'This publishing release supports zero or one image URL' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(target_media_refs, '[]'::jsonb)) = 1 then
    media_url := target_media_refs->>0;
    if media_url !~ '^https://[^[:space:]]+$' then raise exception 'Image URL must be HTTPS' using errcode = '22023'; end if;
  end if;
  insert into public.content_items(workspace_id, brand_id, created_by, title, body, media_refs, status)
  values(target_workspace_id, target_brand_id, current_user_id, clean_title, clean_body, coalesce(target_media_refs, '[]'::jsonb), 'draft')
  returning id into new_content_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values(target_workspace_id, current_user_id, 'content.draft_created', 'content', new_content_id::text, 'success',
    jsonb_build_object('media_count', jsonb_array_length(coalesce(target_media_refs, '[]'::jsonb))));
  return new_content_id;
end;
$$;

create or replace function public.update_content_draft_with_media(
  target_content_id uuid,
  content_title text,
  content_body text,
  target_media_refs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  content_row public.content_items%rowtype;
  member_role text;
  clean_title text := btrim(coalesce(content_title, ''));
  clean_body text := btrim(coalesce(content_body, ''));
  media_url text;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if char_length(clean_title) not between 2 and 160 or char_length(clean_body) not between 1 and 5000 then
    raise exception 'Invalid content title or body' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(target_media_refs, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(target_media_refs, '[]'::jsonb)) > 1 then
    raise exception 'This publishing release supports zero or one image URL' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(target_media_refs, '[]'::jsonb)) = 1 then
    media_url := target_media_refs->>0;
    if media_url !~ '^https://[^[:space:]]+$' then raise exception 'Image URL must be HTTPS' using errcode = '22023'; end if;
  end if;
  select * into content_row from public.content_items c where c.id = target_content_id for update;
  if not found then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  select m.role::text into member_role from public.workspace_members m
  where m.workspace_id = content_row.workspace_id and m.user_id = current_user_id;
  if member_role is null or not (content_row.created_by = current_user_id or member_role in ('owner','admin','manager','publisher')) then
    raise exception 'You do not have permission to edit this content' using errcode = '42501';
  end if;
  if content_row.status <> 'draft' then raise exception 'Only draft content can be edited' using errcode = '22023'; end if;
  update public.content_items set title = clean_title, body = clean_body,
    media_refs = coalesce(target_media_refs, '[]'::jsonb), updated_at = pg_catalog.now()
  where id = target_content_id;
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values(content_row.workspace_id, current_user_id, 'content.draft_updated', 'content', target_content_id::text, 'success',
    jsonb_build_object('media_count', jsonb_array_length(coalesce(target_media_refs, '[]'::jsonb))));
end;
$$;

revoke all on function public.create_content_draft_with_media(uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.update_content_draft_with_media(uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_content_draft_with_media(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.update_content_draft_with_media(uuid, text, text, jsonb) to authenticated;
