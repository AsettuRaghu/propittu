-- =====================================================================
-- Per-service payment and cancellation rules (owner decisions 7 Oct 2026)
--
--   services.payment_timing   when an extra service is paid:
--                               upfront          — right after booking
--                               on_confirmation  — once we accept it (default)
--                               on_completion    — after the work is done
--   services.cancel_policy    until_confirmed (default) | never
--   services.expected_days    usual working time, for "Expected by"
--
-- Both rules are copied onto each request when it is made, so later edits
-- to a service never change the terms of a request already placed.
-- No refunds in the app (staff handle exceptions in Backoffice). Requests
-- covered by the plan can't be cancelled by the customer.
-- "On quote" services: staff set the price on the request
-- (staff_set_request_price), then the customer pays it in the app.
-- =====================================================================

alter table public.services
  add column payment_timing text not null default 'on_confirmation'
    check (payment_timing in ('upfront', 'on_confirmation', 'on_completion')),
  add column cancel_policy text not null default 'until_confirmed'
    check (cancel_policy in ('until_confirmed', 'never')),
  add column expected_days integer check (expected_days is null or expected_days between 1 and 365);

alter table public.service_requests
  add column payment_timing text not null default 'on_confirmation'
    check (payment_timing in ('upfront', 'on_confirmation', 'on_completion')),
  add column cancel_policy text not null default 'until_confirmed'
    check (cancel_policy in ('until_confirmed', 'never'));

-- Fixed-price visits are paid when booked; quote-priced work once the quote is set.
update public.services set payment_timing = 'upfront'
where price_paise is not null and fulfilment = 'visit';
update public.services s set expected_days = v.days
from (values
  ('property_tax_assistance', 7), ('document_verification', 5), ('khata_mutation_assistance', 42),
  ('compliance_alert_assistance', 5), ('property_visit', 5), ('site_inspection', 5),
  ('property_photography', 5), ('video_documentation', 5), ('property_cleaning', 7),
  ('security_site_check', 5), ('other', 3)
) as v(code, days)
where s.code = v.code;

-- Copy the service's rules onto every new request (with the fulfilment).
create or replace function public.service_request_fulfilment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  svc record;
begin
  select s.fulfilment, s.payment_timing, s.cancel_policy into svc
  from public.services s where s.id = new.service_id;
  new.fulfilment := coalesce(svc.fulfilment, 'visit');
  new.payment_timing := coalesce(svc.payment_timing, 'on_confirmation');
  new.cancel_policy := coalesce(svc.cancel_policy, 'until_confirmed');
  return new;
end;
$$;

-- Customer cancellation: only while Requested, only if the request allows it,
-- never for plan-included requests. Payments are not refunded here.
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
    and status = 'requested'
    and coverage <> 'included'
    and cancel_policy = 'until_confirmed';
  if not found then
    raise exception 'This request can no longer be cancelled' using errcode = '23514';
  end if;
end;
$$;

-- Paying for an extra service: only when its rule says it's time, and never
-- twice. The description names the service only (no internal codes).
create or replace function public.create_service_order(p_request uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
  r record;
  new_id uuid;
begin
  select sr.id, sr.coverage, sr.price_paise, sr.status, sr.payment_timing, s.name into r
  from public.service_requests sr join public.services s on s.id = sr.service_id
  where sr.id = p_request and sr.account_id = acc;
  if not found then
    raise exception 'Service request not found' using errcode = 'P0002';
  end if;
  if r.coverage <> 'extra' or r.price_paise is null or r.price_paise <= 0 or r.status = 'cancelled' then
    raise exception 'This request has nothing to pay' using errcode = '23514';
  end if;
  if (r.payment_timing = 'on_confirmation' and r.status = 'requested')
     or (r.payment_timing = 'on_completion' and r.status <> 'completed') then
    raise exception 'Payment opens once we have confirmed the request' using errcode = '23514';
  end if;
  if exists (select 1 from public.orders where service_request_id = p_request and status = 'paid') then
    raise exception 'Already paid' using errcode = '23505';
  end if;

  update public.orders set status = 'cancelled'
  where service_request_id = p_request and status = 'pending';

  insert into public.orders (account_id, user_id, kind, service_request_id, description, amount_paise)
  values (acc, auth.uid(), 'extra_service', p_request, r.name, r.price_paise)
  returning id into new_id;
  return new_id;
end;
$$;

-- Staff: set (or change) the price of an "On quote" request before it is paid.
create or replace function public.staff_set_request_price(p_request uuid, p_price_paise integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_price_paise is null or p_price_paise < 100 or p_price_paise > 100000000 then
    raise exception 'Enter a price between ₹1 and ₹10,00,000' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders where service_request_id = p_request and status = 'paid') then
    raise exception 'This request is already paid' using errcode = '23514';
  end if;
  update public.service_requests set price_paise = p_price_paise
  where id = p_request and coverage = 'extra' and status <> 'cancelled';
  if not found then
    raise exception 'Only an open extra service can be priced' using errcode = '23514';
  end if;
  -- Any unpaid checkout at the old price is closed.
  update public.orders set status = 'cancelled'
  where service_request_id = p_request and status = 'pending';
end;
$$;
revoke all on function public.staff_set_request_price(uuid, integer) from public, anon;
grant execute on function public.staff_set_request_price(uuid, integer) to authenticated;
