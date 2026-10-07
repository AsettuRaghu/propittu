-- =====================================================================
-- Staff review: a new reason, 'deed_changed' — the customer changed what
-- the sale deed says (PIN code, city, state, area, Khata or plot number)
-- when setting the property up. The deed is the most reliable source, so a
-- change is a gap worth a human look (the customer is told on the
-- property page too).
-- =====================================================================

alter table public.property_reviews drop constraint if exists property_reviews_reasons_check;
alter table public.property_reviews add constraint property_reviews_reasons_check
  check (reasons <@ array['name_mismatch', 'not_owner', 'type_changed', 'low_confidence', 'deed_changed']::text[]);
