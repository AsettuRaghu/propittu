-- =====================================================================
-- M7 Payments & Billing (Propittu-owned domain; provider is an adapter)
--
--   orders          what the customer is buying (a Plan, or an Extra Service)
--   payments        attempts to pay an order through a provider
--   refunds         separate financial events (never overwrite a payment)
--   payment_events  webhook log: every provider event, idempotent by event id
--
-- Provider ids (Razorpay plink_/pay_/rfnd_) are REFERENCES only.
--
-- Trust model:
--   * customers create orders only through functions that price them from
--     the catalogue (never from the client);
--   * an order becomes PAID only through record_payment_event(), which is
--     executable by service_role alone — the API calls it after verifying
--     the provider's webhook signature (or fetching the status from the
--     provider server-to-server). The mobile app can never mark a payment.
-- =====================================================================


create sequence public.order_ref_seq start with 1001;

create table public.orders (
  id                  uuid        primary key default gen_random_uuid(),
  reference           text        not null unique
                                  default ('OR-' || lpad(nextval('public.order_ref_seq')::text, 6, '0')),
  account_id          uuid        not null references public.accounts (id) on delete cascade,
  user_id             uuid        not null references auth.users (id),
  kind                text        not null check (kind in ('plan', 'extra_service')),
  plan_version_id     uuid        references public.plan_versions (id),
  service_request_id  uuid        references public.service_requests (id) on delete set null,
  description         text        not null check (char_length(description) between 1 and 200),
  amount_paise        integer     not null check (amount_paise > 0),
  currency            text        not null default 'INR' check (currency = 'INR'),
  status              text        not null default 'pending'
                                  check (status in ('pending', 'paid', 'cancelled')),
  paid_at             timestamptz,
  -- The Plan period this order granted (kind = plan, once paid).
  account_plan_id     uuid        references public.account_plans (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint orders_kind_target check (
    (kind = 'plan' and plan_version_id is not null)
    or (kind = 'extra_service' and service_request_id is not null))
);

alter sequence public.order_ref_seq owned by public.orders.reference;
grant usage, select on sequence public.order_ref_seq to authenticated;

create index orders_account_created_idx on public.orders (account_id, created_at desc);
create index orders_request_idx on public.orders (service_request_id);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.payments (
  id                     uuid        primary key default gen_random_uuid(),
  order_id               uuid        not null references public.orders (id) on delete cascade,
  account_id             uuid        not null references public.accounts (id) on delete cascade,
  provider               text        not null check (provider in ('razorpay')),
  -- The provider's checkout object (e.g. Razorpay payment link plink_…).
  provider_checkout_ref  text,
  -- The provider's payment (e.g. Razorpay pay_…), known once paid.
  provider_payment_ref   text        unique,
  checkout_url           text,
  amount_paise           integer     not null check (amount_paise > 0),
  currency               text        not null default 'INR',
  status                 text        not null default 'created'
                                     check (status in ('created', 'captured', 'failed')),
  method                 text,
  captured_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id, created_at desc);
create unique index payments_provider_checkout_idx
  on public.payments (provider, provider_checkout_ref) where provider_checkout_ref is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.refunds (
  id                   uuid        primary key default gen_random_uuid(),
  payment_id           uuid        not null references public.payments (id) on delete cascade,
  account_id           uuid        not null references public.accounts (id) on delete cascade,
  provider_refund_ref  text        not null unique,
  amount_paise         integer     not null check (amount_paise > 0),
  status               text        not null check (status in ('pending', 'processed', 'failed')),
  created_at           timestamptz not null default now(),
  processed_at         timestamptz
);

create table public.payment_events (
  id                 uuid        primary key default gen_random_uuid(),
  provider           text        not null,
  provider_event_id  text        not null,
  event_type         text        not null,
  order_id           uuid        references public.orders (id) on delete set null,
  payload            jsonb       not null default '{}'::jsonb,
  outcome            text,
  received_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);


-- ---------------------------------------------------------------------
-- Customers create orders only through these (priced server-side).
-- A new checkout cancels the Account's older pending order of the same kind.
-- ---------------------------------------------------------------------

create or replace function public.create_plan_order(p_plan_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
  v record;
  new_id uuid;
begin
  if acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts where id = acc and status = 'active') then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select pv.id, pv.price_paise, pv.billing_period, p.name into v
  from public.plans p
  join public.plan_versions pv on pv.plan_id = p.id and pv.is_current
  where p.code = p_plan_code and p.is_public and p.is_active;
  if not found or v.price_paise <= 0 then
    raise exception 'Plan not available' using errcode = 'P0002';
  end if;

  update public.orders set status = 'cancelled'
  where account_id = acc and kind = 'plan' and status = 'pending';

  insert into public.orders (account_id, user_id, kind, plan_version_id, description, amount_paise)
  values (acc, auth.uid(), 'plan', v.id,
          'Propittu ' || v.name || case v.billing_period when 'year' then ' — 1 year' when 'month' then ' — 1 month' else '' end,
          v.price_paise)
  returning id into new_id;
  return new_id;
end;
$$;

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
  select sr.id, sr.coverage, sr.price_paise, sr.status, sr.reference, s.name into r
  from public.service_requests sr join public.services s on s.id = sr.service_id
  where sr.id = p_request and sr.account_id = acc;
  if not found then
    raise exception 'Service request not found' using errcode = 'P0002';
  end if;
  if r.coverage <> 'extra' or r.price_paise is null or r.price_paise <= 0 or r.status = 'cancelled' then
    raise exception 'This request has nothing to pay' using errcode = '23514';
  end if;
  if exists (select 1 from public.orders where service_request_id = p_request and status = 'paid') then
    raise exception 'Already paid' using errcode = '23505';
  end if;

  update public.orders set status = 'cancelled'
  where service_request_id = p_request and status = 'pending';

  insert into public.orders (account_id, user_id, kind, service_request_id, description, amount_paise)
  values (acc, auth.uid(), 'extra_service', p_request, r.name || ' (' || r.reference || ')', r.price_paise)
  returning id into new_id;
  return new_id;
end;
$$;

-- Records the provider checkout the API created for the customer's own
-- pending order. Metadata only — it cannot mark anything paid.
create or replace function public.attach_checkout(
  p_order uuid, p_provider text, p_checkout_ref text, p_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  new_id uuid;
begin
  select id, account_id, amount_paise, currency into o
  from public.orders
  where id = p_order and account_id = public.current_account_id() and status = 'pending';
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  insert into public.payments (order_id, account_id, provider, provider_checkout_ref, checkout_url, amount_paise, currency)
  values (o.id, o.account_id, p_provider, p_checkout_ref, p_url, o.amount_paise, o.currency)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_plan_order(text) from public, anon;
revoke all on function public.create_service_order(uuid) from public, anon;
revoke all on function public.attach_checkout(uuid, text, text, text) from public, anon;
grant execute on function public.create_plan_order(text) to authenticated;
grant execute on function public.create_service_order(uuid) to authenticated;
grant execute on function public.attach_checkout(uuid, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- record_payment_event(): the ONLY path to "paid". service_role only.
--
-- Normalised event types (the provider adapter maps to these):
--   payment.captured   p_order, p_payment_ref, p_amount, p_currency, p_method
--   payment.failed     p_order, p_payment_ref
--   refund.processed   p_payment_ref, p_refund_ref, p_amount
--
-- Idempotent: a repeated provider event id is recorded once.
-- Returns the outcome (also stored on the event).
-- ---------------------------------------------------------------------

create or replace function public.record_payment_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_order uuid default null,
  p_payment_ref text default null,
  p_amount integer default null,
  p_currency text default null,
  p_method text default null,
  p_checkout_ref text default null,
  p_refund_ref text default null,
  p_payload jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev_id uuid;
  o record;
  pay_id uuid;
  cur record;
  new_plan uuid;
  term integer;
  starts timestamptz;
  v_outcome text;
begin
  insert into public.payment_events (provider, provider_event_id, event_type, order_id, payload)
  values (p_provider, p_event_id, p_event_type, p_order, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing
  returning id into ev_id;
  if ev_id is null then
    return 'duplicate';
  end if;

  if p_event_type = 'payment.captured' then
    select * into o from public.orders where id = p_order for update;
    if not found then
      v_outcome := 'unknown_order';
    elsif o.status = 'paid' then
      v_outcome := 'already_paid';
    elsif p_amount is distinct from o.amount_paise or upper(coalesce(p_currency, '')) <> o.currency then
      -- Never activate on a mismatched amount: needs staff attention.
      v_outcome := 'amount_mismatch';
    else
      -- The payment attempt: the checkout we created, else a new row.
      select id into pay_id from public.payments
      where order_id = o.id and provider = p_provider
        and (provider_checkout_ref = p_checkout_ref or p_checkout_ref is null)
      order by created_at desc limit 1;
      if pay_id is null then
        insert into public.payments (order_id, account_id, provider, provider_checkout_ref, amount_paise, currency)
        values (o.id, o.account_id, p_provider, p_checkout_ref, o.amount_paise, o.currency)
        returning id into pay_id;
      end if;
      update public.payments
      set status = 'captured', provider_payment_ref = p_payment_ref, method = p_method, captured_at = now()
      where id = pay_id;

      update public.orders set status = 'paid', paid_at = now() where id = o.id;

      if o.kind = 'plan' then
        select pv.term_days into term from public.plan_versions pv where pv.id = o.plan_version_id;

        -- Renewal of the same paid Plan queues after the current period;
        -- anything else (Trial → paid, upgrade/downgrade) starts now.
        select ap.id, ap.ends_at, ap.source, pv.plan_id into cur
        from public.account_plans ap join public.plan_versions pv on pv.id = ap.plan_version_id
        where ap.account_id = o.account_id and ap.starts_at <= now() and ap.ends_at > now()
        order by ap.starts_at desc limit 1;

        if cur.id is not null and cur.source <> 'trial'
           and cur.plan_id = (select plan_id from public.plan_versions where id = o.plan_version_id) then
          starts := cur.ends_at;
        else
          starts := now();
          update public.account_plans set ends_at = now()
          where account_id = o.account_id and starts_at < now() and ends_at > now();
        end if;

        insert into public.account_plans (account_id, plan_version_id, source, starts_at, ends_at)
        values (o.account_id, o.plan_version_id, 'payment', starts, starts + make_interval(days => term))
        returning id into new_plan;
        update public.orders set account_plan_id = new_plan where id = o.id;
        v_outcome := 'plan_activated';
      else
        v_outcome := 'paid';
      end if;
    end if;

  elsif p_event_type = 'payment.failed' then
    update public.payments set status = 'failed', provider_payment_ref = coalesce(p_payment_ref, provider_payment_ref)
    where order_id = p_order and provider = p_provider and status = 'created'
      and (provider_checkout_ref = p_checkout_ref or p_checkout_ref is null);
    v_outcome := case when found then 'payment_failed' else 'ignored' end;

  elsif p_event_type = 'refund.processed' then
    select id into pay_id from public.payments where provider_payment_ref = p_payment_ref;
    if pay_id is null then
      v_outcome := 'unknown_payment';
    else
      insert into public.refunds (payment_id, account_id, provider_refund_ref, amount_paise, status, processed_at)
      select pay_id, p.account_id, p_refund_ref, p_amount, 'processed', now()
      from public.payments p where p.id = pay_id
      on conflict (provider_refund_ref) do update set status = 'processed', processed_at = now();
      -- The Plan is not changed automatically; staff decide (M7: separate events).
      v_outcome := 'refund_recorded';
    end if;

  else
    v_outcome := 'ignored';
  end if;

  update public.payment_events set outcome = v_outcome where id = ev_id;
  return v_outcome;
end;
$$;

revoke all on function public.record_payment_event(text, text, text, uuid, text, integer, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_payment_event(text, text, text, uuid, text, integer, text, text, text, text, jsonb)
  to service_role;


-- ---------------------------------------------------------------------
-- RLS: customers read their own billing; staff read all; nobody writes
-- directly (functions only).
-- ---------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.payment_events enable row level security;

revoke all on public.orders, public.payments, public.refunds, public.payment_events from anon, authenticated;
grant select on public.orders, public.payments, public.refunds, public.payment_events to authenticated;

create policy orders_select on public.orders for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy payments_select on public.payments for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy refunds_select on public.refunds for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy payment_events_select on public.payment_events for select to authenticated
  using (public.is_staff());
