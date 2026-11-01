-- RuffNeck Social Hub 2.15.0: provider-specific content variants.
-- Apply once after migrations 0001 through 0017.
-- Variants retain the approved master content relationship, but each provider
-- copy has its own review lifecycle and immutable approved snapshot.

create table if not exists public.content_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null,
  provider text not null check (provider in ('instagram', 'facebook', 'linkedin')),
  variant_name text not null check (char_length(btrim(variant_name)) between 2 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  media_refs jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'changes_requested')),
  created_by uuid not null references auth.users(id) on delete restrict,
  last_reviewed_by uuid references auth.users(id) on delete set null,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_variants_content_workspace_fk
    foreign key (workspace_id, content_id)
    references public.content_items(workspace_id, id) on delete cascade,
  constraint content_variants_media_array_check
    check (
      case
        when jsonb_typeof(media_refs) = 'array' then jsonb_array_length(media_refs) <= 1
        else false
      end
    ),
  constraint content_variants_media_https_check
    check (
      case
        when jsonb_typeof(media_refs) = 'array' and jsonb_array_length(media_refs) = 0 then true
        when jsonb_typeof(media_refs) = 'array' and jsonb_array_length(media_refs) = 1 then
          jsonb_typeof(media_refs -> 0) = 'string'
          and char_length(media_refs ->> 0) <= 2048
          and (media_refs ->> 0) ~ '^https://[^/@[:space:]]+([/?#].*)?$'
        else false
      end
    ),
  constraint content_variants_workspace_content_id_key unique (workspace_id, content_id, id),
  constraint content_variants_workspace_id_key unique (workspace_id, id)
);

create unique index if not exists content_variants_name_unique_idx
  on public.content_variants (content_id, provider, lower(variant_name));
create index if not exists content_variants_workspace_status_idx
  on public.content_variants (workspace_id, status, updated_at desc);
create index if not exists content_variants_content_provider_idx
  on public.content_variants (content_id, provider, status);

create table if not exists public.content_variant_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  variant_id uuid not null,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint content_variant_reviews_variant_workspace_fk
    foreign key (workspace_id, variant_id)
    references public.content_variants(workspace_id, id) on delete cascade
);

create index if not exists content_variant_reviews_workspace_created_idx
  on public.content_variant_reviews (workspace_id, created_at desc);
create index if not exists content_variant_reviews_variant_created_idx
  on public.content_variant_reviews (variant_id, created_at desc);

alter table public.content_variants enable row level security;
alter table public.content_variant_reviews enable row level security;

drop policy if exists content_variants_member_read on public.content_variants;
create policy content_variants_member_read
  on public.content_variants for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists content_variant_reviews_member_read on public.content_variant_reviews;
create policy content_variant_reviews_member_read
  on public.content_variant_reviews for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.content_variants, public.content_variant_reviews from public, anon, authenticated;
grant select on public.content_variants, public.content_variant_reviews to authenticated;

alter table public.publishing_jobs
  add column if not exists variant_id uuid;

alter table public.publishing_jobs
  add constraint publishing_jobs_variant_content_workspace_fk
  foreign key (workspace_id, content_id, variant_id)
  references public.content_variants(workspace_id, content_id, id)
  on delete restrict;

create index if not exists publishing_jobs_variant_idx
  on public.publishing_jobs (variant_id)
  where variant_id is not null;

