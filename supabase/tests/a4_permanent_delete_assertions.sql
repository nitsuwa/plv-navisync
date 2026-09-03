-- Permanent campus deletion contract assertions. Every fixture is rolled back.
-- Run after applying 20260828120000_permanent_campus_delete.sql.
-- Storage cleanup is deliberately not asserted through storage.objects here;
-- the frontend lifecycle service covers Storage API listing/removal because
-- the relational RPC must never mutate Supabase Storage metadata directly.
begin;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin' and is_active) then
    raise exception 'permanent-delete test requires one active admin fixture';
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id from public.profiles where role = 'admin' and is_active limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

insert into public.campuses (id, name, code, status, canvas_width, canvas_height)
values
  ('a4100000-0000-4000-8000-000000000001', 'A4 Delete Target', 'A4DEL', 'archived', 900, 600),
  ('a4100000-0000-4000-8000-000000000002', 'A4 Delete Sibling', 'A4SIB', 'archived', 900, 600),
  ('a4100000-0000-4000-8000-000000000003', 'A4 Active Guard', 'A4ACT', 'draft', 900, 600);

insert into public.buildings (id, campus_id, name, code, category, width, height)
values
  ('a4200000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'Target Building', 'TB', 'academic', 100, 80),
  ('a4200000-0000-4000-8000-000000000002', 'a4100000-0000-4000-8000-000000000002', 'Sibling Building', 'SB', 'academic', 100, 80);

insert into public.floors (id, building_id, name, floor_number)
values ('a4300000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'Ground', 1);

insert into public.map_elements (
  id, campus_id, building_id, floor_id, element_type, name, x, y, width, height
)
values (
  'a4400000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000001',
  'a4200000-0000-4000-8000-000000000001',
  'a4300000-0000-4000-8000-000000000001',
  'room', 'Target Room', 10, 10, 20, 20
);

insert into public.navigation_nodes (
  id, campus_id, building_id, floor_id, map_element_id, node_type, x, y
)
values
  ('a4500000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'destination', 10, 10),
  ('a4500000-0000-4000-8000-000000000002', 'a4100000-0000-4000-8000-000000000001', 'a4200000-0000-4000-8000-000000000001', 'a4300000-0000-4000-8000-000000000001', null, 'waypoint', 30, 30);

insert into public.navigation_edges (
  id, campus_id, from_node_id, to_node_id, distance_m, edge_type
)
values ('a4600000-0000-4000-8000-000000000001', 'a4100000-0000-4000-8000-000000000001', 'a4500000-0000-4000-8000-000000000001', 'a4500000-0000-4000-8000-000000000002', 20, 'walkway');

insert into public.reports (
  id, reporter_id, campus_id, category, title, description
)
values (
  'a4700000-0000-4000-8000-000000000001',
  (select id from public.profiles where role = 'admin' and is_active limit 1),
  'a4100000-0000-4000-8000-000000000001',
  'other', 'Delete test report', 'Report history should survive as a detached record.'
);

-- Published snapshots are protected from normal deletes. Insert this fixture
-- as the database owner, then exercise removal through the RPC as an admin.
set local role postgres;
insert into public.campus_versions (
  id, campus_id, version_number, state, snapshot, created_by, published_by, published_at
)
values (
  'a4800000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000001',
  1, 'published', '{}'::jsonb,
  (select id from public.profiles where role = 'admin' and is_active limit 1),
  (select id from public.profiles where role = 'admin' and is_active limit 1),
  now()
);
reset role;
set local role authenticated;

select public.permanently_delete_campus('a4100000-0000-4000-8000-000000000001');

do $$
begin
  if exists (select 1 from public.campuses where id = 'a4100000-0000-4000-8000-000000000001') then raise exception 'deleted campus still exists'; end if;
  if exists (select 1 from public.buildings where campus_id = 'a4100000-0000-4000-8000-000000000001') then raise exception 'building was orphaned'; end if;
  if exists (select 1 from public.map_elements where campus_id = 'a4100000-0000-4000-8000-000000000001') then raise exception 'map element was orphaned'; end if;
  if exists (select 1 from public.navigation_nodes where campus_id = 'a4100000-0000-4000-8000-000000000001') then raise exception 'navigation node was orphaned'; end if;
  if exists (select 1 from public.navigation_edges where campus_id = 'a4100000-0000-4000-8000-000000000001') then raise exception 'navigation edge was orphaned'; end if;
  if exists (select 1 from public.campus_versions where campus_id = 'a4100000-0000-4000-8000-000000000001') then raise exception 'campus version was orphaned'; end if;
  if not exists (select 1 from public.reports where id = 'a4700000-0000-4000-8000-000000000001' and campus_id is null) then raise exception 'report history was not detached'; end if;
  if not exists (select 1 from public.campuses where id = 'a4100000-0000-4000-8000-000000000002') then raise exception 'unrelated campus was affected'; end if;
  if not exists (select 1 from public.buildings where campus_id = 'a4100000-0000-4000-8000-000000000002') then raise exception 'unrelated building was affected'; end if;
end $$;

do $$
begin
  begin
    perform public.permanently_delete_campus('a4100000-0000-4000-8000-000000000003');
    raise exception 'active campus deletion unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  if not exists (select 1 from public.campuses where id = 'a4100000-0000-4000-8000-000000000003') then
    raise exception 'failed active-campus delete was not atomic';
  end if;
end $$;

rollback;
