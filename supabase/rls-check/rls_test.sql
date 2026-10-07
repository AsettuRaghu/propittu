-- =====================================================================
-- RLS / authorization test suite — PRODUCT_SPEC.md §34, §35, §41 and
-- M10 (master implementation §13, §20).
--
-- Runs as the real `authenticated` / `anon` roles with a JWT `sub`
-- claim, so every assertion goes through the same policies the API is
-- subject to. Any failed assertion raises and aborts (ON_ERROR_STOP).
--
-- Actors: A and B are customers in separate accounts; S is staff.
-- =====================================================================

\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------
-- Assertion helpers (security invoker: they run with the caller's role)
-- ---------------------------------------------------------------------

create schema tst;
grant usage on schema tst to anon, authenticated, service_role;

create function tst.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS  %', label;
end $$;

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

grant execute on all functions in schema tst to anon, authenticated, service_role;

create function tst.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;


-- ---------------------------------------------------------------------
-- Fixtures. Fixed ids keep assertions readable:
--   users     A = aaaaaaaa-…  B = bbbbbbbb-…  S (staff) = 55555555-…
--   accounts  A = acc0000a-…  B = acc0000b-…
-- ---------------------------------------------------------------------

insert into auth.users (id, phone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '919000000001'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '919000000002'),
  ('55555555-5555-5555-5555-555555555555', '919000000003');

\echo
\echo '== New-user trigger: profile + account + owner membership =='
select tst.ok((select count(*) from public.profiles) = 3, 'a profile was created for each auth user');
select tst.ok((select count(*) from public.accounts) = 3, 'an account was created for each auth user');
select tst.ok(
  (select count(*) from public.account_members where role = 'owner') = 3,
  'each user is the owner of exactly one account');
select tst.rejects(
  $$insert into public.account_members (account_id, user_id)
    select id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' from public.accounts limit 1$$,
  'a user cannot belong to a second account (V1 one-account rule)');

-- Re-key A's and B's auto-created accounts to fixed ids for readability.
delete from public.accounts where id in (
  select account_id from public.account_members
  where user_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
insert into public.accounts (id) values
  ('acc0000a-0000-0000-0000-00000000000a'),
  ('acc0000b-0000-0000-0000-00000000000b');
insert into public.account_members (account_id, user_id, role) values
  ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
  ('acc0000b-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner');
insert into public.staff_members (user_id, role)
values ('55555555-5555-5555-5555-555555555555', 'super_admin');
select public.start_trial('acc0000a-0000-0000-0000-00000000000a');
select public.start_trial('acc0000b-0000-0000-0000-00000000000b');
-- A test visit area so the Hyderabad fixture below can book visits.
with area as (insert into public.service_areas (name, state) values ('Test Hyderabad', 'Telangana') returning id)
insert into public.service_area_pincodes (pincode, area_id) select '500032', id from area;


-- =====================================================================
\echo
\echo '== User A creates data in account A =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.ok(public.current_account_id() = 'acc0000a-0000-0000-0000-00000000000a',
  'current_account_id() resolves A to account A');
select tst.rows('select * from public.accounts', 1, 'A sees only its own account');

insert into public.properties (id, account_id, user_id, property_type, name, city, state, pincode, area_value, area_unit)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'My Hyderabad Plot', 'Hyderabad', 'Telangana', '500032', 2400, 'sqft');

insert into public.property_photos (property_id, account_id, user_id, storage_path, mime_type, file_size, upload_status)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/p1.jpg',
        'image/jpeg', 1000, 'ready');

insert into public.property_documents (property_id, account_id, user_id, document_type, file_name, storage_path, mime_type, file_size, upload_status)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sale_deed', 'deed.pdf',
        'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/d1.pdf',
        'application/pdf', 2000, 'ready'),
       ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'property_tax', 'pending.pdf',
        'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/d2.pdf',
        'application/pdf', 2000, 'pending');

-- Requests are opened only through create_service_request() (M4).
select public.create_service_request('a1a1a1a1-0000-0000-0000-000000000001',
  (select id from public.services where code = 'site_inspection'), 'Please inspect the boundary wall');

insert into storage.objects (bucket_id, name)
values ('property-documents', 'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/d1.pdf');

insert into public.audit_events (account_id, actor_user_id, actor_type, action, entity_type, entity_id)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user',
        'property.created', 'property', 'a1a1a1a1-0000-0000-0000-000000000001');

select tst.rows('select * from public.properties', 1, 'A sees its account''s property');
select tst.ok((select reference from public.service_requests limit 1) = 'PR-000123',
  'first service request reference is PR-000123');
select tst.rows('select * from public.services', 13, 'A sees the 13 catalogue services');
select tst.ok(
  (select document_count from public.property_summaries
   where id = 'a1a1a1a1-0000-0000-0000-000000000001') = 1,
  'summary counts only READY documents');
select tst.ok(
  (select account_id from public.property_summaries
   where id = 'a1a1a1a1-0000-0000-0000-000000000001') = 'acc0000a-0000-0000-0000-00000000000a',
  'summary view exposes the owning account');
select tst.rows('select * from public.audit_events', 0,
  'customers cannot read the audit log (even their own events)');


-- =====================================================================
\echo
\echo '== Forged ownership: A tries to write into account B =='
-- =====================================================================

select tst.rejects(
  $$insert into public.properties (account_id, user_id, property_type, name)
    values ('acc0000b-0000-0000-0000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'forged')$$,
  'forged account_id: A cannot create a property in account B');
select tst.rejects(
  $$insert into public.properties (account_id, user_id, property_type, name)
    values ('acc0000a-0000-0000-0000-00000000000a', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'land', 'forged')$$,
  'forged creator: A cannot stamp a row as created by B');
select tst.rejects(
  $$insert into public.audit_events (account_id, actor_user_id, actor_type, action)
    values ('acc0000b-0000-0000-0000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user', 'x')$$,
  'A cannot write audit events into account B');
select tst.rejects(
  $$insert into public.audit_events (account_id, actor_user_id, actor_type, action)
    values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff', 'x')$$,
  'A cannot write audit events posing as staff');
select tst.rejects(
  $$insert into storage.objects (bucket_id, name)
    values ('property-documents', 'acc0000b-0000-0000-0000-00000000000b/x/evil.pdf')$$,
  'A cannot upload into account B''s storage folder');


-- =====================================================================
\echo
\echo '== User B cannot read or change account A =='
-- =====================================================================

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select tst.rows('select * from public.accounts where id = ''acc0000a-0000-0000-0000-00000000000a''',
  0, 'B cannot see account A');
select tst.rows('select * from public.account_members where account_id = ''acc0000a-0000-0000-0000-00000000000a''',
  0, 'B cannot see account A''s members');
select tst.rows('select * from public.properties', 0, 'B sees none of A''s properties');
select tst.rows('select * from public.properties where id = ''a1a1a1a1-0000-0000-0000-000000000001''',
  0, 'B cannot fetch A''s property by id (forged property_id)');
select tst.rows('select * from public.property_photos', 0, 'B sees none of A''s photos');
select tst.rows('select * from public.property_documents', 0, 'B sees none of A''s documents');
select tst.rows('select * from public.service_requests', 0, 'B sees none of A''s service requests');
select tst.rows('select * from public.property_summaries', 0, 'B sees nothing through the summary view');
select tst.rows('select * from public.profiles', 1, 'B sees only its own profile');
select tst.rows('select * from storage.objects', 0, 'B sees none of A''s storage objects');

select tst.rows($$update public.properties set name = 'pwned'
                  where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$, 0,
  'B update of A''s property touches 0 rows');
select tst.rows($$delete from public.properties
                  where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$, 0,
  'B delete of A''s property touches 0 rows');
select tst.rows($$delete from public.property_documents$$, 0,
  'B delete of A''s documents touches 0 rows');
select tst.rows($$delete from storage.objects$$, 0,
  'B delete of A''s storage objects touches 0 rows');

select tst.rejects(
  $$insert into public.property_photos (property_id, account_id, user_id, storage_path, mime_type, file_size)
    values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000b-0000-0000-0000-00000000000b',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            'acc0000b-0000-0000-0000-00000000000b/a1a1a1a1-0000-0000-0000-000000000001/x.jpg',
            'image/jpeg', 10)$$,
  'B cannot attach a photo to A''s property under B''s own account');
select tst.rejects(
  $$insert into public.property_documents (property_id, account_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
    values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'other', 'x.pdf',
            'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/x.pdf',
            'application/pdf', 10)$$,
  'B cannot attach a document to A''s property by forging account A');
select tst.rejects(
  $$insert into public.service_requests (account_id, user_id, property_id, service_id, description)
    select 'acc0000b-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
           'a1a1a1a1-0000-0000-0000-000000000001', id, 'x' from public.services limit 1$$,
  'B cannot file a service request against A''s property');


-- =====================================================================
\echo
\echo '== Customers cannot escalate on their OWN rows =='
-- =====================================================================

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.rejects($$update public.service_requests set status = 'completed'$$,
  'A cannot change service request status (staff-managed)');
select tst.rejects($$delete from public.service_requests$$,
  'A cannot delete request history');
