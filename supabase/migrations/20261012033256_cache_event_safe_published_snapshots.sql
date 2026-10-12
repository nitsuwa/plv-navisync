-- Compute the public-safe projection once when a version is published instead
-- of rebuilding the large JSONB arrays for every Student Map cold load.
create table private.campus_public_safe_snapshots (
  campus_version_id uuid primary key
    references public.campus_versions(id) on delete cascade,
  snapshot jsonb not null
);

comment on table private.campus_public_safe_snapshots is
  'Private event-free projections of immutable published campus versions; never exposed through the public API.';

alter table private.campus_public_safe_snapshots enable row level security;
revoke all on table private.campus_public_safe_snapshots from public, anon, authenticated;

create function private.cache_published_campus_safe_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cache_snapshot boolean := false;
begin
  if tg_op = 'INSERT' then
    v_cache_snapshot := new.state = 'published';
  elsif tg_op = 'UPDATE' then
    if old.state = 'published' and new.state <> 'published' then
      delete from private.campus_public_safe_snapshots
       where campus_version_id = old.id;
    end if;
    v_cache_snapshot := old.state is distinct from 'published'
                        and new.state = 'published';
  end if;

  if v_cache_snapshot then
    insert into private.campus_public_safe_snapshots (campus_version_id, snapshot)
    values (new.id, public.event_free_campus_snapshot(new.snapshot))
    on conflict (campus_version_id) do update
      set snapshot = excluded.snapshot;
  end if;

  return new;
end;
$$;
revoke all on function private.cache_published_campus_safe_snapshot() from public, anon, authenticated;

create trigger cache_published_campus_safe_snapshot
after insert or update of state on public.campus_versions
for each row execute function private.cache_published_campus_safe_snapshot();

-- Materialize the currently published versions once. Future versions are
-- cached by the trigger in the same transaction as publish_campus_version.
insert into private.campus_public_safe_snapshots (campus_version_id, snapshot)
select version.id,
       public.event_free_campus_snapshot(version.snapshot)
  from public.campus_versions version
  join public.campuses campus on campus.id = version.campus_id
 where version.state = 'published'
   and version.id = campus.latest_published_version_id
   and campus.status = 'published'
   and campus.archived_at is null
on conflict (campus_version_id) do nothing;

create or replace function public.list_event_safe_published_campuses()
returns table(campus_id uuid, snapshot jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select version.campus_id,
         coalesce(safe_snapshot.snapshot, public.event_free_campus_snapshot(version.snapshot)),
         version.published_at
    from public.campus_versions version
    join public.campuses campus on campus.id = version.campus_id
    left join private.campus_public_safe_snapshots safe_snapshot
      on safe_snapshot.campus_version_id = version.id
   where version.state = 'published'
     and version.id = campus.latest_published_version_id
     and campus.status = 'published'
     and campus.archived_at is null
   order by version.published_at desc;
$$;
revoke all on function public.list_event_safe_published_campuses() from public;
grant execute on function public.list_event_safe_published_campuses() to anon, authenticated;
