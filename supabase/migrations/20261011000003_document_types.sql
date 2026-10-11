-- =====================================================================
-- The full property file (owner, 11 Oct 2026): every document type a
-- property can hold — ownership, land records, city approvals, flat and
-- builder papers, loans, upkeep and owner ID. Long scans (deeds, wills,
-- agreements, loan papers) get the 50 MB limit. Mirrors DOCUMENT_TYPES
-- and LONG_DOCUMENT_TYPES in packages/shared/src/constants.ts.
-- =====================================================================

alter table public.property_documents drop constraint property_documents_document_type_check;
alter table public.property_documents add constraint property_documents_document_type_check
  check (document_type in ('sale_deed', 'link_deed', 'gift_partition', 'will_succession', 'power_of_attorney', 'court_order', 'registration', 'encumbrance_certificate', 'land_record', 'mutation', 'survey_sketch', 'conversion_order', 'khata', 'property_tax', 'building_plan', 'occupancy_certificate', 'layout_approval', 'sale_agreement', 'possession_letter', 'rera', 'association', 'loan_papers', 'loan_closure', 'rental_agreement', 'utility_bill', 'insurance', 'owner_id', 'other'));

alter table public.property_documents drop constraint property_documents_file_size_check;
alter table public.property_documents add constraint property_documents_file_size_check check (
  file_size > 0 and file_size <= case
    when document_type in ('sale_deed', 'registration', 'encumbrance_certificate', 'link_deed', 'gift_partition', 'will_succession', 'court_order', 'sale_agreement', 'loan_papers') then 52428800
    else 10485760 end
);

alter table public.service_outcome_files drop constraint service_outcome_files_document_type_check;
alter table public.service_outcome_files add constraint service_outcome_files_document_type_check
  check (document_type is null or document_type in ('sale_deed', 'link_deed', 'gift_partition', 'will_succession', 'power_of_attorney', 'court_order', 'registration', 'encumbrance_certificate', 'land_record', 'mutation', 'survey_sketch', 'conversion_order', 'khata', 'property_tax', 'building_plan', 'occupancy_certificate', 'layout_approval', 'sale_agreement', 'possession_letter', 'rera', 'association', 'loan_papers', 'loan_closure', 'rental_agreement', 'utility_bill', 'insurance', 'owner_id', 'other'));
