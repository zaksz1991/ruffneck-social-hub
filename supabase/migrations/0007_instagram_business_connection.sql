-- RuffNeck Social Hub 0.8.0: first official provider connection (Instagram Login).
-- Apply after migrations 0001 through 0006.
-- OAuth access tokens are AES-256-GCM encrypted by the server before reaching this RPC.
-- The token vault is deliberately inaccessible to browser roles.

create table if not exists public.social_account_token_vault (
  social_account_id uuid primary key references public.social_accounts(id) on delete cascade,
  ciphertext text not null check (length(ciphertext) between 4 and 16384),
  iv text not null check (length(iv) between 12 and 32),
  auth_tag text not null check (length(auth_tag) between 20 and 32),
  token_expires_at timestamptz not null,
  encryption_algorithm text not null default 'aes-256-gcm' check (encryption_algorithm = 'aes-256-gcm'),
  updated_at timestamptz not null default now()
);

alter table public.social_account_token_vault enable row level security;
revoke all on table public.social_account_token_vault from public, anon, authenticated;

create or replace function public.store_instagram_connection(
  target_workspace_id uuid,
  target_brand_id uuid,
  target_provider_account_id text,
  target_display_name text,
  target_granted_scopes text[],
  target_token_ciphertext text,
  target_token_iv text,
  target_token_auth_tag text,
  target_token_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  existing_account public.social_accounts%rowtype;
  account_id uuid;
  clean_scopes text[];
  can_publish boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_workspace_id is null or target_brand_id is null then
    raise exception 'Choose a valid workspace and brand' using errcode = '22023';
  end if;
  if target_provider_account_id is null or length(target_provider_account_id) not between 1 and 128 then
    raise exception 'Invalid Instagram account identifier' using errcode = '22023';
  end if;
  if target_display_name is null or length(target_display_name) not between 1 and 120 then
    raise exception 'Invalid Instagram account display name' using errcode = '22023';
  end if;
  if target_token_ciphertext is null or length(target_token_ciphertext) not between 4 and 16384
     or target_token_iv is null or length(target_token_iv) not between 12 and 32
     or target_token_auth_tag is null or length(target_token_auth_tag) not between 20 and 32 then
    raise exception 'Encrypted token payload is invalid' using errcode = '22023';
  end if;
  if target_token_expires_at is null or target_token_expires_at <= pg_catalog.now() then
    raise exception 'Instagram access token is already expired' using errcode = '22023';
  end if;

  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id
    and m.user_id = current_user_id;
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
      where scope_name in ('instagram_business_basic', 'instagram_business_content_publish')
    ),
    array[]::text[]
  );
  can_publish := 'instagram_business_content_publish' = any(clean_scopes);

  select * into existing_account
  from public.social_accounts a
  where a.provider = 'instagram'
    and a.provider_account_id = target_provider_account_id
  for update;

  if found then
    if existing_account.workspace_id <> target_workspace_id or existing_account.brand_id <> target_brand_id then
      raise exception 'This Instagram account is already connected to another workspace or brand' using errcode = '23505';
    end if;
    account_id := existing_account.id;
    update public.social_accounts
    set display_name = target_display_name,
        connection_state = 'connected',
        granted_scopes = clean_scopes,
        capabilities = pg_catalog.jsonb_build_object(
          'profile_read', true,
          'content_publish', can_publish,
          'comments', false,
          'messaging', false,
          'insights', false
        ),
        token_secret_ref = 'social_account_token_vault:' || account_id::text
    where id = account_id;
  else
    insert into public.social_accounts (
      workspace_id, brand_id, provider, provider_account_id, display_name,
      connection_state, granted_scopes, capabilities, token_secret_ref
    ) values (
      target_workspace_id,
      target_brand_id,
      'instagram',
      target_provider_account_id,
      target_display_name,
      'connected',
      clean_scopes,
      pg_catalog.jsonb_build_object(
        'profile_read', true,
        'content_publish', can_publish,
        'comments', false,
        'messaging', false,
        'insights', false
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
    account_id,
    target_token_ciphertext,
    target_token_iv,
    target_token_auth_tag,
    target_token_expires_at,
    pg_catalog.now()
  )
  on conflict (social_account_id) do update set
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    token_expires_at = excluded.token_expires_at,
    updated_at = pg_catalog.now();

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id,
    current_user_id,
    'integration.instagram.connected',
    'social_account',
    account_id::text,
    'success',
    pg_catalog.jsonb_build_object(
      'brand_id', target_brand_id,
      'provider_account_id', target_provider_account_id,
      'granted_scopes', clean_scopes,
      'token_expires_at', target_token_expires_at
    )
  );

  return account_id;
end;
$$;

revoke all on function public.store_instagram_connection(
  uuid, uuid, text, text, text[], text, text, text, timestamptz
) from public, anon;
grant execute on function public.store_instagram_connection(
  uuid, uuid, text, text, text[], text, text, text, timestamptz
) to authenticated;

comment on table public.social_account_token_vault is
  'Encrypted provider OAuth tokens. Browser roles have no privileges or RLS policies; server-side integration code must hold the encryption key.';
comment on function public.store_instagram_connection(
  uuid, uuid, text, text, text[], text, text, text, timestamptz
) is
  'Stores a connected Instagram professional account after validating workspace role and brand ownership. Token values must already be AES-256-GCM encrypted by trusted server code.';
