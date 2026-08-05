-- ============================================================================
-- PLV NaviSync — Initial Reviewed Database Migration
-- ============================================================================
-- File:        supabase/migrations/001_create_plv_navisync_schema.sql
-- Spec:        docs/03_DATABASE_SUPABASE.md (Frozen Backend Specification v2.0)
-- Status:      Review-ready initial migration. NOT yet executed.
--
-- This migration creates the complete application schema:
--   * 20 application tables with UUID PKs (gen_random_uuid()), FKs, check
--     constraints, unique constraints, and indexes
--   * updated_at trigger function and triggers
--   * profiles trigger connected to auth.users (public registration can only
--     ever create a `student` profile)
--   * public.is_admin() SECURITY DEFINER helper with fixed search_path
--   * Row Level Security enabled on every exposed table with guest, student,
--     and administrator policies
--   * Immutability rules (published campus versions, append-only activity logs
--     and report history)
--   * The atomic map publishing database function
--   * Storage buckets and object policies (avatars, building-images,
--     floor-plans, report-images, event-images)
--
-- Accessibility and emergency behavior are represented through
-- navigation_nodes, navigation_edges, and map_elements. There are NO separate
-- accessibility_routes or emergency_routes tables.
--
-- This migration does not run anything and does not seed data.
--
-- Authorization model: Row Level Security is the enforcement layer. This
-- migration relies on Supabase's default privileges (which grant table
-- operations to anon/authenticated/service_role) and deliberately does not
-- revoke them; every exposed table has RLS enabled and access is governed by
-- the policies defined here. No RLS policy is ever disabled.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSION
-- ============================================================================
-- gen_random_uuid() is core since PostgreSQL 13; pgcrypto is created for
-- maximum compatibility with Supabase-managed projects.
create extension if not exists pgcrypto with schema extensions;


-- ============================================================================
-- 2. SHARED TRIGGER FUNCTION: updated_at
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================================
-- 3. PROFILES TABLE
-- ============================================================================
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           text not null default 'student' check (role in ('student', 'admin')),
  first_name     text not null default '',
  last_name      text not null default '',
  email          text not null unique,
  student_number text,
  department     text,
  avatar_path    text,
  is_active      boolean not null default true,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile and authorization metadata linked one-to-one with auth.users.';

create unique index profiles_student_number_uq
  on public.profiles (student_number)
  where student_number is not null;

alter table public.profiles enable row level security;


-- ============================================================================
-- 4. HELPER FUNCTION: is_admin
-- ============================================================================
-- Stable, safe administrator check. SECURITY DEFINER runs as the table owner
-- so complex profile subqueries are not repeated in every policy. Fixed
-- search_path prevents search-path hijacking.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  );
$$;


-- ============================================================================
-- 5. PROFILES POLICIES
-- ============================================================================
-- Guests never see profiles. Students see their own; administrators see all.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- Profiles are created by the auth.users trigger (SECURITY DEFINER) or by
-- administrators. Direct self-insert is intentionally not allowed.
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

-- Students may update their own safe fields; role, is_active, email, id, and
-- last_login_at are additionally protected by a trigger (section 7).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 6. AUTH TRIGGER: profiles row on signup
-- ============================================================================
-- Public registration must never create an administrator. The role is
-- hardcoded to 'student'; any role value supplied in raw_user_meta_data is
-- ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, email, is_active)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.email, ''),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 7. PROFILES AUTHORIZATION TRIGGER
-- ============================================================================
-- Role changes, account status changes, email/id changes, and last_login_at
-- updates are administrator-only. Students may edit only their safe fields.
create or replace function public.protect_profile_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.id <> old.id then
    raise exception 'profile id cannot be changed';
  end if;
  if new.role is distinct from old.role then
    raise exception 'role can only be changed by an administrator';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'account status can only be changed by an administrator';
  end if;
  if new.email is distinct from old.email then
    raise exception 'email is synchronized from authentication';
  end if;
  if new.last_login_at is distinct from old.last_login_at then
    raise exception 'last_login_at is managed by backend logic';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_authorization on public.profiles;
create trigger protect_profile_authorization
  before update on public.profiles
  for each row execute function public.protect_profile_authorization();


-- ============================================================================
-- 8. CAMPUSES TABLE
-- ============================================================================
create table public.campuses (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  code                        text not null unique,
  description                 text,
  address                     text,
  latitude                    double precision,
  longitude                   double precision,
  logo_path                   text,
  overview_image_path         text,
  canvas_width                integer not null default 1000 check (canvas_width > 0),
  canvas_height               integer not null default 700 check (canvas_height > 0),
  map_scale_m_per_unit        numeric not null default 1.0 check (map_scale_m_per_unit > 0),
  is_default                  boolean not null default false,
  status                      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- Circular reference to campus_versions: the FK is added after that table.
  latest_published_version_id uuid,
  created_by                  uuid references public.profiles (id) on delete set null,
  updated_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  archived_at                 timestamptz
);

comment on table public.campuses is 'Each PLV campus and its map-level configuration.';

-- At most one campus may be the default.
create unique index campuses_one_default_uq
  on public.campuses (is_default)
  where is_default = true;

alter table public.campuses enable row level security;


-- ============================================================================
-- 9. HELPER FUNCTION: campus_is_published
-- ============================================================================
-- True when a campus is published and not archived. Used by public-read
-- policies so guests/students only ever see data belonging to published maps.
create or replace function public.campus_is_published(p_campus_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.campuses c
    where c.id = p_campus_id
      and c.status = 'published'
      and c.archived_at is null
  );
$$;


-- ============================================================================
-- 10. CAMPUSES POLICIES
-- ============================================================================
drop policy if exists "campuses_select_public" on public.campuses;
create policy "campuses_select_public"
  on public.campuses
  for select
  to anon, authenticated
  using (status = 'published' and archived_at is null);

drop policy if exists "campuses_select_admin" on public.campuses;
create policy "campuses_select_admin"
  on public.campuses
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "campuses_insert_admin" on public.campuses;
create policy "campuses_insert_admin"
  on public.campuses
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "campuses_update_admin" on public.campuses;
create policy "campuses_update_admin"
  on public.campuses
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "campuses_delete_admin" on public.campuses;
create policy "campuses_delete_admin"
  on public.campuses
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 11. CAMPUS VERSIONS (draft / published snapshots)
-- ============================================================================
create table public.campus_versions (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid not null references public.campuses (id) on delete restrict,
  version_number    integer not null,
  state             text not null check (state in ('draft', 'published', 'superseded')),
  snapshot          jsonb not null,
  change_summary    text,
  validation_score  numeric check (validation_score >= 0 and validation_score <= 100),
  created_by        uuid not null references public.profiles (id) on delete restrict,
  published_by      uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  published_at      timestamptz,
  constraint campus_versions_campus_version_number_uq unique (campus_id, version_number)
);

comment on table public.campus_versions is
  'Immutable draft and published campus snapshots. Published snapshots are read-only.';

-- Resolve the campuses <-> campus_versions circular reference safely.
alter table public.campuses
  add constraint campuses_latest_published_version_fk
  foreign key (latest_published_version_id)
  references public.campus_versions (id)
  on delete set null;

