-- =====================================================================
-- AI foundation (AI-1) — see docs/AI_DOCUMENT_INTELLIGENCE.md
--
--   document_analyses  one AI reading of one document by one TASK VERSION.
--                      Re-reading the same document with the same task
--                      version is never needed: that row is the cache.
--   property_facts     what a reading found, value by value, with page and
--                      confidence. The customer confirms / edits / rejects;
--                      edits are kept (final_value) — the improvement signal.
--   ai_operations      every AI call: task, version, model, tokens, cost,
--                      time, outcome. Budgets and limits are computed here.
--
-- Trust model (same as payments): AI results are written ONLY by the
-- server (service role) after validation; customers can read their own and
-- decide on facts, never write results. Staff read everything. No row-level
-- audit trigger on these tables (they hold names from deeds); the API
-- records business events with counts only.
-- =====================================================================

create table public.document_analyses (
  id             uuid        primary key default gen_random_uuid(),
  account_id     uuid        not null references public.accounts (id) on delete cascade,
  property_id    uuid        not null references public.properties (id) on delete cascade,
  document_id    uuid        not null references public.property_documents (id) on delete cascade,
  task           text        not null check (task ~ '^[a-z_]+\.[a-z_]+$'),
  task_version   text        not null check (char_length(task_version) between 1 and 40),
  status         text        not null default 'queued'
                             check (status in ('queued', 'reading', 'ready', 'failed')),
  attempts       integer     not null default 0 check (attempts between 0 and 10),
  model          text,
  -- Validated, privacy-filtered result (never raw provider output).
  result         jsonb,
  error_code     text        check (error_code is null or char_length(error_code) <= 60),
  requested_by   uuid        references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz not null default now(),
  unique (document_id, task, task_version)
);

create index document_analyses_property_idx on public.document_analyses (property_id, created_at desc);
create index document_analyses_status_idx on public.document_analyses (status, updated_at);

create trigger document_analyses_set_updated_at
  before update on public.document_analyses
  for each row execute function public.set_updated_at();

create table public.property_facts (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  property_id   uuid        not null references public.properties (id) on delete cascade,
  analysis_id   uuid        not null references public.document_analyses (id) on delete cascade,
  document_id   uuid        references public.property_documents (id) on delete set null,
  key           text        not null check (key ~ '^[a-z][a-z0-9_]*$'),
  value         jsonb       not null,
  pages         integer[]   not null default '{}',
  confidence    text        check (confidence is null or confidence in ('high', 'medium', 'low')),
  status        text        not null default 'suggested'
                            check (status in ('suggested', 'confirmed', 'edited', 'rejected', 'superseded')),
  -- What the customer settled on when they edited it.
  final_value   jsonb,
  decided_by    uuid        references auth.users (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (analysis_id, key)
);

create index property_facts_property_idx on public.property_facts (property_id, status);

create table public.ai_operations (
  id             uuid        primary key default gen_random_uuid(),
  account_id     uuid        references public.accounts (id) on delete set null,
  analysis_id    uuid        references public.document_analyses (id) on delete set null,
  task           text        not null,
  task_version   text        not null,
  provider       text        not null,
  model          text        not null,
  input_tokens   integer     not null default 0 check (input_tokens >= 0),
  output_tokens  integer     not null default 0 check (output_tokens >= 0),
  cost_usd       numeric(10, 5) not null default 0 check (cost_usd >= 0),
  duration_ms    integer     not null default 0 check (duration_ms >= 0),
  outcome        text        not null check (outcome in ('ok', 'invalid_output', 'provider_error', 'rejected')),
  error_code     text        check (error_code is null or char_length(error_code) <= 60),
  created_at     timestamptz not null default now()
);

create index ai_operations_created_idx on public.ai_operations (created_at desc);
create index ai_operations_account_idx on public.ai_operations (account_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.document_analyses enable row level security;
alter table public.property_facts enable row level security;
alter table public.ai_operations enable row level security;

revoke all on public.document_analyses, public.property_facts, public.ai_operations from anon, authenticated;

grant select on public.document_analyses to authenticated;
create policy document_analyses_select on public.document_analyses for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());

grant select on public.property_facts to authenticated;
grant update (status, final_value, decided_by, decided_at) on public.property_facts to authenticated;
create policy property_facts_select on public.property_facts for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());
-- The customer decides on their own facts (confirm / edit / reject) — never the value itself.
create policy property_facts_decide on public.property_facts for update to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id) and decided_by = (select auth.uid()));

grant select on public.ai_operations to authenticated;
create policy ai_operations_select on public.ai_operations for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------
-- Larger uploads for documents Pittu reads (real deeds reach ~55 MB).
-- 50 MB is the Supabase Free plan's per-file maximum; other document
-- types stay at 10 MB.
-- ---------------------------------------------------------------------

alter table public.property_documents drop constraint property_documents_file_size_check;
alter table public.property_documents add constraint property_documents_file_size_check check (
  file_size > 0 and file_size <= case when document_type in ('sale_deed', 'registration') then 52428800 else 10485760 end
);
update storage.buckets set file_size_limit = 52428800 where id = 'property-documents';

-- This calendar month's AI spend (UTC), for the hard budget cap. Server only.
create or replace function public.ai_month_spend_usd()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.ai_operations
  where created_at >= date_trunc('month', now());
$$;
revoke all on function public.ai_month_spend_usd() from public, anon, authenticated;
grant execute on function public.ai_month_spend_usd() to service_role;
