-- A4 campus lifecycle and Storage assertions. Safe to repeat: every fixture rolls back.
begin;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin' and is_active) then
    raise exception 'A4 test requires one active admin fixture';
  end if;
  if not exists (select 1 from public.profiles where role = 'student' and is_active) then
    raise exception 'A4 test requires one active student fixture';
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role = 'admin' and is_active limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into public.campuses (
  id, name, code, description, city, province, postal_code, theme_color,
  canvas_width, canvas_height, status
) values (
  'a4000000-0000-4000-8000-000000000001', 'A4 Controlled Fixture', 'A4FIXTURE',
  'rolled back after assertions', 'Valenzuela', 'Metro Manila', '1440', '#1e3a5f',
  1200, 800, 'draft'
);

do $$
begin
  if (select status from public.campuses where id = 'a4000000-0000-4000-8000-000000000001') <> 'draft' then
    raise exception 'new campus was not stored as a draft';
  end if;
end $$;

set local role anon;
do $$ begin
  if exists (select 1 from public.campuses where id = 'a4000000-0000-4000-8000-000000000001') then
    raise exception 'guest can read a private draft';
  end if;
end $$;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role = 'student' and is_active limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.campuses where id = 'a4000000-0000-4000-8000-000000000001') then
    raise exception 'student can read a private draft';
  end if;
end $$;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role = 'admin' and is_active limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

update public.campuses
set name = 'A4 First Writer'
where id = 'a4000000-0000-4000-8000-000000000001';

do $$
declare stale_timestamp timestamptz := '2000-01-01 00:00:00+00'; affected integer;
begin
  update public.campuses set name = 'A4 Stale Writer'
  where id = 'a4000000-0000-4000-8000-000000000001' and updated_at = stale_timestamp;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'stale optimistic update unexpectedly succeeded'; end if;
end $$;

update public.campuses
set status = 'archived', archived_at = now()
where id = 'a4000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    update public.campuses set name = 'Illegal Archived Edit'
    where id = 'a4000000-0000-4000-8000-000000000001';
    raise exception 'archived campus metadata edit unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;

update public.campuses
set status = 'draft', archived_at = null
where id = 'a4000000-0000-4000-8000-000000000001';

do $$ begin
  if (select status from public.campuses where id = 'a4000000-0000-4000-8000-000000000001') <> 'draft' then
    raise exception 'restore did not return the campus to a private draft';
  end if;
end $$;

reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'campus-images', 'a4000000-0000-4000-8000-000000000001/logo.png',
  (select id from public.profiles where role = 'admin' and is_active limit 1),
  '{"mimetype":"image/png","size":128}'::jsonb
);

do $$ begin
  if (select file_size_limit from storage.buckets where id = 'campus-images') <> 5242880 then
    raise exception 'campus-images size limit is not 5 MB';
  end if;
  if (select allowed_mime_types from storage.buckets where id = 'campus-images') <> array['image/jpeg','image/png','image/webp']::text[] then
    raise exception 'campus-images MIME allowlist is incorrect';
  end if;
end $$;

set local role anon;
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'campus-images' and name like 'a4000000%') then
    raise exception 'guest can read an image attached to a private draft';
  end if;
end $$;

rollback;
