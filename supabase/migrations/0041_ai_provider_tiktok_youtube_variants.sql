-- RuffNeck Social Hub v5.4.0 — expand AI provider variants to TikTok and YouTube.
-- Apply after 0040. The publishing integration still requires a connected account
-- and any provider/API permissions already required by the workspace.

alter table public.content_items
  drop constraint if exists content_items_target_platform_check;

alter table public.content_items
  add constraint content_items_target_platform_check
  check (target_platform is null or target_platform in ('facebook', 'instagram', 'linkedin', 'tiktok', 'youtube'));

create or replace function public.create_content_drafts_from_ai_variants(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_variants jsonb
)
returns table(content_id uuid, target_platform text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  variant_item jsonb;
  variant_platform text;
  clean_title text;
  clean_body text;
  new_content_id uuid;
  used_platforms text[] := array[]::text[];
  variant_count integer;
  body_limit integer;
  title_limit integer;
  utf16_length integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'publisher') then
    raise exception 'You do not have permission to create content in this workspace' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.brands b
    where b.id = target_brand_id and b.workspace_id = target_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  if target_variants is null or pg_catalog.jsonb_typeof(target_variants) <> 'array' then
    raise exception 'Platform variants must be a JSON array' using errcode = '22023';
  end if;
  variant_count := pg_catalog.jsonb_array_length(target_variants);
  if variant_count < 1 or variant_count > 5 then
    raise exception 'Select between one and five platform variants' using errcode = '22023';
  end if;

  for variant_item in
    select value from pg_catalog.jsonb_array_elements(target_variants) as variant_rows(value)
  loop
    variant_platform := lower(coalesce(variant_item->>'platform', ''));
    clean_title := btrim(coalesce(variant_item->>'title', ''));
    clean_body := btrim(coalesce(variant_item->>'body', ''));

    if variant_platform not in ('facebook', 'instagram', 'linkedin', 'tiktok', 'youtube') then
      raise exception 'Unsupported target platform' using errcode = '22023';
    end if;
    if variant_platform = any(used_platforms) then
      raise exception 'Duplicate target platform in variant batch' using errcode = '22023';
    end if;
    used_platforms := pg_catalog.array_append(used_platforms, variant_platform);

    body_limit := case variant_platform
      when 'instagram' then 2200
      when 'linkedin' then 3000
      when 'tiktok' then 2200
      when 'youtube' then 4500
      else 5000
    end;
    title_limit := case variant_platform when 'youtube' then 100 else 160 end;
    if pg_catalog.char_length(clean_title) not between 2 and title_limit
       or pg_catalog.char_length(clean_body) not between 1 and body_limit then
      raise exception 'A platform variant has an invalid title or body length' using errcode = '22023';
    end if;
    if variant_platform = 'youtube' and pg_catalog.octet_length(clean_body) > 5000 then
      raise exception 'The YouTube description exceeds the 5,000-byte platform limit' using errcode = '22023';
    end if;
    if variant_platform = 'youtube' and (pg_catalog.strpos(clean_title, '<') > 0 or pg_catalog.strpos(clean_title, '>') > 0 or pg_catalog.strpos(clean_body, '<') > 0 or pg_catalog.strpos(clean_body, '>') > 0) then
      raise exception 'YouTube title and description cannot contain angle brackets' using errcode = '22023';
    end if;
    if variant_platform = 'tiktok' then
      select coalesce(pg_catalog.sum(case when pg_catalog.ascii(pg_catalog.substr(clean_body, positions.i, 1)) > 65535 then 2 else 1 end), 0)::integer
        into utf16_length
      from pg_catalog.generate_series(1, pg_catalog.char_length(clean_body)) as positions(i);
      if utf16_length > 2200 then
        raise exception 'The TikTok caption exceeds the 2,200 UTF-16-unit platform limit' using errcode = '22023';
      end if;
    end if;

    insert into public.content_items (
      workspace_id, brand_id, created_by, title, body, media_refs, status, target_platform
    ) values (
      target_workspace_id, target_brand_id, current_user_id,
      clean_title, clean_body, '[]'::jsonb, 'draft', variant_platform
    ) returning id into new_content_id;

    insert into public.audit_events (
      workspace_id, actor_user_id, event_type, resource_type,
      resource_id, outcome, safe_metadata
    ) values (
      target_workspace_id, current_user_id, 'content.ai_provider_variant_saved', 'content',
      new_content_id::text, 'success',
      pg_catalog.jsonb_build_object('platform', variant_platform, 'source', 'ai_provider_variant_generator')
    );

    content_id := new_content_id;
    target_platform := variant_platform;
    return next;
  end loop;
end;
$$;

revoke all on function public.create_content_drafts_from_ai_variants(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_content_drafts_from_ai_variants(uuid, uuid, jsonb) to authenticated;

comment on function public.create_content_drafts_from_ai_variants(uuid, uuid, jsonb) is
  'Atomically saves one to five reviewed AI-generated Facebook, Instagram, LinkedIn, TikTok and YouTube text variants as workspace drafts; it never approves, schedules or publishes them.';


create or replace function public.schedule_approved_content(
  target_content_id uuid,
  target_social_account_id uuid,
  target_scheduled_local timestamp without time zone
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
  if content_row.target_platform in ('tiktok', 'youtube')
     and (case
       when pg_catalog.jsonb_typeof(content_row.media_refs) = 'array'
         then pg_catalog.jsonb_array_length(content_row.media_refs)
       else 0
     end) < 1 then
    raise exception 'Attach at least one media asset before scheduling TikTok or YouTube content' using errcode = '22023';
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
  if content_row.target_platform is not null and account_row.provider <> content_row.target_platform then
    raise exception 'This content is targeted to % and cannot be scheduled to %.', content_row.target_platform, account_row.provider using errcode = '22023';
  end if;

  scheduled_utc := target_scheduled_local at time zone brand_timezone;
  if scheduled_utc < now() + interval '2 minutes' then
    raise exception 'Schedule time must be at least two minutes in the future' using errcode = '22023';
  end if;
  if scheduled_utc > now() + interval '90 days' then
    raise exception 'Schedule time cannot be more than 90 days ahead' using errcode = '22023';
  end if;

  insert into public.publishing_jobs (
    workspace_id, brand_id, content_id, social_account_id,
    scheduled_at, state, idempotency_key
  ) values (
    content_row.workspace_id, content_row.brand_id, content_row.id,
    account_row.id, scheduled_utc, 'queued', gen_random_uuid()::text
  ) returning id into new_job_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    content_row.workspace_id, current_user_id, 'publishing.job_scheduled',
    'publishing_job', new_job_id::text, 'success',
    pg_catalog.jsonb_build_object(
      'provider', account_row.provider,
      'social_account_id', account_row.id,
      'scheduled_at', scheduled_utc,
      'target_platform', content_row.target_platform
    )
  );

  return new_job_id;
end;
$$;

revoke all on function public.schedule_approved_content(uuid, uuid, timestamp without time zone) from public, anon;
grant execute on function public.schedule_approved_content(uuid, uuid, timestamp without time zone) to authenticated;

comment on function public.schedule_approved_content(uuid, uuid, timestamp without time zone) is
  'Schedules approved content only for its matching connected provider; TikTok and YouTube additionally require at least one media asset. Platform-targeted text drafts cannot be queued without media.';
