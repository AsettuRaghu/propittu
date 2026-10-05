-- =====================================================================
-- M5 Plans & Benefits + M6 Free Trial, Usage, Limited Access
--
--   Account → Plan → Benefits → Usage
--
-- Everything is data, never `if plan == premium`:
--   plans            — Trial, Basic, Plus …
--   plan_versions    — Basic v1, Plus v1, Plus v2 … (price, billing, term)
--   plan_version_benefits
--        kind = feature           e.g. video_upload
--        kind = limit             e.g. max_properties = 5
--        kind = included_service  e.g. property_visit × 2 per year
--   account_plans    — which version an Account holds, and when
--   usage_records    — traceable consumption of Included Services (M4)
--
-- Customers keep the version they got; changing configuration never
-- silently changes an existing customer's Benefits.
-- Capacity usage (properties, documents, media, storage) is derived from
-- the actual rows, so it is always traceable and delete frees capacity.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Plans and versions
-- ---------------------------------------------------------------------

create table public.plans (
  id           uuid        primary key default gen_random_uuid(),
  code         text        not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name         text        not null check (char_length(name) between 1 and 60),
  description  text        not null default '' check (char_length(description) <= 500),
  -- Shown in "available Plans" and purchasable. The Trial is not.
  is_public    boolean     not null default true,
  is_active    boolean     not null default true,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);

create table public.plan_versions (
  id              uuid        primary key default gen_random_uuid(),
  plan_id         uuid        not null references public.plans (id),
  version         integer     not null check (version > 0),
  price_paise     integer     not null default 0 check (price_paise >= 0),
  currency        text        not null default 'INR' check (currency = 'INR'),
  billing_period  text        not null check (billing_period in ('none', 'month', 'year')),
  term_days       integer     not null check (term_days > 0),
  -- New customers get the current version; existing customers keep theirs.
  is_current      boolean     not null default false,
  created_at      timestamptz not null default now(),
  unique (plan_id, version)
);

create unique index plan_versions_one_current_per_plan
  on public.plan_versions (plan_id) where is_current;

create table public.plan_version_benefits (
  id               uuid    primary key default gen_random_uuid(),
  plan_version_id  uuid    not null references public.plan_versions (id) on delete cascade,
  kind             text    not null check (kind in ('feature', 'limit', 'included_service')),
  code             text    not null check (code ~ '^[a-z][a-z0-9_]*$'),
  value            integer check (value is null or value >= 0),
  period           text    check (period is null or period in ('year', 'term')),
  unique (plan_version_id, kind, code),
  constraint plan_version_benefits_shape check (
    (kind = 'feature'          and value is null     and period is null)
    or (kind = 'limit'            and value is not null and period is null)
    or (kind = 'included_service' and value is not null and period is not null)
  )
);


-- ---------------------------------------------------------------------
-- Account → Plan (M5) and Trial eligibility (M6)
-- ---------------------------------------------------------------------

alter table public.accounts add column trial_started_at timestamptz;

create table public.account_plans (
  id                    uuid        primary key default gen_random_uuid(),
  account_id            uuid        not null references public.accounts (id) on delete cascade,
  plan_version_id       uuid        not null references public.plan_versions (id),
  source                text        not null check (source in ('trial', 'payment', 'staff')),
  starts_at             timestamptz not null default now(),
  ends_at               timestamptz not null,
  -- Cancellation = no renewal; the current period continues (M7).
  cancel_at_period_end  boolean     not null default false,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  constraint account_plans_period check (ends_at > starts_at)
);

create index account_plans_account_period_idx on public.account_plans (account_id, ends_at desc);


-- ---------------------------------------------------------------------
-- Usage of Included Services (consumed when a request is confirmed, M4)
-- ---------------------------------------------------------------------

