-- Owners see a disputes check only once it's reviewed and shared, or clear
-- (nothing found). While the team reviews, the API says "being checked"
-- without showing the items.
drop policy property_disputes_read on public.property_disputes;
create policy property_disputes_read on public.property_disputes for select to authenticated
  using (public.is_staff()
         or (public.is_account_member(account_id) and status in ('shared', 'clear')));
