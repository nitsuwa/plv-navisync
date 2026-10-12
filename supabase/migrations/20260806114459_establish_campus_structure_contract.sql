-- A5: typed, transactional persistence for the Campus Map Builder.
-- Public clients continue to read immutable campus_versions snapshots only.

alter table public.buildings
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.floors
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.buildings
  add constraint buildings_name_not_blank check (btrim(name) <> ''),
  add constraint buildings_code_not_blank check (btrim(code) <> ''),
  add constraint buildings_rotation_range check (rotation >= 0 and rotation < 360),
  add constraint buildings_metadata_object check (jsonb_typeof(metadata) = 'object');

alter table public.floors
  add constraint floors_name_not_blank check (btrim(name) <> ''),
  add constraint floors_display_order_nonnegative check (display_order >= 0),
  add constraint floors_canvas_dimensions_positive check (canvas_width > 0 and canvas_height > 0),
  add constraint floors_scale_positive check (map_scale_m_per_unit is null or map_scale_m_per_unit > 0),
  add constraint floors_metadata_object check (jsonb_typeof(metadata) = 'object');

alter table public.map_elements
  add constraint map_elements_name_not_blank check (btrim(name) <> ''),
  add constraint map_elements_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  add constraint map_elements_rotation_range check (rotation >= 0 and rotation < 360),
  add constraint map_elements_style_object check (jsonb_typeof(style) = 'object'),
  add constraint map_elements_metadata_object check (metadata is null or jsonb_typeof(metadata) = 'object');

create index if not exists buildings_campus_display_idx
  on public.buildings (campus_id, archived_at, name, id);
create index if not exists floors_building_display_idx
  on public.floors (building_id, archived_at, display_order, floor_number, id);
create index if not exists map_elements_directory_idx
  on public.map_elements (campus_id, element_type, building_id, floor_id)
  where archived_at is null and is_visible and is_searchable;
create index if not exists navigation_nodes_campus_floor_idx
  on public.navigation_nodes (campus_id, floor_id, id)
  where is_active;

