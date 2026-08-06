-- A4: persistent campus lifecycle, metadata contract, and campus image storage.
-- The applied 001 baseline remains unchanged.

alter table public.campuses
  add column city text,
  add column province text,
  add column postal_code text,
  add column theme_color text not null default '#1e3a5f';

alter table public.campuses
  add constraint campuses_name_length_check
    check (length(btrim(name)) between 1 and 120),
  add constraint campuses_code_format_check
    check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
  add constraint campuses_description_length_check
    check (description is null or length(description) <= 2000),
  add constraint campuses_address_length_check
    check (address is null or length(address) <= 300),
  add constraint campuses_city_length_check
    check (city is null or length(city) <= 120),
  add constraint campuses_province_length_check
    check (province is null or length(province) <= 120),
  add constraint campuses_postal_code_length_check
    check (postal_code is null or length(postal_code) <= 20),
  add constraint campuses_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  add constraint campuses_longitude_range_check
    check (longitude is null or longitude between -180 and 180),
  add constraint campuses_canvas_bounds_check
    check (canvas_width between 320 and 5000 and canvas_height between 240 and 5000),
  add constraint campuses_theme_color_check
    check (theme_color ~ '^#[0-9A-Fa-f]{6}$');

create index campus_versions_current_draft_idx
  on public.campus_versions (campus_id, version_number desc)
  where state = 'draft';

create or replace function public.enforce_campus_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.code := upper(btrim(new.code));
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.address := nullif(btrim(coalesce(new.address, '')), '');
  new.city := nullif(btrim(coalesce(new.city, '')), '');
  new.province := nullif(btrim(coalesce(new.province, '')), '');
  new.postal_code := nullif(btrim(coalesce(new.postal_code, '')), '');

  if tg_op = 'INSERT' then
    if new.status <> 'draft'
       or new.archived_at is not null
       or new.latest_published_version_id is not null then
      raise exception using errcode = '23514', message = 'new campuses must begin as private drafts';
    end if;
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.updated_by := auth.uid();
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception using errcode = '23514', message = 'campus identity and creator fields are immutable';
  end if;

  if old.status = 'archived' then
    if new.status <> 'draft' or new.archived_at is not null then
      raise exception using errcode = '23514', message = 'archived campuses may only be restored as private drafts';
    end if;
    if new.name is distinct from old.name
       or new.code is distinct from old.code
       or new.description is distinct from old.description
       or new.address is distinct from old.address
       or new.city is distinct from old.city
       or new.province is distinct from old.province
       or new.postal_code is distinct from old.postal_code
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
       or new.logo_path is distinct from old.logo_path
       or new.overview_image_path is distinct from old.overview_image_path
       or new.theme_color is distinct from old.theme_color
       or new.canvas_width is distinct from old.canvas_width
       or new.canvas_height is distinct from old.canvas_height
       or new.map_scale_m_per_unit is distinct from old.map_scale_m_per_unit
       or new.latest_published_version_id is distinct from old.latest_published_version_id then
      raise exception using errcode = '23514', message = 'restore the campus before editing its details';
    end if;
  end if;

  if new.status = 'archived' then
    if new.archived_at is null or new.is_default then
      raise exception using errcode = '23514', message = 'archived campuses require archived_at and cannot be active';
    end if;
  elsif new.archived_at is not null then
    raise exception using errcode = '23514', message = 'non-archived campuses cannot retain archived_at';
  end if;

  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.enforce_campus_lifecycle() is
  'Internal trigger enforcing private creation, immutable creator identity, archive semantics, and safe draft-only restoration.';

revoke all on function public.enforce_campus_lifecycle() from public, anon, authenticated;

drop trigger if exists campus_lifecycle_guard on public.campuses;
create trigger campus_lifecycle_guard
  before insert or update on public.campuses
  for each row execute function public.enforce_campus_lifecycle();

drop policy if exists "campus_versions_select_public" on public.campus_versions;
create policy "campus_versions_select_public"
  on public.campus_versions
  for select
  to anon, authenticated
  using (
    state = 'published'
    and id = (
      select c.latest_published_version_id
      from public.campuses c
      where c.id = campus_id
        and c.status = 'published'
        and c.archived_at is null
    )
  );

-- Explicit Data API exposure survives the 2026 Supabase default-grant change.
revoke all on table public.campuses, public.campus_versions from anon, authenticated;
grant select on table public.campuses, public.campus_versions to anon;
grant select, insert, update on table public.campuses, public.campus_versions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campus-images',
  'campus-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "campus_images_select_published" on storage.objects;
create policy "campus_images_select_published"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'campus-images'
    and exists (
      select 1
      from public.campuses c
      where c.status = 'published'
        and c.archived_at is null
        and name in (c.logo_path, c.overview_image_path)
    )
  );

drop policy if exists "campus_images_select_admin" on storage.objects;
create policy "campus_images_select_admin"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'campus-images' and public.is_admin());

drop policy if exists "campus_images_insert_admin" on storage.objects;
create policy "campus_images_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'campus-images'
    and public.is_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "campus_images_update_admin" on storage.objects;
create policy "campus_images_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'campus-images' and public.is_admin())
  with check (
    bucket_id = 'campus-images'
    and public.is_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "campus_images_delete_admin" on storage.objects;
create policy "campus_images_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'campus-images' and public.is_admin());
