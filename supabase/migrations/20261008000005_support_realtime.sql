-- =====================================================================
-- Live support chat (owner, 8 Oct 2026). Support tickets and their
-- messages are published to Supabase Realtime so the Backoffice portal
-- (and later the app) sees a new reply or status change the moment it is
-- saved, without refreshing. Realtime applies the same row-level security
-- as a normal read: staff receive every ticket, a customer only their own.
-- =====================================================================

-- Plain Postgres (the RLS test database) has no Realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.support_tickets, public.support_ticket_messages;
  end if;
end $$;
