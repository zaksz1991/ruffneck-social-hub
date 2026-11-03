-- RuffNeck Social Hub v6.2.0 — agency-managed client accounts.
-- Apply after 0044_subscription_entitlement_enforcement.sql.
-- Client records are agency workspace CRM records. This migration does not grant
-- the agency access to a separately owned client's workspace or social accounts.

create table if not exists public.agency_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_name text not null check (char_length(btrim(client_name)) between 2 and 140),
  contact_name text not null default '' check (char_length(contact_name) <= 120),
  contact_email text not null default '' check (char_length(contact_email) <= 254),
  contact_phone text not null default '' check (char_length(contact_phone) <= 40),
  website text not null default '' check (char_length(website) <= 255),
  status text not null default 'prospect' check (status in ('prospect','onboarding','active','paused','closed')),
  service_level text not null default 'standard' check (service_level in ('basic','standard','premium')),
  monthly_retainer numeric(12,2) check (monthly_retainer is null or monthly_retainer between 0 and 1000000000),
  retainer_currency text not null default 'NGN' check (retainer_currency ~ '^[A-Z]{3}$'),
  start_date date,
  next_review_date date,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (start_date is null or next_review_date is null or next_review_date >= start_date),
  check (contact_email = '' or contact_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
  check (website = '' or (left(lower(website), 8) = 'https://' and position('@' in website) = 0))
);

create index if not exists agency_clients_workspace_status_created_idx
  on public.agency_clients(workspace_id, status, created_at desc);
create index if not exists agency_clients_workspace_name_idx
  on public.agency_clients(workspace_id, lower(client_name));

create table if not exists public.agency_client_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  note_text text not null check (char_length(btrim(note_text)) between 2 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id)
    references public.agency_clients(workspace_id, id) on delete cascade
);
create index if not exists agency_client_notes_client_created_idx
  on public.agency_client_notes(workspace_id, client_id, created_at desc);

alter table public.agency_clients enable row level security;
alter table public.agency_client_notes enable row level security;

revoke all on table public.agency_clients from public, anon, authenticated;
revoke all on table public.agency_client_notes from public, anon, authenticated;
grant select on table public.agency_clients to authenticated;
grant select on table public.agency_client_notes to authenticated;

drop policy if exists agency_clients_manager_read on public.agency_clients;
create policy agency_clients_manager_read on public.agency_clients
for select to authenticated using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = agency_clients.workspace_id
      and m.user_id = auth.uid()
      and m.role::text in ('owner','admin','manager')
  )
);

drop policy if exists agency_client_notes_manager_read on public.agency_client_notes;
create policy agency_client_notes_manager_read on public.agency_client_notes
for select to authenticated using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = agency_client_notes.workspace_id
      and m.user_id = auth.uid()
      and m.role::text in ('owner','admin','manager')
  )
);

