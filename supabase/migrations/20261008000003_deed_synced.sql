-- =====================================================================
-- Which deed reading has been applied to the property (owner, 8 Oct 2026).
-- When a new reading is ready, Pittu applies it once: empty fields are
-- filled and differences read with high confidence take the deed's value.
-- Doubtful differences stay for the owner. Applying once per reading
-- means a change the owner makes later is never overwritten again.
-- =====================================================================

alter table public.properties
  add column deed_synced_analysis uuid references public.document_analyses (id) on delete set null;
