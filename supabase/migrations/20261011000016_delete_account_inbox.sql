-- =====================================================================
-- Account deletion also removes documents sent by email that were never
-- filed under a property (they live in the account's inbox folder).
-- Same function as before, with inbox_documents added to the files list.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS TABLE(bucket text, path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  acc uuid := public.current_account_id();
  a record;
  v_phone text;
begin
  if uid is null or acc is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_members where user_id = uid) then
    raise exception 'Staff logins are removed by an administrator' using errcode = '42501';
  end if;
  if not exists (select 1 from public.account_members
                 where account_id = acc and user_id = uid and role = 'owner') then
    raise exception 'Only the account owner can delete the account' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_members where account_id = acc and user_id <> uid) then
    raise exception 'Remove the other members first' using errcode = '23514';
  end if;

  select * into a from public.accounts where id = acc for update;
  select phone into v_phone from public.profiles where id = uid;

  -- Every stored file of this account (collected before the rows go).
  create temporary table if not exists _deleted_files (bucket text, path text) on commit drop;
  truncate _deleted_files;
  insert into _deleted_files
    select 'property-photos', storage_path from public.property_photos where account_id = acc
    union all
    select 'property-videos', storage_path from public.property_videos where account_id = acc
    union all
    select 'property-documents', storage_path from public.property_documents where account_id = acc
    union all
    select case m.kind when 'video' then 'property-videos' else 'property-photos' end, m.storage_path
      from public.visit_report_media m where m.account_id = acc
    union all
    select 'property-documents', storage_path from public.support_ticket_attachments where account_id = acc
    union all
    select 'property-documents', storage_path from public.inbox_documents where account_id = acc and filed_document_id is null
    union all
    select 'property-documents', storage_path from public.service_outcome_files where account_id = acc;

  -- Personal data. Cascades take photos/videos/documents, reports, outcomes,
  -- media, messages and attachments with their parents.
  delete from public.support_tickets where account_id = acc;
  delete from public.service_requests where account_id = acc;
  delete from public.properties where account_id = acc;
  delete from public.usage_records where account_id = acc;

  -- The plan stops now; the periods themselves stay with the payment records.
  update public.account_plans set ends_at = now()
  where account_id = acc and starts_at < now() and ends_at > now();
  update public.account_plans set cancel_at_period_end = true, cancelled_at = now()
  where account_id = acc and starts_at >= now();

  update public.accounts set status = 'closed', closed_at = now() where id = acc;

  if a.trial_started_at is not null and coalesce(v_phone, '') <> '' then
    insert into public.closed_trial_phones (phone_sha256)
    values (public.phone_sha256(v_phone))
    on conflict (phone_sha256) do nothing;
  end if;

  update public.profiles set full_name = null where id = uid;

  return query select distinct f.bucket, f.path from _deleted_files f where f.path is not null;
end;
$function$;
