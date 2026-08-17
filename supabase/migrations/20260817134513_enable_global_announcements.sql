-- Announcements are system-wide by default. Campus-scoped notices retain the
-- existing campus publication boundary, while global announcement text may be
-- published independently of the map/campus lifecycle.
alter table public.announcements
  add column if not exists audience_scope text not null default 'global';

alter table public.announcements
  drop constraint if exists announcements_audience_scope_check;

alter table public.announcements
  add constraint announcements_audience_scope_check
  check (audience_scope in ('global', 'campus'));

comment on column public.announcements.audience_scope is
  'global announcements are public independently of campus publication; campus announcements require a published campus';

drop policy if exists "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
  on public.announcements
  for select
  to anon, authenticated
  using (
    status = 'published'
    and archived_at is null
    and (
      audience_scope = 'global'
      or (
        audience_scope = 'campus'
        and public.campus_is_published(campus_id)
      )
    )
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at >= now())
  );

-- Location mappings can expose draft buildings/floors. Even when their parent
-- text is global, mapped location rows remain private until the campus itself
-- is published.
drop policy if exists "announcement_locations_select_public" on public.announcement_locations;
create policy "announcement_locations_select_public"
  on public.announcement_locations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.status = 'published'
        and a.archived_at is null
        and public.campus_is_published(a.campus_id)
        and (a.starts_at is null or a.starts_at <= now())
        and (a.expires_at is null or a.expires_at >= now())
    )
  );
