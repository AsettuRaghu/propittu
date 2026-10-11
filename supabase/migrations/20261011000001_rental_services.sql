-- =====================================================================
-- Rental services (owner, 11 Oct 2026): Pittu suggests them when a flat
-- or house is rented out or the owner wants to let it. Priced on quote
-- until the team sets prices in the portal. Coverage follows the existing
-- services they sit next to: on-the-ground work where we visit, paperwork
-- in the states we serve.
-- =====================================================================

insert into public.service_categories (code, name, sort_order)
values ('rentals', 'Rentals', 25)
on conflict (code) do nothing;

insert into public.services
  (code, name, category, description, sort_order, fulfilment, reach, includes, turnaround, expected_days)
values
  ('tenant_search', 'Find a Tenant', 'rentals',
   'We list your property, show it to interested tenants, check them and help you choose.',
   210, 'assistance', 'area',
   array['Photos and a listing on the main rental sites', 'Viewings handled by our team',
         'Tenant background check before you decide'],
   'Usually 2–4 weeks', 28),
  ('rental_agreement', 'Rental Agreement', 'rentals',
   'A rental agreement drafted for your property and tenant, signed and registered or stamped as needed.',
   220, 'assistance', 'state',
   array['Agreement drafted with your terms', 'Stamp paper and e-signing or registration',
         'A copy saved to your Documents'],
   'Usually 3–5 working days', 5),
  ('tenant_verification', 'Tenant Police Verification', 'rentals',
   'We file the tenant''s police verification with the local police and save the acknowledgement.',
   230, 'assistance', 'state',
   array['Form filled with the tenant''s details', 'Submitted to the local police',
         'Acknowledgement saved to your Documents'],
   'Usually 3–7 working days', 7),
  ('rental_management', 'Rent & Tenant Management', 'rentals',
   'We look after the tenancy for you: rent reminders, the tenant''s requests, repairs and checks at move-in and move-out.',
   240, 'assistance', 'area',
   array['Rent due reminders and tracking', 'Tenant requests and repairs handled',
         'Move-in and move-out inspection with photos'],
   'Ongoing', null)
on conflict (code) do nothing;

-- Where they are offered: the same coverage as a property visit (on the
-- ground) or document verification (paperwork).
insert into public.service_coverage (service_id, kind, value)
select n.id, c.kind, c.value
from public.services n
join public.services o
  on o.code = case when n.code in ('tenant_search', 'rental_management')
                   then 'property_visit' else 'document_verification' end
join public.service_coverage c on c.service_id = o.id
where n.code in ('tenant_search', 'rental_agreement', 'tenant_verification', 'rental_management')
on conflict do nothing;
