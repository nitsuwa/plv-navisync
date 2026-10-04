create or replace function public.guard_event_overlay_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_event boolean := false;
  v_new_event boolean := false;
  v_admin_command boolean := coalesce(current_setting('app.event_admin_command', true), '') = 'on';
  v_old_status text;
  v_new_status text;
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    v_old_event := coalesce(old.element_type = 'event_overlay' or old.metadata->>'kind' = 'event_overlay', false);
    v_old_status := coalesce(old.metadata->>'status', 'draft');
  end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    v_new_event := coalesce(new.element_type = 'event_overlay' or new.metadata->>'kind' = 'event_overlay', false);
    v_new_status := coalesce(new.metadata->>'status', 'draft');
  end if;

  if tg_op = 'DELETE' then
    if not v_old_event then return old; end if;
    if v_old_status in ('pending', 'approved') then
      raise exception 'Submitted and approved event maps cannot be deleted.' using errcode = '42501';
    end if;
    if not public.is_admin() and not (public.is_student_org() and old.metadata->>'createdByUserId' = auth.uid()::text) then
      raise exception 'Only the event owner or an administrator may delete this draft.' using errcode = '42501';
    end if;
    return old;
  end if;

  if not v_old_event and not v_new_event then return new; end if;
  if not v_new_event or (tg_op = 'UPDATE' and not v_old_event) then
    raise exception 'Event identity cannot be changed.' using errcode = '42501';
  end if;

  if v_admin_command then
    if not public.is_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
    return new;
  end if;
  if public.is_admin() then
    raise exception 'Use the atomic event review or publication command.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not public.is_student_org()
       or new.metadata->>'createdByUserId' is distinct from auth.uid()::text
       or not public.campus_is_published(new.campus_id)
       or v_new_status <> 'draft'
       or new.metadata ?| array['dateStart','dateEnd','publicationAt','adminComment','locationFeedback'] then
      raise exception 'Student organizations may only create date-free event drafts for published campuses.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not public.is_student_org()
     or old.metadata->>'createdByUserId' is distinct from auth.uid()::text
     or new.metadata->>'createdByUserId' is distinct from old.metadata->>'createdByUserId'
     or new.campus_id is distinct from old.campus_id
     or new.element_type is distinct from old.element_type
     or new.metadata->>'kind' is distinct from old.metadata->>'kind'
     or new.metadata->'dateStart' is distinct from old.metadata->'dateStart'
     or new.metadata->'dateEnd' is distinct from old.metadata->'dateEnd'
     or new.metadata->'publicationAt' is distinct from old.metadata->'publicationAt'
     or new.metadata->'isActive' is distinct from old.metadata->'isActive'
     or new.metadata->'id' is distinct from old.metadata->'id' then
    raise exception 'Event ownership, campus, schedule and publication are protected.' using errcode = '42501';
  end if;
  if v_old_status not in ('draft', 'disapproved', 'pending')
     or v_new_status not in ('draft', 'pending')
     or (v_old_status = 'draft' and v_new_status not in ('draft', 'pending')) then
    raise exception 'Submitted event maps are locked until administrator feedback.' using errcode = '42501';
  end if;
  if v_new_status = 'pending' and v_old_status in ('draft', 'disapproved') then
    if coalesce(new.metadata->>'adminComment', '') <> '' or coalesce(new.metadata->'locationFeedback', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb) then
      raise exception 'Resubmission must clear current feedback; previous feedback remains in history.' using errcode = '42501';
    end if;
  elsif coalesce(new.metadata->'adminComment', 'null'::jsonb) is distinct from coalesce(old.metadata->'adminComment', 'null'::jsonb)
     or coalesce(new.metadata->'locationFeedback', '{}'::jsonb) is distinct from coalesce(old.metadata->'locationFeedback', '{}'::jsonb) then
    raise exception 'Only administrators may change review feedback.' using errcode = '42501';
  end if;
  if new.metadata->'revision' is distinct from old.metadata->'revision'
     or new.metadata->'lastEditedAt' is distinct from old.metadata->'lastEditedAt' then
    raise exception 'Revision timestamps are server managed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Apply after event_publication_management and super_admin migrations.
