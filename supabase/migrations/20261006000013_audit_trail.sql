-- =====================================================================
-- Audit trail hardening (M11)
--
-- Two layers, one table (audit_events):
--
--   1. Business events — written by the API ("service_request.created",
--      "staff.plan.granted", …) with the reason and context.
--   2. Row changes — written HERE by triggers on every table that matters
--      for money, access or service delivery ("db.orders.update" with the
--      changed columns, old → new). They are recorded however the change
--      happens: API, database function, webhook, or an operator running
--      SQL — nothing can change these tables without leaving a trace.
--
-- Every entry carries the actor (user / staff / provider / system) and,
-- when it came through the API, the request id (x-request-id), which is
-- the same id printed in the API logs, so both can be joined.
--
-- audit_events is append-only for everyone: no update, no delete.
-- =====================================================================

alter table public.audit_events add column request_id text
  check (request_id is null or char_length(request_id) <= 100);
create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_request_idx on public.audit_events (request_id) where request_id is not null;

-- The API's request id, sent to PostgREST as a header on every call.
create or replace function public.current_request_id()
returns text
language sql
stable
set search_path = ''
as $$
  select left(nullif(current_setting('request.headers', true), '')::json->>'x-request-id', 100);
$$;

-- Fill request_id on API-written events too.
create or replace function public.audit_events_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.request_id := coalesce(new.request_id, public.current_request_id());
  return new;
end;
$$;
create trigger audit_events_defaults
  before insert on public.audit_events
  for each row execute function public.audit_events_defaults();

-- Append-only: nobody (customers, staff, the API's server key) may rewrite
-- history. Referential "set null" when an account/user is removed is the
-- only change allowed (it runs as the table owner).
create or replace function public.audit_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin') and tg_op = 'UPDATE'
     and new.id = old.id and new.action = old.action and new.data = old.data
     and new.created_at = old.created_at then
    return new;  -- FK set-null on account_id / actor_user_id
  end if;
  raise exception 'The audit log is append-only' using errcode = '42501';
end;
$$;
create trigger audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();


-- ---------------------------------------------------------------------
-- Row-change trigger
-- ---------------------------------------------------------------------

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  changes jsonb;
  uid uuid := auth.uid();
  -- The database role in force (PostgREST switches to it per request).
  db_role text := nullif(current_setting('role', true), 'none');
  v_actor text;
  v_account uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(before->n.key, n.value)) into changes
    from jsonb_each(rec) n
    where n.key not in ('updated_at') and (before->n.key) is distinct from n.value;
    if changes is null then
      return new;  -- nothing meaningful changed
    end if;
  end if;

  -- A user id counts only when the change runs as a signed-in user.
  v_actor := case
    when db_role = 'service_role' then 'provider'                      -- verified payment webhooks
    when db_role = 'authenticated' and uid is not null and public.is_staff() then 'staff'
    when db_role = 'authenticated' and uid is not null then 'user'
    else 'system' end;                                                 -- operator SQL, cron
  if v_actor in ('provider', 'system') then
    uid := null;
  end if;
  v_account := case when tg_table_name = 'accounts' then (rec->>'id')::uuid
                    else (rec->>'account_id')::uuid end;
  -- When a whole account is being removed, keep its id in the data instead.
  if v_account is not null and not exists (select 1 from public.accounts where id = v_account) then
    v_account := null;
  end if;

  begin
    insert into public.audit_events
      (account_id, actor_user_id, actor_type, action, entity_type, entity_id, data, request_id)
    values (
      v_account, uid, v_actor,
      left('db.' || tg_table_name || '.' || lower(tg_op), 80),
      left(tg_table_name, 40),
      (rec->>'id')::uuid,
      case tg_op
        when 'UPDATE' then jsonb_build_object('changes', changes)
        when 'INSERT' then jsonb_build_object('new', rec)
        else jsonb_build_object('old', rec) end,
      public.current_request_id());
  exception when others then
    -- Never block the business change; surface it in the Postgres logs.
    raise warning 'audit_row_change failed on %.%: %', tg_table_name, tg_op, sqlerrm;
  end;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'account_members', 'staff_members', 'account_plans',
    'orders', 'payments', 'refunds',
    'services', 'service_requests', 'service_outcomes', 'visit_reports',
    'property_documents', 'support_tickets'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      t || '_audit', t);
  end loop;
end;
$$;
