-- RuffNeck Social Hub: Content Studio and approval workflow.
-- Apply after 0001_core.sql, 0002_secure_workspace_onboarding.sql,
-- and 0003_multi_workspace_brand_management.sql.

alter table public.content_items
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists last_reviewed_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_items_workspace_id_id_key'
      and conrelid = 'public.content_items'::regclass
  ) then
    alter table public.content_items
      add constraint content_items_workspace_id_id_key unique (workspace_id, id);
  end if;
end;
$$;

create table if not exists public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint content_reviews_content_workspace_fk
    foreign key (workspace_id, content_id)
    references public.content_items(workspace_id, id) on delete cascade
);

create index if not exists content_items_workspace_status_updated_idx
  on public.content_items(workspace_id, status, updated_at desc);
create index if not exists content_reviews_workspace_created_idx
  on public.content_reviews(workspace_id, created_at desc);
create index if not exists content_reviews_content_created_idx
  on public.content_reviews(content_id, created_at desc);

alter table public.content_reviews enable row level security;
drop policy if exists content_reviews_member_read on public.content_reviews;
create policy content_reviews_member_read
  on public.content_reviews for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Writes now go through role-checked functions. This prevents clients from
-- changing status fields or manufacturing approval records in the browser.
drop policy if exists content_insert on public.content_items;
drop policy if exists content_update on public.content_items;
revoke insert, update, delete on public.content_items from anon, authenticated;
revoke insert, update, delete on public.content_reviews from anon, authenticated;

create or replace function public.create_content_draft(
  target_workspace_id uuid,
  target_brand_id uuid,
  content_title text,
  content_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  member_role text;
  clean_title text := btrim(coalesce(content_title, ''));
  clean_body text := btrim(coalesce(content_body, ''));
  new_content_id uuid;
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

  if char_length(clean_title) < 2 or char_length(clean_title) > 160 then
    raise exception 'Title must contain 2 to 160 characters' using errcode = '22023';
  end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 5000 then
    raise exception 'Content must contain 1 to 5000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.brands b
    where b.id = target_brand_id and b.workspace_id = target_workspace_id
  ) then
    raise exception 'Brand does not belong to this workspace' using errcode = '22023';
  end if;

  insert into public.content_items(workspace_id, brand_id, created_by, title, body, status)
  values (target_workspace_id, target_brand_id, current_user_id, clean_title, clean_body, 'draft')
  returning id into new_content_id;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome)
  values (target_workspace_id, current_user_id, 'content.draft_created', 'content', new_content_id::text, 'success');

  return new_content_id;
end;
$$;

create or replace function public.update_content_draft(
  target_content_id uuid,
  content_title text,
  content_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  content_row public.content_items%rowtype;
  member_role text;
  clean_title text := btrim(coalesce(content_title, ''));
  clean_body text := btrim(coalesce(content_body, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(clean_title) < 2 or char_length(clean_title) > 160 then
    raise exception 'Title must contain 2 to 160 characters' using errcode = '22023';
  end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 5000 then
    raise exception 'Content must contain 1 to 5000 characters' using errcode = '22023';
  end if;

  select * into content_row
  from public.content_items c
  where c.id = target_content_id
  for update;
  if not found then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = content_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or not (
    content_row.created_by = current_user_id
    or member_role in ('owner', 'admin', 'manager', 'publisher')
  ) then
    raise exception 'You do not have permission to edit this content' using errcode = '42501';
  end if;
  if content_row.status <> 'draft' then
    raise exception 'Only draft content can be edited' using errcode = '22023';
  end if;

  update public.content_items
  set title = clean_title, body = clean_body, updated_at = now()
  where id = target_content_id;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome)
  values (content_row.workspace_id, current_user_id, 'content.draft_updated', 'content', target_content_id::text, 'success');
end;
$$;

create or replace function public.submit_content_for_review(target_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  content_row public.content_items%rowtype;
  member_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into content_row
  from public.content_items c
  where c.id = target_content_id
  for update;
  if not found then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = content_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or not (
    content_row.created_by = current_user_id
    or member_role in ('owner', 'admin', 'manager', 'publisher')
  ) then
    raise exception 'You do not have permission to submit this content' using errcode = '42501';
  end if;
  if content_row.status <> 'draft' then
    raise exception 'Only draft content can be submitted for review' using errcode = '22023';
  end if;
  if char_length(btrim(content_row.title)) < 2 or char_length(btrim(content_row.body)) < 1 then
    raise exception 'A title and body are required before review' using errcode = '22023';
  end if;

  update public.content_items
  set status = 'in_review', updated_at = now()
  where id = target_content_id;

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome)
  values (content_row.workspace_id, current_user_id, 'content.submitted_for_review', 'content', target_content_id::text, 'success');
end;
$$;

create or replace function public.review_content_item(
  target_content_id uuid,
  review_decision text,
  review_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  content_row public.content_items%rowtype;
  member_role text;
  clean_note text := btrim(coalesce(review_note, ''));
  next_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if review_decision is null or review_decision not in ('approved', 'changes_requested') then
    raise exception 'Unsupported review decision' using errcode = '22023';
  end if;
  if char_length(clean_note) > 1000 then
    raise exception 'Review note cannot exceed 1000 characters' using errcode = '22023';
  end if;

  select * into content_row
  from public.content_items c
  where c.id = target_content_id
  for update;
  if not found then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;

  select m.role::text into member_role
  from public.workspace_members m
  where m.workspace_id = content_row.workspace_id
    and m.user_id = current_user_id;
  if member_role is null or member_role not in ('owner', 'admin', 'manager', 'client_approver') then
    raise exception 'Your role cannot review content' using errcode = '42501';
  end if;
  if content_row.status <> 'in_review' then
    raise exception 'Only content awaiting review can be reviewed' using errcode = '22023';
  end if;

  next_status := case when review_decision = 'approved' then 'approved' else 'draft' end;
  update public.content_items
  set status = next_status,
      last_reviewed_at = now(),
      last_reviewed_by = current_user_id,
      updated_at = now()
  where id = target_content_id;

  insert into public.content_reviews(workspace_id, content_id, reviewer_user_id, decision, note)
  values (content_row.workspace_id, target_content_id, current_user_id, review_decision, clean_note);

  insert into public.audit_events(workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata)
  values (
    content_row.workspace_id,
    current_user_id,
    case when review_decision = 'approved' then 'content.approved' else 'content.changes_requested' end,
    'content',
    target_content_id::text,
    'success',
    jsonb_build_object('decision', review_decision)
  );
end;
$$;

revoke all on function public.create_content_draft(uuid, uuid, text, text) from public, anon;
revoke all on function public.update_content_draft(uuid, text, text) from public, anon;
revoke all on function public.submit_content_for_review(uuid) from public, anon;
revoke all on function public.review_content_item(uuid, text, text) from public, anon;
grant execute on function public.create_content_draft(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_content_draft(uuid, text, text) to authenticated;
grant execute on function public.submit_content_for_review(uuid) to authenticated;
grant execute on function public.review_content_item(uuid, text, text) to authenticated;
