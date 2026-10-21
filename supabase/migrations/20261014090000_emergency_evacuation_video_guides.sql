-- Emergency evacuation video guides are separate private media objects. The
-- room/map JSON stores only a stable video ID and review fingerprint.

create table if not exists public.emergency_evacuation_videos (
  id uuid primary key,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  building_id uuid not null references public.buildings(id) on delete restrict,
  floor_id uuid not null references public.floors(id) on delete restrict,
  room_id uuid not null references public.map_elements(id) on delete restrict,
  storage_path text not null unique,
  captions_path text unique,
  captions_size_bytes bigint check (captions_size_bytes is null or captions_size_bytes between 1 and 1048576),
  original_filename text not null check (
    length(original_filename) between 1 and 255
    and right(lower(original_filename), 4) = '.mp4'
    and position('/' in original_filename) = 0
    and position(chr(92) in original_filename) = 0
    and original_filename !~ '[[:cntrl:]]'
  ),
  mime_type text not null default 'video/mp4' check (mime_type = 'video/mp4'),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 104857600),
  title text not null check (length(btrim(title)) between 1 and 120),
  duration_seconds numeric(10, 2) check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'needs_review', 'archived')),
  approved_route_fingerprint jsonb,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_evacuation_video_route_review_check check (
    (status = 'published' and approved_route_fingerprint is not null and approved_by is not null and published_at is not null)
    or status <> 'published'
  ),
  constraint emergency_evacuation_video_fingerprint_array_check check (
    approved_route_fingerprint is null or (
      jsonb_typeof(approved_route_fingerprint) = 'array'
      and jsonb_array_length(approved_route_fingerprint) between 1 and 2
    )
  ),
  constraint emergency_evacuation_video_caption_pair_check check (
    (captions_path is null and captions_size_bytes is null)
    or (captions_path is not null and captions_size_bytes is not null)
  )
);

comment on table public.emergency_evacuation_videos is
  'Private room video metadata. Student delivery is gated by the current published campus snapshot and reviewed route assignments.';

create index if not exists emergency_evacuation_videos_room_idx
  on public.emergency_evacuation_videos (campus_id, building_id, floor_id, room_id, updated_at desc);

create or replace function public.validate_emergency_evacuation_video_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_exists boolean;
  v_object_size bigint;
  v_object_mime text;
begin
  select exists (
    select 1 from public.map_elements e
    where e.id = new.room_id
      and e.campus_id = new.campus_id
      and e.building_id = new.building_id
      and e.floor_id = new.floor_id
      and e.archived_at is null
      and e.metadata->>'kind' = 'room'
  ) into v_room_exists;
  if not v_room_exists then
    raise exception 'video guide must reference an active Room on the supplied Campus, Building, and Floor' using errcode = '23514';
  end if;
  select case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
         o.metadata->>'mimetype'
    into v_object_size, v_object_mime
    from storage.objects o
   where o.bucket_id = 'emergency-evacuation-videos' and o.name = new.storage_path;
  if not found or v_object_size is distinct from new.file_size_bytes or v_object_size > 104857600
     or v_object_mime is distinct from 'video/mp4' then
    raise exception 'video metadata must match a private MP4 object within the upload size limit' using errcode = '23514';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.campus_id::text
     or split_part(new.storage_path, '/', 2) <> new.room_id::text
     or split_part(new.storage_path, '/', 3) <> (new.id::text || '.mp4')
     or array_length(string_to_array(new.storage_path, '/'), 1) <> 3 then
    raise exception 'video storage path must use the canonical campus/room/video-id.mp4 shape' using errcode = '23514';
  end if;
  if new.captions_path is not null and (
    split_part(new.captions_path, '/', 1) <> new.campus_id::text
    or split_part(new.captions_path, '/', 2) <> new.room_id::text
    or split_part(new.captions_path, '/', 3) not like (new.id::text || '-%.vtt')
    or array_length(string_to_array(new.captions_path, '/'), 1) <> 3
  ) then
    raise exception 'caption storage path must use the canonical campus/room/video-id-token.vtt shape' using errcode = '23514';
  end if;
  if new.captions_path is not null then
    select case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
           o.metadata->>'mimetype'
      into v_object_size, v_object_mime
      from storage.objects o
     where o.bucket_id = 'emergency-evacuation-videos' and o.name = new.captions_path;
    if not found or v_object_size is distinct from new.captions_size_bytes
       or v_object_size not between 1 and 1048576 or v_object_mime is distinct from 'text/vtt' then
      raise exception 'caption metadata must match a private WebVTT object within the captions size limit' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id or new.campus_id is distinct from old.campus_id
    or new.building_id is distinct from old.building_id or new.floor_id is distinct from old.floor_id
    or new.room_id is distinct from old.room_id or new.storage_path is distinct from old.storage_path
    or new.original_filename is distinct from old.original_filename
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.uploaded_by is distinct from old.uploaded_by
  ) then
    raise exception 'uploaded video identity and source metadata are immutable; upload a replacement object' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.status = 'published' and old.status <> 'published'
       and new.approved_by is distinct from auth.uid() then
      raise exception 'the administrator publishing this video must be recorded as its reviewer' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists emergency_evacuation_video_metadata_validate on public.emergency_evacuation_videos;
