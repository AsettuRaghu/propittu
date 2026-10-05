-- =====================================================================
-- M1 Account + M10 security foundation + M11 audit events
--
-- Account is the commercial owner of the Propittu experience:
--   Account → Plan → Benefits → Usage, and Account → Property → …
--
-- V1: exactly one User per Account (enforced by a unique index that can
-- be dropped later for multi-user accounts). Every customer-owned row
-- carries account_id; user_id on those rows now means "created by".
--
-- Additive and non-destructive: existing users get an account, existing
-- rows are backfilled, no data is dropped.
-- =====================================================================


-- ---------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------

create table public.accounts (
  id          uuid        primary key default gen_random_uuid(),
  name        text        check (name is null or char_length(name) <= 120),
  status      text        not null default 'active'
                          check (status in ('active', 'suspended', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- account_members: User → Account (roles ready for multi-user later)
-- ---------------------------------------------------------------------

create table public.account_members (
  account_id  uuid        not null references public.accounts (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  role        text        not null default 'owner' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (account_id, user_id)
);

-- V1: a user belongs to exactly one account. Drop to allow multi-account users.
create unique index account_members_one_account_per_user on public.account_members (user_id);


-- ---------------------------------------------------------------------
-- staff_members: the Backoffice security boundary (separate from customers)
-- ---------------------------------------------------------------------

create table public.staff_members (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  role        text        not null check (role in (
                            'super_admin', 'operations', 'support', 'finance', 'service_operations')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- Helper functions used by RLS policies and the API.
--
-- security definer so they can read account_members / staff_members
-- without recursive RLS evaluation; they only ever answer questions
-- about the CALLER (auth.uid()), never about other users.
-- ---------------------------------------------------------------------

create or replace function public.current_account_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.account_id from public.account_members m where m.user_id = auth.uid() limit 1;
$$;

create or replace function public.is_account_member(target_account uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = target_account and m.user_id = auth.uid()
  );
$$;

-- For storage policies: the first path segment is an account id (as text).
create or replace function public.is_account_folder(folder text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id::text = folder and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members s where s.user_id = auth.uid() and s.is_active
  );
$$;

revoke all on function public.current_account_id()      from public, anon;
revoke all on function public.is_account_member(uuid)   from public, anon;
revoke all on function public.is_account_folder(text)   from public, anon;
revoke all on function public.is_staff()                from public, anon;
grant execute on function public.current_account_id()    to authenticated;
grant execute on function public.is_account_member(uuid) to authenticated;
grant execute on function public.is_account_folder(text) to authenticated;
grant execute on function public.is_staff()              to authenticated;


-- ---------------------------------------------------------------------
-- New users: profile + account + owner membership, atomically.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_account uuid;
begin
  insert into public.profiles (id, phone)
  values (new.id, coalesce(new.phone, ''))
  on conflict (id) do nothing;

  if not exists (select 1 from public.account_members where user_id = new.id) then
    insert into public.accounts default values returning id into new_account;
    insert into public.account_members (account_id, user_id, role)
    values (new_account, new.id, 'owner');
  end if;

  return new;
end;
$$;

-- Backfill: every existing user gets an account.
do $$
declare
  u record;
  new_account uuid;
begin
  for u in
    select id from auth.users
    where id not in (select user_id from public.account_members)
  loop
    insert into public.accounts default values returning id into new_account;
    insert into public.account_members (account_id, user_id, role)
    values (new_account, u.id, 'owner');
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- account_id on every customer-owned table (backfilled, then required)
-- ---------------------------------------------------------------------

alter table public.properties add column account_id uuid references public.accounts (id) on delete cascade;
update public.properties p set account_id = m.account_id
  from public.account_members m where m.user_id = p.user_id;
alter table public.properties alter column account_id set not null;
create index properties_account_created_idx on public.properties (account_id, created_at desc);
comment on column public.properties.user_id is 'User who created the property. Ownership is account_id.';

alter table public.property_photos add column account_id uuid references public.accounts (id) on delete cascade;
update public.property_photos x set account_id = p.account_id
  from public.properties p where p.id = x.property_id;
alter table public.property_photos alter column account_id set not null;
create index property_photos_account_idx on public.property_photos (account_id);
comment on column public.property_photos.user_id is 'User who uploaded the photo. Ownership is account_id.';

alter table public.property_documents add column account_id uuid references public.accounts (id) on delete cascade;
update public.property_documents x set account_id = p.account_id
  from public.properties p where p.id = x.property_id;
alter table public.property_documents alter column account_id set not null;
create index property_documents_account_idx on public.property_documents (account_id);
comment on column public.property_documents.user_id is 'User who uploaded the document. Ownership is account_id.';

alter table public.service_requests add column account_id uuid references public.accounts (id) on delete cascade;
update public.service_requests r set account_id = m.account_id
  from public.account_members m where m.user_id = r.user_id;
alter table public.service_requests alter column account_id set not null;
create index service_requests_account_created_idx on public.service_requests (account_id, created_at desc);
comment on column public.service_requests.user_id is 'User who raised the request. Ownership is account_id.';

-- Storage paths: new uploads use <account_id>/<property_id>/…; existing
-- uploads keep their legacy <user_id>/<property_id>/… paths.
alter table public.property_photos drop constraint property_photos_path_owned;
alter table public.property_photos add constraint property_photos_path_owned check (
  storage_path like (account_id::text || '/' || property_id::text || '/%')
  or storage_path like (user_id::text || '/' || property_id::text || '/%')
);
alter table public.property_documents drop constraint property_documents_path_owned;
alter table public.property_documents add constraint property_documents_path_owned check (
  storage_path like (account_id::text || '/' || property_id::text || '/%')
  or storage_path like (user_id::text || '/' || property_id::text || '/%')
);

-- Summary view now exposes account_id (security_invoker keeps RLS in force).
create or replace view public.property_summaries
with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.property_type,
  p.name,
  p.city,
  p.state,
  p.created_at,
  (select count(*)::int from public.property_documents d
    where d.property_id = p.id and d.upload_status = 'ready') as document_count,
  (select count(*)::int from public.service_requests r
    where r.property_id = p.id) as service_request_count,
  (select ph.storage_path from public.property_photos ph
    where ph.property_id = p.id and ph.upload_status = 'ready'
    order by ph.created_at limit 1) as cover_photo_path,
  p.account_id
from public.properties p;


-- ---------------------------------------------------------------------
-- audit_events (M11): important business events, append-only.
-- ---------------------------------------------------------------------

create table public.audit_events (
  id             uuid        primary key default gen_random_uuid(),
  account_id     uuid        references public.accounts (id) on delete set null,
  actor_user_id  uuid        references auth.users (id) on delete set null,
  actor_type     text        not null check (actor_type in ('user', 'staff', 'system', 'provider')),
  action         text        not null check (char_length(action) between 1 and 80),
  entity_type    text        check (entity_type is null or char_length(entity_type) <= 40),
  entity_id      uuid,
  data           jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index audit_events_account_created_idx on public.audit_events (account_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);


-- =====================================================================
-- Row Level Security — rebuilt around Account membership.
-- Customers: rows of THEIR account. Staff: read access across accounts
-- (write paths for staff are added per module in later migrations).
-- =====================================================================

-- accounts ------------------------------------------------------------
alter table public.accounts enable row level security;
revoke all on public.accounts from anon;
revoke insert, update, delete on public.accounts from authenticated;
grant select on public.accounts to authenticated;
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_account_member(id) or public.is_staff());

-- account_members -----------------------------------------------------
alter table public.account_members enable row level security;
revoke all on public.account_members from anon;
revoke insert, update, delete on public.account_members from authenticated;
grant select on public.account_members to authenticated;
create policy account_members_select on public.account_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- staff_members -------------------------------------------------------
alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon;
revoke insert, update, delete on public.staff_members from authenticated;
grant select on public.staff_members to authenticated;
create policy staff_members_select on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- profiles: staff may read --------------------------------------------
drop policy profiles_select_own on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

-- properties ----------------------------------------------------------
drop policy properties_select_own on public.properties;
drop policy properties_insert_own on public.properties;
drop policy properties_update_own on public.properties;
drop policy properties_delete_own on public.properties;

create policy properties_select on public.properties for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy properties_insert on public.properties for insert to authenticated
  with check (public.is_account_member(account_id) and user_id = (select auth.uid()));
create policy properties_update on public.properties for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));
create policy properties_delete on public.properties for delete to authenticated
  using (public.is_account_member(account_id));

-- property_photos -----------------------------------------------------
drop policy property_photos_select_own on public.property_photos;
drop policy property_photos_insert_own on public.property_photos;
drop policy property_photos_update_own on public.property_photos;
drop policy property_photos_delete_own on public.property_photos;

create policy property_photos_select on public.property_photos for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy property_photos_insert on public.property_photos for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and user_id = (select auth.uid())
    and exists (select 1 from public.properties p
                where p.id = property_id and p.account_id = property_photos.account_id)
  );
create policy property_photos_update on public.property_photos for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));
create policy property_photos_delete on public.property_photos for delete to authenticated
  using (public.is_account_member(account_id));

-- property_documents --------------------------------------------------
drop policy property_documents_select_own on public.property_documents;
drop policy property_documents_insert_own on public.property_documents;
drop policy property_documents_update_own on public.property_documents;
drop policy property_documents_delete_own on public.property_documents;

create policy property_documents_select on public.property_documents for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy property_documents_insert on public.property_documents for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and user_id = (select auth.uid())
    and exists (select 1 from public.properties p
                where p.id = property_id and p.account_id = property_documents.account_id)
  );
