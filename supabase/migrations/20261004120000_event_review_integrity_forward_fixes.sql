begin;

-- Keep all valid pins visible to the event owner and required by the resubmission gate.
-- This replaces the original decoder for projects that already applied its migration.
create or replace function public.event_feedback_pins(p_metadata jsonb)
returns table(location_id text, pin_id text, feedback text)
language plpgsql immutable set search_path = '' as $$
declare v_entry record; v_data jsonb; v_pin jsonb;
begin
  for v_entry in select * from jsonb_each_text(case when jsonb_typeof(p_metadata->'locationFeedback') = 'object' then p_metadata->'locationFeedback' else '{}'::jsonb end) loop
    if left(v_entry.value, 19) <> '@event-feedback/v1:' then continue; end if;
    begin v_data := substring(v_entry.value from 20)::jsonb;
    exception when invalid_text_representation then continue; end;
    if jsonb_typeof(v_data->'pins') is distinct from 'array' or jsonb_typeof(v_data->'text') is distinct from 'string' then continue; end if;
    for v_pin in select value from jsonb_array_elements(v_data->'pins') loop
      if jsonb_typeof(v_pin->'id') = 'string' and jsonb_typeof(v_pin->'comment') = 'string'
         and btrim(coalesce(v_pin->>'comment', '')) <> '' and jsonb_typeof(v_pin->'x') = 'number' and jsonb_typeof(v_pin->'y') = 'number' then
        if (v_pin->>'x')::numeric >= 0 and (v_pin->>'y')::numeric >= 0 then
          location_id := v_entry.key; pin_id := v_pin->>'id'; feedback := v_entry.value; return next;
        end if;
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.event_feedback_pins(jsonb) from public, anon, authenticated;

-- Reapply the corrected ordered location projection for databases that already
-- recorded the historical migration before its source-location alias was fixed.
create or replace function public.event_public_locations(p_metadata jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with source_locations as (
    select value as location, ordinality
      from jsonb_array_elements(case
        when jsonb_typeof(p_metadata->'locations') = 'array' then p_metadata->'locations'
        when jsonb_typeof(p_metadata->'locationRef') = 'object'
          then jsonb_build_array(jsonb_build_object('id', 'legacy-location', 'locationRef', p_metadata->'locationRef',
            'eventFurniture', coalesce(p_metadata->'eventFurniture', '[]'::jsonb),
            'eventLabels', coalesce(p_metadata->'eventLabels', '[]'::jsonb)))
        else '[]'::jsonb end) with ordinality as locations(value, ordinality)
  ), projected as (
    select jsonb_build_object(
      'id', coalesce(nullif(location->>'id', ''), 'location-' || ordinality::text),
      'locationRef', jsonb_strip_nulls(jsonb_build_object(
        'type', location#>>'{locationRef,type}',
        'label', location#>>'{locationRef,label}',
        'buildingId', location#>>'{locationRef,buildingId}',
        'floorId', location#>>'{locationRef,floorId}',
        'roomId', location#>>'{locationRef,roomId}')),
      'eventFurniture', public.event_public_furniture(location->'eventFurniture'),
      'eventLabels', public.event_public_labels(location->'eventLabels')
    ) as value, ordinality
    from source_locations
  )
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) from projected;
$$;
revoke all on function public.event_public_locations(jsonb) from public;

notify pgrst, 'reload schema';
commit;
