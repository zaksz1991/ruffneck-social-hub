-- Multi-workspace and brand management. Membership writes remain server-controlled.
create or replace function public.create_additional_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_workspace_id uuid;
  clean_name text := btrim(workspace_name);
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 120 then
    raise exception 'Workspace name must contain 2 to 120 characters' using errcode = '22023';
  end if;
  insert into public.workspaces(name, created_by)
  values (clean_name, current_user_id)
  returning id into new_workspace_id;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');
  insert into public.brands(workspace_id, name)
  values (new_workspace_id, 'Primary brand');
  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome)
  values (new_workspace_id, current_user_id, 'workspace.created', 'workspace', new_workspace_id::text, 'success');
  return new_workspace_id;
end;
$$;
revoke all on function public.create_additional_workspace(text) from public, anon;
grant execute on function public.create_additional_workspace(text) to authenticated;

-- Restrict browser brand writes to explicit workspace administrators.
drop policy if exists brands_insert_admin on public.brands;
create policy brands_insert_admin on public.brands
for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = brands.workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);

-- Only owners/admins may rename brands; deleting a brand is deliberately disabled
-- until dependent social accounts and content have a reviewed archival workflow.
revoke delete on public.brands from anon, authenticated;

create index if not exists workspace_members_user_idx on public.workspace_members(user_id, workspace_id);
create index if not exists brands_workspace_created_idx on public.brands(workspace_id, created_at);