create trigger emergency_evacuation_video_metadata_validate
  before insert or update on public.emergency_evacuation_videos
  for each row execute function public.validate_emergency_evacuation_video_metadata();

alter table public.emergency_evacuation_videos enable row level security;
revoke all on table public.emergency_evacuation_videos from anon, authenticated;
grant select, insert, update, delete on table public.emergency_evacuation_videos to authenticated;

drop policy if exists emergency_evacuation_videos_admin_select on public.emergency_evacuation_videos;
create policy emergency_evacuation_videos_admin_select
  on public.emergency_evacuation_videos for select to authenticated
  using (public.is_admin());

drop policy if exists emergency_evacuation_videos_admin_insert on public.emergency_evacuation_videos;
create policy emergency_evacuation_videos_admin_insert
  on public.emergency_evacuation_videos for insert to authenticated
  with check (
    public.is_admin()
    and uploaded_by = auth.uid()
    and status = 'draft'
    and approved_route_fingerprint is null
    and approved_by is null
    and published_at is null
  );

drop policy if exists emergency_evacuation_videos_admin_update on public.emergency_evacuation_videos;
create policy emergency_evacuation_videos_admin_update
  on public.emergency_evacuation_videos for update to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and (status <> 'published' or (
      approved_route_fingerprint is not null
      and approved_by is not null
      and published_at is not null
    ))
  );

drop policy if exists emergency_evacuation_videos_admin_delete on public.emergency_evacuation_videos;
create policy emergency_evacuation_videos_admin_delete
  on public.emergency_evacuation_videos for delete to authenticated
  using (public.is_admin());

-- A route fingerprint is a canonical JSON array of the currently approved
-- assignments: [assignment ID, physical door, physical exit, destination node,
-- reviewed Stage 1 graph signature]. Labels and presentation-only fields are
-- intentionally excluded from route identity.
create or replace function public.emergency_evacuation_route_fingerprint(p_configuration jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(route_value order by route_position), '[]'::jsonb)
  from (
    select item.ordinality as route_position,
      jsonb_build_array(
        route->>'id', route->>'doorId', route->>'exitId',
        route->>'destinationNodeId', route->>'approvedRouteSignature'
      ) as route_value
    from jsonb_array_elements(case
      when jsonb_typeof(p_configuration->'routes') = 'array' then p_configuration->'routes'
      else '[]'::jsonb
    end) with ordinality as item(route, ordinality)
    where route->>'approved' = 'true'
      and nullif(route->>'id', '') is not null
      and nullif(route->>'doorId', '') is not null
      and nullif(route->>'exitId', '') is not null
      and nullif(route->>'destinationNodeId', '') is not null
      and nullif(route->>'approvedRouteSignature', '') is not null
    order by item.ordinality
    limit 2
  ) approved_routes;
$$;