alter table public.campus_versions enable row level security;

-- Guests and students may read ONLY the latest published snapshot of a campus.
drop policy if exists "campus_versions_select_public" on public.campus_versions;
create policy "campus_versions_select_public"
  on public.campus_versions
  for select
  to anon, authenticated
  using (
    state = 'published'
    and id = (
      select c.latest_published_version_id
      from public.campuses c
      where c.id = campus_id
    )
  );

drop policy if exists "campus_versions_select_admin" on public.campus_versions;
create policy "campus_versions_select_admin"
  on public.campus_versions
  for select
  to authenticated
  using (public.is_admin());

-- Direct administrator access is limited to DRAFTS. The draft -> published
-- transition (including published_at/published_by) can only be performed by
-- the SECURITY DEFINER function public.publish_campus_version(), which
-- bypasses RLS as the table owner. Drafts may be inserted and edited freely;
-- published and superseded rows are not directly updatable; published rows are
-- not directly deletable (draft and superseded may be deleted).
drop policy if exists "campus_versions_insert_admin" on public.campus_versions;
create policy "campus_versions_insert_admin"
  on public.campus_versions
  for insert
  to authenticated
  with check (
    public.is_admin()
    and state = 'draft'
    and published_by is null
    and published_at is null
    and created_by = auth.uid()
  );

drop policy if exists "campus_versions_update_admin" on public.campus_versions;
create policy "campus_versions_update_admin"
  on public.campus_versions
  for update
  to authenticated
  using (public.is_admin() and state = 'draft')
  with check (
    public.is_admin()
    and state = 'draft'
    and published_by is null
    and published_at is null
  );

drop policy if exists "campus_versions_delete_admin" on public.campus_versions;
create policy "campus_versions_delete_admin"
  on public.campus_versions
  for delete
  to authenticated
  using (public.is_admin() and state <> 'published');

-- Campus versions immutability:
--   * Published rows may only transition published -> superseded (performed by
--     the publish function), and only the state column may change in that
--     transition. Published rows can never be deleted.
--   * Superseded rows are historical published snapshots: they are immutable
--     (no update) but may be deleted by an administrator when RLS permits.
--   * Draft rows remain editable.
-- TG_OP is handled explicitly: DELETE returns OLD for permitted deletes
-- (returning NEW would be NULL and could silently cancel the delete); UPDATE
-- returns NEW for permitted updates.
create or replace function public.protect_published_campus_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'published' then
      raise exception 'published campus versions cannot be deleted';
    end if;
    -- Draft and superseded versions may be deleted when RLS permits.
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Superseded versions are historical snapshots and are immutable.
    if old.state = 'superseded' then
      raise exception 'superseded campus versions are immutable';
    end if;

    -- Published rows may only transition published -> superseded, and only the
    -- state column may change during that transition.
    if old.state = 'published' then
      if coalesce(new.state, old.state) <> 'superseded' then
        raise exception 'published campus versions are immutable; only the transition to superseded is allowed';
      end if;
      if new.id is distinct from old.id
         or new.campus_id is distinct from old.campus_id
         or new.version_number is distinct from old.version_number
         or new.snapshot is distinct from old.snapshot
         or new.change_summary is distinct from old.change_summary
         or new.validation_score is distinct from old.validation_score
         or new.created_by is distinct from old.created_by
         or new.published_by is distinct from old.published_by
         or new.created_at is distinct from old.created_at
         or new.published_at is distinct from old.published_at then
        raise exception 'published campus versions may only change the state column when transitioning to superseded';
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists campus_versions_immutable_published on public.campus_versions;
create trigger campus_versions_immutable_published
  before update or delete on public.campus_versions
  for each row execute function public.protect_published_campus_versions();


-- ============================================================================
-- 12. BUILDINGS
-- ============================================================================
create table public.buildings (
  id                   uuid primary key default gen_random_uuid(),
  campus_id            uuid not null references public.campuses (id) on delete cascade,
  name                 text not null,
  code                 text not null,
  description          text,
  category             text not null check (
    category in (
      'academic',
      'administration',
      'library',
      'laboratory',
      'sports',
      'parking',
      'facility',
      'dormitory',
      'other'
    )
  ),
  image_path           text,
  operating_hours      text,
  contact_information  text,
  x                    double precision not null default 0,
  y                    double precision not null default 0,
  width                double precision not null check (width > 0),
  height               double precision not null check (height > 0),
  rotation             double precision not null default 0,
  is_searchable        boolean not null default true,
  is_visible           boolean not null default true,
  is_accessible        boolean not null default false,
  created_by           uuid references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  constraint buildings_campus_code_uq unique (campus_id, code)
);

alter table public.buildings enable row level security;

-- Live authoring tables are administrator-only. Guests and students receive
-- published map content exclusively from the latest published
-- campus_versions.snapshot (see campus_versions_select_public), so unfinished
-- edits can never be exposed before publication.
drop policy if exists "buildings_select_admin" on public.buildings;
create policy "buildings_select_admin"
  on public.buildings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "buildings_insert_admin" on public.buildings;
create policy "buildings_insert_admin"
  on public.buildings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "buildings_update_admin" on public.buildings;
create policy "buildings_update_admin"
  on public.buildings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "buildings_delete_admin" on public.buildings;
create policy "buildings_delete_admin"
  on public.buildings
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 13. FLOORS
-- ============================================================================
create table public.floors (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references public.buildings (id) on delete cascade,
  name                text not null,
  floor_number        integer not null,
  display_order       integer not null default 0,
  floor_plan_path     text,
  canvas_width        integer not null default 580,
  canvas_height       integer not null default 380,
  map_scale_m_per_unit numeric,
  is_visible          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  constraint floors_building_number_uq unique (building_id, floor_number)
);

alter table public.floors enable row level security;

-- Live authoring tables are administrator-only. Published floors are served
-- from the latest published campus_versions.snapshot; draft floor edits are
-- invisible to guests and students until published.
drop policy if exists "floors_select_admin" on public.floors;
create policy "floors_select_admin"
  on public.floors
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "floors_insert_admin" on public.floors;
create policy "floors_insert_admin"
  on public.floors
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "floors_update_admin" on public.floors;
create policy "floors_update_admin"
  on public.floors
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "floors_delete_admin" on public.floors;
create policy "floors_delete_admin"
  on public.floors
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 14. MAP ELEMENTS
-- ============================================================================
create table public.map_elements (
  id                  uuid primary key default gen_random_uuid(),
  campus_id           uuid not null references public.campuses (id) on delete cascade,
  building_id         uuid references public.buildings (id) on delete cascade,
  floor_id            uuid references public.floors (id) on delete cascade,
  parent_element_id   uuid references public.map_elements (id) on delete set null,
  element_type        text not null check (element_type in (
    'room', 'classroom', 'laboratory', 'office', 'hallway', 'wall', 'door',
    'entrance', 'exit', 'stairs', 'elevator', 'ramp', 'restroom', 'clinic',
    'library', 'canteen', 'parking', 'gate', 'landmark', 'assembly_area',
    'emergency_exit', 'fire_extinguisher', 'information_desk', 'furniture',
    'custom',
    'tree', 'bench', 'lamp', 'sign', 'bike_rack', 'garden', 'window',
    'chair', 'table', 'fire_alarm', 'fire_hydrant', 'cctv', 'security_post'
  )),
  name                text not null,
  code                text,
  description         text,
  search_keywords     text[] not null default '{}',
  x                   double precision not null default 0,
  y                   double precision not null default 0,
  width               double precision,
  height              double precision,
  rotation            double precision not null default 0,
  z_index             integer not null default 0,
  geometry            jsonb,
  style               jsonb not null default '{}'::jsonb,
  metadata            jsonb,
  is_accessible       boolean not null default false,
  is_emergency_asset  boolean not null default false,
  is_searchable       boolean not null default true,
  is_visible          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz
);

