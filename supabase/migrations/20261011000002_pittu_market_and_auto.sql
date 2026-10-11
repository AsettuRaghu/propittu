-- =====================================================================
-- Pittu goes first (owner, 11 Oct 2026): confident results reach owners
-- without waiting for the team.
--  * value_estimates — what similar properties sell for nearby (Pittu
--    searches the web; our rules decide whether there is enough to show a
--    lower and upper value). One current row per property.
--  * watch_items.auto_approved — news Pittu published itself (the team can
--    still hide it).
-- =====================================================================

create table public.value_estimates (
  property_id    uuid        primary key references public.properties (id) on delete cascade,
  account_id     uuid        not null references public.accounts (id) on delete cascade,
  status         text        not null check (status in ('working', 'ready', 'not_enough', 'failed')),
  per_sqft_low   integer     check (per_sqft_low is null or per_sqft_low > 0),
  per_sqft_high  integer     check (per_sqft_high is null or per_sqft_high >= per_sqft_low),
  value_low      bigint,
  value_high     bigint,
  confidence     text        check (confidence is null or confidence in ('high', 'medium')),
  -- [{url, title, kind, same_project, per_sqft, date}] — only pages the search returned.
  comparables    jsonb       not null default '[]',
  note           text        check (note is null or char_length(note) <= 400),
  task_version   text,
  model          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index value_estimates_account_idx on public.value_estimates (account_id);
create trigger value_estimates_set_updated_at
  before update on public.value_estimates
  for each row execute function public.set_updated_at();

alter table public.value_estimates enable row level security;
revoke all on public.value_estimates from anon, authenticated;
grant select on public.value_estimates to authenticated;
-- Written only with the server key; owners and staff read.
create policy value_estimates_read on public.value_estimates for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));

alter table public.watch_items add column auto_approved boolean not null default false;
