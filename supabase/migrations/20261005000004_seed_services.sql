-- =====================================================================
-- Propittu MVP — service catalogue (§22)
--
-- Request categories only. Copy deliberately avoids promising outcomes:
-- V1 "does NOT promise automated government access or guaranteed legal
-- outcomes" (§22) and "must not provide legal advice" (§5).
--
-- Idempotent: re-running updates copy without duplicating rows, and
-- existing service_requests keep pointing at the same ids.
-- =====================================================================

insert into public.services (code, name, category, description, sort_order)
values
  -- Property & Government
  ('property_tax_assistance',
   'Property Tax Assistance',
   'property_government',
   'Get help understanding and paying your property tax, and keeping receipts organised.',
   10),
  ('document_verification',
   'Document Verification Assistance',
   'property_government',
   'Get help reviewing whether your property documents look complete and consistent.',
   20),
  ('khata_mutation_assistance',
   'Khata / Mutation Assistance',
   'property_government',
   'Get help with the paperwork and process for Khata transfer or mutation.',
   30),
  ('compliance_alert_assistance',
   'Government / Compliance Alert Assistance',
   'property_government',
   'Get help staying aware of government notices and requirements that may affect your property.',
   40),

  -- Property Care
  ('site_inspection',
   'Site Inspection',
   'property_care',
   'Have someone visit your property and report back on its condition.',
   110),
  ('property_photography',
   'Property Photography',
   'property_care',
   'Get up-to-date photographs of your property.',
   120),
  ('property_cleaning',
   'Property Cleaning',
   'property_care',
   'Arrange cleaning for your property or plot.',
   130),
  ('maintenance',
   'Maintenance',
   'property_care',
   'Request help with repairs and general upkeep.',
   140),
  ('security_site_check',
   'Security / Site Check',
   'property_care',
   'Have someone check boundaries, locks and signs of encroachment or damage.',
   150),

  -- Other
  ('other',
   'Other',
   'other',
   'Tell us what you need and we will get back to you.',
   900)
on conflict (code) do update
set name        = excluded.name,
    category    = excluded.category,
    description = excluded.description,
    sort_order  = excluded.sort_order;
