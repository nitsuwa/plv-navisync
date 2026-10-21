-- General Room Videos are private media records with their own approval and
-- published-room checks. Emergency evacuation guides remain in
-- emergency_evacuation_videos and keep their route-fingerprint policy.

create table if not exists public.room_videos (
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
  file_size_bytes bigint not null check (file_size_bytes between 1 and 104857600),
  title text not null check (length(btrim(title)) between 1 and 120),
  duration_seconds numeric(10, 2) check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_video_publish_review_check check (
    (status = 'published' and approved_by is not null and published_at is not null)
    or status <> 'published'
  ),
  constraint room_video_caption_pair_check check (
    (captions_path is null and captions_size_bytes is null)
    or (captions_path is not null and captions_size_bytes is not null)
  )
);

create index if not exists room_videos_room_idx
  on public.room_videos (campus_id, building_id, floor_id, room_id, updated_at desc);

create or replace function public.validate_room_video_metadata()
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
    raise exception 'room video must reference an active Room on the supplied Campus, Building, and Floor' using errcode = '23514';
  end if;

  select case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
         o.metadata->>'mimetype'
    into v_object_size, v_object_mime
    from storage.objects o
   where o.bucket_id = 'emergency-evacuation-videos' and o.name = new.storage_path;
  if not found or v_object_size is distinct from new.file_size_bytes
     or v_object_size not between 1 and 104857600 or v_object_mime is distinct from 'video/mp4' then
    raise exception 'room video metadata must match a private MP4 object within the upload size limit' using errcode = '23514';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.campus_id::text
     or split_part(new.storage_path, '/', 2) <> new.room_id::text
     or split_part(new.storage_path, '/', 3) <> (new.id::text || '.mp4')
     or array_length(string_to_array(new.storage_path, '/'), 1) <> 3 then
    raise exception 'room video storage path must use the canonical campus/room/video-id.mp4 shape' using errcode = '23514';
  end if;

  if new.captions_path is not null then
    if split_part(new.captions_path, '/', 1) <> new.campus_id::text
       or split_part(new.captions_path, '/', 2) <> new.room_id::text
       or split_part(new.captions_path, '/', 3) not like (new.id::text || '-%.vtt')
       or array_length(string_to_array(new.captions_path, '/'), 1) <> 3 then
      raise exception 'room video caption path must use the canonical campus/room/video-id-token.vtt shape' using errcode = '23514';
    end if;
    select case when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
           o.metadata->>'mimetype'
      into v_object_size, v_object_mime
      from storage.objects o
     where o.bucket_id = 'emergency-evacuation-videos' and o.name = new.captions_path;
    if not found or v_object_size is distinct from new.captions_size_bytes
       or v_object_size not between 1 and 1048576 or v_object_mime is distinct from 'text/vtt' then
      raise exception 'room video caption metadata must match a private WebVTT object within the size limit' using errcode = '23514';
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
    raise exception 'uploaded room video identity and source metadata are immutable; upload a replacement object' using errcode = '23514';
  end if;
  -- Titles and captions are shown to students. Changing either field on a
  -- published video withdraws its prior approval and requires a new explicit
  -- Admin Publish action. Apply this in the database as well as the UI so a
  -- direct authenticated update cannot keep old approval on changed metadata.
  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'published'
     and (new.title is distinct from old.title
       or new.captions_path is distinct from old.captions_path
       or new.captions_size_bytes is distinct from old.captions_size_bytes) then
    new.status := 'draft';
    new.approved_by := null;
    new.published_at := null;
  end if;
  if tg_op = 'UPDATE' and new.status = 'published' and old.status <> 'published'
     and new.approved_by is distinct from auth.uid() then
    raise exception 'the administrator publishing this room video must be recorded as its reviewer' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists room_video_metadata_validate on public.room_videos;
create trigger room_video_metadata_validate
  before insert or update on public.room_videos
  for each row execute function public.validate_room_video_metadata();

