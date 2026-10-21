-- Run after 20261014090000_emergency_evacuation_video_guides.sql and
-- 20261016090000_allow_single_route_emergency_video_access.sql.
do $$
declare
  v_bucket record;
  v_policy_count integer;
  v_video_resolver text;
  v_upload_policy text;
  v_admin_select_policy text;
  v_admin_function text;
begin
  select public, file_size_limit, allowed_mime_types
    into v_bucket
    from storage.buckets
   where id = 'emergency-evacuation-videos';
  if not found then raise exception 'emergency video bucket is missing'; end if;
  if v_bucket.public is distinct from false then raise exception 'emergency video bucket must stay private'; end if;
  if v_bucket.file_size_limit <> 104857600 then raise exception 'emergency video bucket limit must be 100 MiB'; end if;
  if not (v_bucket.allowed_mime_types @> array['video/mp4', 'text/vtt']) then
    raise exception 'emergency video bucket must restrict uploads to MP4 and WebVTT';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.emergency_evacuation_videos'::regclass) then
    raise exception 'emergency video metadata table must have RLS enabled';
  end if;
  if has_table_privilege('anon', 'public.emergency_evacuation_videos', 'SELECT') then
    raise exception 'anonymous users must not query draft/admin video metadata directly';
  end if;

  select count(*) into v_policy_count from pg_policies
   where schemaname = 'public' and tablename = 'emergency_evacuation_videos'
     and policyname like 'emergency_evacuation_videos_admin_%';
  if v_policy_count < 4 then raise exception 'Admin-only metadata policies are incomplete'; end if;

  select count(*) into v_policy_count from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'emergency_videos_%';
  if v_policy_count < 4 then raise exception 'Private media storage policies are incomplete'; end if;

  select with_check into v_upload_policy from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'emergency_videos_admin_insert' and cmd = 'INSERT';
  if v_upload_policy is null
     or position('is_admin' in lower(v_upload_policy)) = 0
     or position('map_elements' in lower(v_upload_policy)) = 0
     or position('contentLength' in v_upload_policy) = 0
     or position('size' in lower(v_upload_policy)) = 0
     or position('extension' in lower(v_upload_policy)) = 0 then
    raise exception 'Emergency video INSERT policy must scope active Admins and persisted room paths while validating preflight contentLength and final size.';
  end if;

  select qual into v_admin_select_policy from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'emergency_videos_admin_select' and cmd = 'SELECT';
  if v_admin_select_policy is null
     or position('is_admin' in lower(v_admin_select_policy)) = 0 then
    raise exception 'Admin Storage SELECT policy is required for object metadata returned by upload.';
  end if;

  select pg_get_functiondef('public.is_admin()'::regprocedure) into v_admin_function;
  if position('super_admin' in lower(v_admin_function)) = 0 then
    raise exception 'Storage Admin authorization must include active super_admin profiles.';
  end if;

  if not (select prosecdef from pg_proc where oid = 'public.get_published_emergency_evacuation_video(uuid)'::regprocedure) then
    raise exception 'student media delivery must pass through the controlled security-definer RPC';
  end if;
  if not has_function_privilege('anon', 'public.get_published_emergency_evacuation_video(uuid)', 'EXECUTE') then
    raise exception 'published-map guests need the controlled video metadata resolver';
  end if;

  select pg_get_functiondef('public.is_published_emergency_evacuation_video(uuid)'::regprocedure)
    into v_video_resolver;
  if v_video_resolver ~ $needle$->\s*'emergencyEvacuation'\s*->>\s*'enabled'\s*=\s*'true'$needle$ then
    raise exception 'single-route video eligibility must not depend on the Smart Multi-Exit toggle';
  end if;
  if position('public.emergency_evacuation_route_fingerprint' in v_video_resolver) = 0 then
    raise exception 'student video delivery must still require the approved route fingerprint';
  end if;
end;
$$;