alter table public.map_elements enable row level security;

-- Live authoring tables are administrator-only. Published map elements are
-- served from the latest published campus_versions.snapshot.
drop policy if exists "map_elements_select_admin" on public.map_elements;
create policy "map_elements_select_admin"
  on public.map_elements
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "map_elements_insert_admin" on public.map_elements;
create policy "map_elements_insert_admin"
  on public.map_elements
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "map_elements_update_admin" on public.map_elements;
create policy "map_elements_update_admin"
  on public.map_elements
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "map_elements_delete_admin" on public.map_elements;
create policy "map_elements_delete_admin"
  on public.map_elements
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 15. NAVIGATION NODES
-- ============================================================================
create table public.navigation_nodes (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid not null references public.campuses (id) on delete cascade,
  building_id       uuid references public.buildings (id) on delete set null,
  floor_id          uuid references public.floors (id) on delete set null,
  map_element_id    uuid references public.map_elements (id) on delete set null,
  node_type         text not null check (node_type in (
    'waypoint', 'entrance', 'destination', 'stairs', 'elevator', 'ramp',
    'exit', 'assembly_area', 'floor_transition'
  )),
  name              text,
  x                 double precision not null default 0,
  y                 double precision not null default 0,
  is_accessible     boolean not null default true,
  is_emergency_safe boolean not null default true,
  is_active         boolean not null default true,
  metadata          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.navigation_nodes enable row level security;

-- Live navigation graph tables are administrator-only. Published navigation
-- nodes are served from the latest published campus_versions.snapshot.
drop policy if exists "navigation_nodes_select_admin" on public.navigation_nodes;
create policy "navigation_nodes_select_admin"
  on public.navigation_nodes
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "navigation_nodes_insert_admin" on public.navigation_nodes;
create policy "navigation_nodes_insert_admin"
  on public.navigation_nodes
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "navigation_nodes_update_admin" on public.navigation_nodes;
create policy "navigation_nodes_update_admin"
  on public.navigation_nodes
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "navigation_nodes_delete_admin" on public.navigation_nodes;
create policy "navigation_nodes_delete_admin"
  on public.navigation_nodes
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 16. NAVIGATION EDGES
-- ============================================================================
create table public.navigation_edges (
  id                   uuid primary key default gen_random_uuid(),
  campus_id            uuid not null references public.campuses (id) on delete cascade,
  from_node_id         uuid not null references public.navigation_nodes (id) on delete cascade,
  to_node_id           uuid not null references public.navigation_nodes (id) on delete cascade,
  distance_m           numeric not null check (distance_m > 0),
  weight               numeric not null default 1 check (weight > 0),
  travel_time_seconds  integer check (
    travel_time_seconds is null or travel_time_seconds >= 0
  ),
  edge_type            text not null check (edge_type in (
    'walkway', 'hallway', 'stairs', 'elevator', 'ramp', 'door', 'crossing',
    'transition'
  )),
  is_bidirectional     boolean not null default true,
  is_accessible        boolean not null default true,
  is_emergency_safe    boolean not null default true,
  is_temporarily_closed boolean not null default false,
  closure_reason       text,
  metadata             jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint navigation_edges_no_self_loop check (from_node_id <> to_node_id)
);

-- Prevent exact duplicate node pairs.
create unique index navigation_edges_unique_pair_uq
  on public.navigation_edges (campus_id, from_node_id, to_node_id);

alter table public.navigation_edges enable row level security;

-- Live navigation graph tables are administrator-only. Published navigation
-- edges are served from the latest published campus_versions.snapshot.
drop policy if exists "navigation_edges_select_admin" on public.navigation_edges;
create policy "navigation_edges_select_admin"
  on public.navigation_edges
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "navigation_edges_insert_admin" on public.navigation_edges;
create policy "navigation_edges_insert_admin"
  on public.navigation_edges
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "navigation_edges_update_admin" on public.navigation_edges;
create policy "navigation_edges_update_admin"
  on public.navigation_edges
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "navigation_edges_delete_admin" on public.navigation_edges;
create policy "navigation_edges_delete_admin"
  on public.navigation_edges
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 17. EVENTS
-- ============================================================================
create table public.events (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid not null references public.campuses (id) on delete cascade,
  title             text not null,
  description       text,
  category          text not null,
  cover_image_path  text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  organizer         text,
  created_by        uuid not null references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  constraint events_end_after_start check (ends_at >= starts_at)
);

alter table public.events enable row level security;

drop policy if exists "events_select_public" on public.events;
create policy "events_select_public"
  on public.events
  for select
  to anon, authenticated
  using (
    status = 'published'
    and archived_at is null
    and public.campus_is_published(campus_id)
  );

drop policy if exists "events_select_admin" on public.events;
create policy "events_select_admin"
  on public.events
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin"
  on public.events
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "events_update_admin" on public.events;
create policy "events_update_admin"
  on public.events
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "events_delete_admin" on public.events;
create policy "events_delete_admin"
  on public.events
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 18. EVENT LOCATIONS
-- ============================================================================
create table public.event_locations (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  map_element_id  uuid references public.map_elements (id) on delete set null,
  label           text not null,
  x               double precision,
  y               double precision,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint event_locations_target_present
    check (map_element_id is not null or (x is not null and y is not null))
);

alter table public.event_locations enable row level security;

-- Public reads are limited to locations belonging to published events.
drop policy if exists "event_locations_select_public" on public.event_locations;
create policy "event_locations_select_public"
  on public.event_locations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_id
        and e.status = 'published'
        and e.archived_at is null
        and public.campus_is_published(e.campus_id)
    )
  );

drop policy if exists "event_locations_select_admin" on public.event_locations;
create policy "event_locations_select_admin"
  on public.event_locations
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "event_locations_insert_admin" on public.event_locations;
create policy "event_locations_insert_admin"
  on public.event_locations
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "event_locations_update_admin" on public.event_locations;
create policy "event_locations_update_admin"
  on public.event_locations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "event_locations_delete_admin" on public.event_locations;
create policy "event_locations_delete_admin"
  on public.event_locations
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 19. ANNOUNCEMENTS
-- ============================================================================
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  title        text not null,
  content      text not null,
  category     text not null check (
    category in (
      'general',
      'event',
      'emergency',
      'maintenance',
      'closure',
      'relocation'
    )
  ),
  priority     text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at    timestamptz,
  expires_at   timestamptz,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
  on public.announcements
  for select
  to anon, authenticated
  using (
    status = 'published'
    and archived_at is null
    and public.campus_is_published(campus_id)
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at >= now())
  );

