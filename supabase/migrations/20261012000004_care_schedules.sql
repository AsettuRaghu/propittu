-- =====================================================================
-- Care schedule (owner, 12 Oct 2026): a service that repeats — "a visit
-- every 3 months", "plot cleaning every 6 months". About a week before
-- each date: if the plan still includes it, it books itself (same checks
-- as the owner booking it); if it would cost money, the owner gets a
-- one-tap reminder instead — nothing is charged without them.
-- =====================================================================

create table public.care_schedules (
  id              uuid        primary key default gen_random_uuid(),
  account_id      uuid        not null references public.accounts (id) on delete cascade,
  property_id     uuid        not null references public.properties (id) on delete cascade,
  service_id      uuid        not null references public.services (id) on delete cascade,
  every_months    integer     not null check (every_months in (1, 2, 3, 4, 6, 12)),
  next_on         date        not null,
  active          boolean     not null default true,
  last_request_id uuid        references public.service_requests (id) on delete set null,
  last_run_at     timestamptz,
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (property_id, service_id)
);
create index care_schedules_due_idx on public.care_schedules (next_on) where active;

alter table public.care_schedules enable row level security;
revoke all on public.care_schedules from anon, authenticated;
grant select, insert, update, delete on public.care_schedules to authenticated;
create policy care_schedules_own on public.care_schedules for all to authenticated
  using (public.is_staff() or public.is_account_member(account_id))
  with check (public.is_account_member(account_id)
              and exists (select 1 from public.properties p
                          where p.id = property_id and p.account_id = care_schedules.account_id));

-- Book a scheduled service when the plan still includes it (server only).
-- Same checks as create_service_request, for the schedule's account; returns
-- null when it would be an extra (paid) service — the owner books that.
create or replace function public.create_scheduled_request(p_schedule uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  sch public.care_schedules;
  svc record;
  remaining integer;
  new_id uuid;
begin
  select * into sch from public.care_schedules where id = p_schedule and active;
  if sch.id is null then return null; end if;
  perform 1 from public.accounts where id = sch.account_id and status = 'active' for update;
  if not found then return null; end if;
  if not exists (select 1 from public.account_plans
                 where account_id = sch.account_id and starts_at <= now() and ends_at > now()) then
    return null;
  end if;
  select id, code into svc from public.services where id = sch.service_id and is_active;
  if not found then return null; end if;
  if public.service_reach_problem(sch.property_id, sch.service_id) is not null then return null; end if;
  remaining := public.included_remaining(sch.account_id, svc.code);
  if remaining is null or remaining <= 0 then return null; end if;
  insert into public.service_requests
    (account_id, user_id, property_id, service_id, description, coverage, price_paise, preferred_date)
  values
    (sch.account_id, sch.created_by, sch.property_id, sch.service_id,
     'Booked from your care schedule', 'included', null, sch.next_on)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_scheduled_request(uuid) from public, anon, authenticated;
