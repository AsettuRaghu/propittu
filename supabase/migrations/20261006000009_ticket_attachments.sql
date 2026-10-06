-- =====================================================================
-- Support ticket attachments (photos / PDFs on a ticket message)
--
-- Files go to the private property-documents bucket under the customer's
-- account folder: <account_id>/tickets/<ticket_id>/<uuid>.<ext>. Existing
-- storage policies already allow the account (and staff) there and no one
-- else. Same intent → upload → confirm flow as documents.
-- =====================================================================

create table public.support_ticket_attachments (
  id             uuid        primary key default gen_random_uuid(),
  ticket_id      uuid        not null references public.support_tickets (id) on delete cascade,
  message_id     uuid        not null references public.support_ticket_messages (id) on delete cascade,
  account_id     uuid        not null references public.accounts (id) on delete cascade,
  uploaded_by    uuid        not null references auth.users (id),
  file_name      text        not null check (char_length(file_name) between 1 and 255),
  storage_path   text        not null unique,
  mime_type      text        not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size      integer     not null check (file_size > 0 and file_size <= 10485760),
  upload_status  text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  created_at     timestamptz not null default now(),
  constraint support_attachment_path check (storage_path like account_id::text || '/tickets/%')
);

create index support_ticket_attachments_ticket_idx on public.support_ticket_attachments (ticket_id, created_at);

alter table public.support_ticket_attachments enable row level security;
revoke all on public.support_ticket_attachments from anon, authenticated;
grant select, insert, delete on public.support_ticket_attachments to authenticated;
grant update (upload_status) on public.support_ticket_attachments to authenticated;

create policy support_attachments_select on public.support_ticket_attachments for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());

-- Only on a message the uploader wrote, inside that message's ticket and account.
create policy support_attachments_insert on public.support_ticket_attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (public.is_account_member(account_id) or public.is_staff())
    and exists (
      select 1 from public.support_ticket_messages m
      where m.id = message_id
        and m.ticket_id = support_ticket_attachments.ticket_id
        and m.account_id = support_ticket_attachments.account_id
        and m.author_id = (select auth.uid())
    )
  );

create policy support_attachments_update on public.support_ticket_attachments for update to authenticated
  using (uploaded_by = (select auth.uid())) with check (uploaded_by = (select auth.uid()));

-- Uploader may remove an attachment that never finished uploading.
create policy support_attachments_delete on public.support_ticket_attachments for delete to authenticated
  using (uploaded_by = (select auth.uid()) and upload_status = 'pending');
