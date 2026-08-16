-- A8 cross-system security correction.
--
-- Deactivating a profile must immediately remove access granted through an
-- already-issued authenticated session. Auth remains valid until its JWT or
-- refresh session expires, so ownership checks also need current profile state.
-- Keep the lookup outside exposed schemas and expose only a boolean predicate
-- to authenticated database roles for use inside RLS and Storage policies.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  );
$$;

revoke all on function private.is_active_user() from public, anon;
grant execute on function private.is_active_user() to authenticated, service_role;

comment on function private.is_active_user() is
  'Internal RLS/Storage predicate. Returns only whether auth.uid() currently has an active profile; it is not exposed through the public Data API schema.';

-- An inactive account may still read its own profile so the client can explain
-- the account state, but it may not mutate the profile or access private data.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (
  (select private.is_active_user())
  and (select auth.uid()) = id
)
with check (
  (select private.is_active_user())
  and (select auth.uid()) = id
);

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
on public.reports for select
to authenticated
using (
  (select private.is_active_user())
  and reporter_id = (select auth.uid())
);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports for insert
to authenticated
with check (
  (select private.is_active_user())
  and reporter_id = (select auth.uid())
  and status = 'pending'
  and priority = 'normal'
  and assigned_admin_id is null
  and internal_notes is null
  and resolution_notes is null
  and resolved_at is null
  and archived_at is null
  and (select public.campus_is_published(campus_id))
);

drop policy if exists "report_history_select_own" on public.report_history;
create policy "report_history_select_own"
on public.report_history for select
to authenticated
using (
  (select private.is_active_user())
  and exists (
    select 1
    from public.reports r
    where r.id = report_history.report_id
      and r.reporter_id = (select auth.uid())
  )
);

drop policy if exists "report_images_select_own" on public.report_images;
create policy "report_images_select_own"
on public.report_images for select
to authenticated
using (
  (select private.is_active_user())
  and exists (
    select 1
    from public.reports r
    where r.id = report_images.report_id
      and r.reporter_id = (select auth.uid())
  )
);

drop policy if exists "report_images_insert_own" on public.report_images;
create policy "report_images_insert_own"
on public.report_images for insert
to authenticated
with check (
  (select private.is_active_user())
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.reports r
    where r.id = report_images.report_id
      and r.reporter_id = (select auth.uid())
  )
);

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
on public.favorites for select
to authenticated
using (
  (select private.is_active_user())
  and user_id = (select auth.uid())
);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
on public.favorites for insert
to authenticated
with check (
  (select private.is_active_user())
  and user_id = (select auth.uid())
);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
on public.favorites for delete
to authenticated
using (
  (select private.is_active_user())
  and user_id = (select auth.uid())
);

drop policy if exists "recent_destinations_select_own" on public.recent_destinations;
create policy "recent_destinations_select_own"
on public.recent_destinations for select
to authenticated
using (
  (select private.is_active_user())
  and (select auth.uid()) = user_id
);

drop policy if exists "recent_destinations_insert_own" on public.recent_destinations;
create policy "recent_destinations_insert_own"
on public.recent_destinations for insert
to authenticated
with check (
  (select private.is_active_user())
  and (select auth.uid()) = user_id
);

drop policy if exists "recent_destinations_update_own" on public.recent_destinations;
create policy "recent_destinations_update_own"
on public.recent_destinations for update
to authenticated
using (
  (select private.is_active_user())
  and (select auth.uid()) = user_id
)
with check (
  (select private.is_active_user())
  and (select auth.uid()) = user_id
);

drop policy if exists "recent_destinations_delete_own" on public.recent_destinations;
create policy "recent_destinations_delete_own"
on public.recent_destinations for delete
to authenticated
using (
  (select private.is_active_user())
  and (select auth.uid()) = user_id
);

-- Storage owner policies need the same live profile-state check because an
-- Auth session is not revoked merely by changing public.profiles.is_active.
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
on storage.objects for select
to authenticated
using (
  (select private.is_active_user())
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  (select private.is_active_user())
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update
to authenticated
using (
  (select private.is_active_user())
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  (select private.is_active_user())
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  (select private.is_active_user())
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "report_images_select_owner_or_admin" on storage.objects;
create policy "report_images_select_owner_or_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'report-images'
  and (
    (select public.is_admin())
    or (
      (select private.is_active_user())
      and exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(storage.objects.name))[1]
          and r.reporter_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "report_images_insert_owner" on storage.objects;
create policy "report_images_insert_owner"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'report-images'
  and (select private.is_active_user())
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and exists (
    select 1
    from public.reports r
    where r.id::text = (storage.foldername(storage.objects.name))[1]
      and r.reporter_id = (select auth.uid())
  )
);

drop policy if exists "report_images_update_owner_or_admin" on storage.objects;
create policy "report_images_update_owner_or_admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'report-images'
  and (
    (select public.is_admin())
    or (
      (select private.is_active_user())
      and exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(storage.objects.name))[1]
          and r.reporter_id = (select auth.uid())
      )
    )
  )
)
with check (
  bucket_id = 'report-images'
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and (
    (select public.is_admin())
    or (
      (select private.is_active_user())
      and exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(storage.objects.name))[1]
          and r.reporter_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "report_images_delete_owner_or_admin" on storage.objects;
create policy "report_images_delete_owner_or_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'report-images'
  and (
    (select public.is_admin())
    or (
      (select private.is_active_user())
      and exists (
        select 1
        from public.reports r
        where r.id::text = (storage.foldername(storage.objects.name))[1]
          and r.reporter_id = (select auth.uid())
      )
    )
  )
);

-- Correct the A5 campus-image public read predicate. The unqualified `name`
-- in the original correlated subquery bound to campuses.name, so no normal
-- Storage path could match. Compare the object path explicitly instead.
drop policy if exists "campus_images_select_published" on storage.objects;
create policy "campus_images_select_published"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'campus-images'
  and exists (
    select 1
    from public.campuses c
    where c.status = 'published'
      and c.archived_at is null
      and (
        c.logo_path = storage.objects.name
        or c.overview_image_path = storage.objects.name
      )
  )
);
