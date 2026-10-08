-- =====================================================================
-- Service categories are data (owner, 8 Oct 2026): the team adds, renames
-- and orders them in the Backoffice portal. Services point to a category
-- by code; the three categories used so far are seeded unchanged.
-- =====================================================================

create table public.service_categories (
  code        text        primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text        not null check (char_length(trim(name)) between 1 and 60),
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.service_categories (code, name, sort_order) values
  ('property_government', 'Property & Government', 10),
  ('property_care', 'Property Care', 20),
  ('other', 'Other', 30);

alter table public.services drop constraint services_category_check;
alter table public.services
  add constraint services_category_fkey foreign key (category)
  references public.service_categories (code) on update cascade;

alter table public.service_categories enable row level security;
revoke all on public.service_categories from anon, authenticated;
grant select, insert, update, delete on public.service_categories to authenticated;
create policy service_categories_select on public.service_categories for select to authenticated using (true);
create policy service_categories_staff_insert on public.service_categories for insert to authenticated
  with check (public.is_staff());
create policy service_categories_staff_update on public.service_categories for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Only an unused category can be deleted (the foreign key refuses otherwise).
create policy service_categories_staff_delete on public.service_categories for delete to authenticated
  using (public.is_staff());
