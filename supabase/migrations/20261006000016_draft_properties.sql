-- =====================================================================
-- Draft properties (Pittu: "Upload your Sale Deed")
--
-- A deed must belong to a property before it can be stored, so the deed
-- path first creates a DRAFT. Drafts are hidden from Home, do not count
-- toward plan limits, and become real properties only when the customer
-- confirms the details (POST /properties/:id/setup). Abandoned drafts can
-- be cleaned up later; they hold only the uploaded deed.
-- =====================================================================

alter table public.properties add column is_draft boolean not null default false;
create index properties_account_draft_idx on public.properties (account_id) where is_draft;

-- Plan usage counts confirmed properties only.
create or replace view public.account_usage
with (security_invoker = true) as
select
  a.id as account_id,
  (select count(*)::int from public.properties p where p.account_id = a.id and not p.is_draft) as property_count,
  (
    coalesce((select sum(file_size) from public.property_photos x
              where x.account_id = a.id and x.upload_status = 'ready'), 0)
    + coalesce((select sum(file_size) from public.property_documents x
                where x.account_id = a.id and x.upload_status = 'ready'), 0)
    + coalesce((select sum(file_size) from public.property_videos x
                where x.account_id = a.id and x.upload_status = 'ready'), 0)
  )::bigint as storage_bytes
from public.accounts a;

-- Summaries expose the flag (appended column) so lists can leave drafts out.
create or replace view public.property_summaries
with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.property_type,
  p.name,
  p.city,
  p.state,
  p.created_at,
  (select count(*)::int from public.property_documents d
    where d.property_id = p.id and d.upload_status = 'ready') as document_count,
  (select count(*)::int from public.service_requests r
    where r.property_id = p.id) as service_request_count,
  (select ph.storage_path from public.property_photos ph
    where ph.property_id = p.id and ph.upload_status = 'ready'
    order by ph.created_at limit 1) as cover_photo_path,
  p.account_id,
  (select count(*)::int from public.property_photos ph
    where ph.property_id = p.id and ph.upload_status = 'ready') as photo_count,
  (select count(*)::int from public.property_videos v
    where v.property_id = p.id and v.upload_status = 'ready') as video_count,
  p.is_draft
from public.properties p;