-- Additive audit storage: no event, campus, or layout rows are deleted/backfilled.
create table public.event_layout_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  owner_id text,
  actor_id uuid,
  action text not null,
  created_at timestamptz not null default clock_timestamp(),
  before_metadata jsonb not null default '{}'::jsonb,
  after_metadata jsonb not null
);
create index event_layout_revisions_event_time_idx on public.event_layout_revisions(event_id, created_at desc, id desc);
alter table public.event_layout_revisions enable row level security;
revoke all on public.event_layout_revisions from anon, authenticated;
grant select on public.event_layout_revisions to authenticated;
create policy event_revision_read on public.event_layout_revisions for select to authenticated
  using (public.is_admin() or (public.is_student_org() and owner_id = (select auth.uid())::text));

create or replace function public.stamp_event_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_before jsonb := '{}'::jsonb; v_content_changed boolean;
begin
  if new.element_type <> 'event_overlay' and coalesce(new.metadata->>'kind', '') <> 'event_overlay' then return new; end if;
  if tg_op = 'UPDATE' then v_before := coalesce(old.metadata, '{}'::jsonb); end if;
  if tg_op = 'UPDATE' and new.metadata = old.metadata and new.name is not distinct from old.name then return new; end if;
  v_content_changed := tg_op = 'INSERT' or
    (new.metadata - array['status','submittedAt','publicationAt','dateStart','dateEnd','adminComment','locationFeedback','isActive','revision','lastEditedAt'])
      is distinct from (v_before - array['status','submittedAt','publicationAt','dateStart','dateEnd','adminComment','locationFeedback','isActive','revision','lastEditedAt']);
  new.updated_at := clock_timestamp();
  new.metadata := new.metadata || jsonb_build_object('revision', coalesce((v_before->>'revision')::integer, 0) + 1);
  if v_content_changed then new.metadata := new.metadata || jsonb_build_object('lastEditedAt', new.updated_at); end if;
  if new.metadata->>'status' = 'pending' and coalesce(v_before->>'status', 'draft') <> 'pending' then
    new.metadata := new.metadata || jsonb_build_object('submittedAt', new.updated_at);
  end if;
  return new;
end $$;
revoke all on function public.stamp_event_revision() from public;
create trigger zz_stamp_event_revision before insert or update on public.map_elements for each row execute function public.stamp_event_revision();

create or replace function public.capture_event_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_before jsonb := '{}'::jsonb; v_action text := 'edited';
begin
  if new.element_type <> 'event_overlay' and coalesce(new.metadata->>'kind', '') <> 'event_overlay' then return new; end if;
  if tg_op = 'INSERT' then v_action := 'created';
  else
    v_before := old.metadata;
    if new.metadata = old.metadata and new.name is not distinct from old.name then return new; end if;
    if new.metadata->>'status' = 'pending' and old.metadata->>'status' is distinct from 'pending' then v_action := 'submitted';
    elsif old.metadata->>'status' = 'pending' and new.metadata->>'status' = 'draft' then v_action := 'withdrawn';
    elsif new.metadata->>'status' in ('approved', 'disapproved') and new.metadata->>'status' is distinct from old.metadata->>'status' then v_action := new.metadata->>'status';
    end if;
  end if;
  insert into public.event_layout_revisions(event_id, owner_id, actor_id, action, before_metadata, after_metadata)
    values (new.id, new.metadata->>'createdByUserId', auth.uid(), v_action, v_before, new.metadata);
  return new;
end $$;
revoke all on function public.capture_event_revision() from public;
create trigger capture_event_revision after insert or update on public.map_elements for each row execute function public.capture_event_revision();

