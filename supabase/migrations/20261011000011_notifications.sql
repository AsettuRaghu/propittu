-- =====================================================================
-- Notifications (owner, 11 Oct 2026; M8). Every event an owner should know
-- about is kept in their inbox (the bell on Home) — it works in Expo Go —
-- and pushed to their phones once the app is a real build (push_tokens,
-- Expo push service). Written by the server only.
-- =====================================================================

create table public.notifications (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts (id) on delete cascade,
  kind         text        not null check (kind ~ '^[a-z_.]{3,60}$'),
  title        text        not null check (char_length(title) between 1 and 200),
  body         text        check (body is null or char_length(body) <= 500),
  -- Where tapping it goes in the app, e.g. /requests/<id>.
  url          text        check (url is null or url ~ '^/[A-Za-z0-9/_\-]*$'),
  entity_type  text,
  entity_id    uuid,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index notifications_account_idx on public.notifications (account_id, created_at desc);

create table public.push_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  account_id  uuid        not null references public.accounts (id) on delete cascade,
  token       text        not null unique check (char_length(token) between 10 and 300),
  platform    text        check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index push_tokens_account_idx on public.push_tokens (account_id);

alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
revoke all on public.notifications, public.push_tokens from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy notifications_read on public.notifications for select to authenticated
  using (public.is_account_member(account_id));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (public.is_account_member(account_id)) with check (public.is_account_member(account_id));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_account_member(account_id));