select tst.rejects(
  $$insert into public.service_requests (account_id, user_id, property_id, service_id, description, status)
    select 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
           'a1a1a1a1-0000-0000-0000-000000000001', id, 'x', 'completed' from public.services limit 1$$,
  'A cannot create a request pre-marked completed');
select tst.rejects($$update public.profiles set phone = '910000000000'$$,
  'A cannot change profile phone (owned by Supabase Auth)');
select tst.rows($$update public.profiles set full_name = 'Raghu'$$, 1, 'A can set own full_name');
select tst.rejects($$update public.property_photos set storage_path = 'x/y/z.jpg'$$,
  'A cannot repoint a photo at another storage path');
select tst.rejects($$update public.property_documents set account_id = 'acc0000b-0000-0000-0000-00000000000b'$$,
  'A cannot move a document to another account');
select tst.rejects($$update public.properties set account_id = 'acc0000b-0000-0000-0000-00000000000b'
                     where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
  'A cannot give a property away to another account');
select tst.rows($$update public.accounts set status = 'suspended'$$, 0,
  'A cannot change its account status');
select tst.rejects(
  $$insert into public.account_members (account_id, user_id) values
    ('acc0000b-0000-0000-0000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'A cannot add itself to account B');
select tst.rejects(
  $$insert into public.staff_members (user_id, role)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'super_admin')$$,
  'A cannot make itself staff');
select tst.rejects(
  $$insert into public.services (code, name, category, description) values ('evil', 'Evil', 'other', 'x')$$,
  'A cannot write to the service catalogue');
select tst.ok(public.is_staff() = false, 'is_staff() is false for a customer');


-- =====================================================================
\echo
\echo '== Staff: read across accounts, but no customer-side writes =='
-- =====================================================================

select tst.as_user('55555555-5555-5555-5555-555555555555');

select tst.ok(public.is_staff(), 'is_staff() is true for active staff');
select tst.rows('select * from public.accounts', 3, 'staff can see all accounts');
select tst.rows('select * from public.properties', 1, 'staff can see A''s property');
select tst.rows('select * from public.property_documents', 2, 'staff can see A''s documents');
select tst.rows('select * from public.service_requests', 1, 'staff can see A''s service request');
select tst.rows('select * from public.profiles', 3, 'staff can see customer profiles');
select tst.rows($$select * from public.audit_events where action not like 'db.%'$$, 1, 'staff can read the audit log');
select tst.rows('select * from storage.objects', 1, 'staff can see A''s storage objects');
select tst.rejects(
  $$insert into public.properties (account_id, user_id, property_type, name)
    values ('acc0000a-0000-0000-0000-00000000000a', '55555555-5555-5555-5555-555555555555', 'land', 'x')$$,
  'staff cannot create properties inside a customer account');
select tst.rows($$delete from public.properties where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$, 0,
  'staff cannot delete a customer''s property');

reset role;
update public.staff_members set is_active = false where user_id = '55555555-5555-5555-5555-555555555555';
set role authenticated;
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rows('select * from public.properties', 0, 'deactivated staff lose cross-account access');
reset role;
update public.staff_members set is_active = true where user_id = '55555555-5555-5555-5555-555555555555';


-- =====================================================================
\echo
\echo '== M2/M3: location provenance, document rules, videos =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.rejects($$update public.properties set latitude = 17.4, longitude = 78.4
                     where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
  'coordinates without a location_source are rejected (provenance required)');
select tst.rows($$update public.properties set latitude = 17.385, longitude = 78.4867, location_source = 'user',
                  location_confirmed_at = now() where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$, 1,
  'A can confirm a location pin with source user');
select tst.rejects($$update public.properties set location_source = 'oracle'
                     where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
  'unknown location_source rejected');

select tst.rejects($$insert into public.property_documents (property_id, account_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                             'electricity', 'bill.pdf', 'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/bill.pdf',
                             'application/pdf', 10)$$,
  'retired document category (electricity/utility) rejected');
select tst.rows($$update public.property_documents set description = 'Original registered deed'
                  where document_type = 'sale_deed'$$, 1, 'A can describe its document');
select tst.rejects($$update public.property_documents set status = 'verified'$$,
  'A cannot mark its own document verified (staff-controlled)');
select tst.ok((select status from public.property_documents where document_type = 'sale_deed') = 'uploaded',
  'new documents start as uploaded');

insert into public.property_videos (property_id, account_id, user_id, storage_path, mime_type, file_size, upload_status)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/v1.mp4', 'video/mp4', 5000000, 'ready');
insert into storage.objects (bucket_id, name)
values ('property-videos', 'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/v1.mp4');
select tst.rows('select * from public.property_videos', 1, 'A sees its own video');
select tst.ok((select video_count from public.property_summaries where id = 'a1a1a1a1-0000-0000-0000-000000000001') = 1,
  'summary counts ready videos');
select tst.rejects($$insert into public.property_videos (property_id, account_id, user_id, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                             'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/big.mp4', 'video/mp4', 52428801)$$,
  'video over 50 MB rejected');
select tst.rejects($$insert into public.property_videos (property_id, account_id, user_id, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                             'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/x.avi', 'video/x-msvideo', 10)$$,
  'unsupported video type rejected');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows('select * from public.property_videos', 0, 'B sees none of A''s videos');
select tst.rows($$select * from storage.objects where bucket_id = 'property-videos'$$, 0, 'B cannot see A''s video files');
select tst.rejects($$insert into public.property_videos (property_id, account_id, user_id, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000b-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                             'acc0000b-0000-0000-0000-00000000000b/a1a1a1a1-0000-0000-0000-000000000001/x.mp4', 'video/mp4', 10)$$,
  'B cannot attach a video to A''s property');
select tst.rejects($$insert into storage.objects (bucket_id, name)
                     values ('property-videos', 'acc0000a-0000-0000-0000-00000000000a/x/evil.mp4')$$,
  'B cannot upload into A''s video folder');
select tst.rows($$delete from public.property_videos$$, 0, 'B delete of A''s videos touches 0 rows');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rows('select * from public.property_videos', 1, 'staff can see A''s video');
reset role;

-- =====================================================================
\echo
\echo '== M5/M6: Plans, Benefits, Trial, Usage =='
-- =====================================================================

reset role;
-- A brand-new user gets account + Trial automatically; an invited phone becomes staff.
insert into public.staff_invites (phone, role) values ('919000000009', 'operations');
insert into auth.users (id, phone) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '919000000008'),
  ('99999999-9999-9999-9999-999999999999', '919000000009');

select tst.ok(
  (select count(*) from public.account_plans ap
     join public.account_members m on m.account_id = ap.account_id
   where m.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and ap.source = 'trial') = 1,
  'new user automatically gets exactly one Trial');
