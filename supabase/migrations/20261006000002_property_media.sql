-- =====================================================================
-- M2 Property (location, provenance) + M3 Documents & Media (videos)
--
-- Non-destructive: existing document categories are remapped to the
-- V1 set (nothing is deleted); everything else is additive.
-- =====================================================================


-- ---------------------------------------------------------------------
-- M2: location as a first-class, provenance-aware value
--
-- Address → approximate map position → user confirms/moves the pin.
-- location_source records WHO set the coordinates so future AI or
-- external data never silently overwrites a user-confirmed location.
-- field_sources does the same per field, e.g. {"area_value": "user"}.
-- ---------------------------------------------------------------------

alter table public.properties
  add column location_source text
    check (location_source is null or location_source in ('user', 'sale_deed', 'ai', 'external', 'system')),
  add column location_confirmed_at timestamptz,
  add column field_sources jsonb not null default '{}'::jsonb;

-- Coordinates and their source travel together.
alter table public.properties add constraint properties_location_complete check (
  (latitude is null and longitude is null)
  or (latitude is not null and longitude is not null and location_source is not null)
);


-- ---------------------------------------------------------------------
-- M3: V1 document categories — Sale Deed, Registration, Property Tax,
-- Other. Existing rows are remapped, never deleted.
-- ---------------------------------------------------------------------

alter table public.property_documents drop constraint property_documents_document_type_check;

update public.property_documents set document_type = 'property_tax' where document_type = 'tax_receipt';
update public.property_documents set document_type = 'other'
  where document_type in ('khata_certificate', 'encumbrance_certificate', 'building_approval',
                          'electricity', 'rental_agreement');

alter table public.property_documents add constraint property_documents_document_type_check
  check (document_type in ('sale_deed', 'registration', 'property_tax', 'other'));

-- Optional description, and a review status that only staff (or, later,
-- AI with staff oversight) can move beyond 'uploaded'.
alter table public.property_documents
  add column description text check (description is null or char_length(description) <= 500),
  add column status text not null default 'uploaded'
    check (status in ('uploaded', 'under_review', 'verified', 'rejected'));

-- Customers may edit category and description; never the review status.
revoke update on public.property_documents from authenticated;
grant update (upload_status, document_type, description) on public.property_documents to authenticated;


-- ---------------------------------------------------------------------
-- M3: property videos (private bucket, ≤ 50 MB — the Supabase free
-- plan's per-file limit)
-- ---------------------------------------------------------------------

create table public.property_videos (
  id                uuid        primary key default gen_random_uuid(),
  property_id       uuid        not null references public.properties (id) on delete cascade,
  account_id        uuid        not null references public.accounts (id) on delete cascade,
  user_id           uuid        not null references auth.users (id) on delete cascade,
  storage_path      text        not null unique,
  caption           text        check (caption is null or char_length(caption) <= 200),
  mime_type         text        not null check (mime_type in ('video/mp4', 'video/quicktime')),
  file_size         integer     not null check (file_size > 0 and file_size <= 52428800),
  duration_seconds  numeric(7, 2) check (duration_seconds is null or duration_seconds > 0),
  upload_status     text        not null default 'pending' check (upload_status in ('pending', 'ready')),
  created_at        timestamptz not null default now(),

  constraint property_videos_path_owned
    check (storage_path like (account_id::text || '/' || property_id::text || '/%'))
);

create index property_videos_property_idx on public.property_videos (property_id, created_at);
create index property_videos_account_idx on public.property_videos (account_id);

alter table public.property_videos enable row level security;
revoke all on public.property_videos from anon;

create policy property_videos_select on public.property_videos for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
create policy property_videos_insert on public.property_videos for insert to authenticated
  with check (
    public.is_account_member(account_id)
    and user_id = (select auth.uid())
    and exists (select 1 from public.properties p
                where p.id = property_id and p.account_id = property_videos.account_id)
  );
create policy property_videos_update on public.property_videos for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));
create policy property_videos_delete on public.property_videos for delete to authenticated
  using (public.is_account_member(account_id));

revoke update on public.property_videos from authenticated;
grant update (upload_status, caption) on public.property_videos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-videos', 'property-videos', false, 52428800, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------
-- Storage policies now cover the videos bucket too.
-- ---------------------------------------------------------------------

drop policy property_files_select on storage.objects;
drop policy property_files_insert on storage.objects;
drop policy property_files_update on storage.objects;
drop policy property_files_delete on storage.objects;

create policy property_files_select on storage.objects for select to authenticated
  using (
    bucket_id in ('property-photos', 'property-documents', 'property-videos')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

create policy property_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('property-photos', 'property-documents', 'property-videos')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

create policy property_files_update on storage.objects for update to authenticated
  using (
    bucket_id in ('property-photos', 'property-documents', 'property-videos')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
  with check (
    bucket_id in ('property-photos', 'property-documents', 'property-videos')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy property_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('property-photos', 'property-documents', 'property-videos')
    and (
      public.is_account_folder((storage.foldername(name))[1])
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );


-- ---------------------------------------------------------------------
-- Summary view: media counts and completion signals for Home cards.
-- ---------------------------------------------------------------------

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
    where v.property_id = p.id and v.upload_status = 'ready') as video_count
from public.properties p;
