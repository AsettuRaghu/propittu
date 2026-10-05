-- =====================================================================
-- Checkpoint 4: M4 Property Care & Services + M9 Backoffice foundation
--
--   Service Catalogue   services (+ price, extra availability; staff-edited)
--   Included Services   plan_version_benefits kind = included_service (M5)
--   Service Request     created ONLY through create_service_request(), which
--                       decides Included vs Extra server-side; usage is
--                       consumed when staff CONFIRM, released on cancel.
--   Property Visit      visit_reports + visit_report_media (staff-written,
--                       customer-readable)
--   Backoffice          staff-only functions and the backoffice_accounts view
-- =====================================================================


-- ---------------------------------------------------------------------
-- Service Catalogue (M4)
-- ---------------------------------------------------------------------

alter table public.services
  -- Extra-service price in paise. NULL = priced after review (quote).
  add column price_paise integer check (price_paise is null or price_paise >= 0),
  -- Can be bought as an Extra Service when not Included in the Plan.
  add column is_extra_available boolean not null default true,
  add column updated_at timestamptz not null default now();

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- Flagship and new services. Prices are PLACEHOLDERS (not final pricing).
insert into public.services (code, name, category, description, sort_order)
values
  ('property_visit', 'Property Visit', 'property_care',
   'A Propittu visit to your property: photos, observations and a short report with any issues and recommendations.',
   100),
  ('video_documentation', 'Video Documentation', 'property_care',
   'A walk-through video of your property for your records.',
   125),
  ('repair', 'Repair', 'property_care',
   'Request a specific repair. We confirm the scope and price before any work starts.',
   145)
on conflict (code) do update
set name = excluded.name, category = excluded.category,
    description = excluded.description, sort_order = excluded.sort_order;

update public.services s set price_paise = p.price
from (values
  ('property_visit',        99900),
  ('site_inspection',      149900),
  ('property_photography', 199900),
  ('video_documentation',  249900),
  ('property_cleaning',    149900),
  ('security_site_check',   99900)
) as p(code, price)
where s.code = p.code;


-- ---------------------------------------------------------------------
-- Service Requests (M4): new lifecycle, coverage, scheduling
-- ---------------------------------------------------------------------

alter table public.service_requests drop constraint service_requests_status_check;
update public.service_requests
set status = case status when 'submitted' then 'requested' when 'in_review' then 'requested' else status end;
alter table public.service_requests alter column status set default 'requested';
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'completed', 'cancelled'));

alter table public.service_requests
  -- Decided by create_service_request() at request time and frozen.
  add column coverage      text not null default 'extra' check (coverage in ('included', 'extra')),
  -- Snapshot of the Extra price (paise); NULL when Included or priced after review.
  add column price_paise   integer check (price_paise is null or price_paise >= 0),
  add column preferred_date date,
  add column scheduled_for timestamptz,
  -- Short customer-visible message from staff ("Visit booked for Saturday").
  add column status_note   text check (status_note is null or char_length(status_note) <= 1000),
  add column confirmed_at  timestamptz,
  add column completed_at  timestamptz,
  add column cancelled_at  timestamptz,
  add column cancelled_by  text check (cancelled_by is null or cancelled_by in ('customer', 'staff'));

create index service_requests_status_created_idx on public.service_requests (status, created_at desc);

-- Requests are no longer inserted directly: coverage and price must be
-- decided by the server, never by the client.
drop policy service_requests_insert on public.service_requests;
revoke insert on public.service_requests from authenticated;


-- ---------------------------------------------------------------------
-- Included Service allowance remaining (NULL = not included in the Plan)
--
-- Counts consumed usage (confirmed requests) AND requests still waiting
-- for confirmation, so the allowance is never promised twice.
-- Window: 'year' = the last 12 months within the current Plan period;
--         'term' = the current Plan period.
-- ---------------------------------------------------------------------

create or replace function public.included_remaining(p_account uuid, p_code text)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with cur as (
    select ap.id, ap.starts_at, ap.plan_version_id
    from public.account_plans ap
    where ap.account_id = p_account and ap.starts_at <= now() and ap.ends_at > now()
    order by ap.starts_at desc
    limit 1
  ), ben as (
    select cur.id, cur.starts_at, b.value as quantity, b.period,
           case when b.period = 'term' then cur.starts_at
                else greatest(now() - interval '1 year', cur.starts_at) end as since
    from cur
    join public.plan_version_benefits b
      on b.plan_version_id = cur.plan_version_id and b.kind = 'included_service' and b.code = p_code
  )
  select (
    ben.quantity
    - coalesce((select sum(u.quantity) from public.usage_records u
                where u.account_id = p_account and u.code = p_code and u.released_at is null
                  and u.created_at >= ben.since), 0)
    - (select count(*) from public.service_requests r
         join public.services s on s.id = r.service_id
       where r.account_id = p_account and s.code = p_code
         and r.coverage = 'included' and r.status = 'requested' and r.created_at >= ben.since)
  )::integer
  from ben;