create or replace function public.try_parse_emergency_video_fingerprint(p_value text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null then return null; end if;
  return p_value::jsonb;
exception when others then
  return null;
end;
$$;

create or replace function public.is_published_emergency_evacuation_video(p_video_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.emergency_evacuation_videos v
    join public.campuses c on c.id = v.campus_id
    join public.campus_versions cv on cv.id = c.latest_published_version_id and cv.campus_id = c.id
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(cv.snapshot->'structure'->'map_elements') = 'array' then cv.snapshot->'structure'->'map_elements'
      when jsonb_typeof(cv.snapshot->'map_elements') = 'array' then cv.snapshot->'map_elements'
      else '[]'::jsonb
    end) element
    where v.id = p_video_id
      and v.status = 'published'
      and v.approved_route_fingerprint is not null
      and c.status = 'published'
      and c.archived_at is null
      and cv.state = 'published'
      and element->>'id' = v.room_id::text
      and element->>'campus_id' = v.campus_id::text
      and element->>'building_id' = v.building_id::text
      and element->>'floor_id' = v.floor_id::text
      and element->'metadata'->>'kind' = 'room'
      and element->'metadata'->'ui'->'emergencyEvacuation'->>'enabled' = 'true'
      and element->'metadata'->'ui'->'emergencyEvacuation'->'videoGuide'->>'enabled' = 'true'
      and element->'metadata'->'ui'->'emergencyEvacuation'->'videoGuide'->>'videoId' = v.id::text
      and element->'metadata'->'ui'->'emergencyEvacuation'->'videoGuide'->>'reviewStatus' = 'approved'
      and public.try_parse_emergency_video_fingerprint(
        element->'metadata'->'ui'->'emergencyEvacuation'->'videoGuide'->>'reviewedRouteFingerprint'
      ) = v.approved_route_fingerprint
      and public.emergency_evacuation_route_fingerprint(
        element->'metadata'->'ui'->'emergencyEvacuation'
      ) = v.approved_route_fingerprint
  );
$$;

revoke all on function public.emergency_evacuation_route_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.try_parse_emergency_video_fingerprint(text) from public, anon, authenticated;
revoke all on function public.is_published_emergency_evacuation_video(uuid) from public, anon, authenticated;
grant execute on function public.is_published_emergency_evacuation_video(uuid) to anon, authenticated;

create or replace function public.is_published_emergency_evacuation_video_path(p_path text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.emergency_evacuation_videos v
    where (v.storage_path = p_path or v.captions_path = p_path)
      and public.is_published_emergency_evacuation_video(v.id)
  );
$$;

create or replace function public.get_published_emergency_evacuation_video(p_video_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', v.id,
    'campus_id', v.campus_id,
    'building_id', v.building_id,
    'floor_id', v.floor_id,
    'room_id', v.room_id,
    'storage_path', v.storage_path,
    'captions_path', v.captions_path,
    'original_filename', v.original_filename,
    'mime_type', v.mime_type,
    'file_size_bytes', v.file_size_bytes,
    'title', v.title,
    'duration_seconds', v.duration_seconds,
    'approved_route_fingerprint', v.approved_route_fingerprint,
    'updated_at', v.updated_at
  )
  from public.emergency_evacuation_videos v
  where v.id = p_video_id
    and public.is_published_emergency_evacuation_video(v.id);
$$;

revoke all on function public.is_published_emergency_evacuation_video_path(text) from public, anon, authenticated;
revoke all on function public.get_published_emergency_evacuation_video(uuid) from public, anon, authenticated;
grant execute on function public.is_published_emergency_evacuation_video_path(text) to anon, authenticated;
grant execute on function public.get_published_emergency_evacuation_video(uuid) to anon, authenticated;