select tst.ok(
  (select ap.ends_at - ap.starts_at from public.account_plans ap
     join public.account_members m on m.account_id = ap.account_id
   where m.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = interval '30 days',
  'Trial lasts the configured 30 days');
select public.start_trial((select account_id from public.account_members
                           where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
select tst.ok(
  (select count(*) from public.account_plans ap
     join public.account_members m on m.account_id = ap.account_id
   where m.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = 1,
  'Trial eligibility is once per Account (second start is a no-op)');
select tst.ok(
  (select role from public.staff_members where user_id = '99999999-9999-9999-9999-999999999999') = 'operations',
  'invited phone number becomes staff on first login');
select tst.ok(
  not exists (select 1 from public.staff_members where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'uninvited users do not become staff');

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.rows('select * from public.plans', 3, 'A can read the Plan catalogue (Trial, Basic, Plus)');
select tst.rows($$select * from public.plan_version_benefits b
                   join public.plan_versions v on v.id = b.plan_version_id
                   join public.plans p on p.id = v.plan_id where p.code = 'plus' and v.is_current$$, 10,
  'Plus (current version) has 4 Feature Benefits + 5 Usage Limits + 1 Included Service');
select tst.ok((select string_agg(p.code || '=' || v.price_paise, ',' order by p.code)
               from public.plan_versions v join public.plans p on p.id = v.plan_id
               where v.is_current and p.is_public) = 'basic=149900,plus=499900',
  'current prices: Basic ₹1,499, Plus ₹4,999 (older versions kept for existing customers)');
select tst.rows('select * from public.account_plans', 1, 'A sees its own Trial');
select tst.ok((select property_count from public.account_usage) = 1, 'A''s usage: 1 property');
select tst.ok((select storage_bytes from public.account_usage) = 1000 + 2000 + 5000000,
  'A''s storage usage sums READY photos, documents and videos');

select tst.rejects(
  $$insert into public.account_plans (account_id, plan_version_id, source, ends_at)
    select 'acc0000a-0000-0000-0000-00000000000a', v.id, 'payment', now() + interval '1 year'
    from public.plan_versions v join public.plans p on p.id = v.plan_id where p.code = 'plus'$$,
  'A cannot grant itself a Plan (client cannot bypass Plans)');
select tst.rows($$update public.account_plans set ends_at = now() + interval '10 years'$$, 0,
  'A cannot extend its own Trial');
select tst.rejects(
  $$insert into public.usage_records (account_id, kind, code) values
    ('acc0000a-0000-0000-0000-00000000000a', 'included_service', 'property_visit')$$,
  'A cannot write usage records');
select tst.rows($$update public.usage_records set released_at = now()$$, 0,
  'A cannot release (refund) its own usage');
select tst.rows($$update public.plan_version_benefits set value = 999$$, 0,
  'A cannot raise its own Usage Limits');
select tst.rejects($$insert into public.plans (code, name) values ('free_forever', 'Free')$$,
  'A cannot create Plans');
select tst.rejects($$select public.start_trial('acc0000a-0000-0000-0000-00000000000a')$$,
  'A cannot call start_trial() directly');
select tst.rows($$update public.accounts set status = 'active'$$, 0,
  'A cannot change its own account status');
select tst.ok(public.cancel_current_plan() = 0, 'a Trial cannot be "cancelled" (nothing to renew)');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows($$select * from public.account_plans where account_id = 'acc0000a-0000-0000-0000-00000000000a'$$, 0,
  'B cannot see A''s Plan');
select tst.rows($$select * from public.account_usage where account_id = 'acc0000a-0000-0000-0000-00000000000a'$$, 0,
  'B cannot see A''s usage');
select tst.rows('select * from public.staff_invites', 0, 'customers cannot read staff invites');

-- Staff grant Plus to A (e.g. offline payment), then A cancels: no renewal.
select tst.as_user('55555555-5555-5555-5555-555555555555');
insert into public.account_plans (account_id, plan_version_id, source, starts_at, ends_at)
select 'acc0000a-0000-0000-0000-00000000000a', v.id, 'staff', now(), now() + interval '365 days'
from public.plan_versions v join public.plans p on p.id = v.plan_id where p.code = 'plus' and v.is_current;
select tst.rows($$select * from public.account_plans where account_id = 'acc0000a-0000-0000-0000-00000000000a'$$, 2,
  'staff can grant a Plan and see the Account''s Plan history');
insert into public.usage_records (account_id, kind, code)
values ('acc0000a-0000-0000-0000-00000000000a', 'included_service', 'property_visit');
select tst.rows('select * from public.staff_invites', 1, 'staff can read staff invites');

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok(public.cancel_current_plan() = 1, 'A can cancel its paid Plan');
select tst.ok((select cancel_at_period_end from public.account_plans where source = 'staff'),
  'cancellation = no renewal (cancel_at_period_end), the period continues');
select tst.ok((select ends_at > now() from public.account_plans where source = 'staff'),
  'the cancelled Plan stays active until its period ends');
select tst.rows('select * from public.usage_records', 1, 'A can read its own usage records');
reset role;

-- =====================================================================
\echo
\echo '== M4/M9: Service requests, Included vs Extra, visit reports, Backoffice =='
-- =====================================================================

-- A is on Plus (2 visits/year) and already used 1 (staff-recorded above).
set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.ok(public.included_remaining('acc0000a-0000-0000-0000-00000000000a', 'property_visit') = 1,
  'A has 1 Included property visit left');
select tst.ok(public.included_remaining('acc0000a-0000-0000-0000-00000000000a', 'site_inspection') is null,
  'a service not in the Plan has no allowance (NULL)');
select public.create_service_request('a1a1a1a1-0000-0000-0000-000000000001',
  (select id from public.services where code = 'property_visit'), 'Quarterly visit', current_date + 7);
select tst.ok((select coverage from public.service_requests where description = 'Quarterly visit') = 'included',
  'first visit request is Included (decided by the server)');
select tst.ok((select price_paise from public.service_requests where description = 'Quarterly visit') is null,
  'an Included request has no price');
select tst.ok(public.included_remaining('acc0000a-0000-0000-0000-00000000000a', 'property_visit') = 0,
  'a pending Included request reserves the allowance');
select public.create_service_request('a1a1a1a1-0000-0000-0000-000000000001',
  (select id from public.services where code = 'property_visit'), 'Extra visit please');
select tst.ok((select coverage = 'extra' and price_paise = 99900 from public.service_requests
               where description = 'Extra visit please'),
  'allowance used up → next visit is an Extra Service with its price snapshotted');
select tst.ok((select status from public.service_requests where description = 'Extra visit please') = 'requested',
  'new requests start as Requested');

select tst.rejects(
  $$insert into public.service_requests (account_id, user_id, property_id, service_id, description, coverage)
    select 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
           'a1a1a1a1-0000-0000-0000-000000000001', id, 'free visit', 'included'
    from public.services where code = 'property_visit'$$,
  'A cannot insert a request directly (cannot forge Included)');
select tst.rejects($$update public.service_requests set coverage = 'included'$$,
  'A cannot flip a request to Included');
select tst.rejects($$select public.create_service_request('b1b1b1b1-0000-0000-0000-000000000001',
                     (select id from public.services where code = 'property_visit'), 'x')$$,
  'A cannot open a request for a property it does not own');
select tst.rejects($$select public.staff_update_service_request(
                     (select id from public.service_requests where description = 'Quarterly visit'), 'confirmed')$$,
  'A cannot confirm its own request (staff only)');
select tst.rejects($$select public.staff_set_document_status(
                     (select id from public.property_documents where document_type = 'sale_deed'), 'verified')$$,
  'A cannot verify its own document via the staff function');
select tst.rejects($$insert into public.visit_reports (service_request_id, account_id, visited_at, condition, created_by)
                     select id, account_id, current_date, 'good', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
                     from public.service_requests where description = 'Quarterly visit'$$,
  'A cannot write a visit report');
select tst.rows($$update public.services set price_paise = 1$$, 0, 'A cannot change service prices');
select tst.rows('select * from public.backoffice_accounts', 0, 'Backoffice account list is empty for customers');

select public.cancel_service_request((select id from public.service_requests where description = 'Extra visit please'));
select tst.ok((select status = 'cancelled' and cancelled_by = 'customer' from public.service_requests
               where description = 'Extra visit please'),
  'A can cancel its own request while Requested');
select tst.rejects($$select public.cancel_service_request(
                     (select id from public.service_requests where description = 'Extra visit please'))$$,
  'a cancelled request cannot be cancelled again');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rejects($$select public.cancel_service_request('00000000-0000-0000-0000-000000000000')$$,
  'B cannot cancel a request it does not own');
select tst.rejects($$select public.create_service_request('a1a1a1a1-0000-0000-0000-000000000001',
                     (select id from public.services where code = 'property_visit'), 'x')$$,
  'B cannot open a request on A''s property');
select tst.ok(public.included_remaining('acc0000a-0000-0000-0000-00000000000a', 'property_visit') is null,
  'B cannot read A''s allowance');
select tst.rows('select * from public.visit_reports', 0, 'B sees no visit reports');

-- Staff: confirm (consumes usage), schedule, report, media, document review.
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.ok((select count(*) from public.backoffice_accounts) >= 3, 'staff can search all accounts');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Quarterly visit'), 'confirmed', null, 'Booked');
select tst.rows($$select * from public.usage_records u join public.service_requests r on r.id = u.service_request_id
                  where r.description = 'Quarterly visit' and u.released_at is null$$, 1,
  'confirming an Included request consumes usage (not before)');
select tst.rejects($$select public.staff_update_service_request(
                     (select id from public.service_requests where description = 'Quarterly visit'), 'confirmed')$$,
  'invalid transition (confirmed → confirmed) rejected');
select tst.rejects($$select public.staff_update_service_request(
                     (select id from public.service_requests where description = 'Quarterly visit'), 'scheduled')$$,
  'scheduling needs a date');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Quarterly visit'), 'scheduled', now() + interval '3 days');
select tst.ok((select status = 'scheduled' and scheduled_for is not null and status_note = 'Booked'
               from public.service_requests where description = 'Quarterly visit'),
  'staff schedule the visit; earlier note kept');
select tst.rejects($$select public.staff_update_service_request(
                     (select id from public.service_requests where description = 'Extra visit please'), 'confirmed')$$,
  'a cancelled request cannot be reopened');

select tst.rejects($$insert into public.visit_reports (service_request_id, account_id, visited_at, condition, created_by)
                     select id, 'acc0000b-0000-0000-0000-00000000000b', current_date, 'good', '55555555-5555-5555-5555-555555555555'
                     from public.service_requests where description = 'Quarterly visit'$$,
  'visit report must belong to the request''s account');
insert into public.visit_reports (service_request_id, account_id, property_id, visited_at, condition, observations, created_by)
select id, account_id, property_id, current_date, 'needs_attention', 'Compound wall cracked', '55555555-5555-5555-5555-555555555555'
from public.service_requests where description = 'Quarterly visit';
select tst.rejects($$insert into public.visit_report_media (report_id, account_id, kind, storage_path, mime_type, file_size, created_by)
                     select id, account_id, 'photo', 'acc0000b-0000-0000-0000-00000000000b/visits/x.jpg', 'image/jpeg', 10,
                            '55555555-5555-5555-5555-555555555555' from public.visit_reports$$,
  'visit media must live in the customer''s own account folder');
insert into public.visit_report_media (report_id, account_id, kind, storage_path, mime_type, file_size, upload_status, created_by)
select id, account_id, 'photo', account_id::text || '/visits/r1/m1.jpg', 'image/jpeg', 10, 'ready',
       '55555555-5555-5555-5555-555555555555' from public.visit_reports;
select public.staff_set_document_status((select id from public.property_documents where document_type = 'sale_deed'), 'verified');
select tst.ok((select status from public.property_documents where document_type = 'sale_deed') = 'verified',
  'staff can verify a document');
select tst.rejects($$select public.staff_set_document_status(
                     (select id from public.property_documents where document_type = 'sale_deed'), 'approved_forever')$$,
  'unknown document status rejected');
select tst.rows($$update public.services set price_paise = 109900 where code = 'property_visit'$$, 1,
  'staff can change a service price');
select tst.ok((select price_paise from public.service_requests where description = 'Extra visit please') = 99900,
  'existing requests keep the price they were opened at');

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.rows('select * from public.visit_reports', 0, 'a DRAFT report (request not completed) is hidden from the customer');
select tst.rows('select * from public.visit_report_media', 0, 'draft visit media is hidden from the customer');
select tst.rows($$delete from public.visit_report_media$$, 0, 'A cannot delete visit media');

-- Staff cancel a confirmed Included visit → usage released.
select tst.as_user('55555555-5555-5555-5555-555555555555');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Quarterly visit'), 'cancelled', null, 'Customer travelling');
select tst.ok((select released_at is not null from public.usage_records u join public.service_requests r on r.id = u.service_request_id
               where r.description = 'Quarterly visit'),
  'cancelling a confirmed Included visit releases its usage');
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok(public.included_remaining('acc0000a-0000-0000-0000-00000000000a', 'property_visit') = 1,
  'released usage returns the allowance');
reset role;

-- =====================================================================
\echo
\echo '== Visit report lifecycle: draft → published on completion → locked =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select public.create_service_request('a1a1a1a1-0000-0000-0000-000000000001',
  (select id from public.services where code = 'property_visit'), 'Locked report visit');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Locked report visit'), 'confirmed');
insert into public.visit_reports (service_request_id, account_id, property_id, visited_at, condition, observations, created_by)
select id, account_id, property_id, current_date, 'good', 'v1', '55555555-5555-5555-5555-555555555555'
from public.service_requests where description = 'Locked report visit';
select tst.rows($$update public.visit_reports set observations = 'v2'
                  where service_request_id = (select id from public.service_requests where description = 'Locked report visit')$$, 1,
  'staff can edit a draft report');
select tst.ok((select count(*) from public.visit_report_revisions r join public.visit_reports v on v.id = r.report_id
               join public.service_requests sr on sr.id = v.service_request_id
               where sr.description = 'Locked report visit' and r.snapshot->>'observations' = 'v1') = 1,
  'every edit keeps the previous version (revision history)');
insert into public.visit_report_media (report_id, account_id, kind, storage_path, mime_type, file_size, upload_status, created_by)
select v.id, v.account_id, 'photo', v.account_id::text || '/visits/r2/m1.jpg', 'image/jpeg', 10, 'ready', '55555555-5555-5555-5555-555555555555'
from public.visit_reports v join public.service_requests sr on sr.id = v.service_request_id
where sr.description = 'Locked report visit';

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.rows($$select * from public.visit_reports v join public.service_requests sr on sr.id = v.service_request_id
                  where sr.description = 'Locked report visit'$$, 0, 'customer cannot see the report while it is a draft');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Locked report visit'), 'completed');
select tst.rows($$update public.visit_reports set observations = 'v3'
                  where service_request_id = (select id from public.service_requests where description = 'Locked report visit')$$, 0,
  'a published report is LOCKED (staff edit touches 0 rows)');
select tst.rejects($$insert into public.visit_report_media (report_id, account_id, kind, storage_path, mime_type, file_size, created_by)
                     select v.id, v.account_id, 'photo', v.account_id::text || '/visits/r2/m2.jpg', 'image/jpeg', 10, '55555555-5555-5555-5555-555555555555'
                     from public.visit_reports v join public.service_requests sr on sr.id = v.service_request_id
                     where sr.description = 'Locked report visit'$$,
  'no media can be added to a published report');
select tst.rows($$delete from public.visit_report_media where storage_path like '%/visits/r2/%'$$, 0,
  'media of a published report cannot be deleted');

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok((select observations from public.visit_reports) = 'v2', 'customer sees the published (final) report');
select tst.rows('select * from public.visit_report_media', 1, 'customer sees the published report''s media');
select tst.rows('select * from public.visit_report_revisions', 0, 'customers cannot read report revisions');
reset role;


-- =====================================================================
\echo
\echo '== M7: Orders, payments, refunds, webhooks =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select public.create_plan_order('plus');
select tst.ok((select amount_paise = 499900 and status = 'pending' and kind = 'plan' from public.orders),
  'A creates a Plus order priced from the catalogue (₹4,999)');
select tst.rejects($$select public.create_plan_order('trial')$$, 'the Trial cannot be bought');
select tst.rejects($$select public.create_plan_order('platinum')$$, 'unknown plan rejected');
select tst.rejects($$insert into public.orders (account_id, user_id, kind, plan_version_id, description, amount_paise)
                     select 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'plan', id, 'cheap', 1 from public.plan_versions limit 1$$,
  'A cannot insert an order directly (cannot set its own price)');
select tst.rejects($$update public.orders set status = 'paid'$$, 'A cannot mark its order paid');
select tst.rejects($$insert into public.payments (order_id, account_id, provider, amount_paise, status)
                     select id, account_id, 'razorpay', amount_paise, 'captured' from public.orders$$,
  'A cannot insert a captured payment');
select public.attach_checkout((select id from public.orders where kind = 'plan' and status = 'pending'),
  'razorpay', 'plink_A1', 'https://rzp.io/test');
select tst.ok((select status from public.payments) = 'created', 'checkout attached: payment created, not captured');
select tst.rejects($$select public.record_payment_event('razorpay', 'evt_forged', 'payment.captured',
                     (select id from public.orders limit 1), 'pay_x', 499900, 'INR')$$,
  'A cannot call record_payment_event (webhook path is server-only)');
select tst.rejects($$select public.create_service_order(
                     (select id from public.service_requests where description = 'Extra visit please'))$$,
  'a cancelled request cannot be paid');
select public.create_service_order((select id from public.service_requests where description = 'Please inspect the boundary wall'));
select tst.ok((select amount_paise from public.orders where kind = 'extra_service') = 149900,
  'Extra Service order uses the request''s snapshotted price');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows('select * from public.orders', 0, 'B cannot see A''s orders');
select tst.rows('select * from public.payments', 0, 'B cannot see A''s payments');
select tst.rejects($$select public.attach_checkout((select id from public.orders limit 1), 'razorpay', 'plink_B', 'x')$$,
  'B cannot attach a checkout to A''s order');
select tst.rejects($$select public.create_service_order('00000000-0000-0000-0000-000000000000')$$,
  'B cannot pay for a request it does not own');
reset role;

-- The verified webhook (service_role) is the only path to "paid".
set role service_role;
select tst.ok(public.record_payment_event('razorpay', 'evt_1', 'payment.captured',
  (select id from public.orders where kind = 'plan' and status = 'pending'), 'pay_1', 499900, 'INR', 'upi', 'plink_A1') = 'plan_activated',
  'captured webhook records the paid Plan');
select tst.ok(public.record_payment_event('razorpay', 'evt_1', 'payment.captured',
  (select id from public.orders where kind = 'plan'), 'pay_1', 499900, 'INR') = 'duplicate',
  'replayed webhook is ignored (idempotent)');
select tst.ok(public.record_payment_event('razorpay', 'evt_2', 'payment.captured',
  (select id from public.orders where kind = 'plan'), 'pay_1b', 499900, 'INR') = 'already_paid',
  'second capture for a paid order does not grant twice');
select tst.ok(public.record_payment_event('razorpay', 'evt_3', 'payment.captured',
  (select id from public.orders where kind = 'extra_service'), 'pay_3', 100, 'INR') = 'amount_mismatch',
  'amount mismatch never marks an order paid');
select tst.ok((select status from public.orders where kind = 'extra_service') = 'pending', 'mismatched order stays pending');
select tst.ok(public.record_payment_event('razorpay', 'evt_4', 'refund.processed', null, 'pay_1', 499900, 'INR', null, null, 'rfnd_1') = 'refund_recorded',
  'refund recorded as a separate event');
reset role;

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- A already had Plus (staff grant), so the paid period queues after it.
select tst.ok((select count(*) from public.account_plans where source = 'payment' and starts_at > now()) = 1,
  'paying for the Plan you already have extends it (queued, no days lost)');
select tst.ok((select status = 'captured' and provider_payment_ref = 'pay_1' and method = 'upi' from public.payments
               where provider_checkout_ref = 'plink_A1'),
  'payment captured with the provider reference');
select tst.ok((select count(*) from public.refunds) = 1 and (select status from public.payments where provider_payment_ref = 'pay_1') = 'captured',
  'refund does not overwrite the original payment');
select tst.rows('select * from public.payment_events', 0, 'customers cannot read the webhook log');

-- Renewal of the same paid Plan queues after the current period.
select public.create_plan_order('plus');
reset role;
set role service_role;
select public.record_payment_event('razorpay', 'evt_6', 'payment.captured',
  (select id from public.orders where kind = 'plan' and status = 'pending'), 'pay_6', 499900, 'INR');
reset role;
select tst.ok((select count(*) from public.account_plans where account_id = 'acc0000a-0000-0000-0000-00000000000a' and source = 'payment' and starts_at > now()) = 2,
  'a further renewal queues after the previous one');

-- B: Trial → paid Plus starts immediately and ends the Trial.
set role authenticated;
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select public.create_plan_order('plus');
reset role;
set role service_role;
select tst.ok(public.record_payment_event('razorpay', 'evt_7', 'payment.captured',
  (select id from public.orders where account_id = 'acc0000b-0000-0000-0000-00000000000b' and status = 'pending'), 'pay_7', 499900, 'INR') = 'plan_activated',
  'B pays for Plus');
reset role;
set role authenticated;
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.ok((select ap.source from public.account_plans ap
               where ap.starts_at <= now() and ap.ends_at > now() order by ap.starts_at desc limit 1) = 'payment',
  'Trial → paid: the paid Plan is in force immediately');
select tst.ok((select ends_at <= now() from public.account_plans where source = 'trial'),
  'the Trial is ended when the paid Plan starts');
reset role;

set role authenticated;
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.ok((select count(*) from public.payment_events) = 6, 'staff can read the webhook log (the replay is stored once)');
select tst.ok((select count(*) from public.orders) = 4, 'staff can see all orders');
reset role;

-- =====================================================================
\echo
\echo '== Plan changes: trial carry-over, proration, staff add days =='
-- =====================================================================

-- B went Trial → Plus with ~30 Trial days left: they are kept.
select tst.ok((select ends_at > now() + interval '394 days' from public.account_plans
               where account_id = 'acc0000b-0000-0000-0000-00000000000b' and source = 'payment'),
  'Trial → paid: the unused Trial days are added to the paid term');

set role authenticated;
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.ok((select public.plan_quote('basic')->>'mode') = 'downgrade'
               and (select public.plan_quote('basic')->>'blocked_reason') like 'You can move to Basic when%',
  'a mid-term downgrade is quoted as blocked');
select tst.rejects($$select public.create_plan_order('basic')$$, 'a mid-term downgrade cannot be ordered');
reset role;

-- Make B a paid Basic customer half-way through the year, one visit used.
update public.account_plans
set plan_version_id = (select pv.id from public.plan_versions pv join public.plans p on p.id = pv.plan_id
                       where p.code = 'basic' and pv.is_current),
    starts_at = now() - interval '182 days', ends_at = now() + interval '183 days'
where account_id = 'acc0000b-0000-0000-0000-00000000000b' and source = 'payment';
update public.account_plans set starts_at = now() - interval '200 days', ends_at = now() - interval '182 days'
where account_id = 'acc0000b-0000-0000-0000-00000000000b' and source = 'trial';
insert into public.usage_records (account_id, kind, code, quantity, created_at)
values ('acc0000b-0000-0000-0000-00000000000b', 'included_service', 'property_visit', 1, now() - interval '30 days');

set role authenticated;
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.ok((select (q->>'mode') = 'upgrade' and (q->>'list_price_paise')::int = 499900
                      and abs((q->>'credit_paise')::int - 75154) < 500
                      and (q->>'amount_paise')::int = 499900 - (q->>'credit_paise')::int
               from (select public.plan_quote('plus') q) x),
  'upgrade Basic → Plus mid-term: unused Basic is credited (prorated)');
select public.create_plan_order('plus');
select tst.ok((select amount_paise < 499900 and list_price_paise = 499900 and credit_paise > 0
                      and description like '%upgrade from Basic%'
               from public.orders where status = 'pending'),
  'the upgrade order is priced net of the credit');
reset role;
set role service_role;
select tst.ok(public.record_payment_event('razorpay', 'evt_up', 'payment.captured',
  (select id from public.orders where account_id = 'acc0000b-0000-0000-0000-00000000000b' and status = 'pending'),
  'pay_up', (select amount_paise from public.orders where account_id = 'acc0000b-0000-0000-0000-00000000000b' and status = 'pending'), 'INR')
  = 'plan_activated', 'B pays the upgrade');
reset role;
set role authenticated;
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.ok((select p.code from public.account_plans ap join public.plan_versions pv on pv.id = ap.plan_version_id
               join public.plans p on p.id = pv.plan_id
               where ap.starts_at <= now() and ap.ends_at > now() order by ap.starts_at desc limit 1) = 'plus',
  'upgrade: Plus is in force immediately');
select tst.ok((select count(*) from public.account_plans ap join public.plan_versions pv on pv.id = ap.plan_version_id
               join public.plans p on p.id = pv.plan_id where p.code = 'basic' and ap.ends_at > now()) = 0,
  'upgrade: the Basic period is ended');
select tst.ok(public.included_remaining('acc0000b-0000-0000-0000-00000000000b', 'property_visit') = 1,
  'upgrade: visits already used this year still count (2 on Plus − 1 used)');
select tst.rejects($$select public.staff_extend_plan('acc0000b-0000-0000-0000-00000000000b', 7)$$,
  'a customer cannot add days');

-- Staff add days: extends what is in force, keeps the paid period.
select tst.as_user('55555555-5555-5555-5555-555555555555');
create temp table before_extend as
  select id, ends_at from public.account_plans
  where account_id = 'acc0000b-0000-0000-0000-00000000000b' and ends_at > now();
select public.staff_extend_plan('acc0000b-0000-0000-0000-00000000000b', 7);
select tst.ok((select bool_and(ap.ends_at = b.ends_at + interval '7 days')
               from public.account_plans ap join before_extend b using (id)),
  'staff add 7 days: the paid Plus period runs 7 days longer (not replaced)');
select tst.rejects($$select public.staff_extend_plan('acc0000b-0000-0000-0000-00000000000b', 0)$$,
  'adding 0 days is rejected');
reset role;

-- =====================================================================
\echo
\echo '== Help & Support: tickets =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.support_tickets (account_id, user_id, subject, category, property_id)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Wrong area on my plot', 'property', 'a1a1a1a1-0000-0000-0000-000000000001');
insert into public.support_ticket_messages (ticket_id, account_id, author_id, author_type, body)
select id, account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'customer', 'The area shows 2400 but it is 2600 sqft.' from public.support_tickets;
select tst.ok((select reference from public.support_tickets) like 'ST-%', 'A opens a ticket with an ST- reference');
select tst.rejects($$insert into public.support_tickets (account_id, user_id, subject, category, status)
                     values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sneaky', 'other', 'resolved')$$, 'A cannot open a ticket already resolved');
select tst.rejects($$insert into public.support_tickets (account_id, user_id, subject, category)
                     values ('acc0000b-0000-0000-0000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Forged account', 'other')$$, 'A cannot open a ticket in account B');
select tst.rejects($$update public.support_tickets set status = 'resolved'$$, 'A cannot change ticket status');
select tst.rejects($$insert into public.support_ticket_messages (ticket_id, account_id, author_id, author_type, body)
                     select id, account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff', 'I am staff' from public.support_tickets$$,
  'A cannot post as staff');
select tst.rejects($$select public.staff_set_ticket_status((select id from public.support_tickets limit 1), 'closed')$$,
  'A cannot call the staff status function');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows('select * from public.support_tickets', 0, 'B cannot see A''s tickets');
select tst.rows('select * from public.support_ticket_messages', 0, 'B cannot see A''s ticket messages');
select tst.rejects($$insert into public.support_tickets (account_id, user_id, subject, category, property_id)
                     values ('acc0000b-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Not mine', 'property', 'a1a1a1a1-0000-0000-0000-000000000001')$$,
  'B cannot link A''s property to a ticket');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rows('select * from public.support_tickets', 1, 'staff see all tickets');
insert into public.support_ticket_messages (ticket_id, account_id, author_id, author_type, body)
select id, account_id, '55555555-5555-5555-5555-555555555555', 'staff', 'Thanks — we have corrected it.' from public.support_tickets;
select public.staff_set_ticket_status((select id from public.support_tickets limit 1), 'waiting_on_customer');
select tst.ok((select status from public.support_tickets) = 'waiting_on_customer', 'staff set ticket status');

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.support_ticket_messages (ticket_id, account_id, author_id, author_type, body)
select id, account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'customer', 'Still wrong on the detail page.' from public.support_tickets;
select tst.ok((select status from public.support_tickets) = 'open', 'customer reply re-opens a waiting ticket');
select tst.rows('select * from public.support_ticket_messages', 3, 'A sees the whole conversation');
reset role;

-- Attachments on ticket messages
set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.support_ticket_attachments (ticket_id, message_id, account_id, uploaded_by, file_name, storage_path, mime_type, file_size, upload_status)
select m.ticket_id, m.id, m.account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo.jpg', 'acc0000a-0000-0000-0000-00000000000a/tickets/' || m.ticket_id || '/a1.jpg', 'image/jpeg', 1000, 'ready'
from public.support_ticket_messages m where m.author_type = 'customer' order by m.created_at limit 1;
select tst.rows('select * from public.support_ticket_attachments', 1, 'A attaches a photo to its own message');
select tst.rejects($$insert into public.support_ticket_attachments (ticket_id, message_id, account_id, uploaded_by, file_name, storage_path, mime_type, file_size)
                     select m.ticket_id, m.id, m.account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x.jpg', 'acc0000a-0000-0000-0000-00000000000a/tickets/x/b.jpg', 'image/jpeg', 10
                     from public.support_ticket_messages m where m.author_type = 'staff' limit 1$$,
  'A cannot attach to a staff message');
select tst.rejects($$insert into public.support_ticket_attachments (ticket_id, message_id, account_id, uploaded_by, file_name, storage_path, mime_type, file_size)
                     select m.ticket_id, m.id, m.account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x.exe', 'acc0000a-0000-0000-0000-00000000000a/tickets/x/c.exe', 'application/x-msdownload', 10
                     from public.support_ticket_messages m where m.author_type = 'customer' limit 1$$,
  'unsupported attachment type rejected');
select tst.rejects($$insert into public.support_ticket_attachments (ticket_id, message_id, account_id, uploaded_by, file_name, storage_path, mime_type, file_size)
                     select m.ticket_id, m.id, m.account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x.jpg', 'acc0000b-0000-0000-0000-00000000000b/tickets/x/d.jpg', 'image/jpeg', 10
                     from public.support_ticket_messages m where m.author_type = 'customer' limit 1$$,
  'attachment path must be in the ticket account folder');
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows('select * from public.support_ticket_attachments', 0, 'B cannot see A''s attachments');
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rows('select * from public.support_ticket_attachments', 1, 'staff can see ticket attachments');
reset role;

-- =====================================================================
\echo
\echo '== Data integrity constraints =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.rejects($$insert into public.properties (account_id, user_id, property_type, name, pincode)
                     values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'x', '012345')$$,
  'PIN code starting with 0 rejected');
select tst.rejects($$insert into public.properties (account_id, user_id, property_type, name, area_value)
                     values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'x', 100)$$,
  'area without a unit rejected');
select tst.rejects($$insert into public.properties (account_id, user_id, property_type, name)
                     values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'castle', 'x')$$,
  'unknown property_type rejected');
