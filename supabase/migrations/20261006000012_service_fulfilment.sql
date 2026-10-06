-- =====================================================================
-- Service fulfilment types (product decision 2026-10-06)
--
--   visit       On-site work. Requested → Confirmed → Scheduled →
--               In progress → Completed. Delivers a visit report.
--   assistance  Paperwork help (tax, Khata, document checks). Requested →
--               Accepted → Working on it ⇄ Need info from you → Completed.
--               No visit, no schedule. Delivers an outcome summary with
--               result files, which are saved into the property's
--               Documents when the request is completed.
--
-- The type lives on the service (staff can change it) and is copied onto
-- each request when it is opened, so changing the catalogue never changes
-- requests already in flight. Staff can switch a request's type before
-- work has been written up (e.g. for "Other").
--
-- "Need info from you" is a support ticket linked to the request: staff
-- ask, the customer replies (with files) in the ticket thread, and the
-- request goes back to "Working on it" automatically.
-- =====================================================================

alter table public.services
  add column fulfilment text not null default 'visit' check (fulfilment in ('visit', 'assistance'));
update public.services set fulfilment = 'assistance' where category = 'property_government';

alter table public.service_requests
  add column fulfilment text not null default 'visit' check (fulfilment in ('visit', 'assistance'));
update public.service_requests r set fulfilment = s.fulfilment
from public.services s where s.id = r.service_id;

-- Copy the service's type onto every new request (whoever inserts it).
create or replace function public.service_request_fulfilment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.fulfilment into new.fulfilment from public.services s where s.id = new.service_id;
  new.fulfilment := coalesce(new.fulfilment, 'visit');
  return new;
end;
$$;
revoke all on function public.service_request_fulfilment() from public, anon, authenticated;
create trigger service_requests_fulfilment
  before insert on public.service_requests
  for each row execute function public.service_request_fulfilment();

alter table public.service_requests drop constraint service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('requested', 'confirmed', 'scheduled', 'in_progress', 'awaiting_customer',
                    'completed', 'cancelled'));
-- Paperwork requests that were "scheduled" under the old one-size flow.
update public.service_requests set status = 'in_progress'
where fulfilment = 'assistance' and status = 'scheduled';
alter table public.service_requests add constraint service_requests_status_fits_fulfilment
  check (not (fulfilment = 'assistance' and status = 'scheduled')
         and not (fulfilment = 'visit' and status = 'awaiting_customer'));


-- ---------------------------------------------------------------------
-- Lifecycle, by type. Mirrors SERVICE_REQUEST_TRANSITIONS in the app.
-- ---------------------------------------------------------------------

create or replace function public.request_transitions(p_fulfilment text, p_status text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_fulfilment = 'assistance' then case p_status
      when 'requested'         then array['confirmed', 'cancelled']
      when 'confirmed'         then array['in_progress', 'awaiting_customer', 'completed', 'cancelled']
      when 'in_progress'       then array['awaiting_customer', 'completed', 'cancelled']
      when 'awaiting_customer' then array['in_progress', 'completed', 'cancelled']
      else array[]::text[] end
    else case p_status
      when 'requested'   then array['confirmed', 'cancelled']
      when 'confirmed'   then array['scheduled', 'in_progress', 'completed', 'cancelled']
      when 'scheduled'   then array['scheduled', 'in_progress', 'completed', 'cancelled']
      when 'in_progress' then array['completed', 'cancelled']
      else array[]::text[] end
  end;
$$;
grant execute on function public.request_transitions(text, text) to authenticated;

-- Reports and outcomes are drafts while work is open (now including
-- "Need info from you"), published when the request is completed.
create or replace function public.request_report_editable(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_requests
                 where id = p_request
                   and status in ('confirmed', 'scheduled', 'in_progress', 'awaiting_customer'));
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
                 where v.id = p_report
                   and r.status in ('confirmed', 'scheduled', 'in_progress', 'awaiting_customer'));
$$;


-- ---------------------------------------------------------------------
-- Outcome summary (assistance) + result files
-- ---------------------------------------------------------------------

