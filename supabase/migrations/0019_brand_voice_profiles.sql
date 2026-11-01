-- v2.18.0: audited, role-checked brand voice profile updates.
-- Uses the existing brands.voice_profile jsonb column; no data rewrite is required.

create or replace function public.update_brand_voice_profile(
  target_brand_id uuid,
  submitted_profile jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_workspace_id uuid;
  member_role text;
  tone_value text;
  languages_value text;
  facts_input jsonb;
  forbidden_input jsonb;
  triggers_input jsonb;
  facts_clean jsonb;
  forbidden_clean jsonb;
  triggers_clean jsonb;
  safe_profile jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if submitted_profile is null or jsonb_typeof(submitted_profile) <> 'object' then
    raise exception 'A brand voice profile object is required' using errcode = '22023';
  end if;

  select b.workspace_id into target_workspace_id
  from public.brands b
  where b.id = target_brand_id
  for update;
  if target_workspace_id is null then
    raise exception 'Brand not found' using errcode = 'P0002';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id
  for share;
  if member_role is null or member_role not in ('owner', 'admin') then
    raise exception 'Workspace owner or admin role required' using errcode = '42501';
  end if;

  tone_value := coalesce(nullif(btrim(submitted_profile ->> 'tone'), ''), '');
  languages_value := coalesce(nullif(btrim(submitted_profile ->> 'languages'), ''), '');
  if char_length(tone_value) > 120 or char_length(languages_value) > 120 then
    raise exception 'Tone and language guidance must be 120 characters or fewer' using errcode = '22023';
  end if;

  facts_input := coalesce(submitted_profile -> 'approved_facts', '[]'::jsonb);
  forbidden_input := coalesce(submitted_profile -> 'forbidden_claims', '[]'::jsonb);
  triggers_input := coalesce(submitted_profile -> 'escalation_triggers', '[]'::jsonb);

  if jsonb_typeof(facts_input) is distinct from 'array'
    or jsonb_typeof(forbidden_input) is distinct from 'array'
    or jsonb_typeof(triggers_input) is distinct from 'array' then
    raise exception 'Brand voice lists must be JSON arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(facts_input) > 12
    or jsonb_array_length(forbidden_input) > 12
    or jsonb_array_length(triggers_input) > 12 then
    raise exception 'Each brand voice list may contain at most twelve entries' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(facts_input) as facts(item)
    where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) > 240
  ) or exists (
    select 1 from jsonb_array_elements(forbidden_input) as forbidden(item)
    where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) > 240
  ) or exists (
    select 1 from jsonb_array_elements(triggers_input) as triggers(item)
    where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) > 240
  ) then
    raise exception 'Brand voice list entries must be strings of at most 240 characters' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(btrim(item #>> '{}'))), '[]'::jsonb) into facts_clean
  from jsonb_array_elements(facts_input) as facts(item) where btrim(item #>> '{}') <> '';
  select coalesce(jsonb_agg(to_jsonb(btrim(item #>> '{}'))), '[]'::jsonb) into forbidden_clean
  from jsonb_array_elements(forbidden_input) as forbidden(item) where btrim(item #>> '{}') <> '';
  select coalesce(jsonb_agg(to_jsonb(btrim(item #>> '{}'))), '[]'::jsonb) into triggers_clean
  from jsonb_array_elements(triggers_input) as triggers(item) where btrim(item #>> '{}') <> '';

  safe_profile := jsonb_build_object(
    'tone', tone_value,
    'languages', languages_value,
    'approved_facts', facts_clean,
    'forbidden_claims', forbidden_clean,
    'escalation_triggers', triggers_clean
  );

  update public.brands
  set voice_profile = safe_profile
  where id = target_brand_id and workspace_id = target_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id, 'brand.voice_profile.updated', 'brand', target_brand_id::text, 'success',
    jsonb_build_object(
      'approved_facts_count', jsonb_array_length(facts_clean),
      'forbidden_claims_count', jsonb_array_length(forbidden_clean),
      'escalation_triggers_count', jsonb_array_length(triggers_clean),
      'tone_configured', tone_value <> '',
      'languages_configured', languages_value <> ''
    )
  );
end;
$$;

revoke all on function public.update_brand_voice_profile(uuid, jsonb) from public, anon;
grant execute on function public.update_brand_voice_profile(uuid, jsonb) to authenticated;
