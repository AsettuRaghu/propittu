-- =====================================================================
-- Smarter deed reading, and a map pin that agrees with the PIN code.
--
--   property_documents.content_sha256   fingerprint of the file, set by the
--       server when Pittu is asked to read it. The same deed uploaded again
--       is recognised before any AI call (no tokens spent): its earlier
--       reading is reused, and if it belongs to a property already in the
--       locker the customer is told so.
--   document_analyses.duplicate_of      that property (null once it's gone).
--   properties.location_check           the server's last pin-vs-PIN-code
--       check: {pincode, latitude, longitude, issue}. Advisory only — it is
--       recomputed whenever the pin or the PIN code no longer match it.
-- =====================================================================

alter table public.property_documents
  add column content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
create index property_documents_sha_idx on public.property_documents (account_id, content_sha256)
  where content_sha256 is not null;

alter table public.document_analyses
  add column duplicate_of uuid references public.properties (id) on delete set null;

alter table public.properties add column location_check jsonb;