drop policy if exists "announcements_select_admin" on public.announcements;
create policy "announcements_select_admin"
  on public.announcements
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
  on public.announcements
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin"
  on public.announcements
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin"
  on public.announcements
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 20. ANNOUNCEMENT LOCATIONS
-- ============================================================================
create table public.announcement_locations (
  id                 uuid primary key default gen_random_uuid(),
  announcement_id    uuid not null references public.announcements (id) on delete cascade,
  building_id        uuid references public.buildings (id) on delete set null,
  floor_id           uuid references public.floors (id) on delete set null,
  map_element_id     uuid references public.map_elements (id) on delete set null,
  navigation_edge_id uuid references public.navigation_edges (id) on delete set null,
  effect_type        text not null check (effect_type in (
    'information', 'warning', 'closure', 'relocation', 'maintenance'
  )),
  created_at         timestamptz not null default now()
);

alter table public.announcement_locations enable row level security;

-- Public reads are limited to locations belonging to published announcements.
drop policy if exists "announcement_locations_select_public" on public.announcement_locations;
create policy "announcement_locations_select_public"
  on public.announcement_locations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.status = 'published'
        and a.archived_at is null
        and public.campus_is_published(a.campus_id)
        and (a.starts_at is null or a.starts_at <= now())
        and (a.expires_at is null or a.expires_at >= now())
    )
  );

drop policy if exists "announcement_locations_select_admin" on public.announcement_locations;
create policy "announcement_locations_select_admin"
  on public.announcement_locations
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "announcement_locations_insert_admin" on public.announcement_locations;
create policy "announcement_locations_insert_admin"
  on public.announcement_locations
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "announcement_locations_update_admin" on public.announcement_locations;
create policy "announcement_locations_update_admin"
  on public.announcement_locations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "announcement_locations_delete_admin" on public.announcement_locations;
create policy "announcement_locations_delete_admin"
  on public.announcement_locations
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 21. REPORTS
-- ============================================================================
create table public.reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid not null references public.profiles (id) on delete restrict,
  campus_id          uuid not null references public.campuses (id) on delete restrict,
  building_id        uuid references public.buildings (id) on delete set null,
  floor_id           uuid references public.floors (id) on delete set null,
  map_element_id     uuid references public.map_elements (id) on delete set null,
  category           text not null check (
    category in (
      'broken_equipment',
      'damaged_facility',
      'electrical_issue',
      'water_leak',
      'cleanliness',
      'accessibility_concern',
      'safety_concern',
      'navigation_error',
      'other'
    )
  ),
  title              text not null,
  description        text not null,
  status             text not null default 'pending' check (status in (
    'pending', 'under_review', 'in_progress', 'resolved', 'rejected'
  )),
  priority           text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  assigned_admin_id  uuid references public.profiles (id) on delete set null,
  internal_notes     text,
  resolution_notes   text,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

alter table public.reports enable row level security;

-- Students may read and create only their own reports; they may not modify
-- them. Administrators have full access.
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "reports_select_admin" on public.reports;
create policy "reports_select_admin"
  on public.reports
  for select
  to authenticated
  using (public.is_admin());

-- Students create reports with fully student-owned values only: pending status,
-- normal priority, no admin assignment, no internal/resolution notes, and no
-- lifecycle timestamps. Administrator-controlled workflow fields are locked.
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports
  for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and priority = 'normal'
    and assigned_admin_id is null
    and internal_notes is null
    and resolution_notes is null
    and resolved_at is null
    and archived_at is null
    and public.campus_is_published(campus_id)
  );

-- Administrators may create reports (e.g. on behalf of walk-in students) and
-- may set any workflow field.
drop policy if exists "reports_insert_admin" on public.reports;
create policy "reports_insert_admin"
  on public.reports
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "reports_delete_admin" on public.reports;
create policy "reports_delete_admin"
  on public.reports
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 22. REPORT IMAGES
-- ============================================================================
create table public.report_images (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  storage_path  text not null,
  uploaded_by   uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now()
);

alter table public.report_images enable row level security;

drop policy if exists "report_images_select_own" on public.report_images;
create policy "report_images_select_own"
  on public.report_images
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_id
        and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "report_images_select_admin" on public.report_images;
create policy "report_images_select_admin"
  on public.report_images
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "report_images_insert_own" on public.report_images;
create policy "report_images_insert_own"
  on public.report_images
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.reports r
      where r.id = report_id
        and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "report_images_delete_admin" on public.report_images;
create policy "report_images_delete_admin"
  on public.report_images
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 23. REPORT HISTORY (append-only)
-- ============================================================================
create table public.report_history (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  action        text not null,
  old_status    text,
  new_status    text,
  note          text,
  performed_by  uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now()
);

alter table public.report_history enable row level security;

-- Students may read history for their own reports but may not create history
-- rows directly (append-only enforced through services and a trigger).
drop policy if exists "report_history_select_own" on public.report_history;
create policy "report_history_select_own"
  on public.report_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_id
        and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "report_history_select_admin" on public.report_history;
create policy "report_history_select_admin"
  on public.report_history
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "report_history_insert_admin" on public.report_history;
create policy "report_history_insert_admin"
  on public.report_history
  for insert
  to authenticated
  with check (public.is_admin());