create or replace function public.emergency_evacuation_graph_fingerprint(p_snapshot jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_structure jsonb;
  v_fingerprint_data jsonb;
begin
  v_structure := case when jsonb_typeof(p_snapshot->'structure') = 'object' then p_snapshot->'structure' else p_snapshot end;
  select jsonb_build_object(
    'buildings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b->'id',
        'entrances', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', entrance->'id', 'edge', entrance->'edge', 'offset', entrance->'offset',
            'type', entrance->'type', 'direction', entrance->'direction', 'accessible', entrance->'accessible',
            'name', entrance->'name'
          ) order by entrance->>'id')
          from jsonb_array_elements(coalesce(b->'metadata'->'entrances', '[]'::jsonb)) entrance
        ), '[]'::jsonb),
        'exteriorEmergencyStairs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', stair->'id', 'state', stair->'state', 'width', stair->'width', 'height', stair->'height',
            'attachment', stair->'attachment', 'servedFloorIds', stair->'servedFloorIds',
            'sharedId', stair->'sharedId', 'occurrenceIds', stair->'occurrenceIds',
            'occurrenceNodeIds', stair->'occurrenceNodeIds', 'outdoorNodeId', stair->'outdoorNodeId',
            'emergencySafe', stair->'emergencySafe', 'visible', stair->'visible', 'label', stair->'label'
          ) order by stair->>'id')
          from jsonb_array_elements(coalesce(b->'metadata'->'exteriorEmergencyStairs', '[]'::jsonb)) stair
        ), '[]'::jsonb)
      ) order by b->>'id')
      from jsonb_array_elements(coalesce(v_structure->'buildings', '[]'::jsonb)) b
    ), '[]'::jsonb),
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n->'id', 'node_type', n->'node_type', 'building_id', n->'building_id', 'floor_id', n->'floor_id',
        'x', n->'x', 'y', n->'y', 'is_accessible', n->'is_accessible',
        'is_emergency_safe', n->'is_emergency_safe', 'is_active', n->'is_active',
        'entranceId', n->'metadata'->'entranceId', 'buildingEntranceId', n->'metadata'->'buildingEntranceId',
        'transitionSharedId', n->'metadata'->'transitionSharedId', 'roomId', n->'metadata'->'roomId',
        'doorId', n->'metadata'->'doorId', 'stairId', n->'metadata'->'stairId',
        'exteriorEmergencyStairId', n->'metadata'->'exteriorEmergencyStairId', 'gateId', n->'metadata'->'gateId',
        'elevatorId', n->'metadata'->'elevatorId', 'rampId', n->'metadata'->'rampId',
        'emergencySafe', n->'metadata'->'emergencySafe', 'emergencyStair', n->'metadata'->'emergencyStair'
      ) order by n->>'id')
      from jsonb_array_elements(coalesce(v_structure->'navigation_nodes', '[]'::jsonb)) n
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->'id', 'from_node_id', e->'from_node_id', 'to_node_id', e->'to_node_id',
        'distance_m', e->'distance_m', 'edge_type', e->'edge_type',
        'is_bidirectional', e->'is_bidirectional', 'is_accessible', e->'is_accessible',
        'is_emergency_safe', e->'is_emergency_safe', 'is_temporarily_closed', e->'is_temporarily_closed',
        'bendPoints', e->'metadata'->'bendPoints', 'emergencySafe', e->'metadata'->'emergencySafe',
        'emergencyReason', e->'metadata'->'emergencyReason', 'closed', e->'metadata'->'closed',
        'generatedFromPathIds', e->'metadata'->'generatedFromPathIds',
        'derivedOwnerType', e->'metadata'->'derivedOwnerType', 'derivedOwnerId', e->'metadata'->'derivedOwnerId',
        'derivedRole', e->'metadata'->'derivedRole'
      ) order by e->>'id')
      from jsonb_array_elements(coalesce(v_structure->'navigation_edges', '[]'::jsonb)) e
    ), '[]'::jsonb),
    'routeGeometry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->'id', 'campus_id', e->'campus_id', 'building_id', e->'building_id', 'floor_id', e->'floor_id',
        'kind', e->'metadata'->>'kind', 'element_type', e->'element_type',
        'x', meta.ui->'x', 'y', meta.ui->'y', 'w', meta.ui->'w', 'h', meta.ui->'h', 'rotation', meta.ui->'rotation',
        'shapePoints', meta.ui->'shapePoints', 'accessDoorId', meta.ui->'accessDoorId', 'accessDoorIds', meta.ui->'accessDoorIds',
        'accessType', meta.ui->'accessType', 'x1', meta.ui->'x1', 'y1', meta.ui->'y1', 'x2', meta.ui->'x2', 'y2', meta.ui->'y2',
        'thickness', meta.ui->'thickness', 'wallId', meta.ui->'wallId', 'offset', meta.ui->'offset',
        'direction', meta.ui->'direction', 'width', meta.ui->'width', 'isEmergencyExit', meta.ui->'isEmergencyExit',
        'gatePurpose', case when e->'metadata'->>'kind' = 'gate' then meta.ui->'purpose' else null end,
        'gateNavNodeId', case when e->'metadata'->>'kind' = 'gate' then meta.ui->'navNodeId' else null end,
        'gateName', case when e->'metadata'->>'kind' = 'gate' then meta.ui->'name' else null end,
        'startAnchor', meta.ui->'startAnchor', 'endAnchor', meta.ui->'endAnchor'
      ) order by e->>'id')
      from jsonb_array_elements(coalesce(v_structure->'map_elements', '[]'::jsonb)) e
      cross join lateral (select e->'metadata'->'ui' as ui) meta
      where e->'metadata'->>'kind' in ('room', 'wall', 'door', 'stairs', 'ramp', 'elevator', 'gate')
    ), '[]'::jsonb)
  ) into v_fingerprint_data;
  return md5(v_fingerprint_data::text);
