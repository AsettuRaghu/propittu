-- =====================================================================
-- Ask Pittu (owner, 11 Oct 2026): owners ask questions about their
-- property; Pittu answers from their own property file and hands over to
-- the team when it can't. The conversation is kept for the owner (and the
-- team, for quality); written by the server only.
-- =====================================================================

create table public.ask_messages (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  property_id  uuid        references public.properties (id) on delete cascade,
  role         text        not null check (role in ('owner', 'pittu')),
  text         text        not null check (char_length(text) between 1 and 4000),
  -- Pittu's extras: where the answer came from, a suggested service, a team handover.
  meta         jsonb       not null default '{}',
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index ask_messages_thread_idx on public.ask_messages (account_id, property_id, created_at);

alter table public.ask_messages enable row level security;
revoke all on public.ask_messages from anon, authenticated;
grant select on public.ask_messages to authenticated;
create policy ask_messages_read on public.ask_messages for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));
