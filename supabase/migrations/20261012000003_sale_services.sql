-- =====================================================================
-- Getting sale-ready and lost documents (owner, 12 Oct 2026): three new
-- paperwork services, priced on quote until the team sets prices.
-- =====================================================================

insert into public.services
  (code, name, category, description, sort_order, fulfilment, reach, includes, turnaround, expected_days)
values
  ('certified_copy', 'Certified Copy of a Deed', 'property_government',
   'A certified copy of your registered deed (or any registered document) from the Sub-Registrar office.',
   38, 'assistance', 'state',
   array['Application at the Sub-Registrar office', 'The certified copy, scanned to your Documents',
         'The original posted to you if you want it'],
   'Usually 1–2 weeks', 10),
  ('lost_document_recovery', 'Lost Document Help', 'property_government',
   'Lost or damaged an original deed or Khata? We take you through the police complaint, the newspaper notice and a certified copy, so a sale or loan isn’t stuck.',
   39, 'assistance', 'state',
   array['Police complaint (lost document report) and newspaper notice', 'Certified copy from the Sub-Registrar',
         'An indemnity / affidavit if a bank asks for one'],
   'Usually 3–6 weeks', 30),
  ('ec_request', 'Encumbrance Certificate for You', 'property_government',
   'We get your Encumbrance Certificate for the period buyers and banks ask for (often 30 years) and add it to your Documents — Pittu then checks it.',
   36, 'assistance', 'state',
   array['EC applied for the period you need', 'Saved to your Documents', 'Checked against your sale deed'],
   'Usually 3–10 working days', 7)
on conflict (code) do nothing;

insert into public.service_coverage (service_id, kind, value)
select n.id, c.kind, c.value
from public.services n
join public.services o on o.code = 'document_verification'
join public.service_coverage c on c.service_id = o.id
where n.code in ('certified_copy', 'lost_document_recovery', 'ec_request')
on conflict do nothing;