create or replace function public.create_content_variant(
  target_content_id uuid,
  target_provider text,
  target_variant_name text,
  target_variant_body text,
  target_media_refs jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  content_row public.content_items%rowtype;
  member_role text;
  clean_name text := btrim(coalesce(target_variant_name, ''));
  clean_body text := btrim(coalesce(target_variant_body, ''));
  media_url text;
  new_variant_id uuid;
  media_value jsonb := coalesce(target_media_refs, '[]'::jsonb);
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_provider not in ('instagram', 'facebook', 'linkedin') then
    raise exception 'Choose a provider with an active publishing worker' using errcode = '22023';
  end if;
  if char_length(clean_name) not between 2 and 60 or char_length(clean_body) not between 1 and 5000 then
    raise exception 'Variant name or copy is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(media_value) is distinct from 'array' then
    raise exception 'A provider variant supports zero or one image URL' using errcode = '22023';
  end if;
  if jsonb_array_length(media_value) > 1 then
    raise exception 'A provider variant supports zero or one image URL' using errcode = '22023';
  end if;
  if jsonb_array_length(media_value) = 1 then
    if jsonb_typeof(media_value -> 0) <> 'string' then
      raise exception 'Image reference must be a URL string' using errcode = '22023';
    end if;
    media_url := media_value ->> 0;
    if char_length(media_url) > 2048 or media_url !~ '^https://[^/@[:space:]]+([/?#].*)?$' then
      raise exception 'Image URL must use HTTPS' using errcode = '22023';
    end if;
  end if;

  select * into content_row
  from public.content_items c
  where c.id = target_content_id
  for share;
  if not found then
    raise exception 'Master content item not found' using errcode = 'P0002';
  end if;
  if content_row.status <> 'approved' then
    raise exception 'Approve the master content before creating provider variants' using errcode = '22023';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = content_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your role cannot create provider variants' using errcode = '42501';
  end if;

  insert into public.content_variants (
    workspace_id, content_id, provider, variant_name, body, media_refs, status, created_by
  ) values (
    content_row.workspace_id, content_row.id, target_provider, clean_name, clean_body, media_value, 'draft', current_user_id
  ) returning id into new_variant_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    content_row.workspace_id, current_user_id, 'content.variant_created', 'content_variant', new_variant_id::text, 'success',
    jsonb_build_object('provider', target_provider, 'media_count', jsonb_array_length(media_value))
  );
  return new_variant_id;
end;
$$;

create or replace function public.update_content_variant(
  target_variant_id uuid,
  target_variant_name text,
  target_variant_body text,
  target_media_refs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  variant_row public.content_variants%rowtype;
  member_role text;
  clean_name text := btrim(coalesce(target_variant_name, ''));
  clean_body text := btrim(coalesce(target_variant_body, ''));
  media_value jsonb := coalesce(target_media_refs, '[]'::jsonb);
  media_url text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(clean_name) not between 2 and 60 or char_length(clean_body) not between 1 and 5000 then
    raise exception 'Variant name or copy is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(media_value) is distinct from 'array' then
    raise exception 'A provider variant supports zero or one image URL' using errcode = '22023';
  end if;
  if jsonb_array_length(media_value) > 1 then
    raise exception 'A provider variant supports zero or one image URL' using errcode = '22023';
  end if;
  if jsonb_array_length(media_value) = 1 then
    if jsonb_typeof(media_value -> 0) <> 'string' then
      raise exception 'Image reference must be a URL string' using errcode = '22023';
    end if;
    media_url := media_value ->> 0;
    if char_length(media_url) > 2048 or media_url !~ '^https://[^/@[:space:]]+([/?#].*)?$' then
      raise exception 'Image URL must use HTTPS' using errcode = '22023';
    end if;
  end if;

  select * into variant_row
  from public.content_variants v
  where v.id = target_variant_id
  for update;
  if not found then
    raise exception 'Provider variant not found' using errcode = 'P0002';
  end if;
  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = variant_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or not (
    variant_row.created_by = current_user_id
    or member_role in ('owner', 'admin', 'manager', 'publisher')
  ) then
    raise exception 'Your role cannot edit this provider variant' using errcode = '42501';
  end if;
  if variant_row.status not in ('draft', 'changes_requested') then
    raise exception 'Only draft variants or variants returned for changes can be edited' using errcode = '22023';
  end if;

  update public.content_variants
  set variant_name = clean_name, body = clean_body, media_refs = media_value,
      status = 'draft', updated_at = pg_catalog.now()
  where id = target_variant_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome
  ) values (
    variant_row.workspace_id, current_user_id, 'content.variant_updated', 'content_variant', target_variant_id::text, 'success'
  );
end;
$$;

create or replace function public.submit_content_variant_for_review(target_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  variant_row public.content_variants%rowtype;
  content_status text;
  member_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into variant_row
  from public.content_variants v
  where v.id = target_variant_id
  for update;
  if not found then
    raise exception 'Provider variant not found' using errcode = 'P0002';
  end if;
  select c.status into content_status
  from public.content_items c
  where c.id = variant_row.content_id and c.workspace_id = variant_row.workspace_id;
  if content_status is distinct from 'approved' then
    raise exception 'The master content must remain approved' using errcode = '22023';
  end if;
  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = variant_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or not (
    variant_row.created_by = current_user_id
    or member_role in ('owner', 'admin', 'manager', 'publisher')
  ) then
    raise exception 'Your role cannot submit this provider variant' using errcode = '42501';
  end if;
  if variant_row.status not in ('draft', 'changes_requested') then
    raise exception 'Only draft variants can be submitted for review' using errcode = '22023';
  end if;

  update public.content_variants
  set status = 'in_review', updated_at = pg_catalog.now()
  where id = target_variant_id;
  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome
  ) values (
    variant_row.workspace_id, current_user_id, 'content.variant_submitted_for_review', 'content_variant', target_variant_id::text, 'success'
  );
