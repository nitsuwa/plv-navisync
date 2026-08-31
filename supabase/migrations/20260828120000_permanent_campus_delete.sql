-- Permanent campus deletion contract.
--
-- Structural/map data already belongs to a campus through cascading foreign
-- keys. This migration adds the one transactional operation that is allowed
-- to remove an archived campus and its protected snapshots. Reports are
-- retained as administrative history, but are detached from the deleted
-- campus so they cannot block or orphan the deletion.

begin;

-- Reports are history, not map-owned authored data. Keep the report row and
-- its text/status, but allow the campus association to disappear when the
-- campus is permanently removed.
alter table public.reports
  drop constraint if exists reports_campus_id_fkey;

alter table public.reports
  alter column campus_id drop not null;

alter table public.reports
  add constraint reports_campus_id_fkey
  foreign key (campus_id)
  references public.campuses (id)
  on delete set null;

-- Keep the lifecycle contract's published-campus protection explicit. The
-- existing archive UI already asks the administrator to unpublish first; this
-- trigger prevents a direct status update from bypassing that guard and then
-- reaching the permanent-delete RPC as a falsely archived campus.
create or replace function public.prevent_published_campus_archive()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'published' and new.status = 'archived' then
    raise exception 'unpublish this campus before archiving it' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_published_campus_archive() from public, anon, authenticated;

drop trigger if exists campus_prevent_published_archive on public.campuses;
create trigger campus_prevent_published_archive
  before update on public.campuses
  for each row execute function public.prevent_published_campus_archive();

-- Published snapshots remain protected from ordinary administrator deletes.
-- The permanent-delete RPC sets a transaction-local marker containing the
-- exact campus being removed; only a published snapshot for that campus may
-- pass this trigger during that one authoritative operation.
create or replace function public.protect_published_campus_versions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'published'
       and (
         current_user <> (
           select r.rolname
             from pg_catalog.pg_proc p
             join pg_catalog.pg_roles r on r.oid = p.proowner
            where p.oid = 'public.permanently_delete_campus(uuid)'::pg_catalog.regprocedure
         )
         or current_setting('plv.permanently_deleting_campus', true)
             is distinct from old.campus_id::text
       ) then
      raise exception 'published campus versions cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.state = 'superseded' then
      raise exception 'superseded campus versions are immutable';
    end if;

    if old.state = 'published' then
      if coalesce(new.state, old.state) <> 'superseded' then
        raise exception 'published campus versions are immutable; only the transition to superseded is allowed';
      end if;
      if new.id is distinct from old.id
         or new.campus_id is distinct from old.campus_id
         or new.version_number is distinct from old.version_number
         or new.snapshot is distinct from old.snapshot
         or new.change_summary is distinct from old.change_summary
         or new.validation_score is distinct from old.validation_score
         or new.created_by is distinct from old.created_by
         or new.published_by is distinct from old.published_by
         or new.created_at is distinct from old.created_at
         or new.published_at is distinct from old.published_at then
        raise exception 'published campus versions may only change the state column when transitioning to superseded';
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

-- The baseline schema installs this trigger on the versions table. Reassert
-- the exact binding here so an existing database cannot retain an older or
-- differently named protection trigger when this contract is applied.
drop trigger if exists campus_versions_immutable_published on public.campus_versions;
create trigger campus_versions_immutable_published
  before update or delete on public.campus_versions
  for each row execute function public.protect_published_campus_versions();

-- A campus is removable only through this function. It is intentionally
-- security-definer and fixed-search-path so the browser never performs a
-- best-effort chain of child deletes. The function is atomic by PostgreSQL
-- transaction semantics: any exception rolls back every delete/reconciliation.
create or replace function public.permanently_delete_campus(target_campus_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reports_preserved bigint;
begin
  if not public.is_admin() then
    raise exception 'administrator access is required to permanently delete a campus'
      using errcode = '42501';
  end if;

  select c.status
    into v_status
    from public.campuses c
   where c.id = target_campus_id
   for update;

  if not found then
    raise exception 'campus not found' using errcode = 'P0002';
  end if;

  if v_status <> 'archived' then
    raise exception 'only archived campuses can be permanently deleted'
      using errcode = '22023';
  end if;

  select count(*)
    into v_reports_preserved
    from public.reports r
   where r.campus_id = target_campus_id;

  -- This marker is transaction-local and scoped to this exact campus. It is
  -- consumed by the published-version protection trigger above.
  perform set_config('plv.permanently_deleting_campus', target_campus_id::text, true);

  -- Versions are campus-owned snapshots. Remove them explicitly before the
  -- campus row; published rows are permitted only through the guarded path.
  delete from public.campus_versions
   where campus_id = target_campus_id;

  -- Supabase Storage objects are intentionally not mutated here. The browser
  -- service must list the campus-images and floor-plans prefixes and remove
  -- actual files through the Storage API before invoking this relational RPC.
  -- This keeps the database operation transactional without orphaning files
  -- or relying on direct storage.objects mutations.

  -- Reports remain as audit/history records and detach via ON DELETE SET NULL.
  -- All authored/map tables with campus-owned cascade FKs, including
  -- buildings, floors, map elements, navigation nodes/edges, events,
  -- announcements, favorites, validation runs, and settings, are removed by
  -- this one campus delete. Activity logs intentionally detach their campus
  -- reference via their existing ON DELETE SET NULL contract.
  delete from public.campuses
   where id = target_campus_id;

  if not found then
    raise exception 'campus deletion did not complete';
  end if;

  return jsonb_build_object(
    'campus_id', target_campus_id,
    'deleted', true,
    'reports_preserved', v_reports_preserved
  );
end;
$$;

revoke all on function public.permanently_delete_campus(uuid) from public, anon;
grant execute on function public.permanently_delete_campus(uuid) to authenticated, service_role;

comment on function public.permanently_delete_campus(uuid) is
  'Atomically permanently deletes an archived campus and its authored data; preserves reports as detached history.';

commit;
