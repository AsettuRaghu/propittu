-- =====================================================================
-- Booking UX (redesign): preferred time of day, optional notes.
--   * service_requests.preferred_slot: morning | afternoon | evening
--   * description may now be empty (the service itself says what is
--     needed; notes are extra context), still max 2000 characters.
-- =====================================================================

alter table public.service_requests
  add column preferred_slot text
    check (preferred_slot is null or preferred_slot in ('morning', 'afternoon', 'evening'));

alter table public.service_requests drop constraint service_requests_description_check;
alter table public.service_requests add constraint service_requests_description_check
  check (char_length(description) <= 2000);

drop function public.create_service_request(uuid, uuid, text, date);

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
