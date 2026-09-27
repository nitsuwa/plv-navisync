-- Regression: map_elements.id is globally unique. A save payload that reuses
-- an ID owned by another Campus must fail inside the RPC before any upsert or
-- omission archival can commit.
begin;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin' and is_active) then
    raise exception 'A5 ownership-collision test requires an active admin fixture';
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role = 'admin' and is_active limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into public.campuses (id, name, code, status, canvas_width, canvas_height)
values
  ('a5100000-0000-4000-8000-000000000001', 'A5 Save Target', 'A5TARGET', 'draft', 900, 600),
  ('a5100000-0000-4000-8000-000000000002', 'A5 Save Owner', 'A5OWNER', 'draft', 900, 600);

insert into public.buildings (id, campus_id, name, code, category, width, height)
values ('a5200000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000002', 'Owner Building', 'A5OWN', 'academic', 100, 80);

insert into public.floors (id, building_id, name, floor_number)
values ('a5300000-0000-4000-8000-000000000002', 'a5200000-0000-4000-8000-000000000002', 'Owner Floor', 1);

insert into public.map_elements (id, campus_id, building_id, floor_id, element_type, name, x, y, width, height)
values ('a5400000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000002', 'a5200000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000002', 'room', 'Owner Room', 10, 10, 30, 30);

do $$
declare
  v_message text;
begin
  begin
    perform public.save_campus_structure(
      'a5100000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'buildings', jsonb_build_array(jsonb_build_object('id', 'a5200000-0000-4000-8000-000000000003')),
        'floors', jsonb_build_array(jsonb_build_object('id', 'a5300000-0000-4000-8000-000000000003', 'building_id', 'a5200000-0000-4000-8000-000000000003')),
        'map_elements', jsonb_build_array(jsonb_build_object(
          'id', 'a5400000-0000-4000-8000-000000000001',
          'building_id', 'a5200000-0000-4000-8000-000000000003',
          'floor_id', 'a5300000-0000-4000-8000-000000000003'
        )),
        'navigation_nodes', '[]'::jsonb,
        'navigation_edges', '[]'::jsonb
      )
    );
    raise exception 'cross-Campus map element ID collision unexpectedly saved';
  exception when unique_violation then
    get stacked diagnostics v_message = message_text;
    if position('Map element ID ownership collision' in v_message) = 0 then raise; end if;
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from public.map_elements
    where id = 'a5400000-0000-4000-8000-000000000001'
      and campus_id = 'a5100000-0000-4000-8000-000000000002'
      and archived_at is null
  ) then
    raise exception 'collision attempt modified or archived the original map element';
  end if;
  if exists (select 1 from public.buildings where id = 'a5200000-0000-4000-8000-000000000003') then
    raise exception 'collision attempt partially wrote the target Building';
  end if;
end $$;

rollback;
