-- =====================================================================
-- Pittu Value learns from owners (owner, 11 Oct 2026): a sale an owner
-- knows of in their project ("a flat like ours sold for ₹2.7 Cr in 2024")
-- is better evidence than asking prices online. With the owner's OK it
-- helps every owner in the same project — anonymously (no name, no flat
-- number). value_estimates keeps all prices Pittu found (raw_comparables)
-- so a range can be worked out again without a new web search.
-- =====================================================================

create table public.known_sales (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  property_id   uuid        not null references public.properties (id) on delete cascade,
  project_key   text        check (project_key is null or project_key ~ '^[a-z0-9]{3,120}$'),
  price_inr     bigint      not null check (price_inr between 100000 and 10000000000),
  area_sqft     integer     not null check (area_sqft between 100 and 100000),
  area_basis    text        not null check (area_basis in ('super_built_up', 'built_up', 'carpet', 'plot')),
  sold_on       date        not null,
  note          text        check (note is null or char_length(note) <= 300),
  share_in_project boolean  not null default true,
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index known_sales_project_idx on public.known_sales (project_key) where share_in_project;

alter table public.known_sales enable row level security;
revoke all on public.known_sales from anon, authenticated;
grant select, insert, delete on public.known_sales to authenticated;
create policy known_sales_read on public.known_sales for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));
create policy known_sales_add on public.known_sales for insert to authenticated
  with check (public.is_account_member(account_id) and created_by = (select auth.uid())
              and exists (select 1 from public.properties p
                          where p.id = property_id and p.account_id = known_sales.account_id));
create policy known_sales_remove on public.known_sales for delete to authenticated
  using (public.is_account_member(account_id));

alter table public.value_estimates add column raw_comparables jsonb not null default '[]';
alter table public.value_estimates add column sources jsonb not null default '[]';
