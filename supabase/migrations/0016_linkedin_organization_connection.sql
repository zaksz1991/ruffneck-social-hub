-- RuffNeck Social Hub v2.0.0: LinkedIn organization Page connection foundation.
-- Apply after migrations 0001 through 0015.
-- LinkedIn access tokens are encrypted by the application before this function receives them.
-- This migration enables connection/profile discovery only; publishing remains disabled.

create or replace function public.store_linkedin_organization_connections(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_granted_scopes text[],
  target_organizations jsonb,
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
  organization_item jsonb;
  organization_id text;
  organization_name text;
  organization_urn text;
  organization_role text;
  token_ciphertext text;
  token_iv text;
  token_auth_tag text;
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  stored_count integer := 0;
  seen_organization_ids text[] := array[]::text[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_token_expires_at is null or target_token_expires_at <= pg_catalog.now()
     or target_token_expires_at > pg_catalog.now() + interval '366 days' then
    raise exception 'LinkedIn token expiry is invalid' using errcode = '22023';
  end if;
  if target_organizations is null or pg_catalog.jsonb_typeof(target_organizations) <> 'array'
     or pg_catalog.jsonb_array_length(target_organizations) not between 1 and 100 then
    raise exception 'LinkedIn organization payload must contain between 1 and 100 organizations' using errcode = '22023';
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

  clean_scopes := array(
    select distinct scope_name
    from pg_catalog.unnest(coalesce(target_granted_scopes, array[]::text[])) as u(scope_name)
    where scope_name in ('r_organization_admin')
  );
  if not ('r_organization_admin' = any(clean_scopes)) then
    raise exception 'LinkedIn organization administration read permission is required' using errcode = '22023';
  end if;

  -- Validate the entire callback payload before any writes; this operation is atomic.
  for organization_item in
    select value from pg_catalog.jsonb_array_elements(target_organizations) as p(value)
  loop
    organization_id := nullif(pg_catalog.btrim(organization_item->>'id'), '');
    organization_name := nullif(pg_catalog.btrim(organization_item->>'name'), '');
    organization_urn := nullif(pg_catalog.btrim(organization_item->>'organization_urn'), '');
    organization_role := nullif(pg_catalog.btrim(organization_item->>'role'), '');
    token_ciphertext := organization_item->>'token_ciphertext';
    token_iv := organization_item->>'token_iv';
    token_auth_tag := organization_item->>'token_auth_tag';

    if organization_id is null or organization_id !~ '^[0-9]{1,20}$'
       or organization_name is null or pg_catalog.length(organization_name) > 160
       or organization_urn is null
       or organization_urn <> 'urn:li:organization:' || organization_id
       or organization_role is null
       or organization_role <> 'ADMINISTRATOR'
       or token_ciphertext is null or pg_catalog.length(token_ciphertext) not between 4 and 32768
       or token_iv is null or pg_catalog.length(token_iv) not between 12 and 32
       or token_auth_tag is null or pg_catalog.length(token_auth_tag) not between 20 and 32 then
      raise exception 'LinkedIn organization credential payload is invalid' using errcode = '22023';
    end if;
    if organization_id = any(seen_organization_ids) then
      raise exception 'LinkedIn organization payload contains duplicate IDs' using errcode = '22023';
    end if;
    seen_organization_ids := seen_organization_ids || organization_id;
  end loop;

  for organization_item in
    select value from pg_catalog.jsonb_array_elements(target_organizations) as p(value)
  loop
    organization_id := pg_catalog.btrim(organization_item->>'id');
    organization_name := pg_catalog.btrim(organization_item->>'name');
    organization_urn := pg_catalog.btrim(organization_item->>'organization_urn');
    organization_role := pg_catalog.btrim(organization_item->>'role');
    token_ciphertext := organization_item->>'token_ciphertext';
    token_iv := organization_item->>'token_iv';
    token_auth_tag := organization_item->>'token_auth_tag';

    select * into existing_account
    from public.social_accounts a
    where a.provider = 'linkedin' and a.provider_account_id = organization_id
    for update;

    if found then
      if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
        raise exception 'This LinkedIn organization is already connected to another workspace or brand' using errcode = '23505';
      end if;
      account_id := existing_account.id;
      update public.social_accounts
      set display_name = organization_name,
          connection_state = 'connected',
          granted_scopes = clean_scopes,
          capabilities = pg_catalog.jsonb_build_object(
            'profile_read', true,
            'content_publish', false,
            'publish_permission_granted', false,
            'comments', false,
            'messaging', false,
            'insights', false,
            'organization_urn', organization_urn,
            'organization_role', organization_role
          ),
          token_secret_ref = 'social_account_token_vault:' || account_id::text
      where id = account_id;
    else
      insert into public.social_accounts (
        workspace_id, brand_id, provider, provider_account_id, display_name,
        connection_state, granted_scopes, capabilities, token_secret_ref
      ) values (
        target_workspace_id, target_brand_id, 'linkedin', organization_id, organization_name,
        'connected', clean_scopes,
        pg_catalog.jsonb_build_object(
          'profile_read', true,
          'content_publish', false,
          'publish_permission_granted', false,
          'comments', false,
          'messaging', false,
          'insights', false,
          'organization_urn', organization_urn,
          'organization_role', organization_role
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
    target_workspace_id, current_user_id,
    'integration.linkedin.organizations_connected',
    'social_account_batch', null, 'success',
    pg_catalog.jsonb_build_object(
      'brand_id', target_brand_id,
      'organization_count', stored_count,
      'granted_scopes', clean_scopes,
      'publishing_enabled', false,
      'token_expiry_recorded', true
    )
  );
  return stored_count;
end;
$$;

revoke all on function public.store_linkedin_organization_connections(uuid, uuid, text[], jsonb, timestamptz) from public, anon;
grant execute on function public.store_linkedin_organization_connections(uuid, uuid, text[], jsonb, timestamptz) to authenticated;

comment on function public.store_linkedin_organization_connections(uuid, uuid, text[], jsonb, timestamptz) is
  'Atomically stores LinkedIn organization Page identities and encrypted member access tokens after validating workspace role, brand ownership, approved administrator role and r_organization_admin permission. Publishing is deliberately disabled.';
