-- =====================================================================
-- Pittu Watch: the search for places around Hyderabad uses "Hyderabad" also
-- when the PIN directory writes the district as "K.V.Rangareddy" (and
-- Medchal, Sangareddy). Same function as 20261008000014 otherwise.
-- =====================================================================

/**
 * Staff: create a place for every locality where customers have properties
 * (from the PIN directory), merging PINs that share a place. Returns how
 * many places were added.
 */
create or replace function public.staff_sync_watch_places()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  with spots as (
    select d.place, d.district, d.state, array_agg(distinct d.pincode) as pins
    from public.properties p
    join public.pincodes d on d.pincode = p.pincode
    where not p.is_draft
    group by d.place, d.district, d.state
  ), ins as (
    insert into public.watch_places (name, district, state, pincodes, query)
    select s.place, s.district, s.state, s.pins,
           '"' || s.place || '" ' ||
           case when s.district ilike 'bangalore%' or s.district ilike 'bengaluru%' then '(Bengaluru OR Bangalore)'
                when s.district ilike '%hyderabad%' or s.district ilike '%rangareddy%' or s.district ilike '%ranga reddy%'
                  or s.district ilike '%medchal%' or s.district ilike '%sangareddy%' then 'Hyderabad'
                else '"' || s.district || '"' end
    from spots s
    on conflict (name, district, state) do update
      set pincodes = (select array_agg(distinct x) from unnest(public.watch_places.pincodes || excluded.pincodes) x)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into added from ins;
  return added;
end;
$$;
revoke all on function public.staff_sync_watch_places() from public, anon;
grant execute on function public.staff_sync_watch_places() to authenticated;

update public.watch_places set query = '"' || name || '" Hyderabad'
where state = 'Telangana' and query not like '%Hyderabad%'
  and (district ilike '%rangareddy%' or district ilike '%ranga reddy%' or district ilike '%medchal%' or district ilike '%sangareddy%');