end;
$$;

-- A published change to the navigation graph, egress assets, or route-bearing
-- room/door/wall geometry requires video re-review. Visual-only room edits do
-- not participate in the signature above.
create or replace function public.mark_emergency_videos_for_review_on_map_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_snapshot jsonb;
begin
  if old.state <> 'draft' or new.state <> 'published' then return new; end if;
  select cv.snapshot into v_previous_snapshot
    from public.campuses c
    join public.campus_versions cv on cv.id = c.latest_published_version_id
   where c.id = new.campus_id;
  if v_previous_snapshot is not null
     and public.emergency_evacuation_graph_fingerprint(v_previous_snapshot)
       is distinct from public.emergency_evacuation_graph_fingerprint(new.snapshot) then
    update public.emergency_evacuation_videos
       set status = 'needs_review', updated_at = now()
     where campus_id = new.campus_id and status = 'published';
  end if;
  return new;
end;
$$;

drop trigger if exists emergency_evacuation_video_route_review on public.campus_versions;
create trigger emergency_evacuation_video_route_review
  before update of state on public.campus_versions
  for each row execute function public.mark_emergency_videos_for_review_on_map_publish();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'emergency-evacuation-videos', 'emergency-evacuation-videos', false,
  104857600, array['video/mp4', 'text/vtt']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = array['video/mp4', 'text/vtt'];

drop policy if exists emergency_videos_admin_select on storage.objects;
create policy emergency_videos_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'emergency-evacuation-videos' and public.is_admin());

drop policy if exists emergency_videos_student_select_published on storage.objects;
create policy emergency_videos_student_select_published
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'emergency-evacuation-videos'
    and public.is_published_emergency_evacuation_video_path(name)
  );

drop policy if exists emergency_videos_admin_insert on storage.objects;
create policy emergency_videos_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'emergency-evacuation-videos'
    and public.is_admin()
    and lower(storage.extension(name)) in ('mp4', 'vtt')
    and coalesce(metadata->>'size', '') ~ '^[0-9]+$'
    and case
      when lower(storage.extension(name)) = 'mp4' then (metadata->>'size')::bigint <= 104857600
      when lower(storage.extension(name)) = 'vtt' then (metadata->>'size')::bigint between 1 and 1048576
      else false
    end
    and exists (
      select 1 from public.map_elements e
      where e.id::text = (storage.foldername(name))[2]
        and e.campus_id::text = (storage.foldername(name))[1]
        and e.archived_at is null
        and e.metadata->>'kind' = 'room'
    )
  );

drop policy if exists emergency_videos_admin_delete on storage.objects;
create policy emergency_videos_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'emergency-evacuation-videos' and public.is_admin());

revoke all on function public.emergency_evacuation_graph_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.mark_emergency_videos_for_review_on_map_publish() from public, anon, authenticated;
revoke all on function public.validate_emergency_evacuation_video_metadata() from public, anon, authenticated;

comment on function public.get_published_emergency_evacuation_video(uuid) is
  'Returns a guide only when the private media row, approved room configuration, route fingerprint, and latest published campus snapshot all agree.';
