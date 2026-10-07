-- =====================================================================
-- Abandoned checkout (7 Oct 2026): when the customer comes back from the
-- payment page without paying (and the provider shows no payment
-- attempt), the order is closed at once so it shows as "Not completed"
-- instead of "Processing" for half an hour.
--
-- Safe if money arrives later anyway: record_payment_event() still marks
-- a cancelled order paid and activates what was bought. The API also
-- cancels the provider's payment link, so it can't be paid twice.
-- =====================================================================

create or replace function public.abandon_order(p_order uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
begin
  if acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  update public.orders set status = 'cancelled'
  where id = p_order and account_id = acc and status = 'pending';
  return found;
end;
$$;
revoke all on function public.abandon_order(uuid) from public, anon;
grant execute on function public.abandon_order(uuid) to authenticated;
