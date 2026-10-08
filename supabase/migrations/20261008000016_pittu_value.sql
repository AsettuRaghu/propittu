-- =====================================================================
-- Pittu Value — government values (owner, 8 Oct 2026). docs/PITTU.md.
--
--   value_sources  a government rate document the team uploads (e.g. a
--                  Karnataka guidance-value PDF for one Sub-Registrar office),
--                  read once by Pittu and shared by every property in the area
--   value_rates    one rate per locality / village / survey numbers and type
--                  of property, from a source (Pittu's reading, reviewed) or
--                  added by hand. Only published rates are used.
--
-- A property's government value is worked out by the API from its area and
-- the matching published rate; customers never read these tables directly.
-- The files live in a private bucket only the server key can reach.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reference-documents', 'reference-documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create table public.value_sources (
  id              uuid        primary key default gen_random_uuid(),
  state           text        not null,
  district        text        not null,
  office          text,
  title           text        not null check (char_length(title) between 1 and 200),
  effective_from  date,
  storage_path    text        unique,
  file_size       integer,
  upload_status   text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  read_status     text        not null default 'none' check (read_status in ('none', 'reading', 'read', 'failed')),
  read_error      text,
  rows_found      integer,
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.value_rates (
  id              uuid        primary key default gen_random_uuid(),
  source_id       uuid        references public.value_sources (id) on delete cascade,
  state           text        not null,
  district        text        not null,
  office          text,
  locality        text        not null check (char_length(locality) between 1 and 200),
  pincodes        text[]      not null default '{}',
  survey_numbers  text[]      not null default '{}',
  kind            text        not null check (kind in ('site', 'apartment', 'house', 'commercial', 'agricultural', 'other')),
  rate_inr        numeric     not null check (rate_inr > 0),
  unit            text        not null check (unit in ('sqft', 'sqm', 'sqyd', 'acre', 'guntha', 'cent')),
  effective_from  date,
  status          text        not null default 'draft' check (status in ('draft', 'published')),
  page            integer,
  notes           text        check (notes is null or char_length(notes) <= 500),
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index value_rates_place_idx on public.value_rates (state, district, status);
create index value_rates_source_idx on public.value_rates (source_id);

create trigger value_sources_audit after insert or update or delete on public.value_sources
  for each row execute function public.audit_row_change();
create trigger value_rates_audit after insert or update or delete on public.value_rates
  for each row execute function public.audit_row_change();

alter table public.value_sources enable row level security;
alter table public.value_rates enable row level security;
revoke all on public.value_sources, public.value_rates from anon, authenticated;
grant select, insert, update, delete on public.value_sources, public.value_rates to authenticated;
create policy value_sources_staff on public.value_sources for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy value_rates_staff on public.value_rates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