create or replace function public.save_campus_structure(
  p_campus_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_building_ids uuid[];
  v_floor_ids uuid[];
  v_element_ids uuid[];
  v_node_ids uuid[];
  v_edge_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'campus structure payload must be an object' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_payload->'buildings', '[]'::jsonb)) > 500
     or jsonb_array_length(coalesce(p_payload->'floors', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload->'map_elements', '[]'::jsonb)) > 25000
     or jsonb_array_length(coalesce(p_payload->'navigation_nodes', '[]'::jsonb)) > 25000
     or jsonb_array_length(coalesce(p_payload->'navigation_edges', '[]'::jsonb)) > 50000 then
    raise exception 'campus structure payload exceeds supported limits' using errcode = '54000';
  end if;

  perform 1 from public.campuses where id = p_campus_id and archived_at is null for update;
  if not found then
    raise exception 'active campus not found' using errcode = 'P0002';
  end if;

  insert into public.buildings (
    id, campus_id, name, code, description, category, x, y, width, height,
    rotation, is_searchable, is_visible, is_accessible, metadata, updated_by, archived_at
  )
  select id, p_campus_id, name, code, description, category, x, y, width, height,
    rotation, is_searchable, is_visible, is_accessible, coalesce(metadata, '{}'::jsonb), auth.uid(), null
  from jsonb_to_recordset(coalesce(p_payload->'buildings', '[]'::jsonb)) as x(
    id uuid, name text, code text, description text, category text, x double precision,
    y double precision, width double precision, height double precision, rotation double precision,
    is_searchable boolean, is_visible boolean, is_accessible boolean, metadata jsonb
  )
  on conflict (id) do update set
    name=excluded.name, code=excluded.code, description=excluded.description,
    category=excluded.category, x=excluded.x, y=excluded.y, width=excluded.width,
    height=excluded.height, rotation=excluded.rotation, is_searchable=excluded.is_searchable,
    is_visible=excluded.is_visible, is_accessible=excluded.is_accessible,
    metadata=excluded.metadata, updated_by=auth.uid(), updated_at=now(), archived_at=null
  where public.buildings.campus_id = p_campus_id;
  select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into v_building_ids
    from jsonb_array_elements(coalesce(p_payload->'buildings', '[]'::jsonb));

  insert into public.floors (
    id, building_id, name, floor_number, display_order, canvas_width, canvas_height,
    map_scale_m_per_unit, is_visible, metadata, archived_at
  )
  select id, building_id, name, floor_number, display_order, canvas_width, canvas_height,
    map_scale_m_per_unit, is_visible, coalesce(metadata, '{}'::jsonb), null
  from jsonb_to_recordset(coalesce(p_payload->'floors', '[]'::jsonb)) as x(
    id uuid, building_id uuid, name text, floor_number integer, display_order integer,
    canvas_width integer, canvas_height integer, map_scale_m_per_unit numeric,
    is_visible boolean, metadata jsonb
  )
  on conflict (id) do update set
    name=excluded.name, floor_number=excluded.floor_number, display_order=excluded.display_order,
    canvas_width=excluded.canvas_width, canvas_height=excluded.canvas_height,
    map_scale_m_per_unit=excluded.map_scale_m_per_unit, is_visible=excluded.is_visible,
    metadata=excluded.metadata, updated_at=now(), archived_at=null
  where public.floors.building_id = excluded.building_id;
  select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into v_floor_ids
    from jsonb_array_elements(coalesce(p_payload->'floors', '[]'::jsonb));

  insert into public.map_elements (
    id, campus_id, building_id, floor_id, element_type, name, code, description,
    search_keywords, x, y, width, height, rotation, z_index, geometry, style, metadata,
    is_accessible, is_emergency_asset, is_searchable, is_visible, archived_at
  )
  select id, p_campus_id, building_id, floor_id, element_type, name, code, description,
    coalesce(search_keywords, '{}'::text[]), x, y, width, height, rotation, z_index,
    geometry, coalesce(style, '{}'::jsonb), metadata, is_accessible,
    is_emergency_asset, is_searchable, is_visible, null
  from jsonb_to_recordset(coalesce(p_payload->'map_elements', '[]'::jsonb)) as x(
    id uuid, building_id uuid, floor_id uuid, element_type text, name text, code text,
    description text, search_keywords text[], x double precision, y double precision,
    width double precision, height double precision, rotation double precision, z_index integer,
    geometry jsonb, style jsonb, metadata jsonb, is_accessible boolean,
    is_emergency_asset boolean, is_searchable boolean, is_visible boolean
  )
  on conflict (id) do update set
    building_id=excluded.building_id, floor_id=excluded.floor_id, element_type=excluded.element_type,
    name=excluded.name, code=excluded.code, description=excluded.description,
    search_keywords=excluded.search_keywords, x=excluded.x, y=excluded.y, width=excluded.width,
    height=excluded.height, rotation=excluded.rotation, z_index=excluded.z_index,
    geometry=excluded.geometry, style=excluded.style, metadata=excluded.metadata,
    is_accessible=excluded.is_accessible, is_emergency_asset=excluded.is_emergency_asset,
    is_searchable=excluded.is_searchable, is_visible=excluded.is_visible,
    updated_at=now(), archived_at=null
  where public.map_elements.campus_id = p_campus_id;
  select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into v_element_ids
    from jsonb_array_elements(coalesce(p_payload->'map_elements', '[]'::jsonb));

  insert into public.navigation_nodes (
    id, campus_id, building_id, floor_id, map_element_id, node_type, name, x, y,
    is_accessible, is_emergency_safe, is_active, metadata
  )
  select id, p_campus_id, building_id, floor_id, map_element_id, node_type, name, x, y,
    is_accessible, is_emergency_safe, is_active, metadata
  from jsonb_to_recordset(coalesce(p_payload->'navigation_nodes', '[]'::jsonb)) as x(
    id uuid, building_id uuid, floor_id uuid, map_element_id uuid, node_type text,
    name text, x double precision, y double precision, is_accessible boolean,
    is_emergency_safe boolean, is_active boolean, metadata jsonb
  )
  on conflict (id) do update set
    building_id=excluded.building_id, floor_id=excluded.floor_id,
    map_element_id=excluded.map_element_id, node_type=excluded.node_type, name=excluded.name,
    x=excluded.x, y=excluded.y, is_accessible=excluded.is_accessible,
    is_emergency_safe=excluded.is_emergency_safe, is_active=excluded.is_active,
    metadata=excluded.metadata, updated_at=now()
  where public.navigation_nodes.campus_id = p_campus_id;
  select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into v_node_ids
    from jsonb_array_elements(coalesce(p_payload->'navigation_nodes', '[]'::jsonb));

  insert into public.navigation_edges (
    id, campus_id, from_node_id, to_node_id, distance_m, weight, edge_type,
    is_bidirectional, is_accessible, is_emergency_safe, is_temporarily_closed, metadata
  )
  select id, p_campus_id, from_node_id, to_node_id, distance_m, weight, edge_type,
    is_bidirectional, is_accessible, is_emergency_safe, is_temporarily_closed, metadata
  from jsonb_to_recordset(coalesce(p_payload->'navigation_edges', '[]'::jsonb)) as x(
    id uuid, from_node_id uuid, to_node_id uuid, distance_m numeric, weight numeric,
    edge_type text, is_bidirectional boolean, is_accessible boolean,
    is_emergency_safe boolean, is_temporarily_closed boolean, metadata jsonb
  )
  on conflict (id) do update set
    from_node_id=excluded.from_node_id, to_node_id=excluded.to_node_id,
    distance_m=excluded.distance_m, weight=excluded.weight, edge_type=excluded.edge_type,
    is_bidirectional=excluded.is_bidirectional, is_accessible=excluded.is_accessible,
    is_emergency_safe=excluded.is_emergency_safe,
    is_temporarily_closed=excluded.is_temporarily_closed, closure_reason=null,
    metadata=excluded.metadata, updated_at=now()
  where public.navigation_edges.campus_id = p_campus_id;
  select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into v_edge_ids
    from jsonb_array_elements(coalesce(p_payload->'navigation_edges', '[]'::jsonb));

  -- Omitted records are recoverably retired, never physically deleted. This
  -- protects against partial/stale browser payloads while retaining a clean
  -- active authoring view and allowing the same IDs to be restored later.
  update public.navigation_edges set is_temporarily_closed=true,
    closure_reason='Removed from the current authoring draft', updated_at=now()
    where campus_id=p_campus_id and not (id=any(v_edge_ids));
  update public.navigation_nodes set is_active=false, updated_at=now()
    where campus_id=p_campus_id and not (id=any(v_node_ids));
  update public.map_elements set archived_at=now(), updated_at=now()
    where campus_id=p_campus_id and archived_at is null and not (id=any(v_element_ids));
  update public.floors f set archived_at=now(), updated_at=now()
    from public.buildings b where f.building_id=b.id and b.campus_id=p_campus_id
      and f.archived_at is null and not (f.id=any(v_floor_ids));
  update public.buildings set archived_at=now(), updated_at=now()
    where campus_id=p_campus_id and archived_at is null and not (id=any(v_building_ids));

  return jsonb_build_object(
    'buildings', cardinality(v_building_ids), 'floors', cardinality(v_floor_ids),
    'map_elements', cardinality(v_element_ids), 'navigation_nodes', cardinality(v_node_ids),
    'navigation_edges', cardinality(v_edge_ids)
  );
end;
$$;

comment on function public.save_campus_structure(uuid, jsonb) is
  'Administrator-only atomic Map Builder save. It is intentionally not public; guest/student reads use published campus_versions snapshots.';

revoke all on table public.buildings, public.floors, public.map_elements,
  public.navigation_nodes, public.navigation_edges from anon, authenticated;
grant select, insert, update, delete on table public.buildings, public.floors,
  public.map_elements, public.navigation_nodes, public.navigation_edges to authenticated;
grant all on table public.buildings, public.floors, public.map_elements,
  public.navigation_nodes, public.navigation_edges to service_role;

revoke execute on function public.save_campus_structure(uuid, jsonb) from public, anon;
grant execute on function public.save_campus_structure(uuid, jsonb) to authenticated, service_role;
