-- RuffNeck Social Hub v1.7.0: Facebook Pages + reusable provider connection layer.
-- Apply after migrations 0001 through 0013.
-- Page OAuth tokens arrive server-side already encrypted with AES-256-GCM.
-- Meta does not expose a Page-token expiry in the Page-list response; NULL is intentional.

alter table public.social_account_token_vault
  alter column token_expires_at drop not null;
-- This function validates workspace ownership before it writes any connection.

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
      where scope_name in ('pages_show_list', 'pages_read_engagement', 'pages_manage_posts')
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
        where task_name in ('CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE', 'MANAGE')
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
