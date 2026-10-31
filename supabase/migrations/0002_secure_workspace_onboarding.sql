-- Secure, idempotent first-workspace provisioning for an authenticated user.
-- The function accepts no user ID: auth.uid() is the only identity source.
create or replace function public.create_workspace_for_current_user(workspace_name text)
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

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select w.id into new_workspace_id
  from public.workspaces as w
  join public.workspace_members as m on m.workspace_id = w.id
  where m.user_id = current_user_id and m.role = 'owner'
  order by w.created_at asc
  limit 1;

  if new_workspace_id is not null then
    return new_workspace_id;
  end if;

  insert into public.workspaces(name, created_by)
  values (clean_name, current_user_id)
  returning id into new_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  insert into public.brands(workspace_id, name)
  values (new_workspace_id, 'Primary brand');

  return new_workspace_id;
end;
$$;
revoke all on function public.create_workspace_for_current_user(text) from public, anon;
grant execute on function public.create_workspace_for_current_user(text) to authenticated;

-- Harden the membership predicate with a fixed, empty search path.
create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.workspace_members as m where m.workspace_id = target and m.user_id = auth.uid()) $$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- Replace the ambiguous original brand insert policy with a qualified membership check.
drop policy if exists brands_insert_admin on public.brands;
create policy brands_insert_admin on public.brands
for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members as m
    where m.workspace_id = brands.workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);

-- Only workspace owners/admins can rename or remove brands. No browser-side
-- mutation is granted for social credentials, publishing jobs, or audit events.
create policy brands_update_admin on public.brands
for update to authenticated
using (
  exists (select 1 from public.workspace_members as m
    where m.workspace_id = brands.workspace_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin'))
)
with check (
  exists (select 1 from public.workspace_members as m
    where m.workspace_id = brands.workspace_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin'))
);

-- A member can read only their own membership row and membership rows within
-- workspaces they already belong to. Membership creation remains server-only.
drop policy if exists members_read on public.workspace_members;
create policy members_read on public.workspace_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_workspace_member(workspace_id));

-- Keep workspace creation and membership writes behind the definer function.
revoke insert, update, delete on public.workspaces from anon, authenticated;
revoke insert, update, delete on public.workspace_members from anon, authenticated;
