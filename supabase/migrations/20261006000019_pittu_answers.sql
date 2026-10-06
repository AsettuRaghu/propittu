-- =====================================================================
-- Pittu guided setup: the customer's answers (docs/PITTU_PROPERTY_SETUP.md)
--
-- One row per property per question, saved as soon as it is answered.
-- Questions, wording and validation live in shared code (pittu.ts); the
-- API validates before writing. Customers read and answer their own;
-- staff read (Review list later).
-- Also: a "Khata" document type for the Khata certificate / e-Khata.
-- =====================================================================

create table public.property_answers (
  property_id  uuid        not null references public.properties (id) on delete cascade,
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  question_id  text        not null check (question_id ~ '^[a-z][a-z_]{1,40}$'),
  answer       text        not null check (answer ~ '^[a-z][a-z_]{0,40}$'),
  answered_by  uuid        references auth.users (id) on delete set null,
  answered_at  timestamptz not null default now(),
  primary key (property_id, question_id)
);
create index property_answers_account_idx on public.property_answers (account_id);

alter table public.property_answers enable row level security;
revoke all on public.property_answers from anon, authenticated;
grant select, insert, update on public.property_answers to authenticated;
create policy property_answers_select on public.property_answers for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy property_answers_write on public.property_answers for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and answered_by = (select auth.uid())
    and exists (select 1 from public.properties p where p.id = property_id and p.account_id = property_answers.account_id)
  );
create policy property_answers_update on public.property_answers for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id) and answered_by = (select auth.uid()));

create trigger property_answers_audit after insert or update or delete on public.property_answers
  for each row execute function public.audit_row_change();

-- Khata certificate / e-Khata as its own document type.
alter table public.property_documents drop constraint property_documents_document_type_check;
alter table public.property_documents add constraint property_documents_document_type_check
  check (document_type in ('sale_deed', 'registration', 'property_tax', 'khata', 'other'));
