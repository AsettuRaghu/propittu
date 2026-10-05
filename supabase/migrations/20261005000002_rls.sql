-- =====================================================================
-- Propittu MVP — Row Level Security
-- PRODUCT_SPEC.md §34, §35
--
-- The API queries Postgres with a per-request client carrying the
-- caller's own JWT, so these policies are enforced on EVERY API query —
-- not only on hypothetical direct client access. The API additionally
-- filters by user_id in code; this is the defense-in-depth layer (§35).
--
-- Conventions:
--   * `(select auth.uid())` rather than bare `auth.uid()` — Postgres then
--     evaluates it once per statement instead of once per row.
--   * USING   guards which existing rows are visible / targetable.
--   * WITH CHECK guards what a row may look like after insert/update —
--     without it a user could write a row stamped with someone else's id.
--   * The anon role is granted nothing. Every resource needs a session.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Baseline: no anonymous access to any application table.
-- ---------------------------------------------------------------------

revoke all on public.profiles           from anon;
revoke all on public.properties         from anon;
revoke all on public.property_photos    from anon;
revoke all on public.property_documents from anon;
revoke all on public.services           from anon;
revoke all on public.service_requests   from anon;
revoke all on public.property_summaries from anon;
revoke all on sequence public.service_request_ref_seq from anon;


-- ---------------------------------------------------------------------
-- profiles
--
-- Rows are created by the handle_new_user trigger (security definer),
-- so users never insert. Users may update ONLY full_name — phone is
-- owned by Supabase Auth and must not be user-editable here.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- properties — full CRUD on own rows.
-- ---------------------------------------------------------------------

alter table public.properties enable row level security;

create policy properties_select_own on public.properties
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy properties_insert_own on public.properties
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy properties_update_own on public.properties
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy properties_delete_own on public.properties
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- property_photos / property_documents
--
-- WITH CHECK also requires the parent property to belong to the caller.
-- Foreign-key checks bypass RLS, so without this a user who learned
-- another user's property UUID could attach files to it.
--
-- Storage-path ownership is additionally enforced by the CHECK
-- constraint in the init migration and by storage.objects policies.
-- ---------------------------------------------------------------------

alter table public.property_photos enable row level security;

create policy property_photos_select_own on public.property_photos
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy property_photos_insert_own on public.property_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.user_id = (select auth.uid())
    )
  );

create policy property_photos_update_own on public.property_photos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy property_photos_delete_own on public.property_photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only the upload status and caption may change after creation.
revoke update on public.property_photos from authenticated;
grant update (upload_status, caption) on public.property_photos to authenticated;


alter table public.property_documents enable row level security;

create policy property_documents_select_own on public.property_documents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy property_documents_insert_own on public.property_documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.user_id = (select auth.uid())
    )
  );

create policy property_documents_update_own on public.property_documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy property_documents_delete_own on public.property_documents
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.property_documents from authenticated;
grant update (upload_status, document_type) on public.property_documents to authenticated;


-- ---------------------------------------------------------------------
-- services — read-only catalogue for any signed-in user.
-- Writes happen only via migrations / the dashboard.
-- ---------------------------------------------------------------------

alter table public.services enable row level security;

create policy services_select_active on public.services
  for select to authenticated
  using (is_active);

revoke insert, update, delete on public.services from authenticated;
grant select on public.services to authenticated;


-- ---------------------------------------------------------------------
-- service_requests — users may create and read their own.
--
-- No update or delete policy: status is operator-managed (§24), and
-- request history must not be erasable by the client.
-- ---------------------------------------------------------------------

alter table public.service_requests enable row level security;

create policy service_requests_select_own on public.service_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy service_requests_insert_own on public.service_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'submitted'
    and (
      property_id is null
      or exists (
        select 1 from public.properties p
        where p.id = property_id and p.user_id = (select auth.uid())
      )
    )
  );

revoke update, delete on public.service_requests from authenticated;
grant select, insert on public.service_requests to authenticated;

-- The reference column default calls nextval() as the inserting role.
grant usage, select on sequence public.service_request_ref_seq to authenticated;


-- ---------------------------------------------------------------------
-- property_summaries — security_invoker view; the table policies above
-- apply through it. Read-only.
-- ---------------------------------------------------------------------

revoke insert, update, delete on public.property_summaries from authenticated;
grant select on public.property_summaries to authenticated;
