-- RuffNeck Social Hub v2.1.0: enable LinkedIn organization text publishing.
-- Apply after migrations 0001 through 0016. The application requests
-- w_organization_social during OAuth and calls the capability gate only after
-- a successful OAuth exchange and approved organization-admin discovery.

create or replace function public.enable_linkedin_organization_publishing(
  target_workspace_id uuid,
  target_brand_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role text;
  changed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select m.role::text into actor_role
  from public.workspace_members m
  where m.workspace_id = target_workspace_id and m.user_id = current_user_id;
  if actor_role is null or actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Your workspace role cannot enable LinkedIn publishing' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.brands b
    where b.id = target_brand_id and b.workspace_id = target_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  update public.social_accounts a
  set granted_scopes = array(
        select distinct scope_name
        from pg_catalog.unnest(coalesce(a.granted_scopes, array[]::text[]) || array['w_organization_social']::text[]) as s(scope_name)
        where scope_name in ('r_organization_admin', 'w_organization_social')
      ),
      capabilities = coalesce(a.capabilities, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'content_publish', true,
        'publish_permission_granted', true,
        'publish_format', 'text_only'
      )
  where a.workspace_id = target_workspace_id
    and a.brand_id = target_brand_id
    and a.provider = 'linkedin'
    and a.connection_state = 'connected'
    and 'r_organization_admin' = any(coalesce(a.granted_scopes, array[]::text[]))
    and a.capabilities->>'organization_role' = 'ADMINISTRATOR'
    and a.provider_account_id ~ '^[0-9]{1,20}$';
  get diagnostics changed_count = row_count;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id,
    'integration.linkedin.organization_publishing_capability_checked',
    'social_account_batch', null, 'success',
    pg_catalog.jsonb_build_object('brand_id', target_brand_id, 'enabled_organization_count', changed_count, 'format', 'text_only')
  );
  return changed_count;
end;
$$;

revoke all on function public.enable_linkedin_organization_publishing(uuid, uuid) from public, anon;
grant execute on function public.enable_linkedin_organization_publishing(uuid, uuid) to authenticated;

comment on function public.enable_linkedin_organization_publishing(uuid, uuid) is
  'Enables text-only LinkedIn organization publishing after successful OAuth and approved administrator organization discovery; publishing requests still require provider-side permission approval.';
