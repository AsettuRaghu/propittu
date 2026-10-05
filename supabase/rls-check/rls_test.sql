-- =====================================================================
-- RLS / authorization test suite — PRODUCT_SPEC.md §34, §35, §41
--
--   "User A must never be able to access User B's data.
--    Test this at API and database/RLS levels."
--
-- Runs as the real `authenticated` role with a JWT `sub` claim set, so
-- every assertion goes through the same policies the API is subject to.
-- Any failed assertion raises and aborts the run (ON_ERROR_STOP).
-- =====================================================================

\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------
-- Assertion helpers (security invoker: they run with the caller's role)
-- ---------------------------------------------------------------------

create schema tst;
grant usage on schema tst to anon, authenticated;

create function tst.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS  %', label;
end $$;

-- Asserts the statement raises an error (RLS violation, privilege, check).
create function tst.rejects(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS  % — rejected: %', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — statement was NOT rejected', label;
end $$;

-- Asserts how many rows a statement touched / returned.
create function tst.rows(stmt text, expected int, label text) returns void
language plpgsql as $$
declare
  n int;
begin
  if stmt ~* '^\s*select' then
    execute 'select count(*) from (' || stmt || ') q' into n;
  else
    execute stmt;
    get diagnostics n = row_count;
  end if;
  if n <> expected then
    raise exception 'FAIL: % — expected % rows, got %', label, expected, n;
  end if;
  raise notice 'PASS  % (% rows)', label, n;
end $$;

grant execute on all functions in schema tst to anon, authenticated;

-- Switch identity. Only the superuser running this script can do this.
create function tst.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;


-- ---------------------------------------------------------------------
-- Fixtures: two users. Fixed UUIDs so the assertions are readable.
--   A = aaaaaaaa-…   B = bbbbbbbb-…
-- ---------------------------------------------------------------------

insert into auth.users (id, phone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '919876543210'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '919876543211');

\echo
\echo '== Profiles trigger =='
select tst.ok((select count(*) from public.profiles) = 2,
  'handle_new_user created a profile for each auth user');
select tst.ok((select phone from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = '919876543210',
  'profile copies phone from auth.users');


-- =====================================================================
\echo
\echo '== User A creates data =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.properties (id, user_id, property_type, name, city, state, area_value, area_unit)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'land', 'My Hyderabad Plot', 'Hyderabad', 'Telangana', 2400, 'sqft');

insert into public.property_photos (property_id, user_id, storage_path, mime_type, file_size, upload_status)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/p1.jpg',
        'image/jpeg', 1000, 'ready');

insert into public.property_documents (property_id, user_id, document_type, file_name, storage_path, mime_type, file_size, upload_status)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'sale_deed', 'deed.pdf',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/d1.pdf',
        'application/pdf', 2000, 'ready'),
       ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'tax_receipt', 'pending.pdf',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/d2.pdf',
        'application/pdf', 2000, 'pending');

insert into public.service_requests (id, user_id, property_id, service_id, description)
select 'a1a1a1a1-0000-0000-0000-0000000000f1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'a1a1a1a1-0000-0000-0000-000000000001', s.id, 'Please inspect the boundary wall'
from public.services s where s.code = 'site_inspection';

insert into storage.objects (bucket_id, name)
values ('property-documents', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/d1.pdf');

select tst.rows('select * from public.properties', 1, 'A sees own property');
select tst.ok((select reference from public.service_requests limit 1) = 'PR-000123',
  'first service request reference is PR-000123 (§23)');
select tst.ok((select status from public.service_requests limit 1) = 'submitted',
  'new service request defaults to submitted');
select tst.rows('select * from public.services', 10, 'A sees the 10 catalogue services (§22)');

select tst.ok(
  (select document_count from public.property_summaries
   where id = 'a1a1a1a1-0000-0000-0000-000000000001') = 1,
  'summary counts only READY documents (pending excluded)');
select tst.ok(
  (select service_request_count from public.property_summaries
   where id = 'a1a1a1a1-0000-0000-0000-000000000001') = 1,
  'summary counts service requests');
select tst.ok(
  (select cover_photo_path from public.property_summaries
   where id = 'a1a1a1a1-0000-0000-0000-000000000001') like '%/p1.jpg',
  'summary exposes cover photo path');


-- =====================================================================
\echo
\echo '== User B cannot read A =='
-- =====================================================================

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select tst.rows('select * from public.properties',          0, 'B sees none of A''s properties');
select tst.rows('select * from public.properties where id = ''a1a1a1a1-0000-0000-0000-000000000001''',
                                                              0, 'B cannot fetch A''s property by id');
select tst.rows('select * from public.property_photos',     0, 'B sees none of A''s photos');
select tst.rows('select * from public.property_documents',  0, 'B sees none of A''s documents');
select tst.rows('select * from public.service_requests',    0, 'B sees none of A''s service requests');
select tst.rows('select * from public.property_summaries',  0, 'B sees nothing through the summary view');
select tst.rows('select * from public.profiles',            1, 'B sees only own profile');
select tst.rows('select * from storage.objects',            0, 'B sees none of A''s storage objects');


-- =====================================================================
\echo
\echo '== User B cannot write A =='
-- =====================================================================

select tst.rows($$update public.properties set name = 'pwned'
                  where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
                0, 'B update of A''s property touches 0 rows');
select tst.rows($$delete from public.properties
                  where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
                0, 'B delete of A''s property touches 0 rows');
select tst.rows($$delete from public.property_documents$$,
                0, 'B delete of A''s documents touches 0 rows');
select tst.rows($$delete from storage.objects$$,
                0, 'B delete of A''s storage objects touches 0 rows');

select tst.rejects($$insert into public.properties (user_id, property_type, name)
                     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'forged')$$,
  'B cannot create a property stamped with A''s user_id');