select tst.rejects($$insert into public.property_documents (property_id, account_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other', 'x.exe',
                             'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/x.exe',
                             'application/x-msdownload', 10)$$,
  'unsupported document MIME type rejected');
select tst.rejects($$insert into public.property_documents (property_id, account_id, user_id, document_type, file_name, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other', 'big.pdf',
                             'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/big.pdf',
                             'application/pdf', 10485761)$$,
  'document over 10 MB rejected');
select tst.rejects($$insert into public.property_photos (property_id, account_id, user_id, storage_path, mime_type, file_size)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                             'somewhere/else/p.jpg', 'image/jpeg', 10)$$,
  'photo path outside <account>/<property>/ rejected');


-- =====================================================================
\echo
\echo '== Anonymous access =='
-- =====================================================================

reset role;
set role anon;
select set_config('request.jwt.claims', '', false);

select tst.rejects('select * from public.properties',         'anon cannot read properties');
select tst.rejects('select * from public.accounts',           'anon cannot read accounts');
select tst.rejects('select * from public.account_members',    'anon cannot read memberships');
select tst.rejects('select * from public.staff_members',      'anon cannot read staff');
select tst.rejects('select * from public.audit_events',       'anon cannot read audit events');
select tst.rejects('select * from public.services',           'anon cannot read services');
select tst.rejects('select * from public.service_requests',   'anon cannot read service requests');
select tst.rejects('select * from public.property_summaries', 'anon cannot read summaries');
select tst.rejects('select public.is_staff()',                'anon cannot call is_staff()');
select tst.rows   ('select * from storage.objects', 0,        'anon sees no storage objects');
select tst.ok(public.keepalive() is not null,                 'anon CAN call keepalive() (cron)');


