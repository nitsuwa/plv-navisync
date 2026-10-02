-- Run after migrations on a disposable/local database, never changes live data.
begin;
do $$
declare hidden jsonb; projected jsonb;
begin
 hidden := '{"status":"approved","isActive":true,"dateStart":"2099-10-01T00:00:00Z","dateEnd":"2099-10-02T00:00:00Z","publicationAt":"2099-09-30T00:00:00Z"}';
 if public.event_overlay_is_published(hidden) then raise exception 'Future publication was exposed'; end if;
 if public.event_overlay_is_published('{"status":"approved","dateStart":"2000-01-01T00:00:00Z","dateEnd":"2000-01-02T00:00:00Z"}') then raise exception 'Expired event was exposed'; end if;
 if public.event_overlay_is_published('{"status":"approved"}') then raise exception 'Undated legacy event was exposed'; end if;
 projected := public.event_free_campus_snapshot('{"campus":{"name":"Main","eventOverlays":[{"status":"draft"}]},"structure":{"map_elements":[{"element_type":"custom","metadata":{"kind":"event_overlay","status":"draft"}},{"element_type":"wall","metadata":{"kind":"wall"}}]}}');
 if projected#>'{campus,eventOverlays}' is not null then raise exception 'Snapshot event metadata leaked'; end if;
 if jsonb_array_length(projected#>'{structure,map_elements}') <> 1 then raise exception 'Projection changed base map geometry'; end if;
 if not exists(select 1 from pg_policies where tablename='map_elements' and policyname='map_elements_event_publication_guard' and permissive='RESTRICTIVE' and roles @> array['authenticated']::name[]) then raise exception 'Missing restrictive student publication access guard'; end if;
 if not exists(select 1 from pg_policies where tablename='map_elements' and policyname='map_elements_event_publication_guest_guard' and permissive='RESTRICTIVE' and roles @> array['anon']::name[]) then raise exception 'Missing guest publication access guard'; end if;
end $$;
rollback;