-- ============================================================================
-- 24. FAVORITES
-- ============================================================================
create table public.favorites (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  campus_id       uuid not null references public.campuses (id) on delete cascade,
  building_id     uuid references public.buildings (id) on delete cascade,
  map_element_id  uuid references public.map_elements (id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- Exactly one target must identify the favorite.
  constraint favorites_single_target check (num_nonnulls(building_id, map_element_id) = 1)
);

-- Prevent duplicate favorites per user and target.
create unique index favorites_user_building_uq
  on public.favorites (user_id, building_id)
  where building_id is not null;

create unique index favorites_user_element_uq
  on public.favorites (user_id, map_element_id)
  where map_element_id is not null;

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "favorites_select_admin" on public.favorites;
create policy "favorites_select_admin"
  on public.favorites
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "favorites_delete_admin" on public.favorites;
create policy "favorites_delete_admin"
  on public.favorites
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 25. VALIDATION RUNS
-- ============================================================================
create table public.validation_runs (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid not null references public.campuses (id) on delete cascade,
  campus_version_id uuid references public.campus_versions (id) on delete set null,
  status            text not null check (status in ('passed', 'warning', 'failed')),
  score             numeric not null check (score >= 0 and score <= 100),
  errors_count      integer not null default 0 check (errors_count >= 0),
  warnings_count    integer not null default 0 check (warnings_count >= 0),
  passed_count      integer not null default 0 check (passed_count >= 0),
  run_by            uuid not null references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now()
);

alter table public.validation_runs enable row level security;

-- Validation data is administrator-only.
drop policy if exists "validation_runs_select_admin" on public.validation_runs;
create policy "validation_runs_select_admin"
  on public.validation_runs
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "validation_runs_insert_admin" on public.validation_runs;
create policy "validation_runs_insert_admin"
  on public.validation_runs
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "validation_runs_update_admin" on public.validation_runs;
create policy "validation_runs_update_admin"
  on public.validation_runs
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "validation_runs_delete_admin" on public.validation_runs;
create policy "validation_runs_delete_admin"
  on public.validation_runs
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 26. VALIDATION ISSUES
-- ============================================================================
create table public.validation_issues (
  id                   uuid primary key default gen_random_uuid(),
  validation_run_id    uuid not null references public.validation_runs (id) on delete cascade,
  severity             text not null check (severity in ('error', 'warning', 'info')),
  rule_code            text not null,
  message              text not null,
  entity_type          text,
  entity_id            uuid,
  suggested_resolution text,
  created_at           timestamptz not null default now()
);

alter table public.validation_issues enable row level security;

-- Validation data is administrator-only.
drop policy if exists "validation_issues_select_admin" on public.validation_issues;
create policy "validation_issues_select_admin"
  on public.validation_issues
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "validation_issues_insert_admin" on public.validation_issues;
create policy "validation_issues_insert_admin"
  on public.validation_issues
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "validation_issues_delete_admin" on public.validation_issues;
create policy "validation_issues_delete_admin"
  on public.validation_issues
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 27. SYSTEM SETTINGS
-- ============================================================================
create table public.system_settings (
  id         uuid primary key default gen_random_uuid(),
  campus_id  uuid references public.campuses (id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique keys: global settings (campus_id IS NULL) and campus settings are
-- indexed separately because PostgreSQL treats NULLs as distinct.
create unique index system_settings_global_key_uq
  on public.system_settings (key)
  where campus_id is null;

create unique index system_settings_campus_key_uq
  on public.system_settings (campus_id, key)
  where campus_id is not null;

alter table public.system_settings enable row level security;

-- Guests and students may read only public settings keys.
drop policy if exists "system_settings_select_public" on public.system_settings;
create policy "system_settings_select_public"
  on public.system_settings
  for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "system_settings_select_admin" on public.system_settings;
create policy "system_settings_select_admin"
  on public.system_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "system_settings_insert_admin" on public.system_settings;
create policy "system_settings_insert_admin"
  on public.system_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "system_settings_update_admin" on public.system_settings;
create policy "system_settings_update_admin"
  on public.system_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "system_settings_delete_admin" on public.system_settings;
create policy "system_settings_delete_admin"
  on public.system_settings
  for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 28. ACTIVITY LOGS (append-only, administrator-readable)
-- ============================================================================
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  campus_id   uuid references public.campuses (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

-- Activity logs are administrator-readable and append-only. No update/delete
-- policies exist; the trigger below hardens immutability for every role.
drop policy if exists "activity_logs_select_admin" on public.activity_logs;
create policy "activity_logs_select_admin"
  on public.activity_logs
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "activity_logs_insert_admin" on public.activity_logs;
create policy "activity_logs_insert_admin"
  on public.activity_logs
  for insert
  to authenticated
  with check (public.is_admin());


-- ============================================================================
-- 29. APPEND-ONLY / IMMUTABILITY TRIGGERS
-- ============================================================================
create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'this table is append-only and cannot be updated or deleted';
end;
$$;

drop trigger if exists activity_logs_append_only on public.activity_logs;
create trigger activity_logs_append_only
  before update or delete on public.activity_logs
  for each row execute function public.prevent_append_only_mutation();

drop trigger if exists report_history_append_only on public.report_history;
create trigger report_history_append_only
  before update or delete on public.report_history
  for each row execute function public.prevent_append_only_mutation();


-- ============================================================================
-- 30. UPDATED_AT TRIGGERS
-- ============================================================================
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.campuses;
create trigger set_updated_at
  before update on public.campuses
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.buildings;
create trigger set_updated_at
  before update on public.buildings
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.floors;
create trigger set_updated_at
  before update on public.floors
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.map_elements;
create trigger set_updated_at
  before update on public.map_elements
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.navigation_nodes;
create trigger set_updated_at
  before update on public.navigation_nodes
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.navigation_edges;
create trigger set_updated_at
  before update on public.navigation_edges
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.events;
create trigger set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.event_locations;
create trigger set_updated_at
  before update on public.event_locations
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.announcements;
create trigger set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.reports;
create trigger set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.system_settings;
create trigger set_updated_at
  before update on public.system_settings
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 31. REQUIRED INDEXES
-- ============================================================================
create index profiles_role_active_idx
  on public.profiles (role, is_active);

create index campuses_status_default_idx
  on public.campuses (status, is_default);

create index buildings_campus_archived_idx
  on public.buildings (campus_id, archived_at);

create index map_elements_campus_floor_type_idx
  on public.map_elements (campus_id, floor_id, element_type);

create index map_elements_search_keywords_gin
  on public.map_elements using gin (search_keywords);

create index navigation_nodes_campus_floor_idx
  on public.navigation_nodes (campus_id, floor_id);

-- (campus_id, from_node_id, to_node_id) is covered by the unique index
-- navigation_edges_unique_pair_uq created with the table.
create index navigation_edges_to_node_idx
  on public.navigation_edges (to_node_id);

create index events_campus_status_time_idx
  on public.events (campus_id, status, starts_at, ends_at);

create index announcements_campus_status_time_idx
  on public.announcements (campus_id, status, starts_at, expires_at);

create index reports_reporter_status_created_idx
  on public.reports (reporter_id, status, created_at);

create index reports_campus_status_created_idx
  on public.reports (campus_id, status, created_at);

create index favorites_user_idx
  on public.favorites (user_id);

create index validation_runs_campus_created_idx
  on public.validation_runs (campus_id, created_at);

create index activity_logs_actor_created_idx
  on public.activity_logs (actor_id, created_at);

-- Additional index coverage for common foreign-key lookups.
create index event_locations_event_idx
  on public.event_locations (event_id);

create index announcement_locations_announcement_idx
  on public.announcement_locations (announcement_id);

create index report_images_report_idx
  on public.report_images (report_id);

create index report_history_report_idx
  on public.report_history (report_id);

create index validation_issues_run_idx
  on public.validation_issues (validation_run_id);

create index map_elements_building_idx
  on public.map_elements (building_id);

create index map_elements_floor_idx
  on public.map_elements (floor_id);

create index navigation_nodes_floor_id_idx
  on public.navigation_nodes (floor_id);


-- ============================================================================
-- 32. ATOMIC MAP PUBLISHING FUNCTION
-- ============================================================================
-- Implements the publishing sequence from docs/03_DATABASE_SUPABASE.md:
--   1. Re-run a critical validation gate (a failed validation run blocks).
--   2. Mark the previous published version as superseded.
--   3. Mark the target draft version as published.
--   4. Update campuses.latest_published_version_id.
--   5. Record an activity log.
-- Public clients then read the newest published snapshot (see the
-- campus_versions public select policy).
--
-- SECURITY DEFINER with a fixed search_path. Only administrators may publish;
-- row locks serialize concurrent publishes for the same campus.
create or replace function public.publish_campus_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campus_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only administrators may publish campus versions';
  end if;

  -- Load and lock the draft version row.
  select campus_id
    into v_campus_id
    from public.campus_versions
   where id = p_version_id
     and state = 'draft'
     for update;

  if v_campus_id is null then
    raise exception 'version not found or not in draft state';
  end if;

  -- Critical validation gate: a snapshot is mandatory and any failed
  -- validation run blocks publication (errors block; warnings only require
  -- confirmation, which the caller handles before invoking this function).
  if not exists (
    select 1
    from public.campus_versions
    where id = p_version_id
      and snapshot is not null
  ) then
    raise exception 'cannot publish a version without a snapshot';
  end if;

  -- Evaluation gate: the version must have at least one validation run, and
  -- only the NEWEST run (created_at desc, id as deterministic tie-breaker)
  -- matters. A 'failed' latest run blocks publication; 'passed' and 'warning'
  -- are accepted because warning confirmation is handled by the application
  -- before it calls this function. Older failed runs on the same version do
  -- not block a newer passing run.
  if not exists (
    select 1
    from public.validation_runs
    where campus_version_id = p_version_id
  ) then
    raise exception 'version has no validation run and cannot be published';
  end if;

  if (
    select vr.status
    from public.validation_runs vr
    where vr.campus_version_id = p_version_id
    order by vr.created_at desc, vr.id desc
    limit 1
  ) = 'failed' then
    raise exception 'the latest validation run failed; version cannot be published';
  end if;

  -- Serialize concurrent publishes for this campus.
  perform 1
    from public.campuses
   where id = v_campus_id
     for update;

  -- Supersede the previous published version (published_at is preserved as
  -- the historical publication record).
  update public.campus_versions
     set state = 'superseded'
   where campus_id = v_campus_id
     and state = 'published'
     and id <> p_version_id;

  -- Publish the target version.
  update public.campus_versions
     set state = 'published',
         published_at = now(),
         published_by = auth.uid()
   where id = p_version_id;

  -- Point the campus at the newest published snapshot.
  update public.campuses
     set latest_published_version_id = p_version_id,
         status = 'published',
         updated_by = auth.uid(),
         updated_at = now()
   where id = v_campus_id;

  -- Record the activity log entry.
  insert into public.activity_logs (actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    v_campus_id,
    'campus_version.published',
    'campus_versions',
    p_version_id,
    jsonb_build_object('version_id', p_version_id)
  );

  return p_version_id;
end;
$$;

comment on function public.publish_campus_version(uuid) is
  'Atomically publishes a draft campus version and updates the public pointer. Administrator only.';


-- ============================================================================
-- 33. CROSS-CAMPUS REFERENCE INTEGRITY + PUBLISHED FLOOR PLAN HELPER
-- ============================================================================
-- Focused constraint triggers keep parent references consistent with the row's
-- own campus, so no record can point at a building/floor/element/node that
-- belongs to a different campus (or, where relevant, a different building).
-- Composite foreign keys were considered but each parent would need a
-- synthetic unique key; focused triggers are the maintainable choice here.

-- ── map_elements: building/floor/parent must belong to the same campus ─────
create or replace function public.check_map_element_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campus          uuid;
  v_parent_building uuid;
  v_parent_floor    uuid;
begin
  if new.building_id is not null then
    select campus_id into v_campus
      from public.buildings where id = new.building_id;
    if v_campus is not null and v_campus <> new.campus_id then
      raise exception 'map element building must belong to the same campus';
    end if;
  end if;

  if new.floor_id is not null then
    select b.campus_id into v_campus
      from public.floors f
      join public.buildings b on b.id = f.building_id
     where f.id = new.floor_id;
    if v_campus is not null and v_campus <> new.campus_id then
      raise exception 'map element floor must belong to the same campus';
    end if;
    if new.building_id is not null and not exists (
      select 1 from public.floors f where f.id = new.floor_id and f.building_id = new.building_id
    ) then
      raise exception 'map element floor must belong to the same building';
    end if;
  end if;

  if new.parent_element_id is not null then
    select campus_id, building_id, floor_id
      into v_campus, v_parent_building, v_parent_floor
      from public.map_elements where id = new.parent_element_id;
    if v_campus is not null and v_campus <> new.campus_id then
      raise exception 'map element parent must belong to the same campus';
    end if;
    if new.building_id is not null and v_parent_building is not null and v_parent_building <> new.building_id then
      raise exception 'map element parent must belong to the same building';
    end if;
    if new.floor_id is not null and v_parent_floor is not null and v_parent_floor <> new.floor_id then
      raise exception 'map element parent must belong to the same floor';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists map_elements_cross_campus_check on public.map_elements;
create trigger map_elements_cross_campus_check
  before insert or update on public.map_elements
  for each row execute function public.check_map_element_integrity();

-- ── navigation_nodes: building/floor/map_element must match the node campus ──
create or replace function public.check_navigation_node_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campus        uuid;
  v_elem_building uuid;
  v_elem_floor    uuid;
begin
  if new.building_id is not null then
    select campus_id into v_campus
      from public.buildings where id = new.building_id;
    if v_campus is not null and v_campus <> new.campus_id then
      raise exception 'navigation node building must belong to the same campus';
    end if;
  end if;

  if new.floor_id is not null then
    select b.campus_id into v_campus
      from public.floors f
      join public.buildings b on b.id = f.building_id
     where f.id = new.floor_id;
    if v_campus is not null and v_campus <> new.campus_id then
      raise exception 'navigation node floor must belong to the same campus';
    end if;
    if new.building_id is not null and not exists (
      select 1 from public.floors f where f.id = new.floor_id and f.building_id = new.building_id
    ) then
      raise exception 'navigation node floor must belong to the same building';
    end if;
  end if;

  if new.map_element_id is not null then
    select campus_id, building_id, floor_id
      into v_campus, v_elem_building, v_elem_floor
      from public.map_elements where id = new.map_element_id;
    if v_campus is not null and v_campus <> new.campus_id then
      raise exception 'navigation node map element must belong to the same campus';
    end if;
    if new.building_id is not null and v_elem_building is not null and v_elem_building <> new.building_id then
      raise exception 'navigation node map element must belong to the same building';
    end if;
    if new.floor_id is not null and v_elem_floor is not null and v_elem_floor <> new.floor_id then
      raise exception 'navigation node map element must belong to the same floor';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists navigation_nodes_cross_campus_check on public.navigation_nodes;
create trigger navigation_nodes_cross_campus_check
  before insert or update on public.navigation_nodes
  for each row execute function public.check_navigation_node_integrity();

-- ── navigation_edges: both endpoints must belong to the edge campus ─────────
create or replace function public.check_navigation_edge_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_campus uuid;
  v_to_campus uuid;
begin
  select campus_id into v_from_campus from public.navigation_nodes where id = new.from_node_id;
  select campus_id into v_to_campus   from public.navigation_nodes where id = new.to_node_id;
  if (v_from_campus is not null and v_from_campus <> new.campus_id)
     or (v_to_campus is not null and v_to_campus <> new.campus_id) then
    raise exception 'navigation edge endpoints must belong to the same campus';
  end if;
  return new;
end;
$$;

drop trigger if exists navigation_edges_cross_campus_check on public.navigation_edges;
create trigger navigation_edges_cross_campus_check
  before insert or update on public.navigation_edges
  for each row execute function public.check_navigation_edge_integrity();

-- ── event_locations: map element must belong to the event campus ────────────
create or replace function public.check_event_location_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_campus uuid;
  v_element_campus uuid;
begin
  select campus_id into v_event_campus from public.events where id = new.event_id;
  if new.map_element_id is not null and v_event_campus is not null then
    select campus_id into v_element_campus from public.map_elements where id = new.map_element_id;
    if v_element_campus is not null and v_element_campus <> v_event_campus then
      raise exception 'event location map element must belong to the same campus as the event';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_locations_cross_campus_check on public.event_locations;
create trigger event_locations_cross_campus_check
  before insert or update on public.event_locations
  for each row execute function public.check_event_location_integrity();

-- ── announcement_locations: all references must match the announcement campus ─
create or replace function public.check_announcement_location_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ann_campus    uuid;
  v_ref_campus    uuid;
  v_ref_building  uuid;
  v_ref_floor     uuid;
begin
  select campus_id into v_ann_campus from public.announcements where id = new.announcement_id;
  if v_ann_campus is null then
    -- Missing announcement: defer to the foreign key constraint so it can
    -- surface the canonical integrity error.
    return new;
  end if;

  if new.building_id is not null then
    select campus_id into v_ref_campus from public.buildings where id = new.building_id;
    if v_ref_campus is not null and v_ref_campus <> v_ann_campus then
      raise exception 'announcement location building must belong to the same campus';
    end if;
  end if;

  if new.floor_id is not null then
    select b.campus_id into v_ref_campus
      from public.floors f
      join public.buildings b on b.id = f.building_id
     where f.id = new.floor_id;
    if v_ref_campus is not null and v_ref_campus <> v_ann_campus then
      raise exception 'announcement location floor must belong to the same campus';
    end if;
    if new.building_id is not null and not exists (
      select 1 from public.floors f where f.id = new.floor_id and f.building_id = new.building_id
    ) then
      raise exception 'announcement location floor must belong to the same building';
    end if;
  end if;

  if new.map_element_id is not null then
    select campus_id, building_id, floor_id
      into v_ref_campus, v_ref_building, v_ref_floor
      from public.map_elements where id = new.map_element_id;
    if v_ref_campus is not null and v_ref_campus <> v_ann_campus then
      raise exception 'announcement location map element must belong to the same campus';
    end if;
    if new.building_id is not null and v_ref_building is not null and v_ref_building <> new.building_id then
      raise exception 'announcement location map element must belong to the same building';
    end if;
    if new.floor_id is not null and v_ref_floor is not null and v_ref_floor <> new.floor_id then
      raise exception 'announcement location map element must belong to the same floor';
    end if;
  end if;

  if new.navigation_edge_id is not null then
    select campus_id into v_ref_campus from public.navigation_edges where id = new.navigation_edge_id;
    if v_ref_campus is not null and v_ref_campus <> v_ann_campus then
      raise exception 'announcement location navigation edge must belong to the same campus';
    end if;
    -- When both a navigation edge and a building/floor are given, the edge's
    -- endpoints must not point into a different building/floor.
    if new.building_id is not null and exists (
      select 1
      from public.navigation_edges ne
      join public.navigation_nodes fn on fn.id = ne.from_node_id
      join public.navigation_nodes tn on tn.id = ne.to_node_id
      where ne.id = new.navigation_edge_id
        and fn.building_id is not null and fn.building_id <> new.building_id
        and tn.building_id is not null and tn.building_id <> new.building_id
    ) then
      raise exception 'announcement location navigation edge endpoints must belong to the same building';
    end if;
    if new.floor_id is not null and exists (
      select 1
      from public.navigation_edges ne
      join public.navigation_nodes fn on fn.id = ne.from_node_id
      join public.navigation_nodes tn on tn.id = ne.to_node_id
      where ne.id = new.navigation_edge_id
        and fn.floor_id is not null and fn.floor_id <> new.floor_id
        and tn.floor_id is not null and tn.floor_id <> new.floor_id
    ) then
      raise exception 'announcement location navigation edge endpoints must belong to the same floor';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists announcement_locations_cross_campus_check on public.announcement_locations;
create trigger announcement_locations_cross_campus_check
  before insert or update on public.announcement_locations
  for each row execute function public.check_announcement_location_integrity();

-- ── favorites: building/map element must belong to the favorite campus ──────
create or replace function public.check_favorite_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref_campus uuid;
begin
  if new.building_id is not null then
    select campus_id into v_ref_campus from public.buildings where id = new.building_id;
    if v_ref_campus is not null and v_ref_campus <> new.campus_id then
      raise exception 'favorite building must belong to the same campus';
    end if;
  end if;

  if new.map_element_id is not null then
    select campus_id into v_ref_campus from public.map_elements where id = new.map_element_id;
    if v_ref_campus is not null and v_ref_campus <> new.campus_id then
      raise exception 'favorite map element must belong to the same campus';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists favorites_cross_campus_check on public.favorites;
create trigger favorites_cross_campus_check
  before insert or update on public.favorites
  for each row execute function public.check_favorite_integrity();

-- ── reports: building/floor/map element must belong to the report campus ────
create or replace function public.check_report_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref_campus   uuid;
  v_ref_building uuid;
  v_ref_floor    uuid;
begin
  if new.building_id is not null then
    select campus_id into v_ref_campus from public.buildings where id = new.building_id;
    if v_ref_campus is not null and v_ref_campus <> new.campus_id then
      raise exception 'report building must belong to the same campus';
    end if;
  end if;

  if new.floor_id is not null then
    select b.campus_id into v_ref_campus
      from public.floors f
      join public.buildings b on b.id = f.building_id
     where f.id = new.floor_id;
    if v_ref_campus is not null and v_ref_campus <> new.campus_id then
      raise exception 'report floor must belong to the same campus';
    end if;
    if new.building_id is not null and not exists (
      select 1 from public.floors f where f.id = new.floor_id and f.building_id = new.building_id
    ) then
      raise exception 'report floor must belong to the same building';
    end if;
  end if;

  if new.map_element_id is not null then
    select campus_id, building_id, floor_id
      into v_ref_campus, v_ref_building, v_ref_floor
      from public.map_elements where id = new.map_element_id;
    if v_ref_campus is not null and v_ref_campus <> new.campus_id then
      raise exception 'report map element must belong to the same campus';
    end if;
    if new.building_id is not null and v_ref_building is not null and v_ref_building <> new.building_id then
      raise exception 'report map element must belong to the same building';
    end if;
    if new.floor_id is not null and v_ref_floor is not null and v_ref_floor <> new.floor_id then
      raise exception 'report map element must belong to the same floor';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_cross_campus_check on public.reports;
create trigger reports_cross_campus_check
  before insert or update on public.reports
  for each row execute function public.check_report_integrity();

-- ── Published floor plan helper (used by the floor-plans storage policy) ─────
-- True when the path is referenced as a floor plan inside the LATEST published
-- snapshot of a published, non-archived campus. SECURITY DEFINER + fixed
-- search_path so the check runs with table-owner privileges and never depends
-- on public access to the live floors/buildings rows (which are now
-- administrator-only). Draft floor plans are therefore never readable.
--
-- Contract: published snapshots must include `floor_plan_path` on each floor
-- object so this gate can resolve published floor plans.
create or replace function public.is_published_floor_plan(p_path text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.campus_versions cv
    join public.campuses c on c.id = cv.campus_id
    where cv.state = 'published'
      and cv.id = c.latest_published_version_id
      and c.status = 'published'
      and c.archived_at is null
      and exists (
        select 1
        from jsonb_array_elements(cv.snapshot -> 'buildings') b
        cross join lateral jsonb_array_elements(b -> 'floors') f
        where f ->> 'floor_plan_path' = p_path
      )
  );
$$;

comment on function public.is_published_floor_plan(text) is
  'True when a floor plan path belongs to the latest published campus snapshot.';

-- ── campuses: latest_published_version_id must match a published version of the same campus ──
create or replace function public.check_campus_latest_published_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_campus uuid;
  v_version_state  text;
begin
  if new.latest_published_version_id is not null then
    select campus_id, state
      into v_version_campus, v_version_state
      from public.campus_versions
     where id = new.latest_published_version_id;
    if v_version_campus is null then
      -- Missing version: defer to the FK constraint so it can surface the
      -- canonical integrity error.
      return new;
    end if;
    if v_version_campus <> new.id then
      raise exception 'latest_published_version_id must reference a version of the same campus';
    end if;
    if v_version_state <> 'published' then
      raise exception 'latest_published_version_id must reference a published version';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists campuses_latest_published_version_check on public.campuses;
create trigger campuses_latest_published_version_check
  before insert or update on public.campuses
  for each row execute function public.check_campus_latest_published_version();

-- ── validation_runs: campus_version_id must belong to the run's campus ─────
create or replace function public.check_validation_run_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_campus uuid;
begin
  if new.campus_version_id is not null then
    select campus_id into v_version_campus
      from public.campus_versions
     where id = new.campus_version_id;
    if v_version_campus is not null and v_version_campus <> new.campus_id then
      raise exception 'validation run campus_version_id must belong to the same campus';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validation_runs_version_campus_check on public.validation_runs;
create trigger validation_runs_version_campus_check
  before insert or update on public.validation_runs
  for each row execute function public.check_validation_run_version();


-- ============================================================================
-- 34. STORAGE BUCKETS
-- ============================================================================
-- avatars         : private, users manage only their own folder
-- building-images : public, administrator write
-- floor-plans     : private, controlled public read for published floor plans
-- report-images   : private, report owner / uploader / administrator read
-- event-images    : public, administrator write
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', false),
  ('building-images', 'building-images', true),
  ('floor-plans', 'floor-plans', false),
  ('report-images', 'report-images', false),
  ('event-images', 'event-images', true)
on conflict (id) do nothing;


-- ============================================================================
-- 35. STORAGE OBJECT POLICIES
-- ============================================================================

-- ── avatars ────────────────────────────────────────────────────────────────
-- Users may manage only objects in their own folder: {user_id}/...
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- ── building-images ────────────────────────────────────────────────────────
drop policy if exists "building_images_select_public" on storage.objects;
create policy "building_images_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'building-images');

drop policy if exists "building_images_insert_admin" on storage.objects;
create policy "building_images_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'building-images'
    and public.is_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "building_images_update_admin" on storage.objects;
create policy "building_images_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'building-images' and public.is_admin())
  with check (bucket_id = 'building-images' and public.is_admin());

drop policy if exists "building_images_delete_admin" on storage.objects;
create policy "building_images_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'building-images' and public.is_admin());


-- ── floor-plans ────────────────────────────────────────────────────────────
-- Controlled public read via a SECURITY DEFINER helper (section 33): an
-- object is readable only when its path is referenced as a floor plan inside
-- the LATEST published snapshot of a published, non-archived campus. The check
-- never reads the live floors/buildings rows, so unpublished draft floor plans
-- can never be exposed.
drop policy if exists "floor_plans_select_published" on storage.objects;
create policy "floor_plans_select_published"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'floor-plans'
    and public.is_published_floor_plan(name)
  );

drop policy if exists "floor_plans_insert_admin" on storage.objects;
create policy "floor_plans_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'floor-plans'
    and public.is_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "floor_plans_update_admin" on storage.objects;
create policy "floor_plans_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'floor-plans' and public.is_admin())
  with check (bucket_id = 'floor-plans' and public.is_admin());

drop policy if exists "floor_plans_delete_admin" on storage.objects;
create policy "floor_plans_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'floor-plans' and public.is_admin());


-- ── report-images ──────────────────────────────────────────────────────────
-- Objects are stored under {report_id}/... The uploader (report owner) and
-- administrators may read and manage them.
drop policy if exists "report_images_select_owner_or_admin" on storage.objects;
create policy "report_images_select_owner_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'report-images'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(name))[1]
          and r.reporter_id = auth.uid()
      )
    )
  );