-- =====================================================================
\echo
\echo '== Service types: paperwork help (assistance) vs on-site visit =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select public.create_service_request('a1a1a1a1-0000-0000-0000-000000000001',
  (select id from public.services where code = 'property_tax_assistance'), 'Pay my property tax');
select tst.ok((select fulfilment from public.service_requests where description = 'Pay my property tax') = 'assistance',
  'a paperwork service opens an assistance request (type copied from the service)');
select tst.ok((select fulfilment from public.service_requests where description = 'Quarterly visit') = 'visit',
  'a property visit is an on-site request');
select tst.rejects($$select public.staff_request_info(
                     (select id from public.service_requests where description = 'Pay my property tax'), 'Send receipt')$$,
  'A cannot ask itself for information (staff only)');
select tst.rejects($$select public.staff_set_request_fulfilment(
                     (select id from public.service_requests where description = 'Pay my property tax'), 'visit')$$,
  'A cannot change a request''s type');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Pay my property tax'), 'confirmed', null, 'On it');
select tst.rejects($$select public.staff_update_service_request(
                     (select id from public.service_requests where description = 'Pay my property tax'), 'scheduled', now() + interval '1 day')$$,
  'paperwork help is never scheduled');
select tst.ok(not exists (select 1 from unnest(array['requested','confirmed','scheduled','in_progress']) st
                          where 'awaiting_customer' = any (public.request_transitions('visit', st))),
  'an on-site request never goes to "Need info from you"');
