-- v1.6.0: atomic, bounded bulk triage for the newest 25 matching comments.
-- This updates internal labels only; it never calls Meta or changes provider state.
create or replace function public.bulk_set_instagram_comment_triage_status(
  target_workspace_id uuid,
  target_status text,
  target_from_status text default 'new',
  target_limit integer default 25
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  changed_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if target_status not in ('new','reviewed','ignored') or target_from_status not in ('all','new','reviewed','ignored') then
    raise exception 'Invalid triage filter or status' using errcode = '22023';
  end if;
  if target_limit is null or target_limit < 1 or target_limit > 25 then
    raise exception 'Bulk triage limit must be between 1 and 25' using errcode = '22023';
  end if;
  if not public.is_workspace_member(target_workspace_id) or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = actor_id
      and m.role in ('owner','admin','manager','publisher','client_approver')
  ) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;

  with selected as (
    select c.id
    from public.instagram_comments c
    where c.workspace_id = target_workspace_id
      and (target_from_status = 'all' or c.triage_status = target_from_status)
      and c.triage_status <> target_status
    order by c.provider_created_at desc, c.id desc
    limit target_limit
    for update skip locked
  ), changed as (
    update public.instagram_comments c
    set triage_status = target_status, updated_at = pg_catalog.now()
    from selected s
    where c.id = s.id
    returning c.id
  )
  select pg_catalog.count(*)::integer into changed_count from changed;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    target_workspace_id, actor_id, 'instagram.comment.bulk_triage_updated',
    'instagram_comment_batch', null, 'success',
    pg_catalog.jsonb_build_object('from_status', target_from_status, 'to_status', target_status, 'changed_count', changed_count)
  );
  return changed_count;
end;
$$;

revoke all on function public.bulk_set_instagram_comment_triage_status(uuid, text, text, integer) from public, anon;
grant execute on function public.bulk_set_instagram_comment_triage_status(uuid, text, text, integer) to authenticated;
