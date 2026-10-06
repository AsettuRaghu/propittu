-- =====================================================================
-- Where we can serve (product decision 2026-10-06)
--
-- Customers may add a property ANYWHERE. What depends on location is
-- which services we can deliver there:
--
--   services.reach = 'area'        our team visits → the property's PIN code
--                                  must be in an active service area
--                    'state'       paperwork help  → the property must be in
--                                  an active service state
--                    'everywhere'  no location needed
--
--   service_areas / service_area_pincodes   visit coverage (PIN allow-list)
--   service_states                          paperwork coverage; a property's
--                                           state comes from its PIN prefix
--                                           first, then the typed state
--   property_reach_exceptions               staff: "serve this one anyway"
--   reach_interest                          customer: "tell me when you arrive"
--
-- create_service_request() refuses a service that cannot reach the
-- property, so no app version can book a visit we cannot make.
-- =====================================================================

alter table public.services
  add column reach text not null default 'area' check (reach in ('area', 'state', 'everywhere'));
update public.services set reach = case when fulfilment = 'assistance' then 'state' else 'area' end;

create table public.service_areas (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique check (char_length(name) between 1 and 80),
  state       text        not null check (char_length(state) between 1 and 60),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger service_areas_set_updated_at
  before update on public.service_areas for each row execute function public.set_updated_at();

-- One PIN code belongs to at most one area.
create table public.service_area_pincodes (
  pincode     text        primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  area_id     uuid        not null references public.service_areas (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index service_area_pincodes_area_idx on public.service_area_pincodes (area_id);

create table public.service_states (
  state             text        primary key check (char_length(state) between 1 and 60),
  -- PIN code prefixes of this state (e.g. Karnataka 56–59, Telangana 50).
  pincode_prefixes  text[]      not null default '{}'
                                check (array_to_string(pincode_prefixes, ',') ~ '^([1-9][0-9]{0,2}(,[1-9][0-9]{0,2})*)?$'),
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger service_states_set_updated_at
  before update on public.service_states for each row execute function public.set_updated_at();

create table public.property_reach_exceptions (
  property_id  uuid        primary key references public.properties (id) on delete cascade,
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  reason       text        not null check (char_length(reason) between 3 and 500),
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.reach_interest (
  property_id  uuid        primary key references public.properties (id) on delete cascade,
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index reach_interest_account_idx on public.reach_interest (account_id);

-- ---------------------------------------------------------------------
-- RLS. Coverage lists are not sensitive: any signed-in user may read
-- them; only staff change them (the API also checks services.manage).
-- ---------------------------------------------------------------------

alter table public.service_areas enable row level security;
alter table public.service_area_pincodes enable row level security;
alter table public.service_states enable row level security;
alter table public.property_reach_exceptions enable row level security;
alter table public.reach_interest enable row level security;
revoke all on public.service_areas, public.service_area_pincodes, public.service_states,
  public.property_reach_exceptions, public.reach_interest from anon, authenticated;

grant select, insert, update, delete on public.service_areas, public.service_area_pincodes,
  public.service_states to authenticated;
create policy service_areas_read on public.service_areas for select to authenticated using (true);
create policy service_areas_staff on public.service_areas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy service_area_pincodes_read on public.service_area_pincodes for select to authenticated using (true);
create policy service_area_pincodes_staff on public.service_area_pincodes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy service_states_read on public.service_states for select to authenticated using (true);
create policy service_states_staff on public.service_states for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

grant select, insert, delete on public.property_reach_exceptions to authenticated;
create policy property_reach_exceptions_staff_read on public.property_reach_exceptions
  for select to authenticated using (public.is_staff());
create policy property_reach_exceptions_staff_add on public.property_reach_exceptions
  for insert to authenticated
  with check (
    public.is_staff() and created_by = (select auth.uid())
    and exists (select 1 from public.properties p
                where p.id = property_id and p.account_id = property_reach_exceptions.account_id)
  );
create policy property_reach_exceptions_staff_remove on public.property_reach_exceptions
  for delete to authenticated using (public.is_staff());

grant select, insert, delete on public.reach_interest to authenticated;
create policy reach_interest_read on public.reach_interest for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy reach_interest_add on public.reach_interest for insert to authenticated
  with check (
    public.is_account_member(account_id) and created_by = (select auth.uid())
    and exists (select 1 from public.properties p
                where p.id = property_id and p.account_id = reach_interest.account_id)
  );
create policy reach_interest_remove on public.reach_interest for delete to authenticated
  using (public.is_account_member(account_id));

create trigger service_areas_audit after insert or update or delete on public.service_areas
  for each row execute function public.audit_row_change();
create trigger service_area_pincodes_audit after insert or update or delete on public.service_area_pincodes
  for each row execute function public.audit_row_change();
create trigger service_states_audit after insert or update or delete on public.service_states
  for each row execute function public.audit_row_change();
create trigger property_reach_exceptions_audit after insert or update or delete on public.property_reach_exceptions
  for each row execute function public.audit_row_change();
create trigger reach_interest_audit after insert or update or delete on public.reach_interest
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------
-- What reaches each property of an account (members and staff only).
-- ---------------------------------------------------------------------

create or replace function public.property_reach(p_account uuid)
returns table (
  property_id  uuid,
  area_name    text,
  reach_state  text,
  visits       boolean,
  paperwork    boolean,
  has_pincode  boolean,
  is_exception boolean,
  interested   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         a.name,
         st.state,
         a.id is not null or x.property_id is not null,
         coalesce(st.is_active, false) or x.property_id is not null,
         p.pincode is not null,
         x.property_id is not null,
         i.property_id is not null
  from public.properties p
  left join public.service_area_pincodes ap on ap.pincode = p.pincode
  left join public.service_areas a on a.id = ap.area_id and a.is_active
  left join lateral (
    select c.state, c.is_active from (
      select s.state, s.is_active, 1 as pri from public.service_states s
      where p.pincode is not null
        and exists (select 1 from unnest(s.pincode_prefixes) pre where left(p.pincode, length(pre)) = pre)
      union all
      select s.state, s.is_active, 2 from public.service_states s
      where lower(trim(p.state)) = lower(s.state)
    ) c order by c.pri limit 1
  ) st on true
  left join public.property_reach_exceptions x on x.property_id = p.id
  left join public.reach_interest i on i.property_id = p.id
  where p.account_id = p_account
    and (public.is_account_member(p_account) or public.is_staff());
$$;
revoke all on function public.property_reach(uuid) from public, anon;
grant execute on function public.property_reach(uuid) to authenticated;

/** Why a service cannot be delivered at a property (null = it can). */
create or replace function public.service_reach_problem(p_property uuid, p_service uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  svc_reach text;
  r record;
begin
  select reach into svc_reach from public.services where id = p_service;
  if svc_reach is null or svc_reach = 'everywhere' then
    return null;
  end if;
  select * into r from public.property_reach(
    (select account_id from public.properties where id = p_property)) pr
  where pr.property_id = p_property;
  if not found then
    return 'not_in_area';
  end if;
  if svc_reach = 'area' and not r.visits then
    return case when r.has_pincode then 'not_in_area' else 'no_pincode' end;
  end if;
  if svc_reach = 'state' and not r.paperwork then
    return 'not_in_state';
  end if;
  return null;
end;
$$;
revoke all on function public.service_reach_problem(uuid, uuid) from public, anon, authenticated;

/** Staff: properties our team cannot visit yet, by PIN code (where to grow next). */
create or replace function public.reach_demand()
returns table (pincode text, place text, properties integer, interested integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return query
  select p.pincode,
         (array_agg(coalesce(nullif(trim(p.city), ''), p.state) order by p.created_at desc))[1],
         count(*)::integer,
         count(i.property_id)::integer
  from public.properties p
  left join public.service_area_pincodes ap on ap.pincode = p.pincode
  left join public.service_areas a on a.id = ap.area_id and a.is_active
  left join public.property_reach_exceptions x on x.property_id = p.id
  left join public.reach_interest i on i.property_id = p.id
  where not p.is_draft and a.id is null and x.property_id is null
  group by p.pincode
  order by count(i.property_id) desc, count(*) desc
  limit 100;
end;
$$;
revoke all on function public.reach_demand() from public, anon;
grant execute on function public.reach_demand() to authenticated;

-- ---------------------------------------------------------------------
-- Requests: same as 20261006000007, plus the reach check.
-- ---------------------------------------------------------------------

create or replace function public.create_service_request(
  p_property uuid, p_service uuid, p_description text, p_preferred_date date default null,
  p_preferred_slot text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
  svc record;
  remaining integer;
  cov text;
  price integer;
  new_id uuid;
  problem text;
begin
  if acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  -- Serialises requests per Account so the last Included visit is never given twice.
  perform 1 from public.accounts where id = acc and status = 'active' for update;
  if not found then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  if not exists (select 1 from public.account_plans
                 where account_id = acc and starts_at <= now() and ends_at > now()) then
    raise exception 'No active Plan (Limited Access)' using errcode = '42501';
  end if;
  if not exists (select 1 from public.properties where id = p_property and account_id = acc) then
    raise exception 'Property not found' using errcode = '42501';
  end if;

  select id, code, price_paise, is_extra_available into svc
  from public.services where id = p_service and is_active;
  if not found then
    raise exception 'Service not available' using errcode = '23514';
  end if;

  problem := public.service_reach_problem(p_property, p_service);
  if problem is not null then
    raise exception 'Service does not reach this property (%)', problem using errcode = '23514';
  end if;

  remaining := public.included_remaining(acc, svc.code);
  if remaining is not null and remaining > 0 then
    cov := 'included';
    price := null;
  elsif svc.is_extra_available then
    cov := 'extra';
    price := svc.price_paise;
  else
    raise exception 'Service not available as an Extra Service' using errcode = '23514';
  end if;

  insert into public.service_requests
    (account_id, user_id, property_id, service_id, description, coverage, price_paise,
     preferred_date, preferred_slot)
  values
    (acc, auth.uid(), p_property, p_service, coalesce(trim(p_description), ''), cov, price,
     p_preferred_date, p_preferred_slot)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_service_request(uuid, uuid, text, date, text) from public, anon;
grant execute on function public.create_service_request(uuid, uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Launch coverage: visits across Bengaluru Urban district (India Post
-- directory, district "Bangalore": the city plus Anekal taluk); paperwork
-- help in Karnataka and Telangana. Staff change all of this in Backoffice.
-- ---------------------------------------------------------------------

insert into public.service_states (state, pincode_prefixes) values
  ('Karnataka', '{56,57,58,59}'),
  ('Telangana', '{50}');

with area as (
  insert into public.service_areas (name, state) values ('Bengaluru', 'Karnataka') returning id
)
insert into public.service_area_pincodes (pincode, area_id)
select v.pincode, area.id from area, (values
  ('560001'),
  ('560002'),
  ('560003'),
  ('560004'),
  ('560005'),
  ('560006'),
  ('560007'),
  ('560008'),
  ('560009'),
  ('560010'),
  ('560011'),
  ('560012'),
  ('560013'),
  ('560014'),
  ('560015'),
  ('560016'),
  ('560017'),
  ('560018'),
  ('560019'),
  ('560020'),
  ('560021'),
  ('560022'),
  ('560023'),
  ('560024'),
  ('560025'),
  ('560026'),
  ('560027'),
  ('560028'),
  ('560029'),
  ('560030'),
  ('560032'),
  ('560033'),
  ('560034'),
  ('560035'),
  ('560036'),
  ('560037'),
  ('560038'),
  ('560039'),
  ('560040'),
  ('560041'),
  ('560042'),
  ('560043'),
  ('560045'),
  ('560046'),
  ('560047'),
  ('560048'),
  ('560049'),
  ('560050'),
  ('560051'),
  ('560052'),
  ('560053'),
  ('560054'),
  ('560055'),
  ('560056'),
  ('560057'),
  ('560058'),
  ('560059'),
  ('560060'),
  ('560061'),
  ('560062'),
  ('560063'),
  ('560064'),
  ('560065'),
  ('560066'),
  ('560067'),
  ('560068'),
  ('560069'),
  ('560070'),
  ('560071'),
  ('560072'),
  ('560073'),
  ('560074'),
  ('560075'),
  ('560076'),
  ('560077'),
  ('560078'),
  ('560079'),
  ('560080'),
  ('560081'),
  ('560082'),
  ('560083'),
  ('560084'),
  ('560085'),
  ('560086'),
  ('560087'),
  ('560091'),
  ('560092'),
  ('560093'),
  ('560094'),
  ('560095'),
  ('560096'),
  ('560097'),
  ('560098'),
  ('560099'),
  ('560100'),
  ('560102'),
  ('560103'),
  ('560104'),
  ('560105'),
  ('560108'),
  ('560109'),
  ('560110'),
  ('560112'),
  ('560300'),
  ('562106'),
  ('562107'),
  ('562125'),
  ('562130'),
  ('562149'),
  ('562157'),
  ('562164')
) as v(pincode);