create or replace function public.create_agency_client(
  p_workspace_id uuid,
  p_client_name text,
  p_contact_name text default '',
  p_contact_email text default '',
  p_contact_phone text default '',
  p_website text default '',
  p_status text default 'prospect',
  p_service_level text default 'standard',
  p_monthly_retainer numeric default null,
  p_retainer_currency text default 'NGN',
  p_start_date date default null,
  p_next_review_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  effective_plan public.billing_plans%rowtype;
  current_clients integer;
  new_client_id uuid;
  clean_name text := pg_catalog.btrim(coalesce(p_client_name, ''));
  clean_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_contact_email, '')));
  clean_website text := pg_catalog.btrim(coalesce(p_website, ''));
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_workspace_id is null or clean_name is null or pg_catalog.char_length(clean_name) not between 2 and 140 then
    raise exception 'A client name between 2 and 140 characters is required' using errcode = '22023';
  end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then
    raise exception 'Only workspace owners, admins and managers can manage agency clients' using errcode = '42501';
  end if;
  if p_status not in ('prospect','onboarding','active','paused','closed') then raise exception 'Invalid client status' using errcode = '22023'; end if;
  if p_service_level not in ('basic','standard','premium') then raise exception 'Invalid service level' using errcode = '22023'; end if;
  if p_retainer_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid retainer currency' using errcode = '22023'; end if;
  if p_monthly_retainer is not null and p_monthly_retainer not between 0 and 1000000000 then raise exception 'Invalid monthly retainer' using errcode = '22023'; end if;
  if clean_email <> '' and clean_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Invalid contact email' using errcode = '22023'; end if;
  if coalesce(p_contact_phone, '') <> '' and p_contact_phone !~ '^[+0-9().\- ]{5,40}$' then raise exception 'Invalid contact phone' using errcode = '22023'; end if;
  if clean_website <> '' and (left(lower(clean_website), 8) <> 'https://' or position('@' in clean_website) > 0) then raise exception 'Website must be a public HTTPS address' using errcode = '22023'; end if;
  if p_start_date is not null and p_next_review_date is not null and p_next_review_date < p_start_date then raise exception 'Review date cannot be earlier than start date' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 6202));
  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then raise exception 'Workspace does not exist' using errcode = '22023'; end if;
  select * into effective_plan from public.get_effective_workspace_billing_plan(p_workspace_id);
  if not found then raise exception 'Workspace billing plan is unavailable' using errcode = '55000'; end if;
  select pg_catalog.count(*)::integer into current_clients
  from public.agency_clients c where c.workspace_id = p_workspace_id and c.status <> 'closed';
  if p_status <> 'closed' and current_clients >= effective_plan.max_client_workspaces then
    raise exception using errcode = 'P0001', message = pg_catalog.format('subscription_client_limit:%s:%s', current_clients, effective_plan.max_client_workspaces);
  end if;

  insert into public.agency_clients (
    workspace_id, client_name, contact_name, contact_email, contact_phone, website,
    status, service_level, monthly_retainer, retainer_currency, start_date, next_review_date,
    created_by, updated_by
  ) values (
    p_workspace_id, clean_name, pg_catalog.left(pg_catalog.btrim(coalesce(p_contact_name,'')),120),
    clean_email, pg_catalog.left(pg_catalog.btrim(coalesce(p_contact_phone,'')),40), clean_website,
    p_status, p_service_level, p_monthly_retainer, p_retainer_currency, p_start_date, p_next_review_date,
    actor_id, actor_id
  ) returning id into new_client_id;
  return new_client_id;
end;
$$;

create or replace function public.update_agency_client_profile(
  p_workspace_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_contact_name text default '',
  p_contact_email text default '',
  p_contact_phone text default '',
  p_website text default '',
  p_service_level text default 'standard',
  p_monthly_retainer numeric default null,
  p_retainer_currency text default 'NGN',
  p_start_date date default null,
  p_next_review_date date default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  clean_name text := pg_catalog.btrim(coalesce(p_client_name, ''));
  clean_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_contact_email, '')));
  clean_website text := pg_catalog.btrim(coalesce(p_website, ''));
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into actor_role from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then raise exception 'Client management role required' using errcode = '42501'; end if;
  if p_client_id is null or clean_name is null or pg_catalog.char_length(clean_name) not between 2 and 140 then raise exception 'Invalid client name' using errcode = '22023'; end if;
  if p_service_level not in ('basic','standard','premium') or p_retainer_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid service settings' using errcode = '22023'; end if;
  if p_monthly_retainer is not null and p_monthly_retainer not between 0 and 1000000000 then raise exception 'Invalid monthly retainer' using errcode = '22023'; end if;
  if clean_email <> '' and clean_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Invalid contact email' using errcode = '22023'; end if;
  if coalesce(p_contact_phone, '') <> '' and p_contact_phone !~ '^[+0-9().\- ]{5,40}$' then raise exception 'Invalid contact phone' using errcode = '22023'; end if;
  if clean_website <> '' and (left(lower(clean_website),8) <> 'https://' or position('@' in clean_website) > 0) then raise exception 'Website must be a public HTTPS address' using errcode = '22023'; end if;
  if p_start_date is not null and p_next_review_date is not null and p_next_review_date < p_start_date then raise exception 'Review date cannot be earlier than start date' using errcode = '22023'; end if;
  update public.agency_clients set
    client_name = clean_name,
    contact_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_contact_name,'')),120),
    contact_email = clean_email,
    contact_phone = pg_catalog.left(pg_catalog.btrim(coalesce(p_contact_phone,'')),40),
    website = clean_website,
    service_level = p_service_level,
    monthly_retainer = p_monthly_retainer,
    retainer_currency = p_retainer_currency,
    start_date = p_start_date,
    next_review_date = p_next_review_date,
    updated_by = actor_id,
    updated_at = pg_catalog.now()
  where id = p_client_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Client record not found' using errcode = 'P0002'; end if;
  return true;
end;
$$;

