-- =====================================================================
-- Propittu MVP — keep-alive
--
-- Supabase's free plan pauses a project after ~7 days without activity.
-- A daily Vercel cron calls GET /cron/keepalive, which calls this
-- function, so the project stays awake even through quiet weeks.
--
-- It returns only the current time: no table access, nothing to leak.
-- =====================================================================

create or replace function public.keepalive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
