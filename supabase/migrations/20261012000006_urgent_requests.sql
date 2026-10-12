-- "Something's wrong at my property" (owner, 12 Oct 2026): urgent service
-- requests (a leak, a break-in, dumping…) are marked so the team sees them
-- first. Set by the server when an owner sends one from the app.
alter table public.service_requests add column urgent boolean not null default false;
create index service_requests_urgent_idx on public.service_requests (created_at desc) where urgent;

-- Nearby offices for a property (police, fire, hospital, local body),
-- looked up once from OpenStreetMap and kept (refreshed now and then).
create table public.property_local_contacts (
  property_id  uuid        primary key references public.properties (id) on delete cascade,
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  places       jsonb       not null default '[]',
  fetched_at   timestamptz not null default now()
);
alter table public.property_local_contacts enable row level security;
revoke all on public.property_local_contacts from anon, authenticated;
grant select on public.property_local_contacts to authenticated;
create policy property_local_contacts_read on public.property_local_contacts for select to authenticated
  using (public.is_account_member(account_id));
