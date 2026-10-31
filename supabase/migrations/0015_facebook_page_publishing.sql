-- RuffNeck Social Hub v1.8.0: enable Facebook Page image publishing only
-- when Meta granted pages_manage_posts AND the Page reports CREATE_CONTENT/MANAGE.
-- Apply after migrations 0001 through 0014.

create or replace function public.enable_facebook_page_publishing(
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
    raise exception 'Your workspace role cannot enable Page publishing' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.brands b
    where b.id = target_brand_id and b.workspace_id = target_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  update public.social_accounts a
  set capabilities = coalesce(a.capabilities, '{}'::jsonb) || jsonb_build_object(
    'content_publish', true,
    'publish_permission_granted', true,
    'publish_format', 'single_image'
  )
  where a.workspace_id = target_workspace_id
    and a.brand_id = target_brand_id
    and a.provider = 'facebook'
    and a.connection_state = 'connected'
    and 'pages_manage_posts' = any(coalesce(a.granted_scopes, array[]::text[]))
    and (
      coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["CREATE_CONTENT"]'::jsonb
      or coalesce(a.capabilities->'page_tasks', '[]'::jsonb) @> '["MANAGE"]'::jsonb
    );
  get diagnostics changed_count = row_count;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type,
    resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, current_user_id,
    'integration.facebook.page_publishing_capability_checked',
    'social_account_batch', null, 'success',
    jsonb_build_object('brand_id', target_brand_id, 'enabled_page_count', changed_count)
  );
  return changed_count;
end;
$$;

revoke all on function public.enable_facebook_page_publishing(uuid, uuid) from public, anon;
grant execute on function public.enable_facebook_page_publishing(uuid, uuid) to authenticated;

-- Existing Page connections are deliberately not enabled automatically. Users must
-- reconnect after granting pages_manage_posts, then the OAuth callback runs this gate.
