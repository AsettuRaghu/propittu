-- =====================================================================
-- New prices (owner decision 7 Oct 2026): Basic ₹1,499/yr, Plus ₹4,999/yr.
--
-- A price change is a NEW plan version: new purchases and renewals use
-- it; customers already on version 1 keep what they bought (and upgrade
-- credit is still worked out from the price they paid). Benefits are
-- copied unchanged from the current version.
-- =====================================================================

do $$
declare
  r record;
  new_id uuid;
begin
  for r in
    select pv.*, p.code
    from public.plan_versions pv
    join public.plans p on p.id = pv.plan_id
    where pv.is_current and p.code in ('basic', 'plus')
  loop
    update public.plan_versions set is_current = false where id = r.id;
    insert into public.plan_versions (plan_id, version, price_paise, billing_period, term_days, is_current)
    values (r.plan_id, r.version + 1,
            case r.code when 'basic' then 149900 else 499900 end,
            r.billing_period, r.term_days, true)
    returning id into new_id;
    insert into public.plan_version_benefits (plan_version_id, kind, code, value, period)
    select new_id, kind, code, value, period
    from public.plan_version_benefits where plan_version_id = r.id;
  end loop;
end;
$$;
