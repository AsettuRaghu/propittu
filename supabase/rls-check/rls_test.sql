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
grant usage on schema tst to anon, authenticated;

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

grant execute on all functions in schema tst to anon, authenticated;

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


-- =====================================================================
\echo
\echo '== User A creates data in account A =='
-- =====================================================================

set role authenticated;
select tst.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select tst.ok(public.current_account_id() = 'acc0000a-0000-0000-0000-00000000000a',
  'current_account_id() resolves A to account A');
select tst.rows('select * from public.accounts', 1, 'A sees only its own account');

insert into public.properties (id, account_id, user_id, property_type, name, city, state, area_value, area_unit)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'acc0000a-0000-0000-0000-00000000000a',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'land', 'My Hyderabad Plot', 'Hyderabad', 'Telangana', 2400, 'sqft');

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

insert into public.service_requests (id, account_id, user_id, property_id, service_id, description)
select 'a1a1a1a1-0000-0000-0000-0000000000f1', 'acc0000a-0000-0000-0000-00000000000a',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1a1a1a1-0000-0000-0000-000000000001', s.id,
       'Please inspect the boundary wall'
from public.services s where s.code = 'site_inspection';

insert into storage.objects (bucket_id, name)
values ('property-documents', 'acc0000a-0000-0000-0000-00000000000a/a1a1a1a1-0000-0000-0000-000000000001/d1.pdf');

insert into public.audit_events (account_id, actor_user_id, actor_type, action, entity_type, entity_id)
values ('acc0000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user',
        'property.created', 'property', 'a1a1a1a1-0000-0000-0000-000000000001');

select tst.rows('select * from public.properties', 1, 'A sees its account''s property');
select tst.ok((select reference from public.service_requests limit 1) = 'PR-000123',
  'first service request reference is PR-000123');
select tst.rows('select * from public.services', 10, 'A sees the 10 catalogue services');
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
select tst.rows('select * from public.audit_events', 1, 'staff can read the audit log');
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
                   join public.plans p on p.id = v.plan_id where p.code = 'plus'$$, 10,
  'Plus v1 has 4 Feature Benefits + 5 Usage Limits + 1 Included Service');
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
select tst.rows('select * from public.service_requests',   1, 'service request history survives');
select tst.ok((select property_id from public.service_requests limit 1) is null,
  'surviving request has property_id nulled');

reset role;
\echo
\echo 'ALL RLS CHECKS PASSED'
