-- RuffNeck Social Hub 1.0.0: verified, idempotent Instagram webhook event journal.
-- Apply after migrations 0001 through 0008. Does not enable messaging or comments.

create table if not exists public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  provider text not null check (provider = 'instagram'),
  event_kind text not null check (event_kind in ('change', 'messaging')),
  idempotency_key text not null unique check (length(idempotency_key) = 64),
  provider_event_at timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb not null check (pg_column_size(payload) <= 262144),
  constraint webhook_event_account_fk
    foreign key (social_account_id) references public.social_accounts(id) on delete cascade
);

create index if not exists provider_webhook_events_workspace_received_idx
  on public.provider_webhook_events (workspace_id, received_at desc);
create index if not exists provider_webhook_events_account_received_idx
  on public.provider_webhook_events (social_account_id, received_at desc);

alter table public.provider_webhook_events enable row level security;
revoke all on table public.provider_webhook_events from public, anon, authenticated;
grant select on table public.provider_webhook_events to authenticated;

create policy provider_webhook_events_workspace_read
on public.provider_webhook_events
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = provider_webhook_events.workspace_id
      and m.user_id = auth.uid()
  )
);

comment on table public.provider_webhook_events is
  'Raw, signature-verified Instagram webhook event journal. Payloads are visible only to members of the owning workspace; writes are server-only. This table is not a normalized inbox and does not imply messaging permissions.';
