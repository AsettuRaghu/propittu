-- =====================================================================
-- Pittu Review list (Backoffice → Pittu)
--
-- One row per property that deserves a human look after Pittu's setup:
-- the deed name differs from the account, the customer is family / manages
-- it, the property type was changed, or unsure values were accepted. The
-- reasons are fixed rules in shared code (reviewReasons in pittu.ts); the
-- API keeps this row current with the server key after setup and after
-- each answer. A reviewed row reopens only when a NEW reason appears.
--
-- Customers never see this table. Staff read it and mark it reviewed
-- (the API checks the documents.review permission).
-- =====================================================================

create table public.property_reviews (
  property_id  uuid        primary key references public.properties (id) on delete cascade,
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  reasons      text[]      not null default '{}'
                           check (reasons <@ array['name_mismatch', 'not_owner', 'type_changed', 'low_confidence']::text[]),
  status       text        not null default 'open' check (status in ('open', 'done')),
  note         text        check (note is null or char_length(note) <= 500),
  reviewed_by  uuid        references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index property_reviews_status_idx on public.property_reviews (status, updated_at desc);

create trigger property_reviews_set_updated_at
  before update on public.property_reviews
  for each row execute function public.set_updated_at();

create trigger property_reviews_audit after insert or update or delete on public.property_reviews
  for each row execute function public.audit_row_change();

alter table public.property_reviews enable row level security;
revoke all on public.property_reviews from anon, authenticated;

grant select on public.property_reviews to authenticated;
create policy property_reviews_select on public.property_reviews for select to authenticated
  using (public.is_staff());

-- Staff decide (status + note); the reasons are written by the server only.
grant update (status, note, reviewed_by, reviewed_at) on public.property_reviews to authenticated;
create policy property_reviews_decide on public.property_reviews for update to authenticated
  using (public.is_staff())
  with check (public.is_staff() and reviewed_by = (select auth.uid()));
