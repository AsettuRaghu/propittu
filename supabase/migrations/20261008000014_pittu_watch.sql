-- =====================================================================
-- Pittu Watch — local news (owner, 8 Oct 2026). docs/PITTU.md.
--
--   watch_places  what we watch: a locality (from customers' PIN codes) with
--                 the PINs it covers and the search query staff can edit
--   watch_items   headlines collected per place (title, link, source, date
--                 only — never the article), Pittu's reading of each, and
--                 the team's review. Owners see only approved items, for
--                 places that cover their property's PIN.
--
-- Work is per place, shared by every customer there, so cost does not grow
-- with the number of customers.
-- =====================================================================

create table public.watch_places (
  id                 uuid        primary key default gen_random_uuid(),
  name               text        not null check (char_length(trim(name)) between 1 and 80),
  district           text        not null,
  state              text        not null,
  pincodes           text[]      not null default '{}',
  query              text        not null check (char_length(query) between 3 and 300),
  is_active          boolean     not null default true,
  last_collected_at  timestamptz,
  created_at         timestamptz not null default now(),
  unique (name, district, state)
);

create table public.watch_items (
  id             uuid        primary key default gen_random_uuid(),
  place_id       uuid        not null references public.watch_places (id) on delete cascade,
  source         text        not null check (source in ('gdelt', 'rss', 'staff')),
  url            text        not null check (char_length(url) <= 2000),
  title          text        not null check (char_length(title) <= 500),
  -- The publisher's own short description from its feed (never the article).
  snippet        text        check (snippet is null or char_length(snippet) <= 600),
  domain         text,
  published_at   timestamptz,
  collected_at   timestamptz not null default now(),
  -- Pittu's reading
  ai_status      text        not null default 'new' check (ai_status in ('new', 'read', 'failed')),
  relevant       boolean,
  category       text,
  impact         text        check (impact is null or impact in ('positive', 'negative', 'neutral')),
  summary        text        check (summary is null or char_length(summary) <= 400),
  ai_confidence  text        check (ai_confidence is null or ai_confidence in ('high', 'medium', 'low')),
  -- The team's review
  review         text        not null default 'pending' check (review in ('pending', 'approved', 'rejected')),
  reviewed_by    uuid        references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  unique (place_id, url)
);
create index watch_items_queue_idx on public.watch_items (review, ai_status, collected_at desc);
create index watch_items_place_idx on public.watch_items (place_id, published_at desc);

create trigger watch_places_audit after insert or update or delete on public.watch_places
  for each row execute function public.audit_row_change();
create trigger watch_items_review_audit after update of review on public.watch_items
  for each row execute function public.audit_row_change();

alter table public.watch_places enable row level security;
alter table public.watch_items enable row level security;
revoke all on public.watch_places, public.watch_items from anon, authenticated;
grant select, insert, update, delete on public.watch_places, public.watch_items to authenticated;

create policy watch_places_staff on public.watch_places for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy watch_items_staff on public.watch_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Owners: approved items for a live place that covers one of their properties' PINs.
create or replace function public.owns_property_in_watch_place(p_place uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.watch_places w
    join public.properties p on p.pincode = any (w.pincodes)
    where w.id = p_place and w.is_active and public.is_account_member(p.account_id)
  );
$$;
revoke all on function public.owns_property_in_watch_place(uuid) from public, anon;
grant execute on function public.owns_property_in_watch_place(uuid) to authenticated;

create policy watch_items_owner_read on public.watch_items for select to authenticated
  using (review = 'approved' and public.owns_property_in_watch_place(place_id));

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
                when s.district ilike '%hyderabad%' or s.district ilike 'rangareddy%' or s.district ilike 'ranga reddy%'
                  or s.district ilike 'medchal%' then 'Hyderabad'
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
