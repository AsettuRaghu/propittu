-- =====================================================================
-- Coverage by PIN code (owner decisions 8 Oct 2026).
--
--   pincodes            India's PIN directory (Department of Posts, GODL):
--                       place, district, state for every PIN. Loaded by
--                       supabase/pincodes/pincodes.mjs, not by migrations.
--   coverage_zones      named groups of PINs ("Bengaluru East", "All of
--     + rules           Telangana"): a whole state, a whole district, single
--                       PINs, or PINs left out. State and district rules
--                       follow the directory, so a zone stays complete.
--   service_coverage    where each service is offered: everywhere, zones,
--                       states, districts or single PINs.
--
-- A service reaches a property when its coverage includes the property's
-- PIN (or, without a directory match, its typed state), or when staff made
-- an exception for that property. Today's visit areas become zones and the
-- paperwork states become state rules on the paperwork services, so nothing
-- changes for customers on day one. The old area/state tables stay for now
-- (unused) and are dropped later.
-- =====================================================================

create table public.pincodes (
  pincode     text        primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  place       text        not null,
  district    text        not null,
  state       text        not null,
  localities  text[]      not null default '{}',
  updated_at  timestamptz not null default now()
);
create index pincodes_state_district_idx on public.pincodes (state, district);

create table public.coverage_zones (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique check (char_length(trim(name)) between 1 and 60),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- value: a state name, "District|State", or a PIN code.
create table public.coverage_zone_rules (
  id          uuid        primary key default gen_random_uuid(),
  zone_id     uuid        not null references public.coverage_zones (id) on delete cascade,
  kind        text        not null check (kind in ('state', 'district', 'pincode', 'exclude')),
  value       text        not null check (char_length(value) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (zone_id, kind, value),
  constraint coverage_zone_rules_pin check (kind not in ('pincode', 'exclude') or value ~ '^[1-9][0-9]{5}$')
);
create index coverage_zone_rules_zone_idx on public.coverage_zone_rules (zone_id);

-- value: '' (everywhere), a zone id, a state, "District|State", or a PIN code.
create table public.service_coverage (
  id          uuid        primary key default gen_random_uuid(),
  service_id  uuid        not null references public.services (id) on delete cascade,
  kind        text        not null check (kind in ('everywhere', 'zone', 'state', 'district', 'pincode')),
  value       text        not null default '',
  created_at  timestamptz not null default now(),
  unique (service_id, kind, value),
  constraint service_coverage_pin check (kind <> 'pincode' or value ~ '^[1-9][0-9]{5}$')
);
create index service_coverage_service_idx on public.service_coverage (service_id);

-- ---------------------------------------------------------------------
-- Day one: today's coverage, carried over unchanged.
-- ---------------------------------------------------------------------

insert into public.coverage_zones (id, name, is_active, created_at)
select id, name, is_active, created_at from public.service_areas;
insert into public.coverage_zone_rules (zone_id, kind, value)
select area_id, 'pincode', pincode from public.service_area_pincodes;

insert into public.service_coverage (service_id, kind, value)
select s.id, 'everywhere', '' from public.services s where s.reach = 'everywhere';
insert into public.service_coverage (service_id, kind, value)
select s.id, 'zone', z.id::text from public.services s cross join public.coverage_zones z where s.reach = 'area';
insert into public.service_coverage (service_id, kind, value)
select s.id, 'state', st.state from public.services s cross join public.service_states st
where s.reach = 'state' and st.is_active;

-- ---------------------------------------------------------------------
-- Access: anyone signed in may look up a PIN; coverage is staff-managed.
-- ---------------------------------------------------------------------

alter table public.pincodes enable row level security;
alter table public.coverage_zones enable row level security;
alter table public.coverage_zone_rules enable row level security;
alter table public.service_coverage enable row level security;
revoke all on public.pincodes, public.coverage_zones, public.coverage_zone_rules, public.service_coverage
  from anon, authenticated;
grant select on public.pincodes to authenticated;
grant select, insert, update, delete on public.coverage_zones, public.coverage_zone_rules, public.service_coverage
  to authenticated;
create policy pincodes_read on public.pincodes for select to authenticated using (true);
create policy coverage_zones_staff on public.coverage_zones for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy coverage_zone_rules_staff on public.coverage_zone_rules for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy service_coverage_staff on public.service_coverage for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create trigger coverage_zones_audit after insert or update or delete on public.coverage_zones
  for each row execute function public.audit_row_change();
create trigger coverage_zone_rules_audit after insert or update or delete on public.coverage_zone_rules
  for each row execute function public.audit_row_change();
create trigger service_coverage_audit after insert or update or delete on public.service_coverage
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------
-- The checks
-- ---------------------------------------------------------------------

/** Is this PIN in this (live) zone? State/district rules follow the directory. */
create or replace function public.zone_has_pincode(p_zone uuid, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_pin is not null
    and exists (select 1 from public.coverage_zones z where z.id = p_zone and z.is_active)
    and not exists (select 1 from public.coverage_zone_rules r
                    where r.zone_id = p_zone and r.kind = 'exclude' and r.value = p_pin)
    and exists (
      select 1 from public.coverage_zone_rules r
      left join public.pincodes d on d.pincode = p_pin
      where r.zone_id = p_zone
        and ((r.kind = 'pincode' and r.value = p_pin)
          or (r.kind = 'state' and r.value = d.state)
          or (r.kind = 'district' and r.value = d.district || '|' || d.state)));
$$;
revoke all on function public.zone_has_pincode(uuid, text) from public, anon;
grant execute on function public.zone_has_pincode(uuid, text) to authenticated;

/**
 * Does this service reach this place? p_state is the property's typed state,
 * used only when the PIN is not in the directory (or there is no PIN).
 */
create or replace function public.service_covers(p_service uuid, p_pin text, p_state text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select pincode, district, state from public.pincodes where pincode = p_pin)
  select exists (
    select 1 from public.service_coverage c
    where c.service_id = p_service
      and (c.kind = 'everywhere'
        or (c.kind = 'pincode' and c.value = p_pin)
        or (c.kind = 'zone' and public.zone_has_pincode(c.value::uuid, p_pin))
        or (c.kind = 'state' and lower(c.value) = lower(coalesce((select state from d), trim(p_state))))
        or (c.kind = 'district' and c.value = (select district || '|' || state from d))));
$$;
revoke all on function public.service_covers(uuid, text, text) from public, anon;
grant execute on function public.service_covers(uuid, text, text) to authenticated;

-- What reaches each property: the same columns as before (older app versions
-- read visits/paperwork), plus the services that reach it.
drop function public.property_reach(uuid);
create function public.property_reach(p_account uuid)
returns table (
  property_id  uuid,
  area_name    text,
  reach_state  text,
  visits       boolean,
  paperwork    boolean,
  has_pincode  boolean,
  is_exception boolean,
  interested   boolean,
  service_ids  uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         (select z.name from public.coverage_zones z
          where public.zone_has_pincode(z.id, p.pincode) order by z.name limit 1),
         coalesce(d.state, nullif(trim(p.state), '')),
         x.property_id is not null or exists (
           select 1 from public.services s
           where s.is_active and s.fulfilment = 'visit' and s.id = any (av.ids)),
         x.property_id is not null or exists (
           select 1 from public.services s
           where s.is_active and s.fulfilment = 'assistance' and s.id = any (av.ids)),
         p.pincode is not null,
         x.property_id is not null,
         i.property_id is not null,
         case when x.property_id is not null
              then (select coalesce(array_agg(s.id), '{}') from public.services s where s.is_active)
              else av.ids end
  from public.properties p
  left join public.pincodes d on d.pincode = p.pincode
  left join public.property_reach_exceptions x on x.property_id = p.id
  left join public.reach_interest i on i.property_id = p.id
  cross join lateral (
    select coalesce(array_agg(s.id), '{}') as ids from public.services s
    where s.is_active and public.service_covers(s.id, p.pincode, p.state)
  ) av
  where p.account_id = p_account
    and (public.is_account_member(p_account) or public.is_staff());
$$;
revoke all on function public.property_reach(uuid) from public, anon;
grant execute on function public.property_reach(uuid) to authenticated;

/** Why a service cannot be delivered at a property (null = it can). Same codes as before. */
create or replace function public.service_reach_problem(p_property uuid, p_service uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p record;
  f text;
begin
  select pr.id, pr.pincode, pr.state into p from public.properties pr where pr.id = p_property;
  if not found then
    return 'not_in_area';
  end if;
  if exists (select 1 from public.property_reach_exceptions x where x.property_id = p_property)
     or public.service_covers(p_service, p.pincode, p.state) then
    return null;
  end if;
  select fulfilment into f from public.services where id = p_service;
  if p.pincode is null then
    return 'no_pincode';
  end if;
  return case when f = 'assistance' then 'not_in_state' else 'not_in_area' end;
end;
$$;
revoke all on function public.service_reach_problem(uuid, uuid) from public, anon, authenticated;

/** Staff: properties outside every live zone, by PIN code (where to grow next). */
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
         coalesce(max(d.place || ', ' || d.district),
                  (array_agg(coalesce(nullif(trim(p.city), ''), p.state) order by p.created_at desc))[1]),
         count(*)::integer,
         count(i.property_id)::integer
  from public.properties p
  left join public.pincodes d on d.pincode = p.pincode
  left join public.property_reach_exceptions x on x.property_id = p.id
  left join public.reach_interest i on i.property_id = p.id
  where not p.is_draft and x.property_id is null
    and not exists (select 1 from public.coverage_zones z where public.zone_has_pincode(z.id, p.pincode))
  group by p.pincode
  order by count(i.property_id) desc, count(*) desc
  limit 200;
end;
$$;
revoke all on function public.reach_demand() from public, anon;
grant execute on function public.reach_demand() to authenticated;

-- ---------------------------------------------------------------------
-- Staff views for the Coverage pages
-- ---------------------------------------------------------------------

/** Every (zone, PIN) pair: rules expanded through the directory, exclusions removed. */
create or replace function public.zone_pins()
returns table (zone_id uuid, pincode text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.zone_id, d.pincode
  from public.coverage_zone_rules r
  join public.pincodes d
    on (r.kind = 'state' and d.state = r.value)
    or (r.kind = 'district' and d.district || '|' || d.state = r.value)
    or (r.kind = 'pincode' and d.pincode = r.value)
  where public.is_staff()
  union
  select r.zone_id, r.value from public.coverage_zone_rules r
  where r.kind = 'pincode' and public.is_staff()
  except
  select r.zone_id, r.value from public.coverage_zone_rules r where r.kind = 'exclude';
$$;
revoke all on function public.zone_pins() from public, anon;
grant execute on function public.zone_pins() to authenticated;

/** PIN codes with their place, live zones and number of properties; filtered and paged. */
create or replace function public.staff_pincode_search(
  p_q text default null, p_state text default null, p_district text default null,
  p_zone uuid default null, p_covered boolean default null,
  p_limit integer default 100, p_offset integer default 0)
returns table (pincode text, place text, district text, state text, localities text[],
               zones text[], properties integer, total bigint)
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
  with zp as materialized (
    select z.zone_id, z.pincode, cz.name from public.zone_pins() z
    join public.coverage_zones cz on cz.id = z.zone_id and cz.is_active
  ), zf as materialized (
    select z.pincode from public.zone_pins() z where z.zone_id = p_zone
  ), hits as (
    select d.pincode, d.place, d.district, d.state, d.localities
    from public.pincodes d
    where (p_state is null or d.state = p_state)
      and (p_district is null or d.district = p_district)
      and (p_zone is null or d.pincode in (select zf.pincode from zf))
      and (p_covered is null or p_covered = exists (select 1 from zp where zp.pincode = d.pincode))
      and (p_q is null or trim(p_q) = ''
        or d.pincode like trim(p_q) || '%'
        or d.place ilike '%' || trim(p_q) || '%'
        or d.district ilike '%' || trim(p_q) || '%'
        or array_to_string(d.localities, ' ') ilike '%' || trim(p_q) || '%')
  )
  select h.pincode, h.place, h.district, h.state, h.localities[1:6],
         coalesce((select array_agg(zp.name order by zp.name) from zp where zp.pincode = h.pincode), '{}'),
         (select count(*)::integer from public.properties p where p.pincode = h.pincode and not p.is_draft),
         count(*) over ()
  from hits h
  order by h.pincode
  limit least(p_limit, 500) offset p_offset;
end;
$$;
revoke all on function public.staff_pincode_search(text, text, text, uuid, boolean, integer, integer) from public, anon;
grant execute on function public.staff_pincode_search(text, text, text, uuid, boolean, integer, integer) to authenticated;

/** Per state and district: PIN codes, how many a live zone covers, and properties. */
create or replace function public.staff_coverage_summary()
returns table (state text, district text, pins integer, covered integer, properties integer)
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
  with covered as (
    select distinct z.pincode from public.zone_pins() z
    join public.coverage_zones cz on cz.id = z.zone_id and cz.is_active
  ), props as (
    select p.pincode, count(*)::integer as n from public.properties p
    where not p.is_draft and p.pincode is not null group by p.pincode
  )
  select d.state, d.district, count(*)::integer,
         count(c.pincode)::integer,
         coalesce(sum(pr.n), 0)::integer
  from public.pincodes d
  left join covered c on c.pincode = d.pincode
  left join props pr on pr.pincode = d.pincode
  group by d.state, d.district
  order by d.state, d.district;
end;
$$;
revoke all on function public.staff_coverage_summary() from public, anon;
grant execute on function public.staff_coverage_summary() to authenticated;

/** How far a service's coverage reaches: PIN codes and properties (everywhere = no count). */
create or replace function public.staff_service_reach(p_service uuid)
returns table (everywhere boolean, pins integer, properties integer)
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
  with pins as (
    select d.pincode from public.pincodes d
    join public.service_coverage c on c.service_id = p_service
      and ((c.kind = 'state' and d.state = c.value)
        or (c.kind = 'district' and d.district || '|' || d.state = c.value))
    union
    select c.value from public.service_coverage c where c.service_id = p_service and c.kind = 'pincode'
    union
    select z.pincode from public.zone_pins() z
    join public.coverage_zones cz on cz.id = z.zone_id and cz.is_active
    join public.service_coverage c on c.service_id = p_service and c.kind = 'zone' and c.value = z.zone_id::text
  )
  select exists (select 1 from public.service_coverage c where c.service_id = p_service and c.kind = 'everywhere'),
         (select count(*)::integer from pins),
         (select count(*)::integer from public.properties p
          where not p.is_draft and p.pincode in (select pincode from pins));
end;
$$;
revoke all on function public.staff_service_reach(uuid) from public, anon;
grant execute on function public.staff_service_reach(uuid) to authenticated;