create table public.usage_records (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts (id) on delete cascade,
  account_plan_id     uuid        references public.account_plans (id) on delete set null,
  kind                text        not null check (kind in ('included_service')),
  code                text        not null check (code ~ '^[a-z][a-z0-9_]*$'),
  quantity            integer     not null default 1 check (quantity > 0),
  service_request_id  uuid        references public.service_requests (id) on delete set null,
  created_at          timestamptz not null default now(),
  -- Set when consumption is reversed (e.g. a confirmed visit is cancelled).
  released_at         timestamptz
);

create index usage_records_account_code_idx on public.usage_records (account_id, code, created_at desc);


-- ---------------------------------------------------------------------
-- Derived capacity usage per Account (security_invoker: RLS applies)
-- ---------------------------------------------------------------------

create view public.account_usage
with (security_invoker = true) as
select
  a.id as account_id,
  (select count(*)::int from public.properties p where p.account_id = a.id) as property_count,
  (
    coalesce((select sum(file_size) from public.property_photos x
              where x.account_id = a.id and x.upload_status = 'ready'), 0)
    + coalesce((select sum(file_size) from public.property_documents x
                where x.account_id = a.id and x.upload_status = 'ready'), 0)
    + coalesce((select sum(file_size) from public.property_videos x
                where x.account_id = a.id and x.upload_status = 'ready'), 0)
  )::bigint as storage_bytes
from public.accounts a;


-- ---------------------------------------------------------------------
-- Staff invites: a phone number that becomes staff on its first login.
-- Rows are inserted by operators (never committed to the repository).
-- ---------------------------------------------------------------------