alter table public.room_videos enable row level security;
revoke all on table public.room_videos from anon, authenticated;
grant select, insert, update, delete on table public.room_videos to authenticated;

drop policy if exists room_videos_admin_select on public.room_videos;
create policy room_videos_admin_select on public.room_videos for select to authenticated
  using (public.is_admin());
drop policy if exists room_videos_admin_insert on public.room_videos;
create policy room_videos_admin_insert on public.room_videos for insert to authenticated
  with check (public.is_admin() and uploaded_by = auth.uid() and status = 'draft'
    and approved_by is null and published_at is null);
drop policy if exists room_videos_admin_update on public.room_videos;
create policy room_videos_admin_update on public.room_videos for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and (status <> 'published' or (approved_by is not null and published_at is not null)));
drop policy if exists room_videos_admin_delete on public.room_videos;
create policy room_videos_admin_delete on public.room_videos for delete to authenticated
  using (public.is_admin());

create or replace function public.is_published_room_video(p_video_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_videos v
    join public.campuses c on c.id = v.campus_id
    join public.campus_versions cv on cv.id = c.latest_published_version_id and cv.campus_id = c.id
    cross join lateral jsonb_array_elements(case
      when jsonb_typeof(cv.snapshot->'structure'->'map_elements') = 'array' then cv.snapshot->'structure'->'map_elements'
      when jsonb_typeof(cv.snapshot->'map_elements') = 'array' then cv.snapshot->'map_elements'
      else '[]'::jsonb
    end) element
    where v.id = p_video_id
      and v.status = 'published'
      and v.approved_by is not null
      and v.published_at is not null
      and c.status = 'published'
      and c.archived_at is null
      and cv.state = 'published'
      and element->>'id' = v.room_id::text
      and element->>'campus_id' = v.campus_id::text
      and element->>'building_id' = v.building_id::text
      and element->>'floor_id' = v.floor_id::text
      and element->'metadata'->>'kind' = 'room'
  );
$$;

create or replace function public.is_published_room_video_path(p_path text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.room_videos v
    where (v.storage_path = p_path or v.captions_path = p_path)
      and public.is_published_room_video(v.id)
  );
$$;

create or replace function public.get_published_room_videos_for_room(p_campus_id uuid, p_room_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'campus_id', v.campus_id, 'building_id', v.building_id,
    'floor_id', v.floor_id, 'room_id', v.room_id, 'storage_path', v.storage_path,
    'captions_path', v.captions_path, 'original_filename', v.original_filename,
    'mime_type', v.mime_type, 'file_size_bytes', v.file_size_bytes,
    'title', v.title, 'duration_seconds', v.duration_seconds, 'updated_at', v.updated_at
  ) order by v.updated_at desc), '[]'::jsonb)
  from public.room_videos v
  where v.campus_id = p_campus_id and v.room_id = p_room_id
    and public.is_published_room_video(v.id);
$$;

revoke all on function public.validate_room_video_metadata() from public, anon, authenticated;
revoke all on function public.is_published_room_video(uuid) from public, anon, authenticated;
revoke all on function public.is_published_room_video_path(text) from public, anon, authenticated;
revoke all on function public.get_published_room_videos_for_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_published_room_video(uuid) to anon, authenticated;
grant execute on function public.is_published_room_video_path(text) to anon, authenticated;
grant execute on function public.get_published_room_videos_for_room(uuid, uuid) to anon, authenticated;

drop policy if exists emergency_videos_student_select_published on storage.objects;
create policy emergency_videos_student_select_published on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'emergency-evacuation-videos'
    and (public.is_published_emergency_evacuation_video_path(name)
      or public.is_published_room_video_path(name))
  );

comment on table public.room_videos is
  'General Room Video metadata. Publishing is independently reviewed and tied to an active Room in the latest published campus snapshot; no emergency route fingerprint is required.';
