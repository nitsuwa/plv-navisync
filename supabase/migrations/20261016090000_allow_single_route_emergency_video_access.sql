-- Smart Multi-Exit is optional. A published emergency video is eligible when
-- the room has a current approved evacuation route, even if Multi-Exit is off.
-- Keep the video-guide opt-in, route fingerprint, and latest published
-- snapshot checks intact.

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
