-- Room photos are private Storage objects. Student signed URLs are issued only
-- when the active published campus snapshot still assigns that path to the
-- same Room identity. Draft-only uploads remain Admin-only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-photos', 'room-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_published_room_photo_path(p_path text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_length(string_to_array(p_path, '/'), 1) = 5, false)
    and exists (
      select 1
      from public.campuses c
      join public.campus_versions cv on cv.id = c.latest_published_version_id and cv.campus_id = c.id
      cross join lateral jsonb_array_elements(case
        when jsonb_typeof(cv.snapshot->'structure'->'map_elements') = 'array' then cv.snapshot->'structure'->'map_elements'
        when jsonb_typeof(cv.snapshot->'map_elements') = 'array' then cv.snapshot->'map_elements'
        else '[]'::jsonb
      end) element
      where c.id::text = split_part(p_path, '/', 1)
        and c.status = 'published'
        and c.archived_at is null
        and cv.state = 'published'
        and element->>'id' = split_part(p_path, '/', 4)
        and element->>'campus_id' = split_part(p_path, '/', 1)
        and element->>'building_id' = split_part(p_path, '/', 2)
        and element->>'floor_id' = split_part(p_path, '/', 3)
        and element->'metadata'->>'kind' = 'room'
        and coalesce(element->'metadata'->'ui'->>'roomPhotoPath', element->'metadata'->>'roomPhotoPath') = p_path
    );
$$;

-- Protect files referenced by a saved draft and retained published history,
-- so Replace/Remove cannot break a draft an Admin may reload or an immutable
-- snapshot that was previously published.
create or replace function public.is_room_photo_referenced_by_saved_snapshot(p_path text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_length(string_to_array(p_path, '/'), 1) = 5, false)
    and exists (
      select 1
      from public.campus_versions cv
      cross join lateral jsonb_array_elements(case
        when jsonb_typeof(cv.snapshot->'structure'->'map_elements') = 'array' then cv.snapshot->'structure'->'map_elements'
        when jsonb_typeof(cv.snapshot->'map_elements') = 'array' then cv.snapshot->'map_elements'
        else '[]'::jsonb
      end) element
      where cv.state in ('draft', 'published', 'superseded')
        and cv.campus_id::text = split_part(p_path, '/', 1)
        and element->>'id' = split_part(p_path, '/', 4)
        and element->>'campus_id' = split_part(p_path, '/', 1)
        and element->>'building_id' = split_part(p_path, '/', 2)
        and element->>'floor_id' = split_part(p_path, '/', 3)
        and element->'metadata'->>'kind' = 'room'
        and coalesce(element->'metadata'->'ui'->>'roomPhotoPath', element->'metadata'->>'roomPhotoPath') = p_path
    );
$$;

revoke all on function public.is_published_room_photo_path(text) from public;
revoke all on function public.is_room_photo_referenced_by_saved_snapshot(text) from public;
grant execute on function public.is_published_room_photo_path(text) to anon, authenticated;
grant execute on function public.is_room_photo_referenced_by_saved_snapshot(text) to authenticated;

drop policy if exists room_photos_admin_insert on storage.objects;
create policy room_photos_admin_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-photos'
    and public.is_admin()
    and array_length(string_to_array(name, '/'), 1) = 5
    and split_part(name, '/', 5) ~ '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
  );

drop policy if exists room_photos_admin_select on storage.objects;
create policy room_photos_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'room-photos' and public.is_admin());

drop policy if exists room_photos_student_select_published on storage.objects;
create policy room_photos_student_select_published on storage.objects for select to anon, authenticated
  using (bucket_id = 'room-photos' and public.is_published_room_photo_path(name));

drop policy if exists room_photos_admin_delete_unpublished on storage.objects;
create policy room_photos_admin_delete_unpublished on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-photos'
    and public.is_admin()
    and not public.is_room_photo_referenced_by_saved_snapshot(name)
  );

comment on function public.is_published_room_photo_path(text) is
  'Allows private Room photo reads only when the active published campus snapshot references the path for the same campus, building, floor, and Room.';
