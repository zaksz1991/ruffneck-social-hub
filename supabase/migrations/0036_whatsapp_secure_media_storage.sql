-- RuffNeck Social Hub v4.9.0 — quarantined and malware-scanned WhatsApp inbound media.
-- Apply once after 0035_whatsapp_sla_and_routing.sql.
-- Browser clients cannot write to or directly read the private media bucket.

alter table public.whatsapp_messages
  add constraint whatsapp_messages_media_link_unique
  unique (id, conversation_id, workspace_id, social_account_id);

create table if not exists public.whatsapp_media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  provider_media_id text not null check (provider_media_id ~ '^\d{5,30}$'),
  media_kind text not null check (media_kind in ('image','video','audio','document','sticker')),
  declared_mime_type text not null default 'application/octet-stream' check (length(declared_mime_type) between 3 and 160),
  provider_sha256 text check (provider_sha256 is null or provider_sha256 ~ '^[a-f0-9]{64}$'),
  original_filename text check (original_filename is null or length(original_filename) between 1 and 120),
  scan_status text not null default 'pending' check (scan_status in ('pending','processing','clean','infected','rejected','unavailable','expired')),
  processing_started_at timestamptz,
  actual_mime_type text,
  file_size bigint check (file_size is null or file_size between 1 and 16777216),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text,
  scan_engine text check (scan_engine is null or scan_engine = 'clamav'),
  scan_engine_version text check (scan_engine_version is null or length(scan_engine_version) <= 80),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[a-z0-9_]{1,64}$'),
  downloaded_at timestamptz,
  scanned_at timestamptz,
  retention_expires_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_media_asset_conversation_workspace_fk foreign key (conversation_id, workspace_id)
    references public.whatsapp_conversations(id, workspace_id) on delete cascade,
  constraint whatsapp_media_asset_message_relationship_fk foreign key (message_id, conversation_id, workspace_id, social_account_id)
    references public.whatsapp_messages(id, conversation_id, workspace_id, social_account_id) on delete cascade,
  constraint whatsapp_media_asset_clean_state_check check (
    scan_status <> 'clean' or (storage_path is not null and actual_mime_type is not null and file_size is not null
      and content_sha256 is not null and scan_engine = 'clamav' and scanned_at is not null
      and retention_expires_at is not null)
  ),
  constraint whatsapp_media_asset_processing_state_check check ((scan_status = 'processing') = (processing_started_at is not null))
);
create unique index if not exists whatsapp_media_assets_provider_unique
  on public.whatsapp_media_assets(social_account_id, provider_media_id);
create index if not exists whatsapp_media_assets_workspace_recent_idx
  on public.whatsapp_media_assets(workspace_id, conversation_id, created_at desc);
create index if not exists whatsapp_media_assets_retention_idx
  on public.whatsapp_media_assets(retention_expires_at) where scan_status = 'clean';

alter table public.whatsapp_media_assets enable row level security;
revoke all on public.whatsapp_media_assets from public, anon, authenticated;
grant select on public.whatsapp_media_assets to authenticated;
create policy whatsapp_media_assets_workspace_read on public.whatsapp_media_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Private bucket. Only the service-role server code accesses object bytes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16777216,
  array['image/jpeg','image/png','image/webp','video/mp4','video/3gpp','audio/aac','audio/mp4','audio/mpeg','audio/amr','audio/ogg','application/pdf','text/plain']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 16777216,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_whatsapp_media_asset(target_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  asset_row public.whatsapp_media_assets%rowtype;
  actor_role text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into asset_row from public.whatsapp_media_assets where id = target_asset_id for update;
  if not found then raise exception 'Media asset not found' using errcode = 'P0002'; end if;
  select m.role::text into actor_role from public.workspace_members m
    where m.workspace_id = asset_row.workspace_id and m.user_id = actor_id;
  if actor_role is null or actor_role not in ('owner','admin','manager','publisher') then
    raise exception 'Workspace role cannot retrieve WhatsApp media' using errcode = '42501';
  end if;
  if asset_row.scan_status not in ('pending','unavailable') and not (
    asset_row.scan_status = 'processing' and asset_row.processing_started_at < pg_catalog.now() - interval '15 minutes'
  ) then return false; end if;
  update public.whatsapp_media_assets set scan_status = 'processing', processing_started_at = pg_catalog.now(),
    safe_error_code = null, updated_at = pg_catalog.now()
    where id = target_asset_id;
  return true;
end;
$$;
revoke all on function public.claim_whatsapp_media_asset(uuid) from public, anon;
grant execute on function public.claim_whatsapp_media_asset(uuid) to authenticated;

comment on table public.whatsapp_media_assets is
  'WhatsApp inbound media metadata and private scanned-object references. Unscanned or infected media is never downloadable; stored clean objects expire after 30 days.';
