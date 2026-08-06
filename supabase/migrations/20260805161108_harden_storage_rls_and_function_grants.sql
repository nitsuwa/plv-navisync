-- PLV NaviSync A1 security baseline corrections.
-- This migration is intentionally separate from the already-applied 001
-- baseline. It narrows function execution, enforces Storage bucket limits,
-- and replaces the RLS policies flagged for per-row auth.uid() evaluation.

-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER and trigger-function execution privileges
-- ---------------------------------------------------------------------------
-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. Revoke that
-- default from every application function, then grant only the four reviewed
-- callable helpers to the roles that require them.

revoke execute on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.protect_profile_authorization() from public, anon, authenticated, service_role;
revoke execute on function public.protect_published_campus_versions() from public, anon, authenticated, service_role;
revoke execute on function public.prevent_append_only_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.check_map_element_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_navigation_node_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_navigation_edge_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_event_location_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_announcement_location_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_favorite_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_report_integrity() from public, anon, authenticated, service_role;
revoke execute on function public.check_campus_latest_published_version() from public, anon, authenticated, service_role;
revoke execute on function public.check_validation_run_version() from public, anon, authenticated, service_role;

revoke execute on function public.is_admin() from public, anon, authenticated, service_role;
revoke execute on function public.campus_is_published(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.is_published_floor_plan(text) from public, anon, authenticated, service_role;
revoke execute on function public.publish_campus_version(uuid) from public, anon, authenticated, service_role;

-- Intentional callable helper: authenticated policies use this recursive-safe
-- active-administrator lookup. It returns false for non-administrators.
grant execute on function public.is_admin() to authenticated, service_role;

-- Intentional public policy helper: public event/announcement/report policies
-- need to determine whether a campus is currently published.
grant execute on function public.campus_is_published(uuid) to anon, authenticated, service_role;

-- Intentional public Storage-policy helper: permits reads only for floor-plan
-- paths referenced by the latest published campus snapshot.
grant execute on function public.is_published_floor_plan(text) to anon, authenticated, service_role;

-- Intentional authenticated RPC: the function performs its own active-admin
-- check and atomically publishes a validated campus version.
grant execute on function public.publish_campus_version(uuid) to authenticated, service_role;

comment on function public.is_admin() is
  'RLS helper. EXECUTE is limited to authenticated and service_role; returns true only for an active administrator.';
comment on function public.campus_is_published(uuid) is
  'Public RLS helper. EXECUTE is intentionally granted to anon/authenticated for published campus content checks.';
comment on function public.is_published_floor_plan(text) is
  'Public Storage RLS helper. EXECUTE is intentionally granted to anon/authenticated and reads only latest published snapshots.';
comment on function public.publish_campus_version(uuid) is
  'Authenticated RPC with an internal active-admin check; atomically publishes a validated campus version.';

-- ---------------------------------------------------------------------------
-- 2. Storage bucket enforcement
-- ---------------------------------------------------------------------------
-- Bucket-level limits validate the actual uploaded object size and MIME type;
-- object policies continue to enforce ownership and administrator access.

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'building-images';

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'floor-plans';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'report-images';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'event-images';

-- ---------------------------------------------------------------------------
-- 3. RLS correctness and performance corrections
-- ---------------------------------------------------------------------------
-- Wrap auth.uid() in SELECT so PostgreSQL evaluates it once per statement.
-- The profile self-update policy also receives the required WITH CHECK guard.

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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
    and created_by = (select auth.uid())
  );

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and priority = 'normal'
    and assigned_admin_id is null
    and internal_notes is null
    and resolution_notes is null
    and resolved_at is null
    and archived_at is null
    and public.campus_is_published(campus_id)
  );

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
        and r.reporter_id = (select auth.uid())
    )
  );

drop policy if exists "report_images_insert_own" on public.report_images;
create policy "report_images_insert_own"
  on public.report_images
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.reports r
      where r.id = report_id
        and r.reporter_id = (select auth.uid())
    )
  );

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
        and r.reporter_id = (select auth.uid())
    )
  );

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
