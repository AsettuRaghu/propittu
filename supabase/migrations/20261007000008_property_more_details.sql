-- =====================================================================
-- More about each property (owner, 7 Oct 2026) — the details that make a
-- property's page genuinely useful and feed value, legal and reminder
-- features later. All optional. Pittu fills the purchase details, sellers
-- and boundaries from the sale deed; the rest the owner adds in Edit.
-- =====================================================================

alter table public.properties
  -- The purchase (from the deed: sale consideration, registration date, sellers)
  add column purchase_price_inr bigint
    check (purchase_price_inr is null or purchase_price_inr between 1 and 100000000000),
  add column purchase_date date
    check (purchase_date is null or purchase_date between '1900-01-01' and '2100-12-31'),
  add column sellers text check (sellers is null or char_length(sellers) <= 500),
  -- Land and approvals
  add column land_use text check (land_use is null or land_use in
    ('residential', 'commercial', 'agricultural', 'converted', 'industrial', 'mixed')),
  add column khata_type text check (khata_type is null or khata_type in
    ('a_khata', 'b_khata', 'e_khata', 'not_sure')),
  add column approving_authority text
    check (approving_authority is null or char_length(approving_authority) <= 60),
  add column rera_number text check (rera_number is null or char_length(rera_number) <= 60),
  -- The site itself
  add column plot_dimensions text
    check (plot_dimensions is null or char_length(plot_dimensions) <= 40),
  add column facing text check (facing is null or facing in
    ('north', 'east', 'south', 'west', 'north_east', 'north_west', 'south_east', 'south_west')),
  add column corner_plot boolean,
  add column road_width_ft integer check (road_width_ft is null or road_width_ft between 1 and 500),
  add column loan_on_property boolean,
  -- Boundaries, as the deed describes them
  add column boundary_north text check (boundary_north is null or char_length(boundary_north) <= 200),
  add column boundary_south text check (boundary_south is null or char_length(boundary_south) <= 200),
  add column boundary_east text check (boundary_east is null or char_length(boundary_east) <= 200),
  add column boundary_west text check (boundary_west is null or char_length(boundary_west) <= 200);
