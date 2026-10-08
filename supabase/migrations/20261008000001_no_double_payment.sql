-- =====================================================================
-- Never take payment twice for the same thing (owner, 8 Oct 2026).
--
-- 1. A payment that arrives for an order that no longer stands — replaced
--    (cancelled), a second payment for an already-paid service request, or
--    a plan order whose terms no longer hold (a term already bought, the
--    price moved) — activates nothing. The money is recorded as captured
--    and the outcome is 'refund_needed' for staff to refund.
-- 2. At most one open plan order per account, one open and one paid order
--    per service request — so two taps at once can't both be payable.
-- (The API also cancels the payment links of orders it replaces.)
-- =====================================================================

create unique index orders_one_pending_plan_idx
  on public.orders (account_id) where kind = 'plan' and status = 'pending';
create unique index orders_one_pending_request_idx
  on public.orders (service_request_id) where kind = 'extra_service' and status = 'pending';
create unique index orders_one_paid_request_idx
  on public.orders (service_request_id) where kind = 'extra_service' and status = 'paid';

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
      -- The payment attempt: the checkout we created, else a new row. The
      -- money is real, so the payment is always recorded as captured.
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

      -- Never grant anything twice. A replaced (cancelled) order, a second
      -- payment for an already-paid request, or a plan order whose terms no
      -- longer hold (a term already bought, the price moved) activates
      -- nothing: the payment is kept for staff to refund.
      if o.status = 'cancelled' then
        v_outcome := 'refund_needed';
      elsif o.kind = 'extra_service' and exists (
        select 1 from public.orders x
        where x.service_request_id = o.service_request_id and x.status = 'paid' and x.id <> o.id
      ) then
        update public.orders set status = 'cancelled' where id = o.id;
        v_outcome := 'refund_needed';
      elsif o.kind = 'plan' then
        q := public.plan_change(o.account_id,
               (select p.code from public.plan_versions pv join public.plans p on p.id = pv.plan_id
                where pv.id = o.plan_version_id));
        if q->>'blocked_reason' is not null
           or (q->>'amount_paise')::integer is distinct from o.amount_paise then
          update public.orders set status = 'cancelled' where id = o.id;
          v_outcome := 'refund_needed';
        else
          update public.orders set status = 'paid', paid_at = now() where id = o.id;
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
        end if;
      else
        update public.orders set status = 'paid', paid_at = now() where id = o.id;
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