create or replace function public.update_agency_client_status(
  p_workspace_id uuid,
  p_client_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  effective_plan public.billing_plans%rowtype;
  current_clients integer;
  old_status text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_status not in ('prospect','onboarding','active','paused','closed') then raise exception 'Invalid client status' using errcode = '22023'; end if;
  select m.role::text into actor_role from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then raise exception 'Client management role required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 6202));
  select c.status into old_status from public.agency_clients c
  where c.id = p_client_id and c.workspace_id = p_workspace_id for update;
  if not found then raise exception 'Client record not found' using errcode = 'P0002'; end if;
  if old_status = 'closed' and p_status <> 'closed' then
    perform 1 from public.workspaces w where w.id = p_workspace_id for update;
    select * into effective_plan from public.get_effective_workspace_billing_plan(p_workspace_id);
    select pg_catalog.count(*)::integer into current_clients from public.agency_clients c
      where c.workspace_id = p_workspace_id and c.status <> 'closed';
    if current_clients >= effective_plan.max_client_workspaces then
      raise exception using errcode = 'P0001', message = pg_catalog.format('subscription_client_limit:%s:%s', current_clients, effective_plan.max_client_workspaces);
    end if;
  end if;
  update public.agency_clients set status = p_status, updated_by = actor_id, updated_at = pg_catalog.now()
  where id = p_client_id and workspace_id = p_workspace_id;
  return true;
end;
$$;

create or replace function public.add_agency_client_note(
  p_workspace_id uuid,
  p_client_id uuid,
  p_note_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  note_id uuid;
  clean_note text := pg_catalog.btrim(coalesce(p_note_text,''));
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into actor_role from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then raise exception 'Client management role required' using errcode = '42501'; end if;
  if p_client_id is null or pg_catalog.char_length(clean_note) not between 2 and 2000 then raise exception 'Note must contain between 2 and 2,000 characters' using errcode = '22023'; end if;
  if not exists (select 1 from public.agency_clients c where c.id = p_client_id and c.workspace_id = p_workspace_id) then
    raise exception 'Client record not found' using errcode = 'P0002';
  end if;
  insert into public.agency_client_notes(workspace_id, client_id, note_text, created_by)
  values (p_workspace_id, p_client_id, clean_note, actor_id) returning id into note_id;
  return note_id;
end;
$$;

create or replace function public.get_agency_client_usage_snapshot(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  effective_plan public.billing_plans%rowtype;
  active_clients integer;
  closed_clients integer;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select m.role::text into actor_role from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager') then raise exception 'Client management role required' using errcode = '42501'; end if;
  select * into effective_plan from public.get_effective_workspace_billing_plan(p_workspace_id);
  select pg_catalog.count(*) filter (where c.status <> 'closed')::integer,
         pg_catalog.count(*) filter (where c.status = 'closed')::integer
    into active_clients, closed_clients
  from public.agency_clients c where c.workspace_id = p_workspace_id;
  return pg_catalog.jsonb_build_object(
    'used', coalesce(active_clients,0),
    'limit', effective_plan.max_client_workspaces,
    'remaining', greatest(0, effective_plan.max_client_workspaces - coalesce(active_clients,0)),
    'closed', coalesce(closed_clients,0),
    'plan_code', effective_plan.code
  );
end;
$$;

revoke all on function public.create_agency_client(uuid,text,text,text,text,text,text,text,numeric,text,date,date) from public, anon, authenticated;
revoke all on function public.update_agency_client_profile(uuid,uuid,text,text,text,text,text,text,numeric,text,date,date) from public, anon, authenticated;
revoke all on function public.update_agency_client_status(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.add_agency_client_note(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.get_agency_client_usage_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.create_agency_client(uuid,text,text,text,text,text,text,text,numeric,text,date,date) to authenticated;
grant execute on function public.update_agency_client_profile(uuid,uuid,text,text,text,text,text,text,numeric,text,date,date) to authenticated;
grant execute on function public.update_agency_client_status(uuid,uuid,text) to authenticated;
grant execute on function public.add_agency_client_note(uuid,uuid,text) to authenticated;
grant execute on function public.get_agency_client_usage_snapshot(uuid) to authenticated;

comment on table public.agency_clients is 'Agency workspace client directory. These are managed client records, not delegated access to the client own workspace.';
comment on table public.agency_client_notes is 'Append-only internal agency notes for a managed client. Visible only to agency owners, admins and managers.';
comment on function public.get_agency_client_usage_snapshot(uuid) is 'Returns the authenticated workspace manager a safe active-client count and plan allowance.';
