-- Atomic event review/publication and an allowlisted student preview feed.
-- This is a forward migration; published campus snapshots remain immutable.

create or replace function public.event_overlay_is_published(metadata jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_publication timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  if coalesce(metadata->>'status', '') <> 'approved'
     or coalesce((metadata->>'isActive')::boolean, true) is not true
     or nullif(metadata->>'publicationAt', '') is null
     or nullif(metadata->>'dateStart', '') is null
     or nullif(metadata->>'dateEnd', '') is null then
    return false;
  end if;
  v_publication := (metadata->>'publicationAt')::timestamptz;
  v_start := (metadata->>'dateStart')::timestamptz;
  v_end := (metadata->>'dateEnd')::timestamptz;
  return v_start < v_end and v_publication < v_end
     and v_publication <= now() and v_end > now();
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;
revoke all on function public.event_overlay_is_published(jsonb) from public;
grant execute on function public.event_overlay_is_published(jsonb) to anon, authenticated;

-- Validate the editor's composite building-floor identity against the latest
-- published authored campus. Floor IDs are `${buildingId}-f${floorNumber}`;
-- they are deliberately not treated as PostgreSQL UUIDs.
create or replace function public.event_locations_match_snapshot(p_snapshot jsonb, p_metadata jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_locations jsonb;
  v_location jsonb;
  v_ref jsonb;
  v_building jsonb;
  v_floor jsonb;
  v_room jsonb;
  v_building_id text;
  v_floor_id text;
  v_floor_number text;
  v_room_id text;
  v_count integer := 0;
  v_seen text[] := '{}'::text[];
  v_key text;
begin
  v_locations := p_metadata->'locations';
  if jsonb_typeof(v_locations) <> 'array' then
    if jsonb_typeof(p_metadata->'locationRef') <> 'object' then return false; end if;
    v_locations := jsonb_build_array(jsonb_build_object('locationRef', p_metadata->'locationRef'));
  end if;
  if jsonb_array_length(v_locations) = 0 then return false; end if;

  for v_location in select value from jsonb_array_elements(v_locations) loop
    v_ref := v_location->'locationRef';
    if jsonb_typeof(v_ref) <> 'object' then return false; end if;
    if v_ref->>'type' = 'campus' then
      v_key := 'campus';
      if v_key = any(v_seen) then return false; end if;
      v_seen := array_append(v_seen, v_key);
      v_count := v_count + 1;
      continue;
    end if;
    if v_ref->>'type' = 'room' and nullif(v_ref->>'roomId', '') is null then return false; end if;
    v_building_id := nullif(v_ref->>'buildingId', '');
    v_floor_id := nullif(v_ref->>'floorId', '');
    if v_ref->>'type' not in ('building', 'room') or v_building_id is null or v_floor_id is null then return false; end if;
    v_key := v_building_id || '|' || v_floor_id || '|' || coalesce(v_ref->>'roomId', '');
    if v_key = any(v_seen) then return false; end if;
    v_seen := array_append(v_seen, v_key);
    select item into v_building
      from jsonb_array_elements(case when jsonb_typeof(p_snapshot#>'{campus,buildings}') = 'array'
                                     then p_snapshot#>'{campus,buildings}' else '[]'::jsonb end) item
     where item->>'id' = v_building_id and coalesce(item->>'visible', 'true') <> 'false'
     limit 1;
    if v_building is null then return false; end if;
    select item into v_floor
      from jsonb_array_elements(case when jsonb_typeof(v_building->'floors') = 'array'
                                     then v_building->'floors' else '[]'::jsonb end) item
     where v_building_id || '-f' || (item->>'number') = v_floor_id
       and coalesce(item->>'visible', 'true') <> 'false'
     limit 1;
    if v_floor is null then return false; end if;
    v_room_id := nullif(v_ref->>'roomId', '');
    if v_room_id is not null then
      select item into v_room
        from jsonb_array_elements(case when jsonb_typeof(v_floor->'rooms') = 'array'
                                       then v_floor->'rooms' else '[]'::jsonb end) item
       where item->>'id' = v_room_id limit 1;
      if v_room is null then return false; end if;
    end if;
    v_count := v_count + 1;
    v_building := null; v_floor := null; v_room := null;
  end loop;
  return v_count > 0;
exception when others then
  return false;
end;
$$;
revoke all on function public.event_locations_match_snapshot(jsonb, jsonb) from public;

-- Allowlist rendered item fields before exposing event layout JSON to students.
create or replace function public.event_public_furniture(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', item->'id', 'type', item->'type', 'name', item->'name', 'category', item->'category',
    'x', item->'x', 'y', item->'y', 'width', item->'width', 'height', item->'height',
    'rotation', item->'rotation', 'flipX', item->'flipX', 'flipY', item->'flipY',
    'color', item->'color', 'assetKey', item->'assetKey', 'assetVariant', item->'assetVariant',
    'assetConfig', case when jsonb_typeof(item->'assetConfig') = 'object' then
      jsonb_strip_nulls(jsonb_build_object('style', case
        when jsonb_typeof(item->'assetConfig'->'style') = 'string' then item->'assetConfig'->'style'
        else null end))
      else null end,
    'layer', item->'layer', 'zOrder', item->'zOrder', 'visible', item->'visible'
  )) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
       with ordinality as rows(item, ordinality)
  where jsonb_typeof(item) = 'object';
$$;
revoke all on function public.event_public_furniture(jsonb) from public;

create or replace function public.event_public_labels(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', item->'id', 'x', item->'x', 'y', item->'y', 'text', item->'text',
    'fontSize', item->'fontSize', 'color', item->'color', 'rotation', item->'rotation',
    'align', item->'align', 'zOrder', item->'zOrder', 'visible', item->'visible'
  )) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
       with ordinality as rows(item, ordinality)
  where jsonb_typeof(item) = 'object';
$$;
revoke all on function public.event_public_labels(jsonb) from public;

create or replace function public.event_public_markers(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'x', item->'x', 'y', item->'y', 'label', item->'label', 'color', item->'color'
  )) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
       with ordinality as rows(item, ordinality)
  where jsonb_typeof(item) = 'object';
$$;
revoke all on function public.event_public_markers(jsonb) from public;

-- Allowlist the location reference shape returned from public event RPCs.
create or replace function public.event_public_locations(p_metadata jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with source_locations as (
    select value as location
      from jsonb_array_elements(case
        when jsonb_typeof(p_metadata->'locations') = 'array' then p_metadata->'locations'
        when jsonb_typeof(p_metadata->'locationRef') = 'object'
          then jsonb_build_array(jsonb_build_object('id', 'legacy-location', 'locationRef', p_metadata->'locationRef',
            'eventFurniture', coalesce(p_metadata->'eventFurniture', '[]'::jsonb),
            'eventLabels', coalesce(p_metadata->'eventLabels', '[]'::jsonb)))
        else '[]'::jsonb end)
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
    from source_locations with ordinality
  )
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) from projected;
$$;
revoke all on function public.event_public_locations(jsonb) from public;

-- Historical snapshots are projected on read only. Missing/null paths retain
-- their original shape, while arrays keep the order of all non-event rows.
create or replace function public.event_free_campus_snapshot(snapshot jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_elements jsonb;
  v_campus jsonb;
begin
  if snapshot is null or jsonb_typeof(snapshot) <> 'object' then return snapshot; end if;
  v_result := snapshot;
  v_campus := snapshot->'campus';
  if jsonb_typeof(v_campus) = 'object' then
    if jsonb_typeof(v_campus->'eventOverlays') = 'array' then
      v_campus := jsonb_set(v_campus, '{eventOverlays}', coalesce((
        select jsonb_agg(item order by ordinality)
          from jsonb_array_elements(v_campus->'eventOverlays') with ordinality as rows(item, ordinality)
         where coalesce(item->>'kind', '') <> 'event_overlay'
      ), '[]'::jsonb), true);
    elsif v_campus ? 'eventOverlays' and v_campus->'eventOverlays' <> 'null'::jsonb then
      v_campus := v_campus - 'eventOverlays';
    end if;
    v_result := jsonb_set(v_result, '{campus}', v_campus, true);
  end if;
  v_elements := snapshot#>'{structure,map_elements}';
  if jsonb_typeof(v_elements) = 'array' then
    v_result := jsonb_set(v_result, '{structure,map_elements}', coalesce((
      select jsonb_agg(item order by ordinality)
        from jsonb_array_elements(v_elements) with ordinality as rows(item, ordinality)
       where coalesce(item->>'element_type', '') <> 'event_overlay'
         and coalesce(item#>>'{metadata,kind}', '') <> 'event_overlay'
    ), '[]'::jsonb), true);
  end if;
  return v_result;
end;
$$;
revoke all on function public.event_free_campus_snapshot(jsonb) from public;
grant execute on function public.event_free_campus_snapshot(jsonb) to anon, authenticated;

create or replace function public.list_event_safe_published_campuses()
returns table(campus_id uuid, snapshot jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select version.campus_id, public.event_free_campus_snapshot(version.snapshot), version.published_at
    from public.campus_versions version
    join public.campuses campus on campus.id = version.campus_id
   where version.state = 'published'
     and version.id = campus.latest_published_version_id
     and campus.status = 'published'
     and campus.archived_at is null
   order by version.published_at desc;
$$;
revoke all on function public.list_event_safe_published_campuses() from public;
grant execute on function public.list_event_safe_published_campuses() to anon, authenticated;

create or replace function public.guard_event_overlay_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_event boolean := false;
  v_new_event boolean := false;
  v_admin_command boolean := coalesce(current_setting('app.event_admin_command', true), '') = 'on';
  v_old_status text;
  v_new_status text;
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    v_old_event := coalesce(old.element_type = 'event_overlay' or old.metadata->>'kind' = 'event_overlay', false);
    v_old_status := coalesce(old.metadata->>'status', 'pending');
  end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    v_new_event := coalesce(new.element_type = 'event_overlay' or new.metadata->>'kind' = 'event_overlay', false);
    v_new_status := coalesce(new.metadata->>'status', 'pending');
  end if;

  if tg_op = 'DELETE' then
    if not v_old_event then return old; end if;
    if v_old_status in ('pending', 'approved') then
      raise exception 'Submitted and approved event maps cannot be deleted.' using errcode = '42501';
    end if;
    if not public.is_admin() and not (public.is_student_org() and old.metadata->>'createdByUserId' = auth.uid()::text) then
      raise exception 'Only the event owner or an administrator may delete this draft.' using errcode = '42501';
    end if;
    return old;
  end if;

  if not v_old_event and not v_new_event then return new; end if;
  if not v_new_event or (tg_op = 'UPDATE' and not v_old_event) then
    raise exception 'Event identity cannot be changed.' using errcode = '42501';
  end if;

  if v_admin_command then
    if not public.is_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
    return new;
  end if;
  if public.is_admin() then
    raise exception 'Use the atomic event review or publication command.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not public.is_student_org()
       or new.metadata->>'createdByUserId' is distinct from auth.uid()::text
       or not public.campus_is_published(new.campus_id)
       or v_new_status <> 'draft'
       or new.metadata ?| array['dateStart','dateEnd','publicationAt','adminComment','locationFeedback'] then
      raise exception 'Student organizations may only create date-free event drafts for published campuses.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not public.is_student_org()
     or old.metadata->>'createdByUserId' is distinct from auth.uid()::text
     or new.metadata->>'createdByUserId' is distinct from old.metadata->>'createdByUserId'
     or new.campus_id is distinct from old.campus_id
     or new.element_type is distinct from old.element_type
     or new.metadata->>'kind' is distinct from old.metadata->>'kind'
     or new.metadata->'dateStart' is distinct from old.metadata->'dateStart'
     or new.metadata->'dateEnd' is distinct from old.metadata->'dateEnd'
     or new.metadata->'publicationAt' is distinct from old.metadata->'publicationAt'
     or new.metadata->'isActive' is distinct from old.metadata->'isActive'
     or new.metadata->'id' is distinct from old.metadata->'id' then
    raise exception 'Event ownership, campus, schedule and publication are protected.' using errcode = '42501';
  end if;
  if v_old_status not in ('draft', 'disapproved')
     or v_new_status not in ('draft', 'pending')
     or (v_old_status = 'draft' and v_new_status not in ('draft', 'pending')) then
    raise exception 'Submitted event maps are locked until administrator feedback.' using errcode = '42501';
  end if;
  if v_old_status = 'disapproved' and v_new_status in ('draft','pending') then
    if coalesce(new.metadata->>'adminComment', '') <> ''
       or jsonb_typeof(coalesce(new.metadata->'locationFeedback', '{}'::jsonb)) <> 'object'
       or new.metadata->'locationFeedback' not in ('{}'::jsonb, 'null'::jsonb) then
      raise exception 'A revised event must clear prior review feedback.' using errcode = '42501';
    end if;
  elsif nullif(new.metadata->>'adminComment', '') is distinct from nullif(old.metadata->>'adminComment', '')
     or coalesce(new.metadata->'locationFeedback', '{}'::jsonb) is distinct from coalesce(old.metadata->'locationFeedback', '{}'::jsonb) then
    raise exception 'Only an administrator may change event review feedback.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_event_overlay_review() from public;
drop trigger if exists guard_event_overlay_review on public.map_elements;
create trigger guard_event_overlay_review
  before insert or update or delete on public.map_elements
  for each row execute function public.guard_event_overlay_review();

-- A direct table read would expose creator and administrator feedback fields.
-- Students and guests use only the allowlisted RPC below.
drop policy if exists "map_elements_select_event_overlay" on public.map_elements;
create policy "map_elements_select_event_overlay"
  on public.map_elements for select to authenticated
  using ((element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
    and (public.is_admin() or metadata->>'createdByUserId' = auth.uid()::text));
drop policy if exists "map_elements_update_event_overlay_owner" on public.map_elements;
create policy "map_elements_update_event_overlay_owner"
  on public.map_elements for update to authenticated
  using ((element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
    and (public.is_admin() or (public.is_student_org() and metadata->>'createdByUserId' = auth.uid()::text)))
  with check ((element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
    and (public.is_admin() or (public.is_student_org() and metadata->>'createdByUserId' = auth.uid()::text)));
drop policy if exists "map_elements_delete_event_overlay_owner" on public.map_elements;
create policy "map_elements_delete_event_overlay_owner"
  on public.map_elements for delete to authenticated
  using ((element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
    and (public.is_admin() or (public.is_student_org() and metadata->>'createdByUserId' = auth.uid()::text)));

create or replace function public.review_event_layout(
  p_overlay_id uuid,
  p_expected_updated_at timestamptz,
  p_decision text,
  p_date_start timestamptz,
  p_date_end timestamptz,
  p_publication_mode text,
  p_publication_at timestamptz,
  p_admin_comment text,
  p_location_feedback jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.map_elements%rowtype;
  v_campus_version jsonb;
  v_before jsonb;
  v_after jsonb;
  v_publication_at timestamptz;
  v_comment text := nullif(btrim(coalesce(p_admin_comment, '')), '');
begin
  if not public.is_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  select * into v_event from public.map_elements
   where id = p_overlay_id and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
   for update;
  if not found then raise exception 'Event layout not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then
    raise exception 'This event changed. Refresh it before saving.' using errcode = '40001';
  end if;
  if coalesce(v_event.metadata->>'status', 'pending') <> 'pending' then
    raise exception 'Only submitted event layouts can be reviewed.' using errcode = '23514';
  end if;
  if p_decision is null or p_decision not in ('approved', 'disapproved') then raise exception 'Invalid review decision.' using errcode = '23514'; end if;
  if p_decision = 'disapproved' and v_comment is null then
    raise exception 'A comment is required when disapproving.' using errcode = '23514';
  end if;

  v_before := coalesce(v_event.metadata, '{}'::jsonb);
  if p_location_feedback is not null and jsonb_typeof(p_location_feedback) <> 'object' then
    raise exception 'Location feedback must be an object.' using errcode = '23514';
  end if;
  v_after := v_before || jsonb_build_object('status', p_decision, 'isActive', p_decision = 'approved');
  if p_decision = 'approved' then
    if p_date_start is null or p_date_end is null or p_date_start >= p_date_end or p_date_end <= now() then
      raise exception 'Set a valid future event schedule before approval.' using errcode = '23514';
    end if;
    if p_publication_mode = 'now' then
      v_publication_at := now();
    elsif p_publication_mode = 'schedule' and p_publication_at is not null and p_publication_at > now() then
      v_publication_at := p_publication_at;
    else
      raise exception 'Choose immediate publication or a future publication time.' using errcode = '23514';
    end if;
    if v_publication_at >= p_date_end then raise exception 'Publication must be before the event ends.' using errcode = '23514'; end if;
    select version.snapshot into v_campus_version
      from public.campuses campus join public.campus_versions version
        on version.id = campus.latest_published_version_id and version.campus_id = campus.id and version.state = 'published'
     where campus.id = v_event.campus_id and campus.status = 'published' and campus.archived_at is null;
    if v_campus_version is null or not public.event_locations_match_snapshot(v_campus_version, v_before) then
      raise exception 'One or more requested locations are no longer on the published campus.' using errcode = '23514';
    end if;
    v_after := v_after || jsonb_build_object('dateStart', p_date_start, 'dateEnd', p_date_end,
      'publicationAt', v_publication_at, 'locationFeedback', coalesce(p_location_feedback, '{}'::jsonb));
    v_after := v_after - 'adminComment';
  else
    v_after := v_after || jsonb_build_object('adminComment', v_comment);
    if p_location_feedback is not null then v_after := v_after || jsonb_build_object('locationFeedback', p_location_feedback); end if;
  end if;

  perform set_config('app.event_admin_command', 'on', true);
  update public.map_elements set metadata = v_after where id = v_event.id returning * into v_event;
  insert into public.activity_logs(actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_event.campus_id, 'event_overlay.' || p_decision, 'event_overlay', v_event.id,
    jsonb_build_object('before', v_before, 'after', v_after));
  return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id,
    'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);
end;
$$;
revoke all on function public.review_event_layout(uuid, timestamptz, text, timestamptz, timestamptz, text, timestamptz, text, jsonb) from public, anon;
grant execute on function public.review_event_layout(uuid, timestamptz, text, timestamptz, timestamptz, text, timestamptz, text, jsonb) to authenticated;

create or replace function public.manage_event_publication(
  p_overlay_id uuid,
  p_expected_updated_at timestamptz,
  p_action text,
  p_publication_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.map_elements%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_publication_at timestamptz;
begin
  if not public.is_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  select * into v_event from public.map_elements
   where id = p_overlay_id and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
   for update;
  if not found then raise exception 'Event layout not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then
    raise exception 'This event changed. Refresh it before saving.' using errcode = '40001';
  end if;
  if coalesce(v_event.metadata->>'status', '') <> 'approved' then
    raise exception 'Only approved event layouts can be published.' using errcode = '23514';
  end if;
  v_before := coalesce(v_event.metadata, '{}'::jsonb);
  if p_action in ('publish_now', 'schedule') and (
     nullif(v_event.metadata->>'dateStart', '') is null
     or nullif(v_event.metadata->>'dateEnd', '') is null
     or (v_event.metadata->>'dateStart')::timestamptz >= (v_event.metadata->>'dateEnd')::timestamptz
     or (v_event.metadata->>'dateEnd')::timestamptz <= now()) then
    raise exception 'This event does not have a valid future occurrence schedule.' using errcode = '23514';
  end if;
  if p_action = 'publish_now' then
    v_publication_at := now();
    v_after := v_before || jsonb_build_object('isActive', true, 'publicationAt', v_publication_at);
    v_action := 'event_overlay.published';
  elsif p_action = 'schedule' then
    if p_publication_at is null or p_publication_at <= now()
       or p_publication_at >= (v_event.metadata->>'dateEnd')::timestamptz then
      raise exception 'Choose a future publication time before the event ends.' using errcode = '23514';
    end if;
    v_publication_at := p_publication_at;
    v_after := v_before || jsonb_build_object('isActive', true, 'publicationAt', v_publication_at);
    v_action := 'event_overlay.publication_scheduled';
  elsif p_action = 'unpublish' then
    v_after := v_before || jsonb_build_object('isActive', false);
    v_action := 'event_overlay.unpublished';
  else
    raise exception 'Invalid publication action.' using errcode = '23514';
  end if;
  perform set_config('app.event_admin_command', 'on', true);
  update public.map_elements set metadata = v_after where id = v_event.id returning * into v_event;
  insert into public.activity_logs(actor_id, campus_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_event.campus_id, v_action, 'event_overlay', v_event.id,
    jsonb_build_object('before', v_before, 'after', v_after));
  return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id,
    'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);
end;
$$;
revoke all on function public.manage_event_publication(uuid, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.manage_event_publication(uuid, timestamptz, text, timestamptz) to authenticated;

create or replace function public.list_published_event_previews(p_campus_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_events jsonb;
begin
  select version.snapshot into v_snapshot
    from public.campuses campus join public.campus_versions version
      on version.id = campus.latest_published_version_id and version.campus_id = campus.id and version.state = 'published'
   where campus.id = p_campus_id and campus.status = 'published' and campus.archived_at is null;
  if v_snapshot is null then return jsonb_build_object('serverNow', v_now, 'events', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', element.id,
      'campusId', element.campus_id,
      'title', coalesce(nullif(element.metadata->>'title', ''), element.name),
      'description', coalesce(element.metadata->>'description', ''),
      'organizer', coalesce(element.metadata->>'organizer', ''),
      'posterUrl', element.metadata->>'posterUrl',
      'markers', public.event_public_markers(element.metadata->'markers'),
      'status', 'approved',
      'isActive', true,
      'dateStart', element.metadata->>'dateStart',
      'dateEnd', element.metadata->>'dateEnd',
      'publicationAt', element.metadata->>'publicationAt',
      'locations', public.event_public_locations(element.metadata)
    ) order by element.metadata->>'dateStart', element.id), '[]'::jsonb)
    into v_events
    from public.map_elements element
   where element.campus_id = p_campus_id
     and element.archived_at is null
     and (element.element_type = 'event_overlay' or element.metadata->>'kind' = 'event_overlay')
     and public.event_overlay_is_published(element.metadata)
     and public.event_locations_match_snapshot(v_snapshot, element.metadata);
  return jsonb_build_object('serverNow', v_now, 'events', v_events);
end;
$$;
revoke all on function public.list_published_event_previews(uuid) from public;
grant execute on function public.list_published_event_previews(uuid) to anon, authenticated;
