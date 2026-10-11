-- =====================================================================
-- Plot satellite watch — an optional module (owner, 11 Oct 2026), off
-- until the team turns it on (app_modules). Free Sentinel-2 pictures
-- (10 m) of each plot with a confirmed pin: how green and how built-up the
-- plot and its surroundings are, compared with the last clear picture. A
-- real change (cleared, built on) tells the owner, with before / after
-- pictures. Written by the server only.
-- =====================================================================

create table public.app_modules (
  key         text        primary key check (key ~ '^[a-z_]{3,40}$'),
  enabled     boolean     not null default false,
  updated_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
insert into public.app_modules (key, enabled) values ('satellite_watch', false)
on conflict (key) do nothing;

create table public.satellite_observations (
  id            uuid        primary key default gen_random_uuid(),
  property_id   uuid        not null references public.properties (id) on delete cascade,
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  item_id       text        not null,
  captured_at   timestamptz not null,
  -- Means over the plot (about 40 m around the pin) and the area (about 150 m).
  ndvi_site     real,
  ndvi_area     real,
  ndbi_site     real,
  ndbi_area     real,
  change        text        not null default 'none'
                            check (change in ('none', 'baseline', 'site_cleared', 'site_built', 'area_built')),
  bbox          real[]      not null,
  created_at    timestamptz not null default now(),
  unique (property_id, item_id)
);
create index satellite_observations_property_idx on public.satellite_observations (property_id, captured_at desc);

alter table public.app_modules enable row level security;
alter table public.satellite_observations enable row level security;
revoke all on public.app_modules, public.satellite_observations from anon, authenticated;
grant select on public.app_modules to authenticated;
grant update (enabled, updated_by, updated_at) on public.app_modules to authenticated;
grant select on public.satellite_observations to authenticated;
create policy app_modules_read on public.app_modules for select to authenticated using (true);
create policy app_modules_staff on public.app_modules for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy satellite_read on public.satellite_observations for select to authenticated
  using (public.is_staff() or public.is_account_member(account_id));