drop policy if exists "report_images_insert_owner" on storage.objects;
create policy "report_images_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-images'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (
      select 1
      from public.reports r
      where r.id::text = (storage.foldername(name))[1]
        and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "report_images_update_owner_or_admin" on storage.objects;
create policy "report_images_update_owner_or_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'report-images'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(name))[1]
          and r.reporter_id = auth.uid()
      )
    )
  )
  with check (
    bucket_id = 'report-images'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(name))[1]
          and r.reporter_id = auth.uid()
      )
    )
  );

drop policy if exists "report_images_delete_owner_or_admin" on storage.objects;
create policy "report_images_delete_owner_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'report-images'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(name))[1]
          and r.reporter_id = auth.uid()
      )
    )
  );


-- ── event-images ───────────────────────────────────────────────────────────
drop policy if exists "event_images_select_public" on storage.objects;
create policy "event_images_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'event-images');

drop policy if exists "event_images_insert_admin" on storage.objects;
create policy "event_images_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and public.is_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "event_images_update_admin" on storage.objects;
create policy "event_images_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'event-images' and public.is_admin())
  with check (bucket_id = 'event-images' and public.is_admin());

drop policy if exists "event_images_delete_admin" on storage.objects;
create policy "event_images_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'event-images' and public.is_admin());


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Review checklist (docs/03_DATABASE_SUPABASE.md):
--   [x] 20 application tables with UUID PKs (gen_random_uuid())
--   [x] Required foreign keys in valid creation order
--   [x] campuses.latest_published_version_id circular reference handled
--       (FK added after campus_versions)
--   [x] Check constraints and unique constraints
--   [x] All required indexes
--   [x] updated_at trigger function and triggers
--   [x] profiles trigger on auth.users (student-only registration)
--   [x] public.is_admin() SECURITY DEFINER with fixed search_path
--   [x] RLS enabled on all 20 exposed tables
--   [x] Guest / student / administrator policies per the RLS matrix
--   [x] Published campus versions immutable
--   [x] Activity logs and report history append-only
--   [x] Atomic map publishing database function
--   [x] Storage buckets and object policies
--   [x] No accessibility_routes / emergency_routes tables
--   [x] No seed data, no RLS disablement, no service-role key usage