$$;

revoke all on function public.included_remaining(uuid, text) from public, anon;
grant execute on function public.included_remaining(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- create_service_request(): the ONLY way to open a request.
-- Checks Account, active Plan, property ownership and service
-- availability; decides Included vs Extra; snapshots the price.
-- ---------------------------------------------------------------------

create or replace function public.create_service_request(
  p_property uuid, p_service uuid, p_description text, p_preferred_date date default null)
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
    (account_id, user_id, property_id, service_id, description, coverage, price_paise, preferred_date)
  values
    (acc, auth.uid(), p_property, p_service, p_description, cov, price, p_preferred_date)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_service_request(uuid, uuid, text, date) from public, anon;
grant execute on function public.create_service_request(uuid, uuid, text, date) to authenticated;


-- Customer cancellation: only while still Requested (nothing consumed yet).
create or replace function public.cancel_service_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.service_requests
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer'
  where id = p_request
    and account_id = public.current_account_id()
    and status = 'requested';
  if not found then
    raise exception 'This request can no longer be cancelled' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.cancel_service_request(uuid) from public, anon;
grant execute on function public.cancel_service_request(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- Staff: move a request through its lifecycle (M4/M9).
--
--   requested   → confirmed | cancelled
--   confirmed   → scheduled | in_progress | completed | cancelled
--   scheduled   → scheduled (reschedule) | in_progress | completed | cancelled
--   in_progress → completed | cancelled
--
-- Usage of an Included Service is consumed on confirmation and released
-- if the request is cancelled later.
-- ---------------------------------------------------------------------

create or replace function public.staff_update_service_request(
  p_request uuid, p_status text, p_scheduled_for timestamptz default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  allowed text[];
  plan_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  select sr.*, s.code as service_code into r
  from public.service_requests sr join public.services s on s.id = sr.service_id
  where sr.id = p_request
  for update of sr;
  if not found then
    raise exception 'Service request not found' using errcode = 'P0002';
  end if;

  allowed := case r.status
    when 'requested'   then array['confirmed', 'cancelled']
    when 'confirmed'   then array['scheduled', 'in_progress', 'completed', 'cancelled']
    when 'scheduled'   then array['scheduled', 'in_progress', 'completed', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    else array[]::text[] end;
  if not (p_status = any (allowed)) then
    raise exception 'Cannot change a % request to %', r.status, p_status using errcode = '23514';
  end if;
  if p_status = 'scheduled' and p_scheduled_for is null then
    raise exception 'A scheduled request needs a date' using errcode = '23514';
  end if;

  update public.service_requests set
    status        = p_status,
    scheduled_for = coalesce(p_scheduled_for, scheduled_for),
    status_note   = coalesce(p_note, status_note),
    confirmed_at  = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at  = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at  = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancelled_by  = case when p_status = 'cancelled' then 'staff' else cancelled_by end
  where id = p_request;

  if p_status = 'confirmed' and r.coverage = 'included' then
    select ap.id into plan_id from public.account_plans ap
    where ap.account_id = r.account_id and ap.starts_at <= now() and ap.ends_at > now()
    order by ap.starts_at desc limit 1;
    insert into public.usage_records (account_id, account_plan_id, kind, code, service_request_id)
    values (r.account_id, plan_id, 'included_service', r.service_code, r.id);
  end if;

  if p_status = 'cancelled' then
    update public.usage_records set released_at = now()
    where service_request_id = p_request and released_at is null;
  end if;
end;
$$;

revoke all on function public.staff_update_service_request(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.staff_update_service_request(uuid, text, timestamptz, text) to authenticated;


-- Staff: document review status (customers can never set it, M3).
create or replace function public.staff_set_document_status(p_document uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  update public.property_documents set status = p_status where id = p_document;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_document_status(uuid, text) from public, anon;
grant execute on function public.staff_set_document_status(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- Property Visit reports (M4)
-- ---------------------------------------------------------------------

create table public.visit_reports (
  id                  uuid        primary key default gen_random_uuid(),
  service_request_id  uuid        not null unique references public.service_requests (id) on delete cascade,
  account_id          uuid        not null references public.accounts (id) on delete cascade,
  property_id         uuid        references public.properties (id) on delete set null,
  visited_at          date        not null,
  condition           text        not null check (condition in ('good', 'fair', 'needs_attention')),
  observations        text        not null default '' check (char_length(observations) <= 4000),
  issues              text        not null default '' check (char_length(issues) <= 4000),
  recommendations     text        not null default '' check (char_length(recommendations) <= 4000),
  created_by          uuid        not null references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index visit_reports_property_idx on public.visit_reports (property_id, visited_at desc);

create trigger visit_reports_set_updated_at
  before update on public.visit_reports
  for each row execute function public.set_updated_at();

create table public.visit_report_media (
  id             uuid        primary key default gen_random_uuid(),
  report_id      uuid        not null references public.visit_reports (id) on delete cascade,
  account_id     uuid        not null references public.accounts (id) on delete cascade,
  kind           text        not null check (kind in ('photo', 'video')),
  storage_path   text        not null unique,
  mime_type      text        not null check (mime_type in ('image/jpeg', 'image/png', 'video/mp4', 'video/quicktime')),
  file_size      integer     not null check (file_size > 0 and file_size <= 52428800),
  upload_status  text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  created_by     uuid        not null references auth.users (id),
  created_at     timestamptz not null default now(),
  -- Files live in the customer's account folder so the customer can read them.
  constraint visit_report_media_path check (storage_path like account_id::text || '/visits/%'),
  constraint visit_report_media_kind check (
    (kind = 'photo' and mime_type like 'image/%') or (kind = 'video' and mime_type like 'video/%'))
);

create index visit_report_media_report_idx on public.visit_report_media (report_id, created_at);

-- Customers read their own reports; only staff write.
alter table public.visit_reports enable row level security;
revoke all on public.visit_reports from anon;
revoke delete on public.visit_reports from authenticated;
grant select, insert, update on public.visit_reports to authenticated;
create policy visit_reports_select on public.visit_reports for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy visit_reports_staff_insert on public.visit_reports for insert to authenticated
  with check (
    public.is_staff()
    and created_by = (select auth.uid())
    and exists (select 1 from public.service_requests r
                where r.id = service_request_id and r.account_id = visit_reports.account_id)
  );
create policy visit_reports_staff_update on public.visit_reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

alter table public.visit_report_media enable row level security;
revoke all on public.visit_report_media from anon;
revoke update on public.visit_report_media from authenticated;
grant select, insert, delete on public.visit_report_media to authenticated;
grant update (upload_status) on public.visit_report_media to authenticated;
create policy visit_media_select on public.visit_report_media for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy visit_media_staff_insert on public.visit_report_media for insert to authenticated
  with check (
    public.is_staff()
    and created_by = (select auth.uid())
    and exists (select 1 from public.visit_reports v
                where v.id = report_id and v.account_id = visit_report_media.account_id)
  );
create policy visit_media_staff_update on public.visit_report_media for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy visit_media_staff_delete on public.visit_report_media for delete to authenticated
  using (public.is_staff());


-- ---------------------------------------------------------------------
-- Service Catalogue: staff manage it; customers see active services.
-- ---------------------------------------------------------------------

drop policy services_select_active on public.services;
create policy services_select on public.services for select to authenticated
  using (is_active or public.is_staff());
grant insert, update on public.services to authenticated;
create policy services_staff_insert on public.services for insert to authenticated
  with check (public.is_staff());
create policy services_staff_update on public.services for update to authenticated
  using (public.is_staff()) with check (public.is_staff());


-- ---------------------------------------------------------------------
-- Backoffice account search (M9). Staff only: empty for customers.
-- ---------------------------------------------------------------------

create view public.backoffice_accounts
with (security_invoker = true) as
select
  a.id,
  a.status,
  a.created_at,
  a.trial_started_at,
  m.user_id,
  pr.phone,
  pr.full_name,
  (select count(*)::int from public.properties p where p.account_id = a.id) as property_count,
  (select count(*)::int from public.service_requests r
    where r.account_id = a.id and r.status not in ('completed', 'cancelled')) as open_request_count,
  cp.plan_code,
  cp.plan_name,
  cp.plan_source,
  cp.plan_ends_at
from public.accounts a
left join public.account_members m on m.account_id = a.id and m.role = 'owner'
left join public.profiles pr on pr.id = m.user_id
left join lateral (
  select p.code as plan_code, p.name as plan_name, ap.source as plan_source, ap.ends_at as plan_ends_at
  from public.account_plans ap
  join public.plan_versions v on v.id = ap.plan_version_id
  join public.plans p on p.id = v.plan_id
  where ap.account_id = a.id and ap.starts_at <= now() and ap.ends_at > now()
  order by ap.starts_at desc
  limit 1
) cp on true
where public.is_staff();

revoke all on public.backoffice_accounts from anon;
grant select on public.backoffice_accounts to authenticated;
