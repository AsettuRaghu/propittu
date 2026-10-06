-- =====================================================================
-- Plan changes: fair periods and prorated upgrades
--
--   * Trial → paid: the unused Trial days are added to the paid term.
--   * Same Plan again: a renewal, queued after what is already bought.
--   * Upgrade mid-term (e.g. Basic → Plus): starts now; the unused part of
--     the paid period is credited against the price, and Included Services
--     already used this year still count (no fresh allowance by upgrading).
--   * Downgrade mid-term: not offered — switch when the current Plan ends.
--   * Staff "add days": extends what is in force (and anything queued)
--     instead of replacing a paid period.
--
-- plan_change() is the single source of these rules: the quote shown to
-- the customer, the order price, and the activation all use it.
-- =====================================================================

-- Included Services count from here (an upgrade carries the earlier start).
alter table public.account_plans add column usage_since timestamptz;

alter table public.orders
  add column list_price_paise integer check (list_price_paise is null or list_price_paise > 0),
  add column credit_paise integer not null default 0 check (credit_paise >= 0),
  -- The paid period that was credited (upgrade).
  add column credit_account_plan_id uuid references public.account_plans (id);

update public.orders set list_price_paise = amount_paise where list_price_paise is null;


-- ---------------------------------------------------------------------
-- plan_change(account, plan code) → what buying this Plan now would do.
-- Internal: callers check who is asking.
-- ---------------------------------------------------------------------

