-- =====================================================================
-- Renewals can stay on an older version (owner decision 8 Oct 2026).
-- plan_versions.renewals_keep: customers holding this version renew on it
-- (same price, term and benefits) instead of moving to the newest version.
-- Set when publishing a new version (for the one it replaces) or later from
-- the plans console (staff_set_version_renewals). New buyers, upgrades and
-- downgrades always use the newest version. Same plan_change() as
-- 20261007000002 plus that one rule.
-- =====================================================================

alter table public.plan_versions add column renewals_keep boolean not null default false;

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

  select ap.id, ap.source, ap.starts_at, ap.ends_at, ap.usage_since, ap.plan_version_id,
         pv.plan_id, pv.price_paise, pv.renewals_keep, p.code, p.name
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
    -- The customer's version may be marked "renewals stay on this version":
    -- they renew at the price, term and benefits they already have.
    if cur.renewals_keep and cur.plan_version_id <> v.id then
      select pv.id, pv.price_paise, pv.term_days, pv.billing_period, pv.plan_id, p.code, p.name into v
      from public.plan_versions pv
      join public.plans p on p.id = pv.plan_id
      where pv.id = cur.plan_version_id;
    end if;
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

drop function public.staff_publish_plan_version(uuid, integer, text, integer, jsonb);

create or replace function public.staff_publish_plan_version(
  p_plan uuid,
  p_price_paise integer,
  p_billing_period text,
  p_term_days integer,
  p_benefits jsonb,
  p_keep_renewals boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  new_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  -- Included services must be real services in the catalogue.
  if exists (
    select 1 from jsonb_array_elements(p_benefits) b
    where b->>'kind' = 'included_service'
      and not exists (select 1 from public.services s where s.code = b->>'code')
  ) then
    raise exception 'An included service is not in the catalogue' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.plan_versions where plan_id = p_plan;

  -- Optionally, customers on the version being replaced keep renewing on it.
  update public.plan_versions set is_current = false,
    renewals_keep = renewals_keep or p_keep_renewals
  where plan_id = p_plan and is_current;

  insert into public.plan_versions (plan_id, version, price_paise, billing_period, term_days, is_current)
  values (p_plan, next_version, p_price_paise, p_billing_period, p_term_days, true)
  returning id into new_id;

  insert into public.plan_version_benefits (plan_version_id, kind, code, value, period)
  select new_id, b->>'kind', b->>'code', (b->>'value')::integer, b->>'period'
  from jsonb_array_elements(p_benefits) b;

  return new_id;
end;
$$;

revoke all on function public.staff_publish_plan_version(uuid, integer, text, integer, jsonb, boolean) from public, anon;
grant execute on function public.staff_publish_plan_version(uuid, integer, text, integer, jsonb, boolean) to authenticated;

create or replace function public.staff_set_version_renewals(p_version uuid, p_keep boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  update public.plan_versions set renewals_keep = p_keep where id = p_version;
  if not found then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_version_renewals(uuid, boolean) from public, anon;
grant execute on function public.staff_set_version_renewals(uuid, boolean) to authenticated;