create table public.staff_invites (
  phone       text        primary key check (phone ~ '^91[6-9][0-9]{9}$'),
  role        text        not null check (role in (
                            'super_admin', 'operations', 'support', 'finance', 'service_operations')),
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- Starts the Free Trial for an eligible Account (once per Account, M6).
create or replace function public.start_trial(target_account uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  trial_version uuid;
  trial_days integer;
begin
  if exists (select 1 from public.accounts where id = target_account and trial_started_at is not null) then
    return;
  end if;

  select pv.id, pv.term_days into trial_version, trial_days
  from public.plan_versions pv
  join public.plans p on p.id = pv.plan_id
  where p.code = 'trial' and p.is_active and pv.is_current;

  if trial_version is null then
    return; -- no Trial configured
  end if;

  insert into public.account_plans (account_id, plan_version_id, source, starts_at, ends_at)
  values (target_account, trial_version, 'trial', now(), now() + make_interval(days => trial_days));

  update public.accounts set trial_started_at = now() where id = target_account;
end;
$$;

revoke all on function public.start_trial(uuid) from public, anon, authenticated;

-- New users: profile + account + owner membership + Trial + staff invite.
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
    perform public.start_trial(new_account);
  end if;

  select role into invited_role from public.staff_invites where phone = new.phone;
  if invited_role is not null then
    insert into public.staff_members (user_id, role) values (new.id, invited_role)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Customer cancellation: no renewal, the current paid period continues.
create or replace function public.cancel_current_plan()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.account_plans
  set cancel_at_period_end = true, cancelled_at = now()
  where account_id = public.current_account_id()
    and source <> 'trial'
    and starts_at <= now() and ends_at > now()
    and not cancel_at_period_end;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.cancel_current_plan() from public, anon;
grant execute on function public.cancel_current_plan() to authenticated;


-- ---------------------------------------------------------------------
-- Seed: Trial, Basic, Plus — v1. PLACEHOLDER commercials (not final);
-- edit the data, never the code.
-- ---------------------------------------------------------------------

insert into public.plans (code, name, description, is_public, sort_order) values
  ('trial', 'Free Trial', 'Try everything in Plus free for 30 days.', false, 0),
  ('basic', 'Basic', 'For one property: keep its documents, photos and videos safe.', true, 10),
  ('plus', 'Plus', 'For owners with several properties, with regular property visits.', true, 20);

insert into public.plan_versions (plan_id, version, price_paise, billing_period, term_days, is_current)
select id, 1,
       case code when 'trial' then 0 when 'basic' then 49900 when 'plus' then 149900 end,
       case code when 'trial' then 'none' else 'year' end,
       case code when 'trial' then 30 else 365 end,
       true
from public.plans;

-- Feature Benefits: every V1 plan includes the core features.
insert into public.plan_version_benefits (plan_version_id, kind, code)
select pv.id, 'feature', f.code
from public.plan_versions pv
cross join (values ('property_profile'), ('document_upload'), ('photo_upload'), ('video_upload')) as f(code);

-- Usage Limits.
insert into public.plan_version_benefits (plan_version_id, kind, code, value)
select pv.id, 'limit', l.code,
       case p.code when 'basic' then l.basic else l.plus end
from public.plan_versions pv
join public.plans p on p.id = pv.plan_id
cross join (values
  ('max_properties',              1,   5),
  ('max_documents_per_property', 10,  50),
  ('max_photos_per_property',    20, 100),
  ('max_videos_per_property',     2,  10),
  ('max_storage_mb',            512, 2048)
) as l(code, basic, plus);

-- Included Services (property visits per year). Trial gets Plus Benefits.
insert into public.plan_version_benefits (plan_version_id, kind, code, value, period)
select pv.id, 'included_service', 'property_visit',
       case p.code when 'basic' then 1 else 2 end, 'year'
from public.plan_versions pv
join public.plans p on p.id = pv.plan_id;


-- Backfill: every existing Account starts its Trial now.
do $$
declare
  a record;
begin
  for a in select id from public.accounts where trial_started_at is null loop
    perform public.start_trial(a.id);
  end loop;
end;
$$;


-- =====================================================================
-- Row Level Security
-- =====================================================================

-- Plan configuration: readable by any signed-in user; staff maintain it.
alter table public.plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_version_benefits enable row level security;
revoke all on public.plans, public.plan_versions, public.plan_version_benefits from anon;
revoke delete on public.plans, public.plan_versions, public.plan_version_benefits from authenticated;
grant select, insert, update on public.plans, public.plan_versions, public.plan_version_benefits to authenticated;

create policy plans_select on public.plans for select to authenticated using (true);
create policy plans_staff_insert on public.plans for insert to authenticated with check (public.is_staff());
create policy plans_staff_update on public.plans for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy plan_versions_select on public.plan_versions for select to authenticated using (true);
create policy plan_versions_staff_insert on public.plan_versions for insert to authenticated
  with check (public.is_staff());
create policy plan_versions_staff_update on public.plan_versions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy plan_benefits_select on public.plan_version_benefits for select to authenticated using (true);
create policy plan_benefits_staff_insert on public.plan_version_benefits for insert to authenticated
  with check (public.is_staff());
create policy plan_benefits_staff_update on public.plan_version_benefits for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- account_plans: customers read their own; only staff (or system
-- functions) write. Customers can never grant themselves a Plan.
alter table public.account_plans enable row level security;
revoke all on public.account_plans from anon;
revoke delete on public.account_plans from authenticated;
grant select, insert, update on public.account_plans to authenticated;
create policy account_plans_select on public.account_plans for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy account_plans_staff_insert on public.account_plans for insert to authenticated
  with check (public.is_staff());
create policy account_plans_staff_update on public.account_plans for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- usage_records: customers read their own; staff record consumption.
alter table public.usage_records enable row level security;
revoke all on public.usage_records from anon;
revoke delete on public.usage_records from authenticated;
grant select, insert, update on public.usage_records to authenticated;
create policy usage_records_select on public.usage_records for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy usage_records_staff_insert on public.usage_records for insert to authenticated
  with check (public.is_staff());
create policy usage_records_staff_update on public.usage_records for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- account_usage view: RLS of the underlying tables applies.
revoke all on public.account_usage from anon;
grant select on public.account_usage to authenticated;

-- staff_invites: staff can read; written only by operators via SQL.
alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from anon, authenticated;
grant select on public.staff_invites to authenticated;
create policy staff_invites_select on public.staff_invites for select to authenticated
  using (public.is_staff());

-- Staff can change an Account's status (suspend / reactivate).
grant update (status) on public.accounts to authenticated;
create policy accounts_staff_update on public.accounts for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
