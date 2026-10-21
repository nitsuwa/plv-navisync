-- Supabase Storage runs an INSERT-policy probe before it uploads the bytes.
-- At that stage standard raw uploads provide metadata.contentLength; the final
-- object row is checked again with metadata.size after Storage has the bytes.
-- Keep the private bucket, Admin-only write scope, canonical room path and
-- actual-size checks. Accept the server-provided preflight field as well as
-- the final stored-size field so new immutable object uploads can pass both
-- Storage authorization checks.

do $$
declare
  v_insert_check text;
  v_select_using text;
  v_room_select_using text;
  v_admin_function text;
  v_bucket_public boolean;
  v_room_rls_enabled boolean;
begin
  select public into v_bucket_public
    from storage.buckets
   where id = 'emergency-evacuation-videos';
  if not found then
    raise exception 'Emergency video bucket is missing; install the existing video migration first.';
  end if;
  if v_bucket_public is distinct from false then
    raise exception 'Emergency video bucket must remain private.';
  end if;

  select with_check into v_insert_check
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname = 'emergency_videos_admin_insert'
     and cmd = 'INSERT';
  if v_insert_check is null
     or position('is_admin' in lower(v_insert_check)) = 0
     or position('map_elements' in lower(v_insert_check)) = 0
     or position('extension' in lower(v_insert_check)) = 0 then
    raise exception 'The expected scoped Admin video INSERT policy is missing or has changed; review live Storage policies before applying this patch.';
  end if;

  select qual into v_select_using
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname = 'emergency_videos_admin_select'
     and cmd = 'SELECT';
  if v_select_using is null
     or position('is_admin' in lower(v_select_using)) = 0
     or position('emergency-evacuation-videos' in v_select_using) = 0 then
    raise exception 'The expected Admin-only Storage SELECT policy is missing or has changed; review live Storage policies before applying this patch.';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and permissive = 'RESTRICTIVE'
       and cmd in ('ALL', 'INSERT')
       and (
         roles::text[] @> array['authenticated']::text[]
         or roles::text[] @> array['public']::text[]
       )
  ) then
    raise exception 'A restrictive Storage INSERT policy also applies; inspect it before changing emergency video upload authorization.';
  end if;

  select relrowsecurity into v_room_rls_enabled
    from pg_class
   where oid = 'public.map_elements'::regclass;
  if v_room_rls_enabled is distinct from true then
    raise exception 'public.map_elements must retain RLS.';
  end if;

  select qual into v_room_select_using
    from pg_policies
   where schemaname = 'public'
     and tablename = 'map_elements'
     and policyname = 'map_elements_select_admin'
     and cmd = 'SELECT';
  if v_room_select_using is null
     or position('is_admin' in lower(v_room_select_using)) = 0 then
    raise exception 'The expected Admin-only map_elements SELECT policy is missing or has changed; review room lookup access before applying this patch.';
  end if;

  select pg_get_functiondef('public.is_admin()'::regprocedure)
    into v_admin_function;
  if position('super_admin' in lower(v_admin_function)) = 0 then
    raise exception 'The Admin policy helper must include active super_admin profiles; apply the existing role-model migration first.';
  end if;
end;
$$;

alter policy emergency_videos_admin_insert on storage.objects
  to authenticated
  with check (
    bucket_id = 'emergency-evacuation-videos'
    and public.is_admin()
    and lower(storage.extension(name)) in ('mp4', 'vtt')
    and case
      when coalesce(metadata->>'size', metadata->>'contentLength', '') ~ '^[0-9]{1,9}$' then
        case
          when lower(storage.extension(name)) = 'mp4'
            then coalesce(metadata->>'size', metadata->>'contentLength')::bigint between 1 and 104857600
          when lower(storage.extension(name)) = 'vtt'
            then coalesce(metadata->>'size', metadata->>'contentLength')::bigint between 1 and 1048576
          else false
        end
      else false
    end
    and exists (
      select 1 from public.map_elements e
      where e.id::text = (storage.foldername(name))[2]
        and e.campus_id::text = (storage.foldername(name))[1]
        and e.archived_at is null
        and e.metadata->>'kind' = 'room'
    )
  );

comment on policy emergency_videos_admin_insert on storage.objects is
  'Admin-only immutable emergency video uploads. Checks Storage preflight contentLength and final stored size against media-specific limits, and requires an active persisted room under the canonical campus/room path.';
