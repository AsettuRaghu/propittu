-- =====================================================================
-- Same person, different name (owner, 11 Oct 2026). Records spell one
-- person many ways (initials, transliteration, a married name). When Pittu
-- isn't sure, the owner confirms once; the link is remembered for every
-- document in the account. 'not_same' stops Pittu asking again.
-- Plus a service to fix it on the records: name correction.
-- =====================================================================

create table public.name_links (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts (id) on delete cascade,
  deed_name   text        not null check (char_length(trim(deed_name)) between 1 and 200),
  other_name  text        not null check (char_length(trim(other_name)) between 1 and 200),
  reason      text        not null check (reason in ('married_name', 'spelling', 'initials', 'other', 'not_same')),
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (account_id, deed_name, other_name)
);

alter table public.name_links enable row level security;
revoke all on public.name_links from anon, authenticated;
grant select, insert, update, delete on public.name_links to authenticated;
create policy name_links_read on public.name_links for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));
create policy name_links_add on public.name_links for insert to authenticated
  with check (public.is_account_member(account_id) and created_by = (select auth.uid()));
create policy name_links_change on public.name_links for update to authenticated
  using (public.is_account_member(account_id)) with check (public.is_account_member(account_id));
create policy name_links_remove on public.name_links for delete to authenticated
  using (public.is_account_member(account_id));

insert into public.services
  (code, name, category, description, sort_order, fulfilment, reach, includes, turnaround, expected_days)
values
  ('name_correction', 'Name Correction Across Records', 'property_government',
   'When your name differs between the deed, Khata, tax and land records (initials, spelling, a married name), we put it right so a sale or loan isn''t held up.',
   35, 'assistance', 'state',
   array['A "one and the same person" affidavit', 'Gazette notification if it''s needed',
         'Khata, tax and land records updated to match'],
   'Usually 2–6 weeks', 30)
on conflict (code) do nothing;

insert into public.service_coverage (service_id, kind, value)
select n.id, c.kind, c.value
from public.services n
join public.services o on o.code = 'document_verification'
join public.service_coverage c on c.service_id = o.id
where n.code = 'name_correction'
on conflict do nothing;