create table public.service_outcomes (
  id                  uuid        primary key default gen_random_uuid(),
  service_request_id  uuid        not null unique references public.service_requests (id) on delete cascade,
  account_id          uuid        not null references public.accounts (id) on delete cascade,
  property_id         uuid        references public.properties (id) on delete set null,
  -- What was done.
  summary             text        not null check (char_length(trim(summary)) between 1 and 4000),
  -- What we found / anything the customer should know.
  findings            text        not null default '' check (char_length(findings) <= 4000),
  -- e.g. receipt, application or acknowledgement number.
  reference_number    text        check (reference_number is null or char_length(reference_number) <= 120),
  -- When this next needs doing (e.g. next property tax due).
  next_due_date       date,
  created_by          uuid        not null references auth.users (id),
  updated_by          uuid        references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger service_outcomes_set_updated_at
  before update on public.service_outcomes
  for each row execute function public.set_updated_at();

create table public.service_outcome_files (
  id                    uuid        primary key default gen_random_uuid(),
  outcome_id            uuid        not null references public.service_outcomes (id) on delete cascade,
  account_id            uuid        not null references public.accounts (id) on delete cascade,
  file_name             text        not null check (char_length(file_name) between 1 and 255),
  storage_path          text        not null unique,
  mime_type             text        not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size             integer     not null check (file_size > 0 and file_size <= 10485760),
  -- Saved into the property's Documents as this type when completed (null = not saved).
  document_type         text        check (document_type is null or document_type in
                                      ('sale_deed', 'registration', 'property_tax', 'other')),
  upload_status         text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  property_document_id  uuid        references public.property_documents (id) on delete set null,
  created_by            uuid        not null references auth.users (id),
  created_at            timestamptz not null default now(),
  -- In the customer's account folder (under the property when there is one,
  -- which is also where Documents expects the file).
  constraint service_outcome_files_path check (storage_path like account_id::text || '/%outcomes/%')
);

create index service_outcome_files_outcome_idx on public.service_outcome_files (outcome_id, created_at);

create or replace function public.outcome_files_editable(p_outcome uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_outcomes o
                 join public.service_requests r on r.id = o.service_request_id
                 where o.id = p_outcome
                   and r.status in ('confirmed', 'in_progress', 'awaiting_customer'));
$$;

create or replace function public.outcome_published(p_outcome uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_outcomes o
                 join public.service_requests r on r.id = o.service_request_id
                 where o.id = p_outcome and r.status = 'completed');
$$;

revoke all on function public.outcome_files_editable(uuid) from public, anon;
revoke all on function public.outcome_published(uuid) from public, anon;
grant execute on function public.outcome_files_editable(uuid) to authenticated;
grant execute on function public.outcome_published(uuid) to authenticated;

alter table public.service_outcomes enable row level security;
revoke all on public.service_outcomes from anon, authenticated;
grant select, insert, update on public.service_outcomes to authenticated;
create policy service_outcomes_select on public.service_outcomes for select to authenticated
  using (
    public.is_staff()
    or (public.is_account_member(account_id) and public.request_report_published(service_request_id))
  );
create policy service_outcomes_staff_insert on public.service_outcomes for insert to authenticated
  with check (
    public.is_staff()
    and created_by = (select auth.uid())
    and public.request_report_editable(service_request_id)
    and exists (select 1 from public.service_requests r
                where r.id = service_request_id and r.account_id = service_outcomes.account_id
                  and r.fulfilment = 'assistance')
  );
create policy service_outcomes_staff_update on public.service_outcomes for update to authenticated
  using (public.is_staff() and public.request_report_editable(service_request_id))
  with check (public.is_staff() and public.request_report_editable(service_request_id));

alter table public.service_outcome_files enable row level security;
revoke all on public.service_outcome_files from anon, authenticated;
grant select, insert, delete on public.service_outcome_files to authenticated;
grant update (upload_status, document_type) on public.service_outcome_files to authenticated;
create policy outcome_files_select on public.service_outcome_files for select to authenticated
  using (
    public.is_staff()
    or (public.is_account_member(account_id) and public.outcome_published(outcome_id))
  );
create policy outcome_files_staff_insert on public.service_outcome_files for insert to authenticated
  with check (
    public.is_staff()
    and created_by = (select auth.uid())
    and public.outcome_files_editable(outcome_id)
    and exists (select 1 from public.service_outcomes o
                where o.id = outcome_id and o.account_id = service_outcome_files.account_id)
  );
create policy outcome_files_staff_update on public.service_outcome_files for update to authenticated
  using (public.is_staff() and public.outcome_files_editable(outcome_id))
  with check (public.is_staff() and public.outcome_files_editable(outcome_id));
create policy outcome_files_staff_delete on public.service_outcome_files for delete to authenticated
  using (public.is_staff() and public.outcome_files_editable(outcome_id));


-- ---------------------------------------------------------------------
-- staff_update_service_request(): lifecycle by type; completing an
-- assistance request saves its result files into the property's Documents.
-- ---------------------------------------------------------------------

