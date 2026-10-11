-- Pittu Value: what similar homes rent for (owner, 11 Oct 2026) — found in
-- the same web search as sale prices; shown only when enough rents agree.
alter table public.value_estimates
  add column rent_low  integer check (rent_low is null or rent_low > 0),
  add column rent_high integer check (rent_high is null or rent_high >= rent_low);
