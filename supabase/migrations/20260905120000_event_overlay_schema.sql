-- Migration: Event overlay support for map_elements
--
-- The Event Map feature persists CampusEventOverlay documents as rows in
-- public.map_elements with element_type = 'event_overlay' and the overlay
-- fields inside metadata JSON.
--
-- Changes:
--   1. Allow element_type 'event_overlay' in the CHECK constraint.
--   2. Add public.is_student_org() helper (mirrors public.is_admin()).
--   3. RLS policies so:
--        - student org users can SELECT/INSERT/UPDATE/DELETE their own overlays
--        - regular students can SELECT approved event overlays (map view)
--        - admins keep full access (existing admin policies still apply)

-- ── 1. element_type CHECK constraint ───────────────────────────────────────
alter table public.map_elements
  drop constraint if exists map_elements_element_type_check;

alter table public.map_elements
  add constraint map_elements_element_type_check
  check (element_type in (
    'room', 'classroom', 'laboratory', 'office', 'hallway', 'wall', 'door',
    'entrance', 'exit', 'stairs', 'elevator', 'ramp', 'restroom', 'clinic',
    'library', 'canteen', 'parking', 'gate', 'landmark', 'assembly_area',
    'emergency_exit', 'fire_extinguisher', 'information_desk', 'furniture',
    'custom',
    'tree', 'bench', 'lamp', 'sign', 'bike_rack', 'garden', 'window',
    'chair', 'table', 'fire_alarm', 'fire_hydrant', 'cctv', 'security_post',
    'event_overlay'
  ));

-- ── 2. Helper: is_student_org() ────────────────────────────────────────────
create or replace function public.is_student_org()
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
      and p.role = 'student_org'
      and p.is_active = true
  )
$$;

grant execute on function public.is_student_org() to authenticated;
grant execute on function public.is_student_org() to service_role;

-- ── 3. RLS policies for event overlays ─────────────────────────────────────
-- SELECT: admin, the creating student org, or anyone when the overlay is
-- approved (regular students must see approved event layouts on the map).
drop policy if exists "map_elements_select_event_overlay" on public.map_elements;
create policy "map_elements_select_event_overlay"
  on public.map_elements
  for select
  to authenticated
  using (
    element_type = 'event_overlay'
    and (
      public.is_admin()
      or metadata->>'createdByUserId' = auth.uid()::text
      or metadata->>'status' = 'approved'
    )
  );

-- INSERT: student org users creating their own event overlay only.
drop policy if exists "map_elements_insert_event_overlay_owner" on public.map_elements;
create policy "map_elements_insert_event_overlay_owner"
  on public.map_elements
  for insert
  to authenticated
  with check (
    element_type = 'event_overlay'
    and public.is_student_org()
    and metadata->>'createdByUserId' = auth.uid()::text
  );

-- UPDATE: admins or the owning student org (layout edits + submit to pending).
drop policy if exists "map_elements_update_event_overlay_owner" on public.map_elements;
create policy "map_elements_update_event_overlay_owner"
  on public.map_elements
  for update
  to authenticated
  using (
    element_type = 'event_overlay'
    and (
      public.is_admin()
      or (public.is_student_org() and metadata->>'createdByUserId' = auth.uid()::text)
    )
  )
  with check (
    element_type = 'event_overlay'
    and (
      public.is_admin()
      or (public.is_student_org() and metadata->>'createdByUserId' = auth.uid()::text)
    )
  );

-- DELETE: admins or the owning student org.
drop policy if exists "map_elements_delete_event_overlay_owner" on public.map_elements;
create policy "map_elements_delete_event_overlay_owner"
  on public.map_elements
  for delete
  to authenticated
  using (
    element_type = 'event_overlay'
    and (
      public.is_admin()
      or (public.is_student_org() and metadata->>'createdByUserId' = auth.uid()::text)
    )
  );