create or replace function public.staff_update_service_request(
  p_request uuid, p_status text, p_scheduled_for timestamptz default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  plan_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  select sr.*, s.code as service_code, s.name as service_name into r
  from public.service_requests sr join public.services s on s.id = sr.service_id
  where sr.id = p_request
  for update of sr;
  if not found then
    raise exception 'Service request not found' using errcode = 'P0002';
  end if;

  if not (p_status = any (public.request_transitions(r.fulfilment, r.status))) then
    raise exception 'Cannot change a % request to %', r.status, p_status using errcode = '23514';
  end if;
  if p_status = 'scheduled' and p_scheduled_for is null then
    raise exception 'A scheduled request needs a date' using errcode = '23514';
  end if;

  update public.service_requests set
    status        = p_status,
    scheduled_for = coalesce(p_scheduled_for, scheduled_for),
    status_note   = coalesce(p_note, status_note),
    confirmed_at  = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at  = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at  = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancelled_by  = case when p_status = 'cancelled' then 'staff' else cancelled_by end
  where id = p_request;

  if p_status = 'confirmed' and r.coverage = 'included' then
    select ap.id into plan_id from public.account_plans ap
    where ap.account_id = r.account_id and ap.starts_at <= now() and ap.ends_at > now()
    order by ap.starts_at desc limit 1;
    insert into public.usage_records (account_id, account_plan_id, kind, code, service_request_id)
    values (r.account_id, plan_id, 'included_service', r.service_code, r.id);
  end if;

  if p_status = 'cancelled' then
    update public.usage_records set released_at = now()
    where service_request_id = p_request and released_at is null;
  end if;

  -- Result files → the property's Documents (once; only files given a type).
  if p_status = 'completed' and r.fulfilment = 'assistance' and r.property_id is not null then
    with saved as (
      insert into public.property_documents
        (property_id, account_id, user_id, document_type, file_name, storage_path,
         mime_type, file_size, upload_status, description)
      select r.property_id, f.account_id, f.created_by, f.document_type, f.file_name, f.storage_path,
             f.mime_type, f.file_size, 'ready',
             left('From ' || r.service_name || ' (' || r.reference || ')', 500)
      from public.service_outcome_files f
      join public.service_outcomes o on o.id = f.outcome_id
      where o.service_request_id = r.id
        and f.upload_status = 'ready'
        and f.document_type is not null
        and f.property_document_id is null
        and f.storage_path like r.account_id::text || '/' || r.property_id::text || '/%'
      returning id, storage_path
    )
    update public.service_outcome_files f set property_document_id = saved.id
    from saved where f.storage_path = saved.storage_path;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- staff_request_info(): "Need info from you". Moves the request to
-- awaiting_customer and asks in the request's support ticket (created on
-- first use), which the customer answers in the app.
-- ---------------------------------------------------------------------

create or replace function public.staff_request_info(p_request uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  ticket uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_message is null or char_length(trim(p_message)) < 3 then
    raise exception 'Say what you need from the customer' using errcode = '22023';
  end if;

  select sr.*, s.name as service_name into r
  from public.service_requests sr join public.services s on s.id = sr.service_id
  where sr.id = p_request
  for update of sr;
  if not found then
    raise exception 'Service request not found' using errcode = 'P0002';
  end if;
  if not ('awaiting_customer' = any (public.request_transitions(r.fulfilment, r.status))) then
    raise exception 'Cannot ask for information on a % request', r.status using errcode = '23514';
  end if;

  update public.service_requests
  set status = 'awaiting_customer', status_note = left(trim(p_message), 1000)
  where id = p_request;

  select id into ticket from public.support_tickets
  where service_request_id = p_request and status <> 'closed'
  order by created_at desc limit 1;
  if ticket is null then
    insert into public.support_tickets
      (account_id, user_id, subject, category, property_id, service_request_id, status)
    values (r.account_id, r.user_id, left(r.service_name || ' ' || r.reference, 120),
            'service_request', r.property_id, r.id, 'waiting_on_customer')
    returning id into ticket;
  end if;

  insert into public.support_ticket_messages (ticket_id, account_id, author_id, author_type, body)
  values (ticket, r.account_id, auth.uid(), 'staff', left(trim(p_message), 4000));
  update public.support_tickets set status = 'waiting_on_customer', resolved_at = null where id = ticket;
  return ticket;
end;
$$;

revoke all on function public.staff_request_info(uuid, text) from public, anon;
grant execute on function public.staff_request_info(uuid, text) to authenticated;

-- Staff switch a request's type before anything has been written up.
create or replace function public.staff_set_request_fulfilment(p_request uuid, p_fulfilment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = p_request for update;
  if not found then
    raise exception 'Service request not found' using errcode = 'P0002';
  end if;
  if r.status not in ('requested', 'confirmed') then
    raise exception 'The type can only be changed before work starts' using errcode = '23514';
  end if;
  if exists (select 1 from public.visit_reports where service_request_id = p_request)
     or exists (select 1 from public.service_outcomes where service_request_id = p_request) then
    raise exception 'A report has already been written for this request' using errcode = '23514';
  end if;
  update public.service_requests set fulfilment = p_fulfilment where id = p_request;
end;
$$;

revoke all on function public.staff_set_request_fulfilment(uuid, text) from public, anon;
grant execute on function public.staff_set_request_fulfilment(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- The customer's reply in the request's ticket resumes the work.
-- ---------------------------------------------------------------------

create or replace function public.resume_request_on_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_type = 'customer' then
    update public.service_requests r
    set status = 'in_progress'
    from public.support_tickets t
    where t.id = new.ticket_id and r.id = t.service_request_id and r.status = 'awaiting_customer';
  end if;
  return new;
end;
$$;
revoke all on function public.resume_request_on_reply() from public, anon, authenticated;

create trigger support_ticket_messages_resume_request
  after insert on public.support_ticket_messages
  for each row execute function public.resume_request_on_reply();
