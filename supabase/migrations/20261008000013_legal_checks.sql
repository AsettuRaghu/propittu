-- =====================================================================
-- Pittu Legal — EC checks (owner, 8 Oct 2026). One row per check of a
-- property: the findings from comparing Pittu Read's EC reading with the
-- sale deed (rules in the API), the team's review of each, and whether it
-- has been shared with the customer. Customers see a check only once it is
-- shared; staff see and edit all.
-- =====================================================================

create table public.legal_checks (
  id                uuid        primary key default gen_random_uuid(),
  account_id        uuid        not null references public.accounts (id) on delete cascade,
  property_id       uuid        not null references public.properties (id) on delete cascade,
  ec_document_id    uuid        not null references public.property_documents (id) on delete cascade,
  deed_document_id  uuid        references public.property_documents (id) on delete set null,
  ec_analysis_id    uuid        references public.document_analyses (id) on delete set null,
  rules_version     text        not null,
  status            text        not null default 'in_review'
                                check (status in ('in_review', 'ready', 'shared')),
  overall           text        check (overall is null or overall in ('green', 'amber', 'red')),
  findings          jsonb       not null default '[]',
  summary           text        check (summary is null or char_length(summary) <= 3000),
  ec_office         text,
  ec_period_from    date,
  ec_period_to      date,
  created_by        uuid        references auth.users (id) on delete set null,
  reviewed_by       uuid        references auth.users (id) on delete set null,
  shared_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index legal_checks_property_idx on public.legal_checks (property_id, created_at desc);
create index legal_checks_status_idx on public.legal_checks (status, updated_at desc);

create trigger legal_checks_set_updated_at before update on public.legal_checks
  for each row execute function public.set_updated_at();
create trigger legal_checks_audit after insert or update or delete on public.legal_checks
  for each row execute function public.audit_row_change();

alter table public.legal_checks enable row level security;
revoke all on public.legal_checks from anon, authenticated;
grant select, insert, update on public.legal_checks to authenticated;
create policy legal_checks_read on public.legal_checks for select to authenticated
  using (public.is_staff() or (status = 'shared' and public.is_account_member(account_id)));
create policy legal_checks_staff_add on public.legal_checks for insert to authenticated
  with check (public.is_staff());
create policy legal_checks_staff_update on public.legal_checks for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
