-- =====================================================================
-- Family and helpers (owner, 11 Oct 2026). An owner invites family by
-- phone; once they sign in with that phone and accept, they're a member of
-- the owner's account (and still have their own). Members see and use the
-- properties; only the owner deletes properties or the account, and manages
-- who has access. Nominees: who should be given access if something happens
-- to the owner (our team grants it after checking).
-- =====================================================================

-- A person can belong to more than one account now.
drop index if exists public.account_members_one_account_per_user;

-- The account a request acts on: the one the app chose (header), else the
-- person's own, else any — the same rule as the API (src/auth.ts).
create or replace function public.current_account_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid()
  order by (m.account_id::text = coalesce(
             (nullif(current_setting('request.headers', true), '')::json ->> 'x-propittu-account'), '')) desc,
           (m.role = 'owner') desc,
           m.created_at
  limit 1;
$$;

create or replace function public.is_account_owner(target_account uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.account_members m
                 where m.account_id = target_account and m.user_id = auth.uid() and m.role = 'owner');
$$;
revoke all on function public.is_account_owner(uuid) from public, anon;
grant execute on function public.is_account_owner(uuid) to authenticated;

create table public.account_invites (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts (id) on delete cascade,
  phone       text        not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  name        text        not null check (char_length(trim(name)) between 1 and 80),
  relation    text        check (relation is null or char_length(relation) <= 40),
  status      text        not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invited_by  uuid        references auth.users (id) on delete set null,
  accepted_by uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
create unique index account_invites_open_idx on public.account_invites (account_id, phone) where status = 'pending';

create table public.account_nominees (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts (id) on delete cascade,
  name        text        not null check (char_length(trim(name)) between 1 and 80),
  relation    text        check (relation is null or char_length(relation) <= 40),
  phone       text        check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  note        text        check (note is null or char_length(note) <= 500),
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.account_invites enable row level security;
alter table public.account_nominees enable row level security;
revoke all on public.account_invites, public.account_nominees from anon, authenticated;
grant select, insert, update on public.account_invites to authenticated;
grant select, insert, update, delete on public.account_nominees to authenticated;

-- Owners manage their account's invites; staff read them.
create policy account_invites_owner on public.account_invites for all to authenticated
  using (public.is_staff() or public.is_account_owner(account_id))
  with check (public.is_account_owner(account_id));
create policy account_nominees_owner on public.account_nominees for all to authenticated
  using (public.is_staff() or public.is_account_owner(account_id))
  with check (public.is_account_owner(account_id));

-- Invites waiting for the signed-in person (matched on their login phone).
create or replace function public.my_account_invites()
returns table (id uuid, account_id uuid, name text, relation text, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.account_id, i.name, i.relation, p.full_name, i.created_at
  from public.account_invites i
  left join public.profiles p on p.id = i.invited_by
  where i.status = 'pending' and i.expires_at > now()
    and i.phone = (select '+' || u.phone from auth.users u where u.id = auth.uid())
    and not exists (select 1 from public.account_members m
                    where m.account_id = i.account_id and m.user_id = auth.uid());
$$;
revoke all on function public.my_account_invites() from public, anon;
grant execute on function public.my_account_invites() to authenticated;

-- Accept (or decline) an invite meant for the signed-in person's phone.
create or replace function public.answer_account_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  inv public.account_invites;
  my_phone text;
begin
  select '+' || u.phone into my_phone from auth.users u where u.id = auth.uid();
  select * into inv from public.account_invites
   where id = p_invite and status = 'pending' and expires_at > now() for update;
  if inv.id is null or inv.phone is distinct from my_phone then
    raise exception 'This invitation is not for you, or has expired' using errcode = '42501';
  end if;
  if p_accept then
    insert into public.account_members (account_id, user_id, role)
    values (inv.account_id, auth.uid(), 'member')
    on conflict do nothing;
  end if;
  update public.account_invites
     set status = case when p_accept then 'accepted' else 'declined' end,
         accepted_by = case when p_accept then auth.uid() else null end
   where id = inv.id;
  return inv.account_id;
end;
$$;
revoke all on function public.answer_account_invite(uuid, boolean) from public, anon;
grant execute on function public.answer_account_invite(uuid, boolean) to authenticated;

-- A member leaves an account they were invited to (an owner can't leave their own).
create or replace function public.leave_account(p_account uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from public.account_members
  where account_id = p_account and user_id = auth.uid() and role = 'member';
$$;
revoke all on function public.leave_account(uuid) from public, anon;
grant execute on function public.leave_account(uuid) to authenticated;

insert into public.services
  (code, name, category, description, sort_order, fulfilment, reach, includes, turnaround, expected_days)
values
  ('will_succession', 'Will & Succession Help', 'property_government',
   'Make sure your family can take over your property smoothly: a Will drafted with a lawyer, nominees recorded, and the papers your heirs will need in one place.',
   37, 'assistance', 'state',
   array['A Will drafted and reviewed by a lawyer', 'Registration of the Will, if you want it',
         'A list of what your heirs will need, for each property'],
   'Usually 2–3 weeks', 21)
on conflict (code) do nothing;
insert into public.service_coverage (service_id, kind, value)
select n.id, c.kind, c.value
from public.services n
join public.services o on o.code = 'document_verification'
join public.service_coverage c on c.service_id = o.id
where n.code = 'will_succession'
on conflict do nothing;
