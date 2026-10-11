-- =====================================================================
-- Send documents to Pittu by email (owner, 11 Oct 2026). Each account has
-- a private inbox code (part of its address, e.g. …+k7x2m9@inbound…).
-- Mail arrives at our webhook; PDFs / photos are stored in the account's
-- folder and wait in inbox_documents until filed under a property (filed at
-- once when the account has a single property). Written by the server.
-- =====================================================================

create table public.account_inboxes (
  account_id  uuid        primary key references public.accounts (id) on delete cascade,
  token       text        not null unique check (token ~ '^[a-z0-9]{8,16}$'),
  created_at  timestamptz not null default now()
);

create table public.inbox_documents (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  file_name     text        not null check (char_length(file_name) between 1 and 255),
  mime_type     text        not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size     integer     not null check (file_size > 0 and file_size <= 10485760),
  storage_path  text        not null,
  from_email    text        check (from_email is null or char_length(from_email) <= 200),
  subject       text        check (subject is null or char_length(subject) <= 300),
  -- Pittu's guess (from the name and subject; later from reading it).
  guess_type    text,
  guess_property_id uuid    references public.properties (id) on delete set null,
  filed_document_id uuid    references public.property_documents (id) on delete set null,
  received_at   timestamptz not null default now()
);
create index inbox_documents_account_idx on public.inbox_documents (account_id, received_at desc);

alter table public.account_inboxes enable row level security;
alter table public.inbox_documents enable row level security;
revoke all on public.account_inboxes, public.inbox_documents from anon, authenticated;
grant select on public.account_inboxes, public.inbox_documents to authenticated;
grant delete on public.inbox_documents to authenticated;
create policy account_inboxes_read on public.account_inboxes for select to authenticated
  using (public.is_account_member(account_id));
create policy inbox_documents_read on public.inbox_documents for select to authenticated
  using (public.is_account_member(account_id));
create policy inbox_documents_remove on public.inbox_documents for delete to authenticated
  using (public.is_account_member(account_id) and filed_document_id is null);
