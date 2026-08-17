-- Admin operational screens subscribe to these existing normalized tables.
-- Publication membership is idempotent so restored or partially configured
-- projects can apply this corrective migration safely.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profiles',
    'campuses',
    'buildings',
    'floors',
    'map_elements',
    'navigation_nodes',
    'navigation_edges',
    'reports',
    'report_history',
    'events',
    'event_locations',
    'event_stalls',
    'announcements',
    'announcement_locations',
    'system_settings',
    'activity_logs',
    'favorites',
    'recent_destinations'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    end if;
  end loop;
end
$$;
