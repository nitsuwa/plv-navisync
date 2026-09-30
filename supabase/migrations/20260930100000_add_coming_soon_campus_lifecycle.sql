-- Add a student-safe announcement state without making authored campus
-- structure or draft snapshots publicly readable.

alter table public.campuses
  drop constraint if exists campuses_status_check;

alter table public.campuses
  add constraint campuses_status_check
    check (status in ('draft', 'coming_soon', 'published', 'archived'));

create or replace function public.enforce_campus_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  new.name := btrim(new.name);
  new.code := upper(btrim(new.code));
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.address := nullif(btrim(coalesce(new.address, '')), '');
  new.city := nullif(btrim(coalesce(new.city, '')), '');
  new.province := nullif(btrim(coalesce(new.province, '')), '');
  new.postal_code := nullif(btrim(coalesce(new.postal_code, '')), '');

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'coming_soon')
       or new.archived_at is not null
       or new.latest_published_version_id is not null then
      raise exception using errcode = '23514', message = 'new campuses must begin as drafts or coming soon announcements';
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

  -- Preserve the existing narrowly-scoped pointer detach used by the guarded
  -- permanent-delete RPC. It is not a general archived-campus edit path.
  if tg_op = 'UPDATE'
     and old.status = 'archived'
     and new.status = 'archived'
     and new.archived_at is not distinct from old.archived_at
     and old.latest_published_version_id is not null
     and new.latest_published_version_id is null
     and pg_catalog.current_setting('plv.permanently_deleting_campus', true) = old.id::text then
    v_old := pg_catalog.to_jsonb(old);
    v_new := pg_catalog.to_jsonb(new);
    if (v_old - 'latest_published_version_id') = (v_new - 'latest_published_version_id')
       and current_user = (
         select r.rolname
         from pg_catalog.pg_proc p
         join pg_catalog.pg_roles r on r.oid = p.proowner
         where p.oid = 'public.permanently_delete_campus(uuid)'::pg_catalog.regprocedure
       ) then
      return new;
    end if;
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
  'Internal trigger enforcing draft/Coming Soon creation, immutable creator identity, archive semantics, safe restoration, and guarded permanent-delete pointer detachment.';

revoke all on function public.enforce_campus_lifecycle() from public, anon, authenticated;

-- This definer RPC intentionally returns an allowlist of announcement fields.
-- Public clients cannot SELECT the campus row or any draft map structure.
create or replace function public.list_coming_soon_campuses()
returns table (
  id uuid,
  name text,
  code text,
  description text,
  address text,
  city text,
  province text,
  theme_color text
)
language sql
security definer
stable
set search_path = ''
as $$
  select c.id, c.name, c.code, c.description, c.address, c.city, c.province, c.theme_color
  from public.campuses c
  where c.status = 'coming_soon'
    and c.archived_at is null
  order by c.name;
$$;

revoke all on function public.list_coming_soon_campuses() from public;
grant execute on function public.list_coming_soon_campuses() to anon, authenticated;

comment on function public.list_coming_soon_campuses() is
  'Returns safe announcement metadata only; does not expose campus rows, map content, or draft structure.';
