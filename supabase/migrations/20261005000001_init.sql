-- =====================================================================
-- Propittu MVP — core schema
-- PRODUCT_SPEC.md §17, §19, §20, §22, §24, §32, §33
--
-- Enumerations are text + CHECK rather than Postgres ENUM types so the
-- lists stay extensible (§20): widening a CHECK is a trivial, reversible
-- migration, whereas ENUM values can never be removed.
--
-- Deliberate deviations from the spec's data models (docs/DECISIONS.md):
--   1. properties.khata_number added — §16 Step 3 captures it; §17 omits it.
--   2. user_id denormalised onto property_photos / property_documents so
--      every RLS policy is a flat user_id = auth.uid() check.
--   3. services is a table (not a service_type enum) because §30 specifies
--      GET /services and §22 needs names, descriptions and categories.
--   4. service_requests.property_id is ON DELETE SET NULL so deleting a
--      property does not erase request history (§8.4).
--   5. upload_status on file tables: rows exist before their bytes arrive.
-- =====================================================================


-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- profiles — application data keyed to the Supabase Auth identity (§32)
--
-- Supabase Auth remains the sole authentication authority. This table
-- holds only app-specific fields. A row is created automatically for
-- every new auth user, so "authenticated but no profile" cannot occur.
-- ---------------------------------------------------------------------

create table public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  phone       text        not null,
  full_name   text        check (full_name is null or char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, coalesce(new.phone, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- properties (§17)
--
-- Mandatory: property_type, name. Everything else is optional (§16).
-- ---------------------------------------------------------------------

create table public.properties (
  id               uuid          primary key default gen_random_uuid(),
  user_id          uuid          not null references auth.users (id) on delete cascade,
  property_type    text          not null check (property_type in (
                                   'land', 'apartment', 'independent_house',
                                   'commercial', 'industrial', 'other')),
  name             text          not null check (char_length(trim(name)) between 1 and 120),
  address_line     text          check (address_line is null or char_length(address_line) <= 300),
  city             text          check (city is null or char_length(city) <= 100),
  state            text          check (state is null or char_length(state) <= 100),
  pincode          text          check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  latitude         numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude        numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  area_value       numeric(14, 2) check (area_value is null or area_value > 0),
  area_unit        text          check (area_unit is null or area_unit in (
                                   'sqft', 'sqyd', 'sqm', 'acre', 'guntha', 'cent', 'bigha')),
  survey_number    text          check (survey_number is null or char_length(survey_number) <= 100),
  property_number  text          check (property_number is null or char_length(property_number) <= 100),
  khata_number     text          check (khata_number is null or char_length(khata_number) <= 100),
  notes            text          check (notes is null or char_length(notes) <= 2000),
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),

  -- An area without a unit is meaningless.
  constraint properties_area_has_unit check (area_value is null or area_unit is not null)
);

create index properties_user_created_idx on public.properties (user_id, created_at desc);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- property_photos (§19)
--
-- Binary data lives in Supabase Storage; this table holds metadata and
-- the server-generated storage path only.
-- ---------------------------------------------------------------------

create table public.property_photos (
  id             uuid        primary key default gen_random_uuid(),
  property_id    uuid        not null references public.properties (id) on delete cascade,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  storage_path   text        not null unique,
  caption        text        check (caption is null or char_length(caption) <= 200),
  mime_type      text        not null check (mime_type in ('image/jpeg', 'image/png')),
  file_size      integer     not null check (file_size > 0 and file_size <= 5242880),
  upload_status  text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  created_at     timestamptz not null default now(),

  -- Path must live under the owner's folder: <user_id>/<property_id>/<file>
  constraint property_photos_path_owned
    check (storage_path like (user_id::text || '/' || property_id::text || '/%'))
);

create index property_photos_property_idx on public.property_photos (property_id, created_at);


-- ---------------------------------------------------------------------
-- property_documents (§20)
-- ---------------------------------------------------------------------

create table public.property_documents (
  id             uuid        primary key default gen_random_uuid(),
  property_id    uuid        not null references public.properties (id) on delete cascade,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  document_type  text        not null check (document_type in (
                               'sale_deed', 'registration', 'tax_receipt', 'khata_certificate',
                               'encumbrance_certificate', 'building_approval', 'electricity',
                               'rental_agreement', 'other')),
  file_name      text        not null check (char_length(file_name) between 1 and 255),
  storage_path   text        not null unique,
  mime_type      text        not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size      integer     not null check (file_size > 0 and file_size <= 10485760),
  upload_status  text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  created_at     timestamptz not null default now(),

  constraint property_documents_path_owned
    check (storage_path like (user_id::text || '/' || property_id::text || '/%'))
);

create index property_documents_property_idx on public.property_documents (property_id, created_at desc);


-- ---------------------------------------------------------------------
-- services — the service catalogue (§22)
--
-- Request categories only. Fulfilment is out of scope for V1 (§8.4).
-- ---------------------------------------------------------------------

create table public.services (
  id           uuid    primary key default gen_random_uuid(),
  code         text    not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name         text    not null,
  category     text    not null check (category in ('property_government', 'property_care', 'other')),
  description  text    not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true
);


-- ---------------------------------------------------------------------
-- service_requests (§24)
--
-- reference renders as PR-000123, matching the §23 mockup; the sequence
-- starts at 123 so the first real request reads exactly that.
--
-- Status is changed by operators via the dashboard/SQL (§24: "status can
-- initially be managed through the database/backend"). Users cannot
-- update requests — see the RLS migration.
-- ---------------------------------------------------------------------

create sequence public.service_request_ref_seq start with 123;

create table public.service_requests (
  id           uuid        primary key default gen_random_uuid(),
  reference    text        not null unique
                           default ('PR-' || lpad(nextval('public.service_request_ref_seq')::text, 6, '0')),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  property_id  uuid        references public.properties (id) on delete set null,
  service_id   uuid        not null references public.services (id),
  description  text        not null check (char_length(trim(description)) between 1 and 2000),
  status       text        not null default 'submitted' check (status in (
                             'submitted', 'in_review', 'in_progress', 'completed', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter sequence public.service_request_ref_seq owned by public.service_requests.reference;

create index service_requests_user_created_idx on public.service_requests (user_id, created_at desc);
create index service_requests_property_idx     on public.service_requests (property_id);

create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- property_summaries — one row per property with the counts the Home
-- cards need (§15), so the API makes one query instead of N+1.
--
-- security_invoker = true makes the view run with the CALLER's
-- privileges, so the underlying tables' RLS policies still apply.
-- Without it, a view runs as its owner and silently bypasses RLS.
-- ---------------------------------------------------------------------

create view public.property_summaries
with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.property_type,
  p.name,
  p.city,
  p.state,
  p.created_at,
  (
    select count(*)::int
    from public.property_documents d
    where d.property_id = p.id and d.upload_status = 'ready'
  ) as document_count,
  (
    select count(*)::int
    from public.service_requests r
    where r.property_id = p.id
  ) as service_request_count,
  (
    select ph.storage_path
    from public.property_photos ph
    where ph.property_id = p.id and ph.upload_status = 'ready'
    order by ph.created_at
    limit 1
  ) as cover_photo_path
from public.properties p;
