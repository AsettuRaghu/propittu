-- =====================================================================
-- Family access is a plan feature (owner, 12 Oct 2026): included in Plus
-- (and the Plus trial), not in Basic. Set per plan version in the portal's
-- plans console like any other feature. Adding it to Plus only gives its
-- subscribers something more, so existing versions get it too.
-- =====================================================================

insert into public.plan_version_benefits (plan_version_id, kind, code)
select pv.id, 'feature', 'family_access'
from public.plan_versions pv
join public.plans p on p.id = pv.plan_id
where p.code in ('plus', 'trial')
on conflict (plan_version_id, kind, code) do nothing;
