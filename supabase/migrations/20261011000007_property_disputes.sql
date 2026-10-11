-- =====================================================================
-- Pittu Legal: court cases and disputes (owner, 11 Oct 2026). Pittu
-- searches the web for the property's PROJECT and LAND (never people's
-- names). Nothing found → 'clear', the owner is told at once. Something
-- found → 'in_review': the team keeps or dismisses each item and shares
-- them; only then does the owner see the items.
-- =====================================================================

create table public.property_disputes (
  property_id   uuid        primary key references public.properties (id) on delete cascade,
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  status        text        not null check (status in ('working', 'in_review', 'shared', 'clear', 'failed')),
  items         jsonb       not null default '[]',
  pittu_note    text        check (pittu_note is null or char_length(pittu_note) <= 400),
  staff_note    text        check (staff_note is null or char_length(staff_note) <= 1000),
  task_version  text,
  checked_at    timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);
create index property_disputes_review_idx on public.property_disputes (status, checked_at desc);
create trigger property_disputes_set_updated_at
  before update on public.property_disputes
  for each row execute function public.set_updated_at();

alter table public.property_disputes enable row level security;
revoke all on public.property_disputes from anon, authenticated;
grant select, update on public.property_disputes to authenticated;
-- Owners read their own (the API hides unshared items); staff read and review.
create policy property_disputes_read on public.property_disputes for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));
create policy property_disputes_staff_update on public.property_disputes for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
