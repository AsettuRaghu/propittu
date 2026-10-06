-- Property limits (owner decision 6 Oct 2026): Basic 3, Plus 10. The Free
-- Trial gives "everything in Plus", so it follows Plus. Edited in the plan
-- data (current versions), so it applies to everyone on those versions and
-- can be changed again later without code.

update public.plan_version_benefits b set value = case p.code when 'basic' then 3 else 10 end
from public.plan_versions pv join public.plans p on p.id = pv.plan_id
where b.plan_version_id = pv.id and pv.is_current
  and b.kind = 'limit' and b.code = 'max_properties'
  and p.code in ('basic', 'plus', 'trial');

update public.plans set description = 'For up to 3 properties: keep their documents, photos and videos safe.'
where code = 'basic';
