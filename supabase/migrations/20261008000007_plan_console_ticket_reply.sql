-- =====================================================================
-- Backoffice portal, plans console and support inbox (owner, 8 Oct 2026).
--
-- 1. Plans are configured in the portal. A plan's name, description and
--    whether it is on sale change in place. Its price, term and benefits
--    change only by publishing a NEW version (staff_publish_plan_version):
--    new purchases, renewals and the Trial use it at once; customers keep
--    the version they bought. Published versions are history, so staff can
--    no longer edit or add version rows directly.
-- 2. support_tickets.awaiting_staff: the customer wrote last and the ticket
--    is not resolved, i.e. it needs a reply from us.
-- =====================================================================

drop policy plan_versions_staff_insert on public.plan_versions;
drop policy plan_versions_staff_update on public.plan_versions;
drop policy plan_benefits_staff_insert on public.plan_version_benefits;
drop policy plan_benefits_staff_update on public.plan_version_benefits;
revoke insert, update on public.plan_versions, public.plan_version_benefits from authenticated;

-- p_benefits: [{"kind":"feature|limit|included_service","code":"…","value":n|null,"period":"year|term"|null}]
create or replace function public.staff_publish_plan_version(
  p_plan uuid,
  p_price_paise integer,
  p_billing_period text,
  p_term_days integer,
  p_benefits jsonb
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

  update public.plan_versions set is_current = false where plan_id = p_plan and is_current;

  insert into public.plan_versions (plan_id, version, price_paise, billing_period, term_days, is_current)
  values (p_plan, next_version, p_price_paise, p_billing_period, p_term_days, true)
  returning id into new_id;

  insert into public.plan_version_benefits (plan_version_id, kind, code, value, period)
  select new_id, b->>'kind', b->>'code', (b->>'value')::integer, b->>'period'
  from jsonb_array_elements(p_benefits) b;

  return new_id;
end;
$$;

revoke all on function public.staff_publish_plan_version(uuid, integer, text, integer, jsonb) from public, anon;
grant execute on function public.staff_publish_plan_version(uuid, integer, text, integer, jsonb) to authenticated;

alter table public.support_tickets
  add column awaiting_staff boolean generated always as (
    status not in ('resolved', 'closed')
    and (last_staff_message_at is null or last_message_at > last_staff_message_at)
  ) stored;
