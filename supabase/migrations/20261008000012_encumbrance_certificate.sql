-- =====================================================================
-- Encumbrance Certificate (EC) as a document type (owner, 8 Oct 2026), for
-- Pittu Read and the coming Pittu Legal check. A 30-year EC can be long, so
-- it gets the same 50 MB limit as sale deeds. Outcome files may also be
-- saved as a Khata (missing before) or an EC.
-- =====================================================================

alter table public.property_documents drop constraint property_documents_document_type_check;
alter table public.property_documents add constraint property_documents_document_type_check
  check (document_type in ('sale_deed', 'registration', 'property_tax', 'khata', 'encumbrance_certificate', 'other'));

alter table public.property_documents drop constraint property_documents_file_size_check;
alter table public.property_documents add constraint property_documents_file_size_check check (
  file_size > 0 and file_size <= case
    when document_type in ('sale_deed', 'registration', 'encumbrance_certificate') then 52428800
    else 10485760 end
);

alter table public.service_outcome_files drop constraint service_outcome_files_document_type_check;
alter table public.service_outcome_files add constraint service_outcome_files_document_type_check
  check (document_type is null or document_type in
    ('sale_deed', 'registration', 'property_tax', 'khata', 'encumbrance_certificate', 'other'));