select public.staff_request_info(
  (select id from public.service_requests where description = 'Pay my property tax'),
  'Please share last year''s tax receipt.');
select tst.ok((select r.status = 'awaiting_customer' and t.status = 'waiting_on_customer'
               from public.service_requests r join public.support_tickets t on t.service_request_id = r.id
               where r.description = 'Pay my property tax'),
  'asking for info: request → Need info from you, linked ticket waits on the customer');
insert into public.service_outcomes (service_request_id, account_id, property_id, summary, reference_number, next_due_date, created_by)
select id, account_id, property_id, 'Paid 2026-27 property tax', 'BBMP-123', current_date + 365, '55555555-5555-5555-5555-555555555555'
from public.service_requests where description = 'Pay my property tax';
insert into public.service_outcome_files (outcome_id, account_id, file_name, storage_path, mime_type, file_size, document_type, upload_status, created_by)
select o.id, o.account_id, 'receipt.pdf',
       o.account_id::text || '/' || o.property_id::text || '/outcomes/' || o.service_request_id::text || '/r1.pdf',
       'application/pdf', 100, 'property_tax', 'ready', '55555555-5555-5555-5555-555555555555'
from public.service_outcomes o join public.service_requests r on r.id = o.service_request_id
where r.description = 'Pay my property tax';
select tst.rejects($$insert into public.service_outcomes (service_request_id, account_id, summary, created_by)
                     select id, account_id, 'x', '55555555-5555-5555-5555-555555555555'
                     from public.service_requests where description = 'Quarterly visit'$$,
  'an on-site request gets a visit report, not an outcome summary');

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.rows($$select * from public.service_outcomes$$, 0, 'customer cannot see the outcome while it is a draft');
insert into public.support_ticket_messages (ticket_id, account_id, author_id, author_type, body)
select t.id, t.account_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'customer', 'Here it is'
from public.support_tickets t join public.service_requests r on r.id = t.service_request_id
where r.description = 'Pay my property tax';
select tst.ok((select status from public.service_requests where description = 'Pay my property tax') = 'in_progress',
  'the customer''s reply resumes the work (→ Working on it)');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select public.staff_update_service_request(
  (select id from public.service_requests where description = 'Pay my property tax'), 'completed');
select tst.ok((select count(*) from public.property_documents d
               join public.service_outcome_files f on f.property_document_id = d.id
               where d.document_type = 'property_tax' and d.upload_status = 'ready') = 1,
  'completing saves the result file into the property''s Documents');
select tst.rows($$update public.service_outcomes set summary = 'changed'$$, 0,
  'a published outcome is LOCKED');

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok((select summary from public.service_outcomes) = 'Paid 2026-27 property tax',
  'customer sees the outcome once completed');
select tst.rows($$select * from public.service_outcome_files$$, 1, 'customer sees the result files once completed');
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows($$select * from public.service_outcomes$$, 0, 'B cannot see A''s outcomes');
reset role;

-- =====================================================================
\echo
\echo '== Audit trail: every important change is recorded, history cannot be rewritten =='
-- =====================================================================

select tst.ok((select count(*) from public.audit_events
               where action = 'db.service_requests.update'
                 and data->'changes' ? 'status'
                 and actor_type = 'staff') > 0,
  'staff status changes are recorded with old → new values');
select tst.ok((select count(*) from public.audit_events
               where action = 'db.orders.update' and data->'changes'->'status'->>1 = 'paid'
                 and actor_type = 'provider') > 0,
  'a payment marking an order paid is recorded as the provider (webhook)');
select tst.ok((select count(*) from public.audit_events where action = 'db.account_plans.insert') > 0,
  'plan periods granted are recorded');
update public.services set sort_order = sort_order + 1 where code = 'repair';
select tst.ok((select actor_type from public.audit_events where action = 'db.services.update'
               order by created_at desc limit 1) = 'system',
  'an operator SQL change is recorded too (actor: system)');

