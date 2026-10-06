-- Event overlays are owned by the Event workflow, not the generic Map Builder
-- replacement save. Keep the existing security/ownership wrapper, but remove
-- Event rows from its input before validation/upsert. Also teach its private
-- canonical writer to leave omitted Event rows untouched during stale-row
-- retirement. Event review/publication commands and their guard are unchanged.

do $migration$
declare
  v_definition text;
  v_original text;
  v_replacement text;
begin
  select pg_get_functiondef('public.save_campus_structure(uuid,jsonb)'::regprocedure)
    into v_definition;

  v_original := $source$  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'campus structure payload must be an object' using errcode = '22023';
  end if;$source$;
  v_replacement := $source$  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'campus structure payload must be an object' using errcode = '22023';
  end if;

  -- Ignore stale clients that still include event_overlay rows in the normal
  -- Map Builder payload. Both canonical identity fields are checked because
  -- historical rows may carry either marker.
  p_payload := jsonb_set(
    p_payload,
    '{map_elements}',
    coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(p_payload->'map_elements', '[]'::jsonb))
        with ordinality as payload_rows(item, ordinal)
      where coalesce(item->>'element_type', '') <> 'event_overlay'
        and coalesce(item#>>'{metadata,kind}', '') <> 'event_overlay'
    ), '[]'::jsonb),
    true
  );$source$;

  if position(v_original in v_definition) = 0 then
    raise exception 'save_campus_structure source changed; refusing unsafe Event isolation migration';
  end if;
  v_definition := replace(v_definition, v_original, v_replacement);
  execute v_definition;

  select pg_get_functiondef('public.save_campus_structure_unchecked(uuid,jsonb)'::regprocedure)
    into v_definition;
  v_original := 'where campus_id=p_campus_id and archived_at is null and not (id=any(v_element_ids));';
  v_replacement := 'where campus_id=p_campus_id and archived_at is null and not (id=any(v_element_ids))' ||
    ' and coalesce(element_type, '''') <> ''event_overlay''' ||
    ' and coalesce(metadata->>''kind'', '''') <> ''event_overlay'';';
  if position(v_original in v_definition) = 0 then
    raise exception 'private campus writer source changed; refusing unsafe Event retirement migration';
  end if;
  v_definition := replace(v_definition, v_original, v_replacement);
  execute v_definition;
end;
$migration$;

comment on function public.save_campus_structure(uuid, jsonb) is
  'Administrator-only transactional Map Builder save. Event Overlay rows are filtered from generic writes and excluded from stale-element retirement; Event review/publication commands remain their exclusive writers.';
