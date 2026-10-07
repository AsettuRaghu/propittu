-- =====================================================================
-- Renewal window (owner decision 7 Oct 2026): a plan can be renewed only
-- in the last 100 days of what the customer already has. Same as
-- 20261006000018's plan_change() plus that one rule; plan_quote() and
-- create_plan_order() use plan_change(), so both enforce it.
-- Keep in sync with RENEWAL_WINDOW_DAYS in packages/shared/src/plans.ts.
-- =====================================================================

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
  owned integer;
  allowed integer;
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
    -- Renewing opens in the last 100 days (owner decision 7 Oct 2026).
    if last_end > now() + interval '100 days' then
      blocked := 'You can renew from '
                 || to_char((last_end - interval '100 days') at time zone 'Asia/Kolkata', 'FMDD Mon YYYY')
                 || ' — renewal opens in the last 100 days of your plan.';
    end if;
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
      credit := (least(greatest(credit, 0), v.price_paise - 100) / 100) * 100;
    end if;
    usage_from := coalesce(cur.usage_since, cur.starts_at);
  else
    v_mode := 'downgrade';
    v_starts := last_end;
    blocked := 'You can move to ' || v.name || ' when your ' || cur.name || ' plan ends on '
               || to_char(cur.ends_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY') || '.';
  end if;

  -- The plan must hold the properties the customer has today (owner decision).
  if blocked is null then
    select count(*) into owned from public.properties where account_id = p_account and not is_draft;
    select b.value into allowed from public.plan_version_benefits b
    where b.plan_version_id = v.id and b.kind = 'limit' and b.code = 'max_properties';
    if allowed is not null and owned > allowed then
      blocked := 'You have ' || owned || ' properties and ' || v.name || ' covers ' || allowed
                 || '. Choose a plan with room for all of them, or remove a property first.';
    end if;
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