end;
$$;

create or replace function public.review_content_variant(
  target_variant_id uuid,
  review_decision text,
  review_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  variant_row public.content_variants%rowtype;
  member_role text;
  content_status text;
  clean_note text := btrim(coalesce(review_note, ''));
  next_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if review_decision is null or review_decision not in ('approved', 'changes_requested') or char_length(clean_note) > 1000 then
    raise exception 'Invalid provider variant review' using errcode = '22023';
  end if;
  select * into variant_row
  from public.content_variants v
  where v.id = target_variant_id
  for update;
  if not found then
    raise exception 'Provider variant not found' using errcode = 'P0002';
  end if;
  select c.status into content_status
  from public.content_items c
  where c.id = variant_row.content_id and c.workspace_id = variant_row.workspace_id;
  if content_status is distinct from 'approved' then
    raise exception 'The master content must remain approved before variant review' using errcode = '22023';
  end if;
  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = variant_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'client_approver') then
    raise exception 'Your role cannot review provider variants' using errcode = '42501';
  end if;
  if variant_row.status <> 'in_review' then
    raise exception 'Only provider variants awaiting review can be reviewed' using errcode = '22023';
  end if;

  next_status := case when review_decision = 'approved' then 'approved' else 'changes_requested' end;
  update public.content_variants
  set status = next_status, last_reviewed_at = pg_catalog.now(), last_reviewed_by = current_user_id,
      updated_at = pg_catalog.now()
  where id = target_variant_id;

  insert into public.content_variant_reviews (
    workspace_id, variant_id, reviewer_user_id, decision, note
  ) values (
    variant_row.workspace_id, target_variant_id, current_user_id, review_decision, clean_note
  );
  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    variant_row.workspace_id, current_user_id, 'content.variant_reviewed', 'content_variant', target_variant_id::text, 'success',
    jsonb_build_object('decision', review_decision, 'provider', variant_row.provider)
  );
end;
$$;

-- Provider-specific schedules bind the approved copy snapshot to each job.
-- The original three-argument function is retained for compatibility; this
-- overload is used by the current application and revalidates variant state.
create or replace function public.schedule_approved_content(
  target_content_id uuid,
  target_social_account_id uuid,
  target_scheduled_local timestamp without time zone,
  target_variant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  content_row public.content_items%rowtype;
  account_row public.social_accounts%rowtype;
  variant_row public.content_variants%rowtype;
  brand_timezone text;
  scheduled_utc timestamptz;
  new_job_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_scheduled_local is null then
    raise exception 'Choose a valid date and time' using errcode = '22023';
  end if;

  select * into content_row
  from public.content_items c
  where c.id = target_content_id
  for update;
  if not found then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;
  if content_row.status <> 'approved' then
    raise exception 'Only approved content can be scheduled' using errcode = '22023';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = content_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'Your role cannot schedule content' using errcode = '42501';
  end if;

  select b.timezone into brand_timezone
  from public.brands b
  where b.id = content_row.brand_id
    and b.workspace_id = content_row.workspace_id;
  if brand_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = brand_timezone
  ) then
    raise exception 'The brand has an invalid timezone. Update the brand timezone before scheduling.' using errcode = '22023';
  end if;

  select * into account_row
  from public.social_accounts a
  where a.id = target_social_account_id
    and a.workspace_id = content_row.workspace_id
    and a.brand_id = content_row.brand_id
  for update;
  if not found then
    raise exception 'Choose a social account belonging to the same workspace and brand as this content' using errcode = '22023';
  end if;
  if account_row.connection_state <> 'connected' then
    raise exception 'This social account is not connected. Reconnect it before scheduling.' using errcode = '22023';
  end if;

  if target_variant_id is not null then
    select * into variant_row
    from public.content_variants v
    where v.id = target_variant_id
      and v.workspace_id = content_row.workspace_id
      and v.content_id = content_row.id
      and v.provider = account_row.provider
    for share;
    if not found or variant_row.status <> 'approved' then
      raise exception 'Select an approved provider variant matching this destination' using errcode = '22023';
    end if;
  end if;

  scheduled_utc := target_scheduled_local at time zone brand_timezone;
  if scheduled_utc < now() + interval '2 minutes' then
    raise exception 'Schedule time must be at least two minutes in the future' using errcode = '22023';
  end if;
  if scheduled_utc > now() + interval '90 days' then
    raise exception 'Schedule time cannot be more than 90 days ahead' using errcode = '22023';
  end if;

  insert into public.publishing_jobs (
    workspace_id, brand_id, content_id, variant_id, social_account_id,
    scheduled_at, state, idempotency_key
  ) values (
    content_row.workspace_id, content_row.brand_id, content_row.id, target_variant_id,
    account_row.id, scheduled_utc, 'queued', gen_random_uuid()::text
  ) returning id into new_job_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    content_row.workspace_id, current_user_id, 'publishing.job_scheduled', 'publishing_job', new_job_id::text, 'success',
    jsonb_build_object(
      'provider', account_row.provider,
      'social_account_id', account_row.id,
      'variant_id', target_variant_id,
      'scheduled_at', scheduled_utc
    )
  );
  return new_job_id;
