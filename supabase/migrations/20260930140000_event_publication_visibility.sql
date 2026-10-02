-- Event publication is restricted even when a broader campus SELECT policy applies.
create or replace function public.event_overlay_is_published(metadata jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
begin
 return metadata->>'dateStart' is not null and metadata->>'dateEnd' is not null
   and metadata->>'status' = 'approved'
   and coalesce((metadata->>'isActive')::boolean, true)
   and coalesce((metadata->>'publicationAt')::timestamptz, '-infinity'::timestamptz) <= now()
   and (metadata->>'dateEnd')::timestamptz > now();
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function public.event_overlay_is_published(jsonb) from public;
grant execute on function public.event_overlay_is_published(jsonb) to anon, authenticated;
create policy map_elements_event_publication_guard on public.map_elements
as restrictive for select to authenticated using (
 (element_type <> 'event_overlay' and coalesce(metadata->>'kind', '') <> 'event_overlay') or (select public.is_admin())
 or metadata->>'createdByUserId' = (select auth.uid())::text
 or public.event_overlay_is_published(metadata)
);
create policy map_elements_event_publication_guest_guard on public.map_elements
as restrictive for select to anon using (
 (element_type <> 'event_overlay' and coalesce(metadata->>'kind', '') <> 'event_overlay')
 or public.event_overlay_is_published(metadata)
);
-- Prevent owners from bypassing review via direct JSON updates.
create or replace function public.guard_event_overlay_review()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.element_type <> 'event_overlay' and coalesce(new.metadata->>'kind', '') <> 'event_overlay' then return new; end if;
 if not public.is_admin() and auth.role() <> 'service_role' then
  if new.metadata->>'status' in ('approved','disapproved') then
   raise exception 'Only administrators can review event layouts.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
   if new.metadata ? 'publicationAt' then raise exception 'Only administrators can set publication.' using errcode = '42501'; end if;
  elsif new.metadata->'publicationAt' is distinct from old.metadata->'publicationAt'
     or new.metadata->'createdByUserId' is distinct from old.metadata->'createdByUserId'
     or new.campus_id is distinct from old.campus_id
     or (new.metadata->'adminComment' is distinct from old.metadata->'adminComment' and new.metadata->>'status' <> 'pending')
     or new.metadata->'locationFeedback' is distinct from old.metadata->'locationFeedback' then
   raise exception 'Event ownership, campus and publication cannot be changed.' using errcode = '42501';
  end if;
 end if;
 if new.metadata->>'status' = 'approved' then
  if new.metadata->>'dateStart' is null or new.metadata->>'dateEnd' is null
     or (new.metadata->>'dateEnd')::timestamptz <= (new.metadata->>'dateStart')::timestamptz
     or (new.metadata->>'dateEnd')::timestamptz <= coalesce((new.metadata->>'publicationAt')::timestamptz, now()) then
   raise exception 'Approval requires valid event dates and publication before event end.' using errcode = '23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_event_overlay_review() from public;
create trigger guard_event_overlay_review before insert or update on public.map_elements
for each row execute function public.guard_event_overlay_review();

-- Campus versions are immutable; project out event documents rather than
-- mutating historical snapshots or copying unpublished event data to students.
create or replace function public.event_free_campus_snapshot(snapshot jsonb)
returns jsonb language sql immutable set search_path = '' as $$
 select case when snapshot is null then null else
 jsonb_set(
   jsonb_set(snapshot, '{campus}', coalesce(snapshot->'campus', '{}'::jsonb) - 'eventOverlays', true),
   '{structure,map_elements}',
   coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(snapshot#>'{structure,map_elements}', '[]'::jsonb)) item
     where coalesce(item->>'element_type', '') <> 'event_overlay'
       and coalesce(item#>>'{metadata,kind}', '') <> 'event_overlay'), '[]'::jsonb), true
 ) end;
$$;
revoke all on function public.event_free_campus_snapshot(jsonb) from public;
grant execute on function public.event_free_campus_snapshot(jsonb) to anon, authenticated;
create policy campus_versions_event_data_guard on public.campus_versions
as restrictive for select to authenticated using (
 (select public.is_admin()) or snapshot = public.event_free_campus_snapshot(snapshot)
);
create policy campus_versions_event_data_guest_guard on public.campus_versions
as restrictive for select to anon using (snapshot = public.event_free_campus_snapshot(snapshot));
create or replace function public.list_event_safe_published_campuses()
returns table(campus_id uuid, snapshot jsonb, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select version.campus_id, public.event_free_campus_snapshot(version.snapshot), version.published_at
 from public.campus_versions version join public.campuses campus on campus.id = version.campus_id
 where version.state = 'published' and version.id = campus.latest_published_version_id
   and campus.archived_at is null
 order by version.published_at desc;
$$;
revoke all on function public.list_event_safe_published_campuses() from public;
grant execute on function public.list_event_safe_published_campuses() to anon, authenticated;