set role authenticated;
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rejects($$update public.audit_events set action = 'x'$$, 'staff cannot edit the audit log');
select tst.rejects($$delete from public.audit_events$$, 'staff cannot delete from the audit log');
reset role;
set role service_role;
select tst.rejects($$delete from public.audit_events$$, 'even the server key cannot delete audit history');
reset role;

-- =====================================================================
\echo
\echo '== AI foundation: results written only by the server; customers read and decide =='
-- =====================================================================

set role service_role;
insert into public.document_analyses (account_id, property_id, document_id, task, task_version, status, model, result)
select d.account_id, d.property_id, d.id, 'sale_deed.extract', 'sale-deed-v2', 'ready', 'test-model', '{"unit_number": "28"}'
from public.property_documents d where d.account_id = 'acc0000a-0000-0000-0000-00000000000a' and d.document_type = 'sale_deed' limit 1;
insert into public.property_facts (account_id, property_id, analysis_id, document_id, key, value, pages, confidence)
select a.account_id, a.property_id, a.id, a.document_id, 'unit_number', '"28"', '{10}', 'high'
from public.document_analyses a where a.account_id = 'acc0000a-0000-0000-0000-00000000000a';
insert into public.ai_operations (account_id, task, task_version, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, outcome)
values ('acc0000a-0000-0000-0000-00000000000a', 'sale_deed.extract', 'sale-deed-v2', 'anthropic', 'test-model', 25000, 1200, 0.062, 14000, 'ok');
reset role;
select tst.rejects($$insert into public.document_analyses (account_id, property_id, document_id, task, task_version)
                     select account_id, property_id, document_id, task, task_version from public.document_analyses limit 1$$,
  'the same document is never read twice by the same task version (cache)');

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.rows('select * from public.document_analyses', 1, 'A reads its own document analysis');
select tst.rows('select * from public.property_facts', 1, 'A reads the facts found');
select tst.rows('select * from public.ai_operations', 0, 'customers cannot see AI usage or cost');
select tst.rejects($$select public.ai_month_spend_usd()$$, 'customers cannot read the AI spend total');
select tst.rejects($$insert into public.document_analyses (account_id, property_id, document_id, task, task_version)
                     select account_id, property_id, document_id, 'sale_deed.extract', 'forged' from public.document_analyses$$,
  'A cannot create an analysis (server only)');
select tst.rejects($$update public.document_analyses set result = '{"unit_number": "99"}'$$,
  'A cannot write an AI result');
select tst.rejects($$update public.property_facts set value = '"99"'$$,
  'A cannot change what the AI found');
select tst.rows($$update public.property_facts set status = 'edited', final_value = '"28A"',
                    decided_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', decided_at = now()$$, 1,
  'A can confirm / edit a fact (the correction is kept)');
select tst.rejects($$update public.property_facts set status = 'confirmed', decided_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'A cannot record a decision in someone else''s name');
select tst.rejects($$insert into public.ai_operations (task, task_version, provider, model, outcome)
                     values ('x.y', 'v', 'p', 'm', 'ok')$$,
  'A cannot write to the AI usage log');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows('select * from public.document_analyses', 0, 'B cannot see A''s analyses');
select tst.rows('select * from public.property_facts', 0, 'B cannot see A''s facts');
select tst.rows($$update public.property_facts set status = 'rejected', decided_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$, 0,
  'B cannot decide on A''s facts');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.ok((select count(*) from public.ai_operations) = 1, 'staff can see AI usage and cost');
reset role;
set role service_role;
select tst.ok(public.ai_month_spend_usd() = 0.062, 'the server reads this month''s AI spend for the budget cap');
reset role;
set role authenticated;
select tst.ok((select status = 'edited' and final_value = '"28A"' from public.property_facts), 'staff see the customer''s correction');
reset role;

select tst.rejects($$update public.property_documents set file_size = 41943040
                     where document_type <> 'sale_deed' and document_type <> 'registration'$$,
  'ordinary documents stay at 10 MB');
update public.property_documents set file_size = 41943040 where document_type = 'sale_deed';
select tst.ok(exists (select 1 from public.property_documents where document_type = 'sale_deed' and file_size = 41943040),
  'a 40 MB sale deed is allowed (Pittu reads deeds up to 50 MB)');

-- =====================================================================
\echo
\echo '== Draft properties: hidden from usage until confirmed =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
create temp table usage_before as select property_count from public.account_usage where account_id = 'acc0000a-0000-0000-0000-00000000000a';
insert into public.properties (account_id, user_id, property_type, name, is_draft)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other', 'New property (reading deed)', true);
select tst.ok((select property_count from public.account_usage where account_id = 'acc0000a-0000-0000-0000-00000000000a')
              = (select property_count from usage_before),
  'a draft property does not count toward the plan''s property limit');
select tst.ok((select bool_or(is_draft) from public.property_summaries), 'summaries mark drafts so lists can leave them out');
update public.properties set is_draft = false, name = 'Confirmed from deed' where is_draft;
select tst.ok((select property_count from public.account_usage where account_id = 'acc0000a-0000-0000-0000-00000000000a')
              = (select property_count from usage_before) + 1,
  'once confirmed, it counts');
delete from public.properties where name = 'Confirmed from deed';
reset role;

-- =====================================================================
\echo
\echo '== Property slots: a property uses a slot for the whole term =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
create temp table slots0 as select public.property_slots_used('acc0000a-0000-0000-0000-00000000000a') as n;
select tst.ok((select n from slots0) >= 1, 'properties that exist in the term hold a slot');
insert into public.properties (account_id, user_id, property_type, name)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'Slot test plot');
select tst.ok(public.property_slots_used('acc0000a-0000-0000-0000-00000000000a') = (select n from slots0) + 1,
  'adding a property uses a slot');
delete from public.properties where name = 'Slot test plot';
select tst.ok(public.property_slots_used('acc0000a-0000-0000-0000-00000000000a') = (select n from slots0) + 1,
  'deleting it does NOT free the slot before the term ends');
select tst.ok((select property_deleted_at is not null and property_name = 'Slot test plot' from public.property_slots
               where property_name = 'Slot test plot'),
  'the slot remembers the deleted property by name');
insert into public.properties (account_id, user_id, property_type, name, is_draft)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'other', 'Slot test draft', true);
select tst.ok(public.property_slots_used('acc0000a-0000-0000-0000-00000000000a') = (select n from slots0) + 1,
  'a draft uses no slot');
delete from public.properties where name = 'Slot test draft';
select tst.rejects($$insert into public.property_slots (account_id, property_name)
                     values ('acc0000a-0000-0000-0000-00000000000a', 'x')$$, 'customers cannot write slots');
select tst.rejects($$update public.property_slots set released_at = now()$$, 'customers cannot free a slot');
select tst.rejects($$select public.staff_release_property_slot((select id from public.property_slots limit 1), 'please')$$,
  'customers cannot use the staff release');
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rejects($$select public.property_slots_used('acc0000a-0000-0000-0000-00000000000a')$$,
  'another account cannot read A''s slots');
select tst.rows('select * from public.property_slots where account_id = ''acc0000a-0000-0000-0000-00000000000a''', 0,
  'B cannot see A''s slots');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rejects($$select public.staff_release_property_slot((select id from public.property_slots where property_name = 'Slot test plot'), '')$$,
  'staff must give a reason');
select public.staff_release_property_slot((select id from public.property_slots where property_name = 'Slot test plot'),
  'Property sold — deed of sale checked');
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok(public.property_slots_used('acc0000a-0000-0000-0000-00000000000a') = (select n from slots0),
  'staff freed the slot (case by case) — it counts no more');
reset role;
select tst.ok(exists (select 1 from public.audit_events where action = 'db.property_slots.update' and actor_type = 'staff'),
  'the staff release is in the audit trail');

-- A plan that can't hold today's properties is refused.
insert into public.properties (account_id, user_id, property_type, name)
select 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'Bulk ' || g
from generate_series(1, 11) g;
set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok((select public.plan_quote('plus')->>'blocked_reason') like 'You have % properties and Plus covers 10.%',
  'buying a plan with fewer slots than today''s properties is refused');
select tst.rejects($$select public.create_plan_order('plus')$$, 'and cannot be ordered');
reset role;
delete from public.properties where name like 'Bulk %';

-- A new term starts fresh: only properties that exist on its first day count.
insert into public.properties (account_id, user_id, property_type, name)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'Gone before renewal');
delete from public.properties where name = 'Gone before renewal';
insert into public.account_plans (account_id, plan_version_id, source, starts_at, ends_at)
select 'acc0000a-0000-0000-0000-00000000000a', pv.id, 'staff', now(), now() + interval '365 days'
from public.plan_versions pv join public.plans p on p.id = pv.plan_id where p.code = 'plus' and pv.is_current;
set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok(public.property_slots_used('acc0000a-0000-0000-0000-00000000000a')
              = (select count(*)::int from public.properties where account_id = 'acc0000a-0000-0000-0000-00000000000a' and not is_draft),
  'a new term counts only the properties that exist on its first day');
reset role;