create policy property_documents_update on public.property_documents for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));
create policy property_documents_delete on public.property_documents for delete to authenticated
  using (public.is_account_member(account_id));

-- service_requests ----------------------------------------------------
drop policy service_requests_select_own on public.service_requests;
drop policy service_requests_insert_own on public.service_requests;

create policy service_requests_select on public.service_requests for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy service_requests_insert on public.service_requests for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and user_id = (select auth.uid())
    and status = 'submitted'
    and (
      property_id is null
      or exists (select 1 from public.properties p
                 where p.id = property_id and p.account_id = service_requests.account_id)
    )
  );

-- audit_events: customers append their own; only staff read ----------
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon;
revoke update, delete on public.audit_events from authenticated;
grant select, insert on public.audit_events to authenticated;
create policy audit_events_insert on public.audit_events for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and (
      (actor_type = 'user' and public.is_account_member(account_id))
      or (actor_type = 'staff' and public.is_staff())
    )
  );
create policy audit_events_select on public.audit_events for select to authenticated
  using (public.is_staff());


-- ---------------------------------------------------------------------
-- Storage: account folders (new) + legacy user folders; staff read/write
-- (staff write is needed for visit-report media in M4).
-- ---------------------------------------------------------------------

drop policy property_files_select_own on storage.objects;
drop policy property_files_insert_own on storage.objects;
drop policy property_files_update_own on storage.objects;
drop policy property_files_delete_own on storage.objects;

create policy property_files_select on storage.objects for select to authenticated
  using (
    bucket_id in ('property-photos', 'property-documents')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

create policy property_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('property-photos', 'property-documents')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

create policy property_files_update on storage.objects for update to authenticated
  using (
    bucket_id in ('property-photos', 'property-documents')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
  with check (
    bucket_id in ('property-photos', 'property-documents')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy property_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('property-photos', 'property-documents')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
