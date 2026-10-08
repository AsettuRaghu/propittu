-- =====================================================================
-- "New reply" for customers (owner, 8 Oct 2026). The app shows when our
-- team has answered a ticket the customer hasn't opened since. A staff
-- message stamps last_staff_message_at; opening the ticket stamps
-- customer_read_at (through mark_ticket_read, as customers cannot update
-- tickets directly). has_new_reply is derived from the two.
-- =====================================================================

alter table public.support_tickets
  add column last_staff_message_at timestamptz,
  add column customer_read_at      timestamptz;

-- Existing conversations start as read: no false alarms on day one.
update public.support_tickets t set
  last_staff_message_at = (
    select max(m.created_at) from public.support_ticket_messages m
    where m.ticket_id = t.id and m.author_type = 'staff'),
  customer_read_at = now();

alter table public.support_tickets
  add column has_new_reply boolean generated always as (
    last_staff_message_at is not null
    and (customer_read_at is null or last_staff_message_at > customer_read_at)
  ) stored;

create or replace function public.touch_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets set
    last_message_at = new.created_at,
    last_staff_message_at = case
      when new.author_type = 'staff' then new.created_at else last_staff_message_at end,
    -- The customer writing is the customer reading.
    customer_read_at = case
      when new.author_type = 'customer' then new.created_at else customer_read_at end,
    status = case
      when new.author_type = 'customer' and status in ('waiting_on_customer', 'resolved') then 'open'
      else status end
  where id = new.ticket_id;
  return new;
end;
$$;

revoke all on function public.touch_support_ticket() from public, anon, authenticated;

-- The customer opened the ticket: everything in it so far is read.
create or replace function public.mark_ticket_read(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets set customer_read_at = now()
  where id = p_ticket
    and public.is_account_member(account_id)
    and has_new_reply;
end;
$$;

revoke all on function public.mark_ticket_read(uuid) from public, anon;
grant execute on function public.mark_ticket_read(uuid) to authenticated;
