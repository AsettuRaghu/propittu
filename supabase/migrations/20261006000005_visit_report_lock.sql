-- =====================================================================
-- Visit report lifecycle (M4, product feedback 2026-10-05)
--
--   Draft      while the request is Confirmed / Scheduled / In Progress:
--              staff-only, editable; every save keeps the previous version.
--   Published  when the request is Completed: visible to the customer and
--              LOCKED (no edits, no media changes) — a record, not a draft.
--
-- Enforced here (RLS + trigger), not only in the API or the app.
-- =====================================================================

alter table public.visit_reports add column updated_by uuid references auth.users (id);

-- Full history of every change to a report (staff-readable).
create table public.visit_report_revisions (
  id          uuid        primary key default gen_random_uuid(),
  report_id   uuid        not null references public.visit_reports (id) on delete cascade,
  account_id  uuid        not null references public.accounts (id) on delete cascade,
  snapshot    jsonb       not null,
  revised_by  uuid        references auth.users (id),
  revised_at  timestamptz not null default now()
);

create index visit_report_revisions_report_idx
  on public.visit_report_revisions (report_id, revised_at desc);

create or replace function public.keep_visit_report_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.visit_report_revisions (report_id, account_id, snapshot, revised_by)
  values (old.id, old.account_id, to_jsonb(old), auth.uid());
  return new;
end;
$$;

revoke all on function public.keep_visit_report_revision() from public, anon, authenticated;

create trigger visit_reports_keep_revision
  before update on public.visit_reports
  for each row execute function public.keep_visit_report_revision();

alter table public.visit_report_revisions enable row level security;
revoke all on public.visit_report_revisions from anon, authenticated;
grant select on public.visit_report_revisions to authenticated;
create policy visit_report_revisions_select on public.visit_report_revisions
  for select to authenticated using (public.is_staff());


-- ---------------------------------------------------------------------
-- Draft vs published, by the request's status
-- ---------------------------------------------------------------------

create or replace function public.request_report_editable(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_requests
                 where id = p_request and status in ('confirmed', 'scheduled', 'in_progress'));
$$;

create or replace function public.request_report_published(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_requests
                 where id = p_request and status = 'completed');
$$;

create or replace function public.report_media_editable(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.visit_reports v
                 join public.service_requests r on r.id = v.service_request_id
                 where v.id = p_report and r.status in ('confirmed', 'scheduled', 'in_progress'));
$$;

create or replace function public.report_media_published(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.visit_reports v
                 join public.service_requests r on r.id = v.service_request_id
                 where v.id = p_report and r.status = 'completed');
$$;

revoke all on function public.request_report_editable(uuid)   from public, anon;
revoke all on function public.request_report_published(uuid)  from public, anon;
revoke all on function public.report_media_editable(uuid)     from public, anon;
revoke all on function public.report_media_published(uuid)    from public, anon;
grant execute on function public.request_report_editable(uuid)  to authenticated;
grant execute on function public.request_report_published(uuid) to authenticated;
grant execute on function public.report_media_editable(uuid)    to authenticated;
grant execute on function public.report_media_published(uuid)   to authenticated;

-- visit_reports ---------------------------------------------------------
drop policy visit_reports_select       on public.visit_reports;
drop policy visit_reports_staff_insert on public.visit_reports;
drop policy visit_reports_staff_update on public.visit_reports;

create policy visit_reports_select on public.visit_reports for select to authenticated
  using (
    public.is_staff()
    or (public.is_account_member(account_id) and public.request_report_published(service_request_id))
  );
create policy visit_reports_staff_insert on public.visit_reports for insert to authenticated
  with check (
    public.is_staff()
    and created_by = (select auth.uid())
    and public.request_report_editable(service_request_id)
    and exists (select 1 from public.service_requests r
                where r.id = service_request_id and r.account_id = visit_reports.account_id)
  );
create policy visit_reports_staff_update on public.visit_reports for update to authenticated
  using (public.is_staff() and public.request_report_editable(service_request_id))
  with check (public.is_staff() and public.request_report_editable(service_request_id));

-- visit_report_media ----------------------------------------------------
drop policy visit_media_select       on public.visit_report_media;
drop policy visit_media_staff_insert on public.visit_report_media;
drop policy visit_media_staff_update on public.visit_report_media;
drop policy visit_media_staff_delete on public.visit_report_media;

create policy visit_media_select on public.visit_report_media for select to authenticated
  using (
    public.is_staff()
    or (public.is_account_member(account_id) and public.report_media_published(report_id))
  );
create policy visit_media_staff_insert on public.visit_report_media for insert to authenticated
  with check (
    public.is_staff()
    and created_by = (select auth.uid())
    and public.report_media_editable(report_id)
    and exists (select 1 from public.visit_reports v
                where v.id = report_id and v.account_id = visit_report_media.account_id)
  );
create policy visit_media_staff_update on public.visit_report_media for update to authenticated
  using (public.is_staff() and public.report_media_editable(report_id))
  with check (public.is_staff() and public.report_media_editable(report_id));
create policy visit_media_staff_delete on public.visit_report_media for delete to authenticated
  using (public.is_staff() and public.report_media_editable(report_id));
