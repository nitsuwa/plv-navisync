-- B5 Phase 3.1.2: two-phase floor-number writes in save_campus_structure.
--
-- `floors_building_number_uq (building_id, floor_number)` is a TABLE-WIDE
-- unique constraint (it also covers archived rows) and is checked
-- per-statement. A single multi-row `INSERT ... ON CONFLICT (id) DO UPDATE`
-- only resolves conflicts on (id), so it can abort with a duplicate-key error
-- even when the FINAL numbers are unique:
--
--   * number swap/reorder: the payload writes A:1→2 while row B still holds 2
--     (and B moves to 1) — the update of A collides before B is rewritten;
--   * archived/stale rows: a new floor takes a number still held by an
--     archived (deleted) floor from an earlier save — the insert collides
--     because the archived row still occupies the number.
--
-- Fix: before the final upsert, Phase 1 moves every existing row that will be
-- rewritten in place (its id is in the payload with the same building) OR that
-- currently holds a (building_id, floor_number) a payload row claims, to a
-- unique temporary negative number. Phase 2 then writes the final numbers with
-- no intermediate collision, and the trailing archive cleanup retires stale
-- rows exactly as before. The unique constraint is never weakened; existing
-- floor ids are preserved (updated, never recreated).
--
-- The payload is also guarded: duplicate floor ids or duplicate
-- (building_id, floor_number) pairs inside one payload fail early with a clear
-- error instead of a raw constraint violation.

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

  -- Payload sanity: floors must not repeat ids or (building_id, floor_number).
  if exists (
    select 1 from (
      select (value->>'id')::uuid as id
      from jsonb_array_elements(coalesce(p_payload->'floors', '[]'::jsonb))
      group by 1 having count(*) > 1
    ) d
  ) then
    raise exception 'floor payload contains duplicate floor ids' using errcode = '22023';
  end if;
  if exists (
    select 1 from (
      select (value->>'building_id')::uuid as building_id,
             (value->>'floor_number')::integer as floor_number
      from jsonb_array_elements(coalesce(p_payload->'floors', '[]'::jsonb))
      group by 1, 2 having count(*) > 1
    ) d
  ) then
    raise exception 'floor payload contains duplicate (building_id, floor_number) pairs' using errcode = '22023';
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

  -- ── FLOORS: two-phase number resolution ───────────────────────────────────
  -- Move every existing row that will be rewritten in place (id + building
  -- match a payload row — those rows are updated by the upsert below) OR that
  -- currently holds a (building_id, floor_number) a payload row claims (a
  -- stale live/archived row that would block the insert/update) to a unique
  -- temporary number below the current minimum for that building. Archived rows
  -- still participate in `floors_building_number_uq`, so fixed temporary values
  -- such as -1000000001 can become blockers on repeated saves.
  with payload_floors as (
    select (value->>'id')::uuid as id,
           (value->>'building_id')::uuid as building_id,
           (value->>'floor_number')::integer as floor_number
    from jsonb_array_elements(coalesce(p_payload->'floors', '[]'::jsonb))
  ),
  building_floor_min as (
    select f.building_id, least(0, min(f.floor_number)) as min_floor_number
    from public.floors f
    where exists (
      select 1 from payload_floors p
      where p.building_id = f.building_id
    )
    group by f.building_id
  ),
  moves as (
    select f.id,
           b.min_floor_number - row_number() over (partition by f.building_id order by f.id) as temp_number
    from public.floors f
    join building_floor_min b on b.building_id = f.building_id
    where exists (
      select 1 from payload_floors p
      where p.id = f.id and p.building_id = f.building_id
    )
       or exists (
      select 1 from payload_floors p
      where p.building_id = f.building_id
        and p.floor_number = f.floor_number
        and p.id <> f.id
    )
  )
  update public.floors f
  set floor_number = m.temp_number
  from moves m
  where f.id = m.id;

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

  -- navigation_edges_unique_pair_uq covers every row, including rows that were
  -- recoverably closed by an earlier save. If an admin removes an edge and later
  -- recreates the same node pair with a new edge id, a plain upsert-on-id would
  -- collide with that stale closed row before the trailing omission cleanup can
  -- run. Retire only those pair-conflicting non-payload rows physically; the
  -- current payload remains the single authoritative edge for the pair.
  with payload_edges as (
    select id, from_node_id, to_node_id
    from jsonb_to_recordset(coalesce(p_payload->'navigation_edges', '[]'::jsonb)) as x(
      id uuid, from_node_id uuid, to_node_id uuid
    )
  )
  delete from public.navigation_edges existing
  using payload_edges payload
  where existing.campus_id = p_campus_id
    and existing.id <> payload.id
    and existing.from_node_id = payload.from_node_id
    and existing.to_node_id = payload.to_node_id;

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
  'Administrator-only atomic Map Builder save (two-phase floor numbers prevent (building_id, floor_number) mid-write collisions). It is intentionally not public; guest/student reads use published campus_versions snapshots.';
