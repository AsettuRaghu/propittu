-- =====================================================================
-- Pittu core (owner, 8 Oct 2026): every AI call is logged under one of
-- Pittu's capabilities — read (documents), ask, watch, value, legal — so cost
-- can be reported and budgeted per capability. Existing rows are readings.
-- =====================================================================

alter table public.ai_operations
  add column capability text not null default 'read'
  check (capability in ('read', 'ask', 'watch', 'value', 'legal'));

create index ai_operations_capability_idx on public.ai_operations (capability, created_at desc);
