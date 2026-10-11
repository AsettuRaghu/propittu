-- =====================================================================
-- Owners hear about disputes before any record shows them (owner, 11 Oct
-- 2026): from the builder, a call, a notice.
--  * dispute_reports — an owner tells us what they heard; the team looks
--    into it (eCourts, the builder) and replies.
--  * project_disputes — a dispute the team has confirmed for a whole
--    project (or layout); every Propittu owner whose deed names that
--    project sees it on their property, with what it means and what to do.
-- Owners write reports through the API; project alerts are written by staff
-- and served to owners by the API (matched on the deed's project name).
-- =====================================================================

create table public.dispute_reports (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  property_id  uuid        not null references public.properties (id) on delete cascade,
  source       text        not null check (source in ('builder', 'call', 'notice', 'neighbours', 'other')),
  details      text        not null check (char_length(trim(details)) between 5 and 2000),
  status       text        not null default 'open'
                           check (status in ('open', 'looking', 'confirmed', 'not_found')),
  staff_note   text        check (staff_note is null or char_length(staff_note) <= 2000),
  project_dispute_id uuid,
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index dispute_reports_status_idx on public.dispute_reports (status, created_at desc);
create trigger dispute_reports_set_updated_at
  before update on public.dispute_reports
  for each row execute function public.set_updated_at();

create table public.project_disputes (
  id            uuid        primary key default gen_random_uuid(),
  -- Normalised project name ("nccurbanmayfair"); matched against deeds.
  project_key   text        not null check (project_key ~ '^[a-z0-9]{3,120}$'),
  project_name  text        not null check (char_length(trim(project_name)) between 2 and 200),
  -- Optional: only properties in this district (two projects can share a name).
  district      text,
  summary       text        not null check (char_length(trim(summary)) between 5 and 1000),
  what_it_means text        check (what_it_means is null or char_length(what_it_means) <= 2000),
  what_to_do    text        check (what_to_do is null or char_length(what_to_do) <= 2000),
  source_url    text        check (source_url is null or source_url ~ '^https?://'),
  status        text        not null default 'active' check (status in ('active', 'resolved')),
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index project_disputes_key_idx on public.project_disputes (project_key, status);
create trigger project_disputes_set_updated_at
  before update on public.project_disputes
  for each row execute function public.set_updated_at();

alter table public.dispute_reports
  add constraint dispute_reports_project_fkey foreign key (project_dispute_id)
  references public.project_disputes (id) on delete set null;

alter table public.dispute_reports enable row level security;
alter table public.project_disputes enable row level security;
revoke all on public.dispute_reports, public.project_disputes from anon, authenticated;
grant select, insert, update on public.dispute_reports to authenticated;
grant select, insert, update on public.project_disputes to authenticated;

create policy dispute_reports_read on public.dispute_reports for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));
create policy dispute_reports_add on public.dispute_reports for insert to authenticated
  with check (public.is_account_member(account_id) and created_by = (select auth.uid())
              and exists (select 1 from public.properties p
                          where p.id = property_id and p.account_id = dispute_reports.account_id));
create policy dispute_reports_staff_update on public.dispute_reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Staff only; owners get the ones for their project through the API.
create policy project_disputes_staff on public.project_disputes for select to authenticated
  using (public.is_staff());
create policy project_disputes_staff_add on public.project_disputes for insert to authenticated
  with check (public.is_staff());
create policy project_disputes_staff_update on public.project_disputes for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
