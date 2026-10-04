-- Contract and projection assertions for 20261002090000_event_publication_management.sql.
-- Run only against an isolated local/staging database after all migrations.
begin;
do $$
declare
  v_now timestamptz := now();
  v_meta jsonb;
  v_snapshot jsonb;
  v_projected jsonb;
  v_rpc regprocedure;
begin
  v_meta := jsonb_build_object('status','approved','isActive',true,
    'publicationAt',v_now - interval '1 day','dateStart',v_now + interval '1 day','dateEnd',v_now + interval '2 days');
  if not public.event_overlay_is_published(v_meta) then raise exception 'Upcoming event was not published'; end if;
  if public.event_overlay_is_published(v_meta || jsonb_build_object('publicationAt', v_now + interval '1 second')) then raise exception 'Scheduled event was exposed early'; end if;
  if public.event_overlay_is_published(v_meta || jsonb_build_object('dateStart',v_now - interval '1 day','dateEnd',v_now + interval '1 day')) is not true then raise exception 'Ongoing event was hidden'; end if;
  if public.event_overlay_is_published(v_meta || jsonb_build_object('dateStart',v_now - interval '1 day','dateEnd',v_now)) then raise exception 'Event at exact end boundary remained visible'; end if;
  if public.event_overlay_is_published(v_meta || jsonb_build_object('dateStart','2026-02-30T09:00:00Z')) then raise exception 'Impossible schedule was exposed'; end if;
  if public.event_overlay_is_published(v_meta - 'publicationAt') then raise exception 'Legacy event without publication time was exposed'; end if;

  v_snapshot := jsonb_build_object(
    'campus', jsonb_build_object('name','Main','eventOverlays',jsonb_build_array(jsonb_build_object('kind','event_overlay'),jsonb_build_object('kind','venue-note'))),
    'structure', jsonb_build_object('map_elements', jsonb_build_array(
      jsonb_build_object('element_type','custom','metadata',jsonb_build_object('kind','event_overlay')),
      jsonb_build_object('element_type','wall','geometry',jsonb_build_object('points',jsonb_build_array(jsonb_build_array(1,2),jsonb_build_array(3,4))))
    ), 'navigation_edges', jsonb_build_array(jsonb_build_object('id','edge-a')))
  );
  v_projected := public.event_free_campus_snapshot(v_snapshot);
  if v_projected#>'{campus,eventOverlays}' <> '[{"kind":"venue-note"}]'::jsonb then raise exception 'Projection did not preserve non-event campus entries'; end if;
  if jsonb_array_length(v_projected#>'{structure,map_elements}') <> 1 then raise exception 'Projection retained an embedded event row'; end if;
  if v_projected#>'{structure,map_elements,0,geometry}' is distinct from v_snapshot#>'{structure,map_elements,1,geometry}' then raise exception 'Projection changed base map geometry'; end if;
  if v_projected#>'{structure,navigation_edges}' is distinct from v_snapshot#>'{structure,navigation_edges}' then raise exception 'Projection changed navigation edges'; end if;
  if public.event_free_campus_snapshot('{"campus":{"eventOverlays":null}}'::jsonb)#>'{campus,eventOverlays}' <> 'null'::jsonb then raise exception 'Projection did not tolerate null campus path'; end if;
  if public.event_free_campus_snapshot('{"structure":{"map_elements":null}}'::jsonb)#>'{structure,map_elements}' <> 'null'::jsonb then raise exception 'Projection did not tolerate null element path'; end if;

  v_projected := public.event_public_locations('{"locations":[{"locationRef":{"type":"campus","label":"Grounds"}},{"locationRef":{"type":"building","buildingId":"building-b","label":"Hall"}}]}'::jsonb);
  if jsonb_array_length(v_projected) <> 2
     or v_projected#>>'{0,id}' <> 'location-1'
     or v_projected#>>'{1,id}' <> 'location-2'
     or v_projected#>>'{1,locationRef,buildingId}' <> 'building-b' then
    raise exception 'Public location projection did not preserve ordered location identities';
  end if;

  v_snapshot := jsonb_build_object('campus',jsonb_build_object('buildings',jsonb_build_array(
    jsonb_build_object('id','building-a','visible',true,'floors',jsonb_build_array(jsonb_build_object('number',2,'visible',true,'rooms',jsonb_build_array(jsonb_build_object('id','room-a')))))
  )));
  if not public.event_locations_match_snapshot(v_snapshot, '{"locations":[{"locationRef":{"type":"campus","label":"Grounds"}},{"locationRef":{"type":"building","buildingId":"building-a","floorId":"building-a-f2","label":"Floor 2"}}]}'::jsonb) then raise exception 'Published locations did not resolve against the snapshot'; end if;
  if public.event_locations_match_snapshot(v_snapshot, '{"locations":[{"locationRef":{"type":"building","buildingId":"building-a","floorId":"floor-uuid","label":"Wrong floor id"}}]}'::jsonb) then raise exception 'UUID was incorrectly accepted in place of a composite floor id'; end if;
  if public.event_locations_match_snapshot(v_snapshot, '{"locations":[{"locationRef":{"type":"building","buildingId":"missing","floorId":"missing-f2","label":"Other campus"}}]}'::jsonb) then raise exception 'Cross-campus building was accepted'; end if;

  v_projected := public.event_public_locations('{"locations":[{"id":"grounds","locationRef":{"type":"campus","label":"Campus Grounds","createdByUserId":"secret"},"adminComment":"secret","eventFurniture":[{"id":"chair","type":"chair","name":"Chair","category":"seating","x":1,"y":2,"width":3,"height":4,"rotation":0,"color":"#fff","createdByUserId":"secret","assetConfig":{"style":"wood","owner":"secret","nested":{"secret":true}}}],"eventLabels":[{"id":"label","text":"Info","x":1,"y":2,"fontSize":12,"color":"#000","rotation":0,"adminComment":"secret"}]}]}'::jsonb);
  if v_projected#>>'{0,adminComment}' is not null or v_projected#>>'{0,locationRef,createdByUserId}' is not null then raise exception 'Private event location fields were exposed'; end if;
  if v_projected#>>'{0,eventFurniture,0,createdByUserId}' is not null or v_projected#>>'{0,eventLabels,0,adminComment}' is not null then raise exception 'Private nested event fields were exposed'; end if;
  if v_projected#>>'{0,eventFurniture,0,assetConfig,style}' is distinct from 'wood'
     or (v_projected#>'{0,eventFurniture,0,assetConfig}' ? 'owner') then
    raise exception 'Asset configuration was not safely projected';
  end if;

  select p.oid::regprocedure into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_event_layout';
  if v_rpc is null or not (select prosecdef from pg_proc where oid=v_rpc) then raise exception 'Review command is missing SECURITY DEFINER'; end if;
  if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') or has_function_privilege('anon', v_rpc, 'EXECUTE') then raise exception 'Review command grants are incorrect'; end if;
  select p.oid::regprocedure into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='manage_event_publication';
  if v_rpc is null or not (select prosecdef from pg_proc where oid=v_rpc) then raise exception 'Publication command is missing SECURITY DEFINER'; end if;
  if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') or has_function_privilege('anon', v_rpc, 'EXECUTE') then raise exception 'Publication command grants are incorrect'; end if;
  select p.oid::regprocedure into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_published_event_previews';
  if v_rpc is null or not (select prosecdef from pg_proc where oid=v_rpc) then raise exception 'Public feed is missing SECURITY DEFINER'; end if;
  if not has_function_privilege('anon', v_rpc, 'EXECUTE') then raise exception 'Anonymous public feed grant is missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='map_elements' and policyname='map_elements_select_event_overlay' and permissive='PERMISSIVE') then raise exception 'Private raw event read policy is missing'; end if;
end $$;
rollback;
