-- =====================================================================
-- Property slots per plan term (owner decision 6 Oct 2026)
--
--   * A term has the plan's number of slots (max_properties).
--   * Every property that exists on the term's first day, or is added during
--     the term, uses a slot until the term ends. Deleting is always allowed
--     but does not free the slot before the next term.
--   * Upgrading mid-term keeps the term (usage_since carries over), so used
--     slots stay used and the new plan's extra slots are available at once.
--   * Only staff free a slot (case by case, with a reason; audited).
--   * Drafts use no slot until confirmed.
--   * Buying / renewing a plan that can't hold today's properties is refused.
--
-- The window of a term = coalesce(usage_since, starts_at) of the plan in force.
-- =====================================================================

create table public.property_slots (
  id              uuid        primary key default gen_random_uuid(),
  account_id      uuid        not null references public.accounts (id) on delete cascade,
  property_id     uuid        references public.properties (id) on delete set null,
  -- Kept for display after the property is deleted.
  property_name   text        not null check (char_length(property_name) between 1 and 200),
  claimed_at      timestamptz not null default now(),
  released_at     timestamptz,
  released_by     uuid        references auth.users (id) on delete set null,
  release_reason  text        check (release_reason is null or char_length(release_reason) between 3 and 500),
  property_deleted_at timestamptz
);
create index property_slots_account_idx on public.property_slots (account_id, claimed_at desc);

alter table public.property_slots enable row level security;
revoke all on public.property_slots from anon, authenticated;
grant select on public.property_slots to authenticated;
create policy property_slots_select on public.property_slots for select to authenticated
  using (public.is_account_member(account_id) or public.is_staff());

-- Start of the current term's slot window (NULL when no plan is in force).
create or replace function public.slot_window_start(p_account uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ap.usage_since, ap.starts_at)
  from public.account_plans ap
  where ap.account_id = p_account and ap.starts_at <= now() and ap.ends_at > now()
  order by ap.starts_at desc
  limit 1;
$$;
revoke all on function public.slot_window_start(uuid) from public, anon, authenticated;