create or replace function public.plan_change(p_account uuid, p_plan_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
  cur record;
  last_end timestamptz;
  queued boolean;
  v_mode text;
  v_starts timestamptz := now();
  v_ends timestamptz;
  bonus interval := interval '0';
  credit integer := 0;
  usage_from timestamptz;
  blocked text;
begin
  select pv.id, pv.price_paise, pv.term_days, pv.billing_period, pv.plan_id, p.code, p.name into v
  from public.plans p
  join public.plan_versions pv on pv.plan_id = p.id and pv.is_current
  where p.code = p_plan_code and p.is_public and p.is_active;
  if not found or v.price_paise <= 0 then
    raise exception 'Plan not available' using errcode = 'P0002';
  end if;

  select ap.id, ap.source, ap.starts_at, ap.ends_at, ap.usage_since,
         pv.plan_id, pv.price_paise, p.code, p.name
    into cur
  from public.account_plans ap
  join public.plan_versions pv on pv.id = ap.plan_version_id
  join public.plans p on p.id = pv.plan_id
  where ap.account_id = p_account and ap.starts_at <= now() and ap.ends_at > now()
  order by ap.starts_at desc
  limit 1;

  select max(ends_at) into last_end from public.account_plans
  where account_id = p_account and ends_at > now();
  queued := exists (select 1 from public.account_plans
                    where account_id = p_account and starts_at > now());

  if cur.id is null then
    v_mode := 'new';
  elsif cur.code = 'trial' or cur.price_paise = 0 then
    -- Trial → paid: keep the Trial days that are left.
    v_mode := 'new';
    bonus := cur.ends_at - now();
  elsif cur.plan_id = v.plan_id then
    v_mode := 'renewal';
    v_starts := last_end;
  elsif v.price_paise > cur.price_paise then
    v_mode := 'upgrade';
    if queued then
      blocked := 'You already have a renewal lined up. Please contact support to upgrade.';
    end if;
    -- Credit only what was paid for: the unused share of a paid period.
    if cur.source = 'payment' then
      credit := floor(cur.price_paise
                      * extract(epoch from (cur.ends_at - now()))
                      / extract(epoch from (cur.ends_at - cur.starts_at)))::integer;
      credit := least(greatest(credit, 0), v.price_paise - 100);
    end if;
    usage_from := coalesce(cur.usage_since, cur.starts_at);
  else
    v_mode := 'downgrade';
    v_starts := last_end;
    blocked := 'You can move to ' || v.name || ' when your ' || cur.name || ' plan ends on '
               || to_char(cur.ends_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY') || '.';
  end if;

  v_ends := v_starts + make_interval(days => v.term_days) + bonus;

  return jsonb_build_object(
    'mode', v_mode,
    'plan_code', v.code,
    'plan_name', v.name,
    'plan_version_id', v.id,
    'billing_period', v.billing_period,
    'list_price_paise', v.price_paise,
    'credit_paise', credit,
    'amount_paise', v.price_paise - credit,
    'bonus_days', floor(extract(epoch from bonus) / 86400)::integer,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'usage_since', usage_from,
    'current_plan_code', cur.code,
    'current_plan_name', cur.name,
    'current_ends_at', cur.ends_at,
    'current_account_plan_id', cur.id,
    'blocked_reason', blocked);
end;
$$;

revoke all on function public.plan_change(uuid, text) from public, anon, authenticated;

-- The signed-in customer's quote (shown before paying).
create or replace function public.plan_quote(p_plan_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
begin
  if acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  return public.plan_change(acc, p_plan_code);
end;
$$;

revoke all on function public.plan_quote(text) from public, anon;
grant execute on function public.plan_quote(text) to authenticated;


-- ---------------------------------------------------------------------
-- create_plan_order(): now priced by plan_change() (credit applied).
-- ---------------------------------------------------------------------

create or replace function public.create_plan_order(p_plan_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
  q jsonb;
  new_id uuid;
begin
  if acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts where id = acc and status = 'active') then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  q := public.plan_change(acc, p_plan_code);
  if q->>'blocked_reason' is not null then
    raise exception '%', q->>'blocked_reason' using errcode = '23514';
  end if;

  update public.orders set status = 'cancelled'
  where account_id = acc and kind = 'plan' and status = 'pending';

  insert into public.orders (account_id, user_id, kind, plan_version_id, description,
                             amount_paise, list_price_paise, credit_paise, credit_account_plan_id)
  values (acc, auth.uid(), 'plan', (q->>'plan_version_id')::uuid,
          'Propittu ' || (q->>'plan_name')
            || case when q->>'mode' = 'upgrade' then ' — upgrade from ' || (q->>'current_plan_name')
                    when q->>'billing_period' = 'year' then ' — 1 year'
                    when q->>'billing_period' = 'month' then ' — 1 month'
                    else '' end,
          (q->>'amount_paise')::integer, (q->>'list_price_paise')::integer,
          (q->>'credit_paise')::integer,
          case when (q->>'credit_paise')::integer > 0 then (q->>'current_account_plan_id')::uuid end)
  returning id into new_id;
  return new_id;
end;
$$;


-- ---------------------------------------------------------------------
-- record_payment_event(): activation follows plan_change().
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
  q jsonb;
  new_plan uuid;
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
        q := public.plan_change(o.account_id,
               (select p.code from public.plan_versions pv join public.plans p on p.id = pv.plan_id
                where pv.id = o.plan_version_id));

        -- New (incl. Trial → paid) and upgrades start now and end what is in
        -- force; renewals (and an unexpected downgrade) queue after it.
        if q->>'mode' in ('new', 'upgrade') then
          update public.account_plans set ends_at = now()
          where account_id = o.account_id and starts_at < now() and ends_at > now();
        end if;

        insert into public.account_plans (account_id, plan_version_id, source, starts_at, ends_at, usage_since)
        values (o.account_id, o.plan_version_id, 'payment',
                (q->>'starts_at')::timestamptz, (q->>'ends_at')::timestamptz,
                (q->>'usage_since')::timestamptz)
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


-- ---------------------------------------------------------------------
-- Included Services count from usage_since when set (carried on upgrade).
-- ---------------------------------------------------------------------

create or replace function public.included_remaining(p_account uuid, p_code text)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with cur as (
    select ap.id, coalesce(ap.usage_since, ap.starts_at) as since0, ap.plan_version_id
    from public.account_plans ap
    where ap.account_id = p_account and ap.starts_at <= now() and ap.ends_at > now()
    order by ap.starts_at desc
    limit 1
  ), ben as (
    select cur.id, b.value as quantity, b.period,
           case when b.period = 'term' then cur.since0
                else greatest(now() - interval '1 year', cur.since0) end as since
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


-- ---------------------------------------------------------------------
-- staff_extend_plan(): add days to what is in force; anything queued
-- after it moves by the same days, so nothing overlaps or is lost.
-- (The API checks the staff permission; this checks staff.)
-- ---------------------------------------------------------------------

create or replace function public.staff_extend_plan(p_account uuid, p_days integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur record;
  shift interval := make_interval(days => p_days);
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Add between 1 and 365 days' using errcode = '22023';
  end if;

  select id, ends_at into cur from public.account_plans
  where account_id = p_account and starts_at <= now() and ends_at > now()
  order by starts_at desc limit 1
  for update;
  if cur.id is null then
    raise exception 'No plan in force — give a plan instead' using errcode = 'P0002';
  end if;

  update public.account_plans
  set starts_at = starts_at + shift, ends_at = ends_at + shift
  where account_id = p_account and starts_at >= cur.ends_at;
  update public.account_plans set ends_at = ends_at + shift where id = cur.id;
  return cur.id;
end;
$$;

revoke all on function public.staff_extend_plan(uuid, integer) from public, anon;
grant execute on function public.staff_extend_plan(uuid, integer) to authenticated;
