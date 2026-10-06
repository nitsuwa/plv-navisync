-- Regression for Map Builder/Event ownership isolation.
-- Run against an isolated local/staging database after all migrations.
begin;

do $$
begin
  if not exists (select 1 from public.profiles where role in ('admin', 'super_admin') and is_active) then
    raise exception 'A7 Event isolation test requires an active administrator fixture';
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role in ('admin', 'super_admin') and is_active order by role limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into public.campuses (id, name, code, status, canvas_width, canvas_height)
values ('a7100000-0000-4000-8000-000000000001', 'A7 Event Isolation', 'A7EVENT', 'draft', 900, 600);

insert into public.buildings (id, campus_id, name, code, category, x, y, width, height)
values ('a7200000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'Building A', 'A7A', 'academic', 10, 20, 100, 80);

insert into public.map_elements (id, campus_id, element_type, name, x, y, width, height, rotation, metadata)
values
  ('a7400000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'custom', 'Decor Asset', 10, 20, 12, 12, 0, '{"kind":"decor"}'::jsonb);

-- Seed representative Event-owned records using the same transaction-local
-- authorization marker used by the dedicated Event administrator RPCs.
select set_config('app.event_admin_command', 'on', true);
insert into public.map_elements (
  id, campus_id, element_type, name, x, y, width, height, rotation, metadata
) values
  ('a7400000-0000-4000-8000-000000000011', 'a7100000-0000-4000-8000-000000000001', 'event_overlay', 'Draft event', 1, 2, 1, 1, 0,
    '{"kind":"event_overlay","status":"draft","title":"Draft event"}'::jsonb),
  ('a7400000-0000-4000-8000-000000000012', 'a7100000-0000-4000-8000-000000000001', 'custom', 'Pending event', 3, 4, 1, 1, 0,
    '{"kind":"event_overlay","status":"pending","title":"Pending event"}'::jsonb),
  ('a7400000-0000-4000-8000-000000000013', 'a7100000-0000-4000-8000-000000000001', 'event_overlay', 'Approved event', 5, 6, 1, 1, 0,
    jsonb_build_object('kind','event_overlay','status','approved','title','Approved event','isActive',true,
      'publicationAt',now(),
      'dateStart',now() + interval '1 day','dateEnd',now() + interval '2 days'));
-- The protected insert is complete. Turn the Event-only authorization marker
-- off before exercising the generic Map Builder RPC.
select set_config('app.event_admin_command', '', true);

do $$
declare
  v_before jsonb;
  v_after jsonb;
  v_pending_updated_at timestamptz;
  v_approved_updated_at timestamptz;
  v_result jsonb;
begin
  select jsonb_agg(to_jsonb(item) order by item.id) into v_before
    from public.map_elements item
   where item.campus_id = 'a7100000-0000-4000-8000-000000000001'
     and (item.element_type = 'event_overlay' or item.metadata->>'kind' = 'event_overlay');
  select updated_at into v_pending_updated_at from public.map_elements where id = 'a7400000-0000-4000-8000-000000000012';
  select updated_at into v_approved_updated_at from public.map_elements where id = 'a7400000-0000-4000-8000-000000000013';

  -- Deliberately include malicious/stale Event rows in the payload. The RPC
  -- must discard both marker forms and preserve their database rows exactly.
  v_result := public.save_campus_structure(
    'a7100000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'buildings', jsonb_build_array(jsonb_build_object(
        'id','a7200000-0000-4000-8000-000000000001','name','Building A','code','A7A','category','academic',
        'x',111,'y',20,'width',100,'height',80,'rotation',0,'is_searchable',true,'is_visible',true,'is_accessible',false,'metadata','{}'::jsonb)),
      'floors','[]'::jsonb,
      'map_elements', jsonb_build_array(
        jsonb_build_object('id','a7400000-0000-4000-8000-000000000001','building_id',null,'floor_id',null,'element_type','custom',
          'name','Decor Asset','x',222,'y',20,'width',12,'height',12,'rotation',0,'z_index',0,'geometry',null,'style','{}'::jsonb,
          'metadata','{"kind":"decor"}'::jsonb,'is_accessible',false,'is_emergency_asset',false,'is_searchable',false,'is_visible',true),
        jsonb_build_object('id','a7400000-0000-4000-8000-000000000011','element_type','event_overlay','name','Tampered draft',
          'x',999,'y',999,'width',1,'height',1,'rotation',0,'metadata','{"kind":"event_overlay","status":"approved"}'::jsonb),
        jsonb_build_object('id','a7400000-0000-4000-8000-000000000012','element_type','custom','name','Tampered pending',
          'x',999,'y',999,'width',1,'height',1,'rotation',0,'metadata','{"kind":"event_overlay","status":"draft"}'::jsonb)
      ),
      'navigation_nodes','[]'::jsonb,
      'navigation_edges','[]'::jsonb
    )
  );

  if v_result->>'buildings' <> '1' then raise exception 'Ordinary campus save did not report the Building write'; end if;
  if (select x from public.buildings where id = 'a7200000-0000-4000-8000-000000000001') <> 111 then
    raise exception 'Ordinary Building movement did not persist';
  end if;
  if (select x from public.map_elements where id = 'a7400000-0000-4000-8000-000000000001') <> 222 then
    raise exception 'Ordinary decorative asset movement did not persist';
  end if;

  select jsonb_agg(to_jsonb(item) order by item.id) into v_after
    from public.map_elements item
   where item.campus_id = 'a7100000-0000-4000-8000-000000000001'
     and (item.element_type = 'event_overlay' or item.metadata->>'kind' = 'event_overlay');
  if v_after is distinct from v_before then
    raise exception 'Generic campus save mutated, archived, or removed an Event row';
  end if;
  if (select count(*) from public.map_elements where campus_id = 'a7100000-0000-4000-8000-000000000001'
       and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')) <> 3 then
    raise exception 'Generic campus save did not preserve every Event row';
  end if;

  -- The purpose-built commands remain the only path for changing review and
  -- publication state after the generic save has been proven isolated.
  perform public.review_event_layout(
    'a7400000-0000-4000-8000-000000000012', v_pending_updated_at, 'disapproved',
    null, null, null, null, 'Test feedback', null
  );
  if (select metadata->>'status' from public.map_elements where id = 'a7400000-0000-4000-8000-000000000012') <> 'disapproved' then
    raise exception 'Dedicated Event review command did not update the pending event';
  end if;

  perform public.manage_event_publication(
    'a7400000-0000-4000-8000-000000000013', v_approved_updated_at, 'unpublish', null
  );
  if (select metadata->>'isActive' from public.map_elements where id = 'a7400000-0000-4000-8000-000000000013') <> 'false' then
    raise exception 'Dedicated Event publication command did not unpublish the approved event';
  end if;
end $$;

rollback;