-- Makes sure a property holds a slot in the current term (idempotent).
create or replace function public.claim_property_slot(p_account uuid, p_property uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := public.slot_window_start(p_account);
begin
  if w is null then
    return;
  end if;
  if not exists (select 1 from public.property_slots
                 where account_id = p_account and property_id = p_property and claimed_at >= w) then
    insert into public.property_slots (account_id, property_id, property_name)
    values (p_account, p_property, left(coalesce(nullif(trim(p_name), ''), 'Property'), 200));
  end if;
end;
$$;
revoke all on function public.claim_property_slot(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.property_slot_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not old.is_draft then
      -- Record the slot before the property goes, then mark it deleted.
      perform public.claim_property_slot(old.account_id, old.id, old.name);
      update public.property_slots set property_deleted_at = now()
      where property_id = old.id and property_deleted_at is null;
    end if;
    return old;
  end if;
  if not new.is_draft then
    perform public.claim_property_slot(new.account_id, new.id, new.name);
    update public.property_slots set property_name = left(new.name, 200)
    where property_id = new.id and released_at is null and property_name is distinct from left(new.name, 200);
  end if;
  return new;
end;
$$;
revoke all on function public.property_slot_trigger() from public, anon, authenticated;

create trigger properties_slot_claim
  after insert or update of is_draft, name on public.properties
  for each row execute function public.property_slot_trigger();
create trigger properties_slot_on_delete
  before delete on public.properties
  for each row execute function public.property_slot_trigger();

-- Slots used in the current term (also claims for properties that existed
-- when the term began). Members of the account and staff only.
create or replace function public.property_slots_used(p_account uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := public.slot_window_start(p_account);
  p record;
  n integer;
begin
  if not (public.is_account_member(p_account) or public.is_staff()
          or coalesce(current_setting('role', true), '') = 'service_role') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if w is null then
    return 0;
  end if;
  for p in select id, name from public.properties where account_id = p_account and not is_draft loop
    perform public.claim_property_slot(p_account, p.id, p.name);
  end loop;
  select count(*) into n from public.property_slots
  where account_id = p_account and claimed_at >= w and released_at is null;
  return n;
end;
$$;
revoke all on function public.property_slots_used(uuid) from public, anon;
grant execute on function public.property_slots_used(uuid) to authenticated, service_role;

-- Staff free a slot, case by case (e.g. property sold, added by mistake).
create or replace function public.staff_release_property_slot(p_slot uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Give a reason' using errcode = '22023';
  end if;
  update public.property_slots
  set released_at = now(), released_by = auth.uid(), release_reason = left(trim(p_reason), 500)
  where id = p_slot and released_at is null;
  if not found then
    raise exception 'Slot not found or already free' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.staff_release_property_slot(uuid, text) from public, anon;
grant execute on function public.staff_release_property_slot(uuid, text) to authenticated;

-- Audit every slot change (claims, deletions, staff releases).
create trigger property_slots_audit after insert or update or delete on public.property_slots
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------
-- plan_change(): refuse a plan that can't hold today's properties.
-- ---------------------------------------------------------------------

create or replace function public.plan_change(p_account uuid, p_plan_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
  cur record;
  last_end timestamptz;
  queued boolean;
  v_mode text;
  v_starts timestamptz := now();
  v_ends timestamptz;
  bonus interval := interval '0';
  credit integer := 0;
  usage_from timestamptz;
  blocked text;
  owned integer;
  allowed integer;
begin
  select pv.id, pv.price_paise, pv.term_days, pv.billing_period, pv.plan_id, p.code, p.name into v
  from public.plans p
  join public.plan_versions pv on pv.plan_id = p.id and pv.is_current
  where p.code = p_plan_code and p.is_public and p.is_active;
  if not found or v.price_paise <= 0 then
    raise exception 'Plan not available' using errcode = 'P0002';
  end if;

  select ap.id, ap.source, ap.starts_at, ap.ends_at, ap.usage_since,
         pv.plan_id, pv.price_paise, p.code, p.name
    into cur
  from public.account_plans ap
  join public.plan_versions pv on pv.id = ap.plan_version_id
  join public.plans p on p.id = pv.plan_id
  where ap.account_id = p_account and ap.starts_at <= now() and ap.ends_at > now()
  order by ap.starts_at desc
  limit 1;

  select max(ends_at) into last_end from public.account_plans
  where account_id = p_account and ends_at > now();
  queued := exists (select 1 from public.account_plans
                    where account_id = p_account and starts_at > now());

  if cur.id is null then
    v_mode := 'new';
  elsif cur.code = 'trial' or cur.price_paise = 0 then
    -- Trial → paid: keep the Trial days that are left.
    v_mode := 'new';
    bonus := cur.ends_at - now();
  elsif cur.plan_id = v.plan_id then
    v_mode := 'renewal';
    v_starts := last_end;
  elsif v.price_paise > cur.price_paise then
    v_mode := 'upgrade';
    if queued then
      blocked := 'You already have a renewal lined up. Please contact support to upgrade.';
    end if;
    -- Credit only what was paid for: the unused share of a paid period.
    if cur.source = 'payment' then
      credit := floor(cur.price_paise
                      * extract(epoch from (cur.ends_at - now()))
                      / extract(epoch from (cur.ends_at - cur.starts_at)))::integer;
      credit := (least(greatest(credit, 0), v.price_paise - 100) / 100) * 100;
    end if;
    usage_from := coalesce(cur.usage_since, cur.starts_at);
  else
    v_mode := 'downgrade';
    v_starts := last_end;
    blocked := 'You can move to ' || v.name || ' when your ' || cur.name || ' plan ends on '
               || to_char(cur.ends_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY') || '.';
  end if;

  -- The plan must hold the properties the customer has today (owner decision).
  if blocked is null then
    select count(*) into owned from public.properties where account_id = p_account and not is_draft;
    select b.value into allowed from public.plan_version_benefits b
    where b.plan_version_id = v.id and b.kind = 'limit' and b.code = 'max_properties';
    if allowed is not null and owned > allowed then
      blocked := 'You have ' || owned || ' properties and ' || v.name || ' covers ' || allowed
                 || '. Choose a plan with room for all of them, or remove a property first.';
    end if;
  end if;

  v_ends := v_starts + make_interval(days => v.term_days) + bonus;

  return jsonb_build_object(
    'mode', v_mode,
    'plan_code', v.code,
    'plan_name', v.name,
    'plan_version_id', v.id,
    'billing_period', v.billing_period,
    'list_price_paise', v.price_paise,
    'credit_paise', credit,
    'amount_paise', v.price_paise - credit,
    'bonus_days', floor(extract(epoch from bonus) / 86400)::integer,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'usage_since', usage_from,
    'current_plan_code', cur.code,
    'current_plan_name', cur.name,
    'current_ends_at', cur.ends_at,
    'current_account_plan_id', cur.id,
    'blocked_reason', blocked);
end;
$$;

