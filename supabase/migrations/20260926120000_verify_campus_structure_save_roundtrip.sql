-- A guarded wrapper makes the existing replacement RPC prove that every row
-- in its input payload is active and owned by this Campus before the outer
-- transaction can commit. The previous ON CONFLICT ... WHERE clauses can
-- otherwise skip an ID already owned by another Campus without raising.
alter function public.save_campus_structure(uuid, jsonb)
  rename to save_campus_structure_unchecked;

revoke all on function public.save_campus_structure_unchecked(uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.save_campus_structure(
  p_campus_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_expected bigint;
  v_persisted bigint;
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'campus structure payload must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1 from (
      select (value->>'id')::uuid as id
      from jsonb_array_elements(coalesce(p_payload->'map_elements', '[]'::jsonb))
      group by 1 having count(*) > 1
    ) duplicated
  ) then
    raise exception 'map element payload contains duplicate IDs' using errcode = '22023';
  end if;

  if exists (
    select 1 from (select (value->>'id')::uuid as id from jsonb_array_elements(coalesce(p_payload->'buildings', '[]'::jsonb)) group by 1 having count(*) > 1) duplicated
  ) then raise exception 'Building payload contains duplicate IDs' using errcode = '22023'; end if;
  if exists (
    select 1 from (select (value->>'id')::uuid as id from jsonb_array_elements(coalesce(p_payload->'floors', '[]'::jsonb)) group by 1 having count(*) > 1) duplicated
  ) then raise exception 'Floor payload contains duplicate IDs' using errcode = '22023'; end if;
  if exists (
    select 1 from (select (value->>'id')::uuid as id from jsonb_array_elements(coalesce(p_payload->'navigation_nodes', '[]'::jsonb)) group by 1 having count(*) > 1) duplicated
  ) then raise exception 'navigation node payload contains duplicate IDs' using errcode = '22023'; end if;
  if exists (
    select 1 from (select (value->>'id')::uuid as id from jsonb_array_elements(coalesce(p_payload->'navigation_edges', '[]'::jsonb)) group by 1 having count(*) > 1) duplicated
  ) then raise exception 'navigation edge payload contains duplicate IDs' using errcode = '22023'; end if;

  -- Reject globally unique-ID conflicts before the original upsert can
  -- silently skip them through ON CONFLICT ... WHERE owner = p_campus_id.
  -- Archived rows remain owners of their IDs and are intentionally included.
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'buildings', '[]'::jsonb)) as x(id uuid)
    join public.buildings existing on existing.id = x.id
    where existing.campus_id is distinct from p_campus_id
  ) then raise exception 'Building ID ownership collision with another Campus' using errcode = '23505'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'floors', '[]'::jsonb)) as x(id uuid, building_id uuid)
    join public.floors existing on existing.id = x.id
    left join public.buildings owner on owner.id = existing.building_id
    where existing.building_id is distinct from x.building_id
       or owner.campus_id is distinct from p_campus_id
  ) then raise exception 'Floor ID ownership collision with another Building or Campus' using errcode = '23505'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'map_elements', '[]'::jsonb)) as x(id uuid, building_id uuid, floor_id uuid)
    join public.map_elements existing on existing.id = x.id
    where existing.campus_id is distinct from p_campus_id
       or existing.building_id is distinct from x.building_id
       or existing.floor_id is distinct from x.floor_id
  ) then raise exception 'Map element ID ownership collision with another Campus, Building, or Floor' using errcode = '23505'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'navigation_nodes', '[]'::jsonb)) as x(id uuid)
    join public.navigation_nodes existing on existing.id = x.id
    where existing.campus_id is distinct from p_campus_id
  ) then raise exception 'Navigation node ID ownership collision with another Campus' using errcode = '23505'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'navigation_edges', '[]'::jsonb)) as x(id uuid)
    join public.navigation_edges existing on existing.id = x.id
    where existing.campus_id is distinct from p_campus_id
  ) then raise exception 'Navigation edge ID ownership collision with another Campus' using errcode = '23505'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'floors', '[]'::jsonb)) as x(id uuid, building_id uuid)
    where not exists (
      select 1 from jsonb_to_recordset(coalesce(p_payload->'buildings', '[]'::jsonb)) as b(id uuid)
      where b.id = x.building_id
    )
  ) then raise exception 'Floor payload refers to a Building missing from the same Campus payload' using errcode = '23514'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'map_elements', '[]'::jsonb)) as x(id uuid, building_id uuid, floor_id uuid)
    where x.floor_id is not null and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_payload->'floors', '[]'::jsonb)) as f(id uuid, building_id uuid)
      where f.id = x.floor_id and f.building_id = x.building_id
    )
  ) then raise exception 'Map element payload has inconsistent Building/Floor ownership' using errcode = '23514'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_payload->'map_elements', '[]'::jsonb)) as x(id uuid, building_id uuid, floor_id uuid)
    where x.building_id is not null and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_payload->'buildings', '[]'::jsonb)) as b(id uuid)
      where b.id = x.building_id
    )
  ) then raise exception 'Map element payload refers to a Building missing from the same Campus payload' using errcode = '23514'; end if;

  -- The original RPC remains the single writer and performs all upserts and
  -- omission archiving. Calling it here keeps those writes inside this outer
  -- transaction; any failed verification below rolls the entire save back.
  v_result := public.save_campus_structure_unchecked(p_campus_id, p_payload);

  select count(*) into v_expected
  from jsonb_to_recordset(coalesce(p_payload->'buildings', '[]'::jsonb)) as x(id uuid);
  select count(*) into v_persisted
  from jsonb_to_recordset(coalesce(p_payload->'buildings', '[]'::jsonb)) as x(id uuid)
  join public.buildings b on b.id = x.id and b.campus_id = p_campus_id and b.archived_at is null;
  if v_persisted <> v_expected then
    raise exception 'campus save verification failed: persisted % of % Building rows', v_persisted, v_expected using errcode = '23514';
  end if;

  select count(*) into v_expected
  from jsonb_to_recordset(coalesce(p_payload->'floors', '[]'::jsonb)) as x(id uuid, building_id uuid);
  select count(*) into v_persisted
  from jsonb_to_recordset(coalesce(p_payload->'floors', '[]'::jsonb)) as x(id uuid, building_id uuid)
  join public.floors f on f.id = x.id and f.building_id = x.building_id and f.archived_at is null
  join public.buildings b on b.id = f.building_id and b.campus_id = p_campus_id and b.archived_at is null;
  if v_persisted <> v_expected then
    raise exception 'campus save verification failed: persisted % of % Floor rows', v_persisted, v_expected using errcode = '23514';
  end if;

  select count(*) into v_expected
  from jsonb_to_recordset(coalesce(p_payload->'map_elements', '[]'::jsonb)) as x(id uuid);
  select count(*) into v_persisted
  from jsonb_to_recordset(coalesce(p_payload->'map_elements', '[]'::jsonb)) as x(
    id uuid, building_id uuid, floor_id uuid
  )
  join public.map_elements m on m.id = x.id
    and m.campus_id = p_campus_id
    and m.building_id is not distinct from x.building_id
    and m.floor_id is not distinct from x.floor_id
    and m.archived_at is null;
  if v_persisted <> v_expected then
    raise exception 'campus save verification failed: persisted % of % map_elements rows', v_persisted, v_expected using errcode = '23514';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.save_campus_structure(uuid, jsonb) from public, anon;
grant execute on function public.save_campus_structure(uuid, jsonb) to authenticated, service_role;

comment on function public.save_campus_structure(uuid, jsonb) is
  'Administrator-only transactional Map Builder save. Wraps the canonical writer and rolls back if any submitted Building, Floor, or map element was skipped or returned with the wrong Campus ownership.';
