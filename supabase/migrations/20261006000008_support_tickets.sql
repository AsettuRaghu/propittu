-- =====================================================================
-- Help & Support: support tickets (customer ↔ Backoffice)
--
--   support_tickets           one per issue, optionally linked to a
--                             property and/or service request
--   support_ticket_messages   the conversation (customer and staff)
--
-- Customers open tickets and reply on their own; only staff change the
-- status. Kept forever (history), like service requests.
-- =====================================================================

create sequence public.support_ticket_ref_seq start with 1001;

create table public.support_tickets (
  id                  uuid        primary key default gen_random_uuid(),
  reference           text        not null unique
                                  default ('ST-' || lpad(nextval('public.support_ticket_ref_seq')::text, 6, '0')),
  account_id          uuid        not null references public.accounts (id) on delete cascade,
  user_id             uuid        not null references auth.users (id),
  subject             text        not null check (char_length(trim(subject)) between 3 and 120),
  category            text        not null check (category in (
                                    'account', 'plan_billing', 'property', 'documents',
                                    'service_request', 'app_issue', 'other')),
  property_id         uuid        references public.properties (id) on delete set null,
  service_request_id  uuid        references public.service_requests (id) on delete set null,
  status              text        not null default 'open'
                                  check (status in ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  last_message_at     timestamptz not null default now(),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter sequence public.support_ticket_ref_seq owned by public.support_tickets.reference;
grant usage, select on sequence public.support_ticket_ref_seq to authenticated;

create index support_tickets_account_idx on public.support_tickets (account_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, last_message_at desc);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.support_ticket_messages (
  id           uuid        primary key default gen_random_uuid(),
  ticket_id    uuid        not null references public.support_tickets (id) on delete cascade,
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  author_id    uuid        not null references auth.users (id),
  author_type  text        not null check (author_type in ('customer', 'staff')),
  body         text        not null check (char_length(trim(body)) between 1 and 4000),
  created_at   timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

-- A new message bumps the ticket (staff reply → waiting on customer;
-- customer reply on a waiting/resolved ticket → open again).
create or replace function public.touch_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets set
    last_message_at = new.created_at,
    status = case
      when new.author_type = 'customer' and status in ('waiting_on_customer', 'resolved') then 'open'
      else status end
  where id = new.ticket_id;
  return new;
end;
$$;

revoke all on function public.touch_support_ticket() from public, anon, authenticated;

create trigger support_ticket_messages_touch
  after insert on public.support_ticket_messages
  for each row execute function public.touch_support_ticket();

-- Staff status changes (customers can never set status directly).
create or replace function public.staff_set_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  update public.support_tickets set
    status = p_status,
    resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end
  where id = p_ticket;
  if not found then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_ticket_status(uuid, text) from public, anon;
grant execute on function public.staff_set_ticket_status(uuid, text) to authenticated;

-- RLS ---------------------------------------------------------------------

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_tickets, public.support_ticket_messages from anon, authenticated;
grant select, insert on public.support_tickets, public.support_ticket_messages to authenticated;

create policy support_tickets_select on public.support_tickets for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and user_id = (select auth.uid())
    and status = 'open'
    and (property_id is null or exists (
          select 1 from public.properties p where p.id = property_id and p.account_id = support_tickets.account_id))
    and (service_request_id is null or exists (
          select 1 from public.service_requests r
          where r.id = service_request_id and r.account_id = support_tickets.account_id))
  );

create policy support_messages_select on public.support_ticket_messages for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy support_messages_insert on public.support_ticket_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.support_tickets t
                where t.id = ticket_id and t.account_id = support_ticket_messages.account_id)
    and (
      (author_type = 'customer' and public.is_account_member(account_id))
      or (author_type = 'staff' and public.is_staff())
    )
  );
