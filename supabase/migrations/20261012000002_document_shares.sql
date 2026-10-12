-- =====================================================================
-- Share documents safely (owner, 12 Oct 2026): an owner picks documents
-- and gets a private link that expires (1–30 days) and can be revoked; the
-- recipient opens a simple page and downloads them (each download link
-- lasts minutes). Every opening and download is logged for the owner.
-- =====================================================================

create table public.document_shares (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  property_id   uuid        not null references public.properties (id) on delete cascade,
  token         text        not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  label         text        not null check (char_length(trim(label)) between 1 and 80),
  document_ids  uuid[]      not null check (cardinality(document_ids) between 1 and 30),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index document_shares_property_idx on public.document_shares (property_id, created_at desc);

create table public.document_share_views (
  id           uuid        primary key default gen_random_uuid(),
  share_id     uuid        not null references public.document_shares (id) on delete cascade,
  kind         text        not null check (kind in ('opened', 'downloaded')),
  document_id  uuid,
  -- No IP addresses kept: just a coarse device line.
  device       text        check (device is null or char_length(device) <= 120),
  created_at   timestamptz not null default now()
);
create index document_share_views_share_idx on public.document_share_views (share_id, created_at desc);

alter table public.document_shares enable row level security;
alter table public.document_share_views enable row level security;
revoke all on public.document_shares, public.document_share_views from anon, authenticated;
grant select, insert, update (revoked_at) on public.document_shares to authenticated;
grant select on public.document_share_views to authenticated;
create policy document_shares_own on public.document_shares for select to authenticated
  using (public.is_account_member(account_id));
create policy document_shares_add on public.document_shares for insert to authenticated
  with check (public.is_account_member(account_id) and created_by = (select auth.uid())
              and exists (select 1 from public.properties p
                          where p.id = property_id and p.account_id = document_shares.account_id));
create policy document_shares_revoke on public.document_shares for update to authenticated
  using (public.is_account_member(account_id)) with check (public.is_account_member(account_id));
create policy document_share_views_own on public.document_share_views for select to authenticated
  using (exists (select 1 from public.document_shares s
                 where s.id = share_id and public.is_account_member(s.account_id)));