select tst.rejects($$insert into public.property_photos (property_id, user_id, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/a1a1a1a1-0000-0000-0000-000000000001/x.jpg',
                             'image/jpeg', 10)$$,
  'B cannot attach a photo to A''s property (FK bypasses RLS; WITH CHECK catches it)');

select tst.rejects($$insert into public.property_documents (property_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'other', 'x.pdf',
                             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/a1a1a1a1-0000-0000-0000-000000000001/x.pdf',
                             'application/pdf', 10)$$,
  'B cannot attach a document to A''s property');

select tst.rejects($$insert into public.service_requests (user_id, property_id, service_id, description)
                     select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a1a1a1a1-0000-0000-0000-000000000001', id, 'x'
                     from public.services limit 1$$,
  'B cannot file a service request against A''s property');

select tst.rejects($$insert into storage.objects (bucket_id, name)
                     values ('property-documents', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/evil.pdf')$$,
  'B cannot upload into A''s storage folder');


-- =====================================================================
\echo
\echo '== Users cannot escalate on their OWN rows =='
-- =====================================================================

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.rejects($$update public.service_requests set status = 'completed'$$,
  'A cannot change service request status (operator-managed, §24)');
select tst.rejects($$delete from public.service_requests$$,
  'A cannot delete request history');
select tst.rejects($$insert into public.service_requests (user_id, property_id, service_id, description, status)
                     select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1a1a1a1-0000-0000-0000-000000000001', id, 'x', 'completed'
                     from public.services limit 1$$,
  'A cannot create a request pre-marked completed');
select tst.rejects($$update public.profiles set phone = '910000000000'$$,
  'A cannot change profile phone (owned by Supabase Auth)');
select tst.rows($$update public.profiles set full_name = 'Raghu'$$, 1,
  'A can set own full_name');
select tst.rejects($$update public.property_photos set storage_path = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/x/y.jpg'$$,
  'A cannot repoint a photo at another storage path');
select tst.rejects($$update public.property_documents set user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'A cannot reassign a document to another user');
select tst.rejects($$update public.properties set user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
                     where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
  'A cannot give a property away to another user');
select tst.rejects($$insert into public.services (code, name, category, description)
                     values ('evil', 'Evil', 'other', 'x')$$,
  'A cannot write to the service catalogue');


-- =====================================================================
\echo
\echo '== Data integrity constraints =='
-- =====================================================================

select tst.rejects($$insert into public.properties (user_id, property_type, name, pincode)
                     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'x', '012345')$$,
  'PIN code starting with 0 rejected');
select tst.rejects($$insert into public.properties (user_id, property_type, name, area_value)
                     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'x', 100)$$,
  'area without a unit rejected');
select tst.rejects($$insert into public.properties (user_id, property_type, name)
                     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'castle', 'x')$$,
  'unknown property_type rejected');
select tst.rejects($$insert into public.property_documents (property_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other', 'x.exe',
                             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/x.exe',
                             'application/x-msdownload', 10)$$,
  'unsupported document MIME type rejected (§21)');
select tst.rejects($$insert into public.property_documents (property_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other', 'big.pdf',
                             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1-0000-0000-0000-000000000001/big.pdf',
                             'application/pdf', 10485761)$$,
  'document over 10 MB rejected (§21)');
select tst.rejects($$insert into public.property_photos (property_id, user_id, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                             'somewhere/else/p.jpg', 'image/jpeg', 10)$$,
  'photo path outside <user>/<property>/ rejected');


-- =====================================================================
\echo
\echo '== Anonymous access =='
-- =====================================================================

reset role;
set role anon;
select set_config('request.jwt.claims', '', false);

select tst.rejects('select * from public.properties',         'anon cannot read properties');
select tst.rejects('select * from public.services',           'anon cannot read services');
select tst.rejects('select * from public.service_requests',   'anon cannot read service requests');
select tst.rejects('select * from public.property_summaries', 'anon cannot read summaries');
select tst.rows   ('select * from storage.objects', 0,        'anon sees no storage objects');


-- =====================================================================
\echo
\echo '== Deleting a property =='
-- =====================================================================

reset role;
set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.rows($$delete from public.properties where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$, 1,
  'A deletes own property');
select tst.rows('select * from public.property_photos',    0, 'photos cascade-deleted');
select tst.rows('select * from public.property_documents', 0, 'documents cascade-deleted');
select tst.rows('select * from public.service_requests',   1, 'service request history SURVIVES (§8.4)');
select tst.ok((select property_id from public.service_requests limit 1) is null,
  'surviving request has property_id nulled');

reset role;
\echo
\echo 'ALL RLS CHECKS PASSED'
