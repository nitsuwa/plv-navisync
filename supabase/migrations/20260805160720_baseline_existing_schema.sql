-- PLV NaviSync live-schema baseline marker.
--
-- The reviewed schema in 001_create_plv_navisync_schema.sql was already
-- applied to the shared development project before migration history was
-- initialized. This migration deliberately performs no CREATE/ALTER/DROP.
-- It fails unless the expected application tables and Storage buckets already
-- exist, allowing the existing live schema to be recorded without replaying
-- the destructive baseline.

do $$
declare
  expected_table text;
  expected_bucket text;
begin
  foreach expected_table in array array[
    'profiles',
    'campuses',
    'campus_versions',
    'buildings',
    'floors',
    'map_elements',
    'navigation_nodes',
    'navigation_edges',
    'events',
    'event_locations',
    'announcements',
    'announcement_locations',
    'reports',
    'report_images',
    'report_history',
    'favorites',
    'validation_runs',
    'validation_issues',
    'system_settings',
    'activity_logs'
  ]
  loop
    if to_regclass(format('public.%I', expected_table)) is null then
      raise exception 'Cannot establish baseline: missing public.%', expected_table;
    end if;
  end loop;

  foreach expected_bucket in array array[
    'avatars',
    'building-images',
    'floor-plans',
    'report-images',
    'event-images'
  ]
  loop
    if not exists (
      select 1
      from storage.buckets
      where id = expected_bucket
    ) then
      raise exception 'Cannot establish baseline: missing Storage bucket %', expected_bucket;
    end if;
  end loop;
end;
$$;
