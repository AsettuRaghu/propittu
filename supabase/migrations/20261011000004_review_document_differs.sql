-- =====================================================================
-- Staff review: a new reason, 'document_differs' — Pittu read a document
-- the owner uploaded (Khata, tax receipt, land record…) and something on it
-- differs from the sale deed: the owner name (still the seller's?), survey
-- number, Khata number. Written by the server after the reading.
-- =====================================================================

alter table public.property_reviews drop constraint if exists property_reviews_reasons_check;
alter table public.property_reviews add constraint property_reviews_reasons_check
  check (reasons <@ array['name_mismatch', 'not_owner', 'type_changed', 'low_confidence', 'deed_changed',
                          'document_differs']::text[]);