create or replace function public.save_pending_event_layout(p_overlay_id uuid, p_expected_updated_at timestamptz, p_locations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.map_elements%rowtype; v_after jsonb; v_snapshot jsonb;
begin
  select * into v_event from public.map_elements where id = p_overlay_id and archived_at is null
    and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay') for update;
  if not found or not public.is_student_org() or v_event.metadata->>'createdByUserId' is distinct from auth.uid()::text then
    raise exception 'Only the event owner can edit this submission.' using errcode = '42501'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then
    raise exception 'This event changed. Refresh before saving.' using errcode = '40001'; end if;
  if v_event.metadata->>'status' <> 'pending' then raise exception 'This submission is no longer pending. Refresh before editing.' using errcode = '23514'; end if;
  if jsonb_typeof(p_locations) is distinct from 'array' or jsonb_array_length(p_locations) = 0 then
    raise exception 'At least one requested location is required.' using errcode = '23514'; end if;
  v_after := v_event.metadata || jsonb_build_object('locations', p_locations, 'locationRef', p_locations->0->'locationRef',
    'eventFurniture', coalesce(p_locations->0->'eventFurniture', '[]'::jsonb), 'eventLabels', coalesce(p_locations->0->'eventLabels', '[]'::jsonb));
  select version.snapshot into v_snapshot from public.campuses campus join public.campus_versions version
    on version.id = campus.latest_published_version_id and version.campus_id = campus.id and version.state = 'published'
    where campus.id = v_event.campus_id and campus.status = 'published' and campus.archived_at is null;
  if v_snapshot is null or not public.event_locations_match_snapshot(v_snapshot, v_after) then
    raise exception 'Requested locations must exist on the published campus.' using errcode = '23514'; end if;
  update public.map_elements set metadata = v_after where id = v_event.id returning * into v_event;
  return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id, 'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);
end $$;
revoke all on function public.save_pending_event_layout(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.save_pending_event_layout(uuid, timestamptz, jsonb) to authenticated;

create or replace function public.withdraw_event_submission(p_overlay_id uuid, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.map_elements%rowtype;
begin
  select * into v_event from public.map_elements where id = p_overlay_id and archived_at is null
    and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay') for update;
  if not found or not public.is_student_org() or v_event.metadata->>'createdByUserId' is distinct from auth.uid()::text then
    raise exception 'Only the event owner can withdraw it.' using errcode = '42501'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then
    raise exception 'This event changed. Refresh before withdrawing.' using errcode = '40001'; end if;
  if v_event.metadata->>'status' <> 'pending' then raise exception 'Only pending submissions can be withdrawn.' using errcode = '23514'; end if;
  update public.map_elements set metadata = metadata || jsonb_build_object('status', 'draft', 'submittedAt', null)
    where id = v_event.id returning * into v_event;
  return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id, 'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);
end $$;
revoke all on function public.withdraw_event_submission(uuid, timestamptz) from public, anon;
grant execute on function public.withdraw_event_submission(uuid, timestamptz) to authenticated;

create or replace function public.list_event_revisions(p_overlay_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_event public.map_elements%rowtype; v_result jsonb;
begin
  select * into v_event from public.map_elements where id = p_overlay_id
    and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay');
  if not found or not (public.is_admin() or (public.is_student_org() and v_event.metadata->>'createdByUserId' = auth.uid()::text)) then
    raise exception 'Event history access denied.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'action', action, 'createdAt', created_at,
    'actorId', actor_id, 'before', before_metadata, 'after', after_metadata) order by created_at desc, id desc), '[]'::jsonb) into v_result
    from (select * from public.event_layout_revisions where event_id = p_overlay_id order by created_at desc, id desc limit 100) history;
  return v_result;
end $$;
revoke all on function public.list_event_revisions(uuid) from public, anon;
grant execute on function public.list_event_revisions(uuid) to authenticated;
notify pgrst, 'reload schema';