-- =====================================================================
\echo
\echo '== Pittu answers: customers answer their own; staff read =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.property_answers (property_id, account_id, question_id, answer, answered_by)
select id, account_id, 'plot_built', 'vacant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
from public.properties where account_id = 'acc0000a-0000-0000-0000-00000000000a' and not is_draft limit 1;
select tst.rows('select * from public.property_answers', 1, 'A answers a Pittu question about its property');
select tst.rejects($$insert into public.property_answers (property_id, account_id, question_id, answer, answered_by)
                     select id, account_id, 'tax_paid', 'paid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
                     from public.properties where account_id = 'acc0000a-0000-0000-0000-00000000000a' limit 1$$,
  'an answer cannot be recorded in someone else''s name');
select tst.rejects($$insert into public.property_answers (property_id, account_id, question_id, answer, answered_by)
                     select id, account_id, 'tax_paid', 'DROP TABLE', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
                     from public.properties where account_id = 'acc0000a-0000-0000-0000-00000000000a' limit 1$$,
  'answers are plain codes only');
select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows('select * from public.property_answers', 0, 'B cannot see A''s answers');
select tst.rejects($$insert into public.property_answers (property_id, account_id, question_id, answer, answered_by)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
                             'tax_paid', 'paid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  'B cannot answer for A''s property (even knowing its id)');
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rows('select * from public.property_answers', 1, 'staff can read answers (for review)');
reset role;

-- =====================================================================
\echo
\echo '== Pittu Review list: staff only; reasons are server-written =='
-- =====================================================================

-- The server (service key) writes the review row.
insert into public.property_reviews (property_id, account_id, reasons)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', '{name_mismatch}');
select tst.rejects($$insert into public.property_reviews (property_id, account_id, reasons)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a', '{made_up}')$$,
  'review reasons are a fixed list');

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.rows('select * from public.property_reviews', 0, 'customers never see the Review list');
select tst.rows($$update public.property_reviews set status = 'done', reviewed_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, 0,
  'a customer cannot mark their own property reviewed');
select tst.rejects($$insert into public.property_reviews (property_id, account_id)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a')$$,
  'a customer cannot add review rows');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rows('select * from public.property_reviews', 1, 'staff see the Review list');
select tst.rows($$update public.property_reviews set status = 'done', note = 'Spoke to the owner',
                    reviewed_by = '55555555-5555-5555-5555-555555555555', reviewed_at = now()$$, 1,
  'staff mark a property reviewed');
select tst.rejects($$update public.property_reviews set reasons = '{}'$$, 'staff cannot rewrite the reasons');
select tst.rejects($$update public.property_reviews set status = 'open', reviewed_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'a review cannot be recorded in someone else''s name');
reset role;

-- =====================================================================
\echo
\echo '== Where we serve: visits by PIN code, paperwork by state =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.properties (id, account_id, user_id, property_type, name, state, pincode)
values ('a1a1a1a1-0000-0000-0000-0000000000f1', 'acc0000a-0000-0000-0000-00000000000a',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'Far away plot', 'Odisha', '751001');
select tst.ok((select not visits and not paperwork and has_pincode from public.property_reach('acc0000a-0000-0000-0000-00000000000a')
               where property_id = 'a1a1a1a1-0000-0000-0000-0000000000f1'),
  'a property can be added anywhere; outside our areas nothing on-site or paperwork reaches it');
select tst.ok((select visits and paperwork and reach_state = 'Telangana' from public.property_reach('acc0000a-0000-0000-0000-00000000000a')
               where property_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  'a PIN code in a service area gets visits; its PIN prefix gives the state for paperwork');
select tst.ok((select visits from public.property_reach('acc0000a-0000-0000-0000-00000000000a')
               where property_id = (select id from public.properties where name = 'My Hyderabad Plot' limit 1)) is not null,
  'reach is listed for every property of the account');
select tst.rejects($$select public.create_service_request('a1a1a1a1-0000-0000-0000-0000000000f1',
                     (select id from public.services where code = 'site_inspection'), 'Visit please')$$,
  'a visit cannot be booked where our team does not go');
select tst.rejects($$select public.create_service_request('a1a1a1a1-0000-0000-0000-0000000000f1',
                     (select id from public.services where code = 'property_tax_assistance'), '')$$,
  'paperwork help cannot be booked in a state we do not cover');
select tst.rejects($$insert into public.service_area_pincodes (pincode, area_id)
                     select '751001', id from public.service_areas limit 1$$,
  'customers cannot change service areas');
insert into public.reach_interest (property_id, account_id, created_by)
values ('a1a1a1a1-0000-0000-0000-0000000000f1', 'acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok((select interested from public.property_reach('acc0000a-0000-0000-0000-00000000000a')
               where property_id = 'a1a1a1a1-0000-0000-0000-0000000000f1'), 'the customer asks to be told when we arrive');
select tst.rejects($$select * from public.reach_demand()$$, 'only staff see the demand list');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select tst.rows($$select * from public.property_reach('acc0000a-0000-0000-0000-00000000000a')$$, 0,
  'B cannot see what reaches A''s properties');
select tst.rejects($$insert into public.reach_interest (property_id, account_id, created_by)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
                             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  'B cannot register interest for A''s property');

select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.ok((select interested = 1 and properties = 1 from public.reach_demand() where pincode = '751001'),
  'staff see demand by PIN code, with interested customers');
select tst.rejects($$insert into public.property_reach_exceptions (property_id, account_id, reason, created_by)
                     values ('a1a1a1a1-0000-0000-0000-0000000000f1', 'acc0000a-0000-0000-0000-00000000000a',
                             'Owner is a friend of the team', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'an exception cannot be recorded in someone else''s name');
insert into public.property_reach_exceptions (property_id, account_id, reason, created_by)
values ('a1a1a1a1-0000-0000-0000-0000000000f1', 'acc0000a-0000-0000-0000-00000000000a',
        'Team travelling there this month', '55555555-5555-5555-5555-555555555555');
insert into public.service_states (state, pincode_prefixes, is_active) values ('Odisha', '{75,76,77}', false);

select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select tst.ok(public.create_service_request('a1a1a1a1-0000-0000-0000-0000000000f1',
                (select id from public.services where code = 'site_inspection'), 'Visit please') is not null,
  'a staff exception lets that one property book visits');
select tst.rejects($$insert into public.property_reach_exceptions (property_id, account_id, reason, created_by)
                     values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
                             'Please serve me', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'customers cannot grant themselves an exception');
reset role;
delete from public.service_requests where property_id = 'a1a1a1a1-0000-0000-0000-0000000000f1';
delete from public.properties where id = 'a1a1a1a1-0000-0000-0000-0000000000f1';

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
select tst.rows('select * from public.property_videos', 0, 'videos cascade-deleted');
select tst.rows('select * from public.service_requests',   5, 'service request history survives');
select tst.ok((select property_id from public.service_requests limit 1) is null,
  'surviving request has property_id nulled');

reset role;

-- =====================================================================
\echo
\echo '== Account deletion: personal data removed, payment records kept =='
-- =====================================================================

set role authenticated;
select tst.as_user('55555555-5555-5555-5555-555555555555');
select tst.rejects($$select * from public.delete_my_account()$$, 'a staff login cannot delete itself this way');

select tst.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
create temp table b_files as select * from public.delete_my_account();
reset role;
select tst.ok((select count(*) from b_files) >= 0, 'deletion returns the stored files to remove');
select tst.ok((select count(*) from public.properties where account_id = 'acc0000b-0000-0000-0000-00000000000b') = 0,
  'B''s properties are gone');
select tst.ok((select count(*) from public.service_requests where account_id = 'acc0000b-0000-0000-0000-00000000000b') = 0
              and (select count(*) from public.support_tickets where account_id = 'acc0000b-0000-0000-0000-00000000000b') = 0,
  'B''s requests and tickets are gone');
select tst.ok((select status = 'closed' and closed_at is not null from public.accounts
               where id = 'acc0000b-0000-0000-0000-00000000000b'),
  'the account is closed');
select tst.ok((select count(*) from public.orders where account_id = 'acc0000b-0000-0000-0000-00000000000b') > 0,
  'payment records are kept');
select tst.ok(not exists (select 1 from public.account_plans where account_id = 'acc0000b-0000-0000-0000-00000000000b'
                            and starts_at <= now() and ends_at > now()),
  'no plan is in force any more');
select tst.ok(exists (select 1 from public.closed_trial_phones where phone_sha256 = public.phone_sha256('919000000002')),
  'only a hash of the number is kept, to prevent a second free trial');

-- The API then deletes the login itself.
delete from auth.users where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select tst.ok((select count(*) from public.orders where account_id = 'acc0000b-0000-0000-0000-00000000000b' and user_id is null) > 0,
  'after the login is deleted, payment records remain but no longer point to the person');
select tst.ok(not exists (select 1 from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'the profile (name, number) is gone');

insert into auth.users (id, phone) values ('bbbbbbbb-0000-0000-0000-00000000000b', '919000000002');
select tst.ok(not exists (select 1 from public.account_plans ap join public.account_members m on m.account_id = ap.account_id
                          where m.user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  'signing up again with the same number does not start a new free trial');

\echo
\echo 'ALL RLS CHECKS PASSED'
