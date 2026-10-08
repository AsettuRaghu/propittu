-- =====================================================================
-- A deleted property takes its open service requests with it (owner,
-- 8 Oct 2026). Requests are history and are kept (property_id becomes
-- null), but one still open for a property that no longer exists can't be
-- delivered. Before a property is deleted, its open requests are cancelled
-- with a note, any plan visit they held is released, and unpaid orders for
-- them are closed. Then the one existing orphan is tidied up the same way.
-- =====================================================================

create or replace function public.cancel_requests_of_removed_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usage_records set released_at = now()
  where released_at is null
    and service_request_id in (
      select id from public.service_requests
      where property_id = old.id
        and status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer'));
  update public.orders set status = 'cancelled'
  where status = 'pending'
    and service_request_id in (
      select id from public.service_requests
      where property_id = old.id
        and status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer'));
  update public.service_requests
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
      status_note = 'The property was removed.'
  where property_id = old.id
    and status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer');
  return old;
end;
$$;
revoke all on function public.cancel_requests_of_removed_property() from public, anon, authenticated;

create trigger properties_cancel_open_requests
  before delete on public.properties
  for each row execute function public.cancel_requests_of_removed_property();

-- The existing orphan(s): open requests whose property is already gone.
update public.usage_records set released_at = now()
where released_at is null
  and service_request_id in (select id from public.service_requests where property_id is null
    and status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer'));
update public.orders set status = 'cancelled'
where status = 'pending'
  and service_request_id in (select id from public.service_requests where property_id is null
    and status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer'));
update public.service_requests
set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
    status_note = 'The property was removed.'
where property_id is null
  and status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer');
