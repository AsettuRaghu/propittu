-- =====================================================================
-- Minimal stand-in for the parts of a Supabase database the Propittu
-- migrations depend on, so they can be applied to a plain Postgres and
-- the RLS policies exercised without Docker or a hosted project.
--
-- Mirrors Supabase's real definitions where behaviour matters:
--   * roles anon / authenticated / service_role
--   * default privileges granting ALL on public objects to those roles
--     (RLS — not grants — is what restricts access on real Supabase)
--   * auth.uid() reading the `sub` claim from request.jwt.claims
--   * storage.foldername() splitting an object path into folders
--
-- NOT a full Supabase. Test-only; never apply this to a real project.
-- =====================================================================

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id         uuid primary key default gen_random_uuid(),
  phone      text,
  created_at timestamptz not null default now()
);

-- Same body as Supabase's auth.uid().
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz default now()
);

create table storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text not null,
  owner       uuid,
  created_at  timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Same body as Supabase's storage.foldername().
create function storage.foldername(name text) returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