end;
$$;

-- Rebuild the server-only claim RPC without changing its result contract.
-- The selected caption and media are the frozen approved variant when present.
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
    left join public.content_variants cv on cv.id = j.variant_id
    join public.social_account_token_vault v on v.social_account_id = a.id
    where j.state in ('queued', 'retryable')
      and j.scheduled_at <= pg_catalog.now()
      and (j.next_attempt_at is null or j.next_attempt_at <= pg_catalog.now())
      and j.attempts < j.max_attempts
      and a.connection_state = 'connected'
      and coalesce((a.capabilities ->> 'content_publish')::boolean, false) = true
      and ci.status = 'approved'
      and (
        j.variant_id is null
        or (
          cv.id is not null
          and cv.workspace_id = j.workspace_id
          and cv.content_id = j.content_id
          and cv.status = 'approved'
          and cv.provider = a.provider
        )
      )
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
         a.provider, a.provider_account_id,
         coalesce(cv.body, ci.body),
         case when cv.id is not null then cv.media_refs else ci.media_refs end,
         c.idempotency_key, c.attempts, c.max_attempts,
         v.ciphertext, v.iv, v.auth_tag, v.token_expires_at
  from claimed c
  join public.social_accounts a on a.id = c.social_account_id
  join public.content_items ci on ci.id = c.content_id
  left join public.content_variants cv on cv.id = c.variant_id
  join public.social_account_token_vault v on v.social_account_id = a.id
  where a.connection_state = 'connected'
    and ci.status = 'approved'
    and coalesce((a.capabilities ->> 'content_publish')::boolean, false) = true
    and (
      c.variant_id is null
      or (
        cv.id is not null
        and cv.workspace_id = c.workspace_id
        and cv.content_id = c.content_id
        and cv.status = 'approved'
        and cv.provider = a.provider
      )
    );
end;
$$;

revoke all on function public.create_content_variant(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.update_content_variant(uuid, text, text, jsonb) from public, anon;
revoke all on function public.submit_content_variant_for_review(uuid) from public, anon;
revoke all on function public.review_content_variant(uuid, text, text) from public, anon;
revoke all on function public.schedule_approved_content(uuid, uuid, timestamp without time zone, uuid) from public, anon;
revoke all on function public.claim_due_publishing_jobs(text, integer) from public, anon, authenticated;

grant execute on function public.create_content_variant(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.update_content_variant(uuid, text, text, jsonb) to authenticated;
grant execute on function public.submit_content_variant_for_review(uuid) to authenticated;
grant execute on function public.review_content_variant(uuid, text, text) to authenticated;
grant execute on function public.schedule_approved_content(uuid, uuid, timestamp without time zone, uuid) to authenticated;
grant execute on function public.claim_due_publishing_jobs(text, integer) to service_role;

comment on table public.content_variants is
  'Workspace-scoped provider-specific copy and media variants. An approved variant is immutable and can be bound to publishing jobs.';
comment on column public.publishing_jobs.variant_id is
  'Optional approved provider-specific content variant used for the dispatch caption and media snapshot.';
