-- =====================================================================
-- Account deletion (App Store 5.1.1(v), Google Play account deletion,
-- DPDP Act 2023 right to erasure)
--
-- delete_my_account() — run by the signed-in owner — removes the customer's
-- personal data in one transaction:
--   properties (+ photos, videos, documents), service requests (+ visit
--   reports, outcomes and their files), support tickets (+ messages,
--   attachments).
-- and returns every stored file to remove. The API then removes the files
-- and finally deletes the login (auth user), which removes the profile and
-- membership.
--
-- KEPT (legal / accounting): orders, payments, refunds and plan periods —
-- unlinked from the person (user_id set null when the login is deleted) —
-- and the audit trail. The account row stays, status 'closed'.
--
-- A deleted number does not get a second free trial: only a one-way hash
-- of the number is kept, never the number itself.
-- =====================================================================

alter table public.accounts add column closed_at timestamptz;

-- Payment records outlive the login that made them.
alter table public.orders alter column user_id drop not null;
alter table public.orders drop constraint orders_user_id_fkey;
alter table public.orders add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

create table public.closed_trial_phones (
  phone_sha256  text        primary key check (phone_sha256 ~ '^[0-9a-f]{64}$'),
  closed_at     timestamptz not null default now()
);
alter table public.closed_trial_phones enable row level security;
revoke all on public.closed_trial_phones from anon, authenticated;

create or replace function public.phone_sha256(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_phone, ''), 'UTF8')), 'hex');
$$;

-- New users: as before, but no Trial for a number that already had one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_account uuid;
  invited_role text;
begin
  insert into public.profiles (id, phone)
  values (new.id, coalesce(new.phone, ''))
  on conflict (id) do nothing;

  if not exists (select 1 from public.account_members where user_id = new.id) then
    insert into public.accounts default values returning id into new_account;
    insert into public.account_members (account_id, user_id, role)
    values (new_account, new.id, 'owner');
    if not exists (select 1 from public.closed_trial_phones
                   where phone_sha256 = public.phone_sha256(new.phone)) then
      perform public.start_trial(new_account);
    end if;
  end if;

  select role into invited_role from public.staff_invites where phone = new.phone;
  if invited_role is not null then
    insert into public.staff_members (user_id, role) values (new.id, invited_role)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;


create or replace function public.delete_my_account()
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  acc uuid := public.current_account_id();
  a record;
  v_phone text;
begin
  if uid is null or acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_members where user_id = uid) then
    raise exception 'Staff logins are removed by an administrator' using errcode = '42501';
  end if;
  if not exists (select 1 from public.account_members
                 where account_id = acc and user_id = uid and role = 'owner') then
    raise exception 'Only the account owner can delete the account' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_members where account_id = acc and user_id <> uid) then
    raise exception 'Remove the other members first' using errcode = '23514';
  end if;

  select * into a from public.accounts where id = acc for update;
  select phone into v_phone from public.profiles where id = uid;

  -- Every stored file of this account (collected before the rows go).
  create temporary table if not exists _deleted_files (bucket text, path text) on commit drop;
  truncate _deleted_files;
  insert into _deleted_files
    select 'property-photos', storage_path from public.property_photos where account_id = acc
    union all
    select 'property-videos', storage_path from public.property_videos where account_id = acc
    union all
    select 'property-documents', storage_path from public.property_documents where account_id = acc
    union all
    select case m.kind when 'video' then 'property-videos' else 'property-photos' end, m.storage_path
      from public.visit_report_media m where m.account_id = acc
    union all
    select 'property-documents', storage_path from public.support_ticket_attachments where account_id = acc
    union all
    select 'property-documents', storage_path from public.service_outcome_files where account_id = acc;

  -- Personal data. Cascades take photos/videos/documents, reports, outcomes,
  -- media, messages and attachments with their parents.
  delete from public.support_tickets where account_id = acc;
  delete from public.service_requests where account_id = acc;
  delete from public.properties where account_id = acc;
  delete from public.usage_records where account_id = acc;

  -- The plan stops now; the periods themselves stay with the payment records.
  update public.account_plans set ends_at = now()
  where account_id = acc and starts_at < now() and ends_at > now();
  update public.account_plans set cancel_at_period_end = true, cancelled_at = now()
  where account_id = acc and starts_at >= now();

  update public.accounts set status = 'closed', closed_at = now() where id = acc;

  if a.trial_started_at is not null and coalesce(v_phone, '') <> '' then
    insert into public.closed_trial_phones (phone_sha256)
    values (public.phone_sha256(v_phone))
    on conflict (phone_sha256) do nothing;
  end if;

  update public.profiles set full_name = null where id = uid;

  return query select distinct f.bucket, f.path from _deleted_files f where f.path is not null;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
