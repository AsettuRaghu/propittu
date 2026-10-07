-- =====================================================================
-- Service details shown before booking (7 Oct 2026): what the service
-- includes (a short list) and how long it usually takes. Staff edit both
-- in Backoffice → Services. A first step towards fully configurable
-- services (see docs/PENDING.md).
-- =====================================================================

alter table public.services
  add column includes   text[] not null default '{}'
    check (cardinality(includes) <= 10 and array_to_string(includes, '') !~ '[<>]'),
  add column turnaround text check (turnaround is null or char_length(turnaround) <= 80);

update public.services s set includes = v.includes, turnaround = v.turnaround
from (values
  ('property_tax_assistance', array['We check what is due for this year', 'We help you pay it', 'The receipt is saved to the property''s documents'], 'Usually 3–7 working days'),
  ('document_verification', array['We review your documents for gaps and mismatches', 'A short summary of what looks complete or missing', 'What to get next, if anything'], 'Usually 3–5 working days'),
  ('khata_mutation_assistance', array['The steps and documents you need, explained', 'Help preparing and submitting the application', 'Follow-ups and updates in the app'], 'Usually 2–6 weeks, depending on the authority'),
  ('compliance_alert_assistance', array['We look for notices that may affect your property', 'What they mean and what to do next'], 'Usually 3–5 working days'),
  ('property_visit', array['A visit by our team', 'Photos of the property', 'Observations and any issues found', 'A visit report in the app'], 'Within 3–5 days of confirming'),
  ('site_inspection', array['A detailed check of the property''s condition', 'Photos of anything that needs attention', 'A report in the app'], 'Within 3–5 days of confirming'),
  ('property_photography', array['Up-to-date photos of the property', 'Saved to the property''s photos'], 'Within 3–5 days of confirming'),
  ('video_documentation', array['A walk-through video of the property', 'Saved to the property''s videos'], 'Within 3–5 days of confirming'),
  ('property_cleaning', array['Cleaning of the property or plot', 'Before and after photos'], 'Within 3–7 days of confirming'),
  ('maintenance', array['We look at what needs doing', 'Scope and price confirmed before any work', 'We arrange and oversee the work'], 'We confirm a date with you'),
  ('repair', array['We look at the problem', 'Scope and price confirmed before any work', 'We arrange and oversee the repair'], 'We confirm a date with you'),
  ('security_site_check', array['Boundaries, locks and gates checked', 'Signs of encroachment or damage', 'Photos and a short report'], 'Within 3–5 days of confirming'),
  ('other', array['Tell us what you need', 'We reply with how we can help and the price'], 'We reply within 1–3 working days')
) as v(code, includes, turnaround)
where s.code = v.code;
