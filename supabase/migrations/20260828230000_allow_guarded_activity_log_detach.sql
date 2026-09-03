-- Allow the permanent campus-delete contract to detach audit activity logs.
--
-- activity_logs is intentionally append-only. Its campus_id FK is
-- ON DELETE SET NULL so audit history survives a campus deletion, but the
-- FK's internal UPDATE is still observed by activity_logs_append_only. The
-- only permitted mutation below is that exact detach, while the guarded
-- SECURITY DEFINER permanent-delete function is executing for the same
-- campus. All ordinary UPDATE/DELETE attempts remain rejected.

begin;

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'activity_logs' then
    v_old := pg_catalog.to_jsonb(old);
    v_new := pg_catalog.to_jsonb(new);

    if current_user = (
         select r.rolname
           from pg_catalog.pg_proc p
           join pg_catalog.pg_roles r on r.oid = p.proowner
          where p.oid = 'public.permanently_delete_campus(uuid)'::pg_catalog.regprocedure
       )
       and v_old ->> 'campus_id' is not null
       and v_new ->> 'campus_id' is null
       and (v_old - 'campus_id') = (v_new - 'campus_id')
       and pg_catalog.current_setting('plv.permanently_deleting_campus', true)
             = v_old ->> 'campus_id' then
      return new;
    end if;
  end if;

  raise exception 'this table is append-only and cannot be updated or deleted';
end;
$$;

comment on function public.prevent_append_only_mutation() is
  'Rejects activity-log/report-history mutations, except the exact campus_id detach performed by permanently_delete_campus.';

-- Deleting a published campus_version also clears the reverse
-- campuses.latest_published_version_id FK.  That is a system-owned pointer
-- detach, not an administrator restoring or editing an archived campus.  The
-- lifecycle trigger must allow only that exact detach during the guarded
-- permanent-delete RPC; all normal archived-campus mutations remain blocked.
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

  -- The campus_versions FK action clears only this pointer while the
  -- permanent-delete function owns the exact campus.  Check the complete row
  -- apart from that pointer so this exception cannot become a general archive
  -- edit bypass.
  if tg_op = 'UPDATE'
     and old.status = 'archived'
     and new.status = 'archived'
     and new.archived_at is not distinct from old.archived_at
     and old.latest_published_version_id is not null
     and new.latest_published_version_id is null
     and pg_catalog.current_setting('plv.permanently_deleting_campus', true)
           = old.id::text then
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
  'Internal trigger enforcing private creation, immutable creator identity, archive semantics, safe draft-only restoration, and guarded permanent-delete pointer detachment.';

commit;
