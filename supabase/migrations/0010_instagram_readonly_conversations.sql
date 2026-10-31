-- v1.3.0: normalized, read-only Instagram text conversations.
-- Requires Meta messaging webhook permissions and delivery; does not enable replies.
create table if not exists public.instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  participant_provider_id text not null check (length(participant_provider_id) between 1 and 128),
  last_message_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, participant_provider_id),
  unique (id, workspace_id)
);
create index if not exists instagram_conversations_workspace_recent_idx
  on public.instagram_conversations(workspace_id, last_message_at desc);

create table if not exists public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  provider_message_id text not null check (length(provider_message_id) between 1 and 255),
  direction text not null check (direction in ('inbound','outbound')),
  message_text text not null check (length(message_text) between 1 and 10000),
  provider_sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint instagram_messages_conversation_workspace_fk
    foreign key (conversation_id, workspace_id)
    references public.instagram_conversations(id, workspace_id) on delete cascade,
  unique (social_account_id, provider_message_id)
);
create index if not exists instagram_messages_conversation_time_idx
  on public.instagram_messages(conversation_id, provider_sent_at asc);

alter table public.instagram_conversations enable row level security;
alter table public.instagram_messages enable row level security;
revoke all on public.instagram_conversations, public.instagram_messages from public, anon, authenticated;
grant select on public.instagram_conversations, public.instagram_messages to authenticated;
create policy instagram_conversations_workspace_read on public.instagram_conversations
for select to authenticated using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = instagram_conversations.workspace_id and m.user_id = auth.uid()
));
create policy instagram_messages_workspace_read on public.instagram_messages
for select to authenticated using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = instagram_messages.workspace_id and m.user_id = auth.uid()
));
comment on table public.instagram_conversations is 'Normalized read-only Instagram text conversations. Replies are not supported.';
comment on table public.instagram_messages is 'Text-only normalized messages. Attachments and reply actions are not supported.';
