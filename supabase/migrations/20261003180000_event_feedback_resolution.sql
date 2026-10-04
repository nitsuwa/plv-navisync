BEGIN;

-- Decode only the existing allowlisted pin format. Legacy comments have no pins.
create or replace function public.event_feedback_pins(p_metadata jsonb)
returns table(location_id text, pin_id text, feedback text)
language plpgsql immutable set search_path = '' as $$
declare v_entry record; v_data jsonb; v_pin jsonb; v_count integer;
begin
  for v_entry in select * from jsonb_each_text(case when jsonb_typeof(p_metadata->'locationFeedback') = 'object' then p_metadata->'locationFeedback' else '{}'::jsonb end) loop
    if left(v_entry.value, 19) <> '@event-feedback/v1:' then continue; end if;
    begin v_data := substring(v_entry.value from 20)::jsonb;
    exception when invalid_text_representation then continue; end;
    if jsonb_typeof(v_data->'pins') is distinct from 'array' or jsonb_typeof(v_data->'text') is distinct from 'string' then continue; end if;
    v_count := 0;
    for v_pin in select value from jsonb_array_elements(v_data->'pins') loop
      if jsonb_typeof(v_pin->'id') = 'string' and jsonb_typeof(v_pin->'comment') = 'string'
         and btrim(coalesce(v_pin->>'comment', '')) <> '' and jsonb_typeof(v_pin->'x') = 'number' and jsonb_typeof(v_pin->'y') = 'number' then
        if (v_pin->>'x')::numeric >= 0 and (v_pin->>'y')::numeric >= 0 then
          location_id := v_entry.key; pin_id := v_pin->>'id'; feedback := v_entry.value; return next;
          v_count := v_count + 1; if v_count = 30 then exit; end if;
        end if;
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.event_feedback_pins(jsonb) from public, anon, authenticated;

create or replace function public.event_feedback_fully_addressed(p_metadata jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from public.event_feedback_pins(p_metadata) pin
    where p_metadata->'feedbackResolutions'->pin.location_id->pin.pin_id->>'feedback' is distinct from pin.feedback
      or coalesce(p_metadata->'feedbackResolutions'->pin.location_id->pin.pin_id->>'addressedAt', '') = ''
      or coalesce(p_metadata->'feedbackResolutions'->pin.location_id->pin.pin_id->>'addressedBy', '') = ''
  );
$$;
revoke all on function public.event_feedback_fully_addressed(jsonb) from public, anon, authenticated;

create or replace function public.set_event_feedback_pin_addressed(
  p_overlay_id uuid, p_expected_updated_at timestamptz, p_location_id text,
  p_pin_id text, p_addressed boolean, p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.map_elements%rowtype; v_feedback text; v_resolutions jsonb; v_location jsonb;
begin
  select * into v_event from public.map_elements where id = p_overlay_id and archived_at is null
    and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay') for update;
  if not found or not public.is_student_org() or v_event.metadata->>'createdByUserId' is distinct from auth.uid()::text then
    raise exception 'Only the event owner can address feedback.' using errcode = '42501'; end if;
  if v_event.metadata->>'status' not in ('draft', 'disapproved', 'pending') then
    raise exception 'This event is no longer editable.' using errcode = '23514'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then
    raise exception 'This event changed. Refresh before addressing feedback.' using errcode = '40001'; end if;
  if p_addressed is null or length(coalesce(p_note, '')) > 1000 then
    raise exception 'Invalid resolution note.' using errcode = '23514'; end if;
  select feedback into v_feedback from public.event_feedback_pins(v_event.metadata)
    where location_id = p_location_id and pin_id = p_pin_id limit 1;
  if v_feedback is null then raise exception 'Feedback pin no longer exists.' using errcode = '23514'; end if;
  v_resolutions := case when jsonb_typeof(v_event.metadata->'feedbackResolutions') = 'object' then v_event.metadata->'feedbackResolutions' else '{}'::jsonb end;
  v_location := case when jsonb_typeof(v_resolutions->p_location_id) = 'object' then v_resolutions->p_location_id else '{}'::jsonb end;
  if p_addressed then
    v_location := v_location || jsonb_build_object(p_pin_id, jsonb_build_object('feedback', v_feedback,
      'addressedAt', clock_timestamp(), 'addressedBy', auth.uid(), 'note', btrim(coalesce(p_note, ''))));
  else v_location := v_location - p_pin_id; end if;
  perform set_config('app.event_feedback_command', 'on', true);
  update public.map_elements set metadata = metadata || jsonb_build_object('feedbackResolutions',
    v_resolutions || jsonb_build_object(p_location_id, v_location)) where id = v_event.id returning * into v_event;
  perform set_config('app.event_feedback_command', 'off', true);
  return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id, 'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);
end $$;
revoke all on function public.set_event_feedback_pin_addressed(uuid, timestamptz, text, text, boolean, text) from public, anon;
grant execute on function public.set_event_feedback_pin_addressed(uuid, timestamptz, text, text, boolean, text) to authenticated;

-- Guard replacement follows; no event rows or history are rewritten.

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
       or new.metadata ?| array['dateStart','dateEnd','publicationAt','adminComment','locationFeedback','feedbackResolutions'] then
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
  if coalesce(current_setting('app.event_feedback_command', true), '') = 'on' then
    if v_old_status not in ('draft', 'disapproved', 'pending')
       or (new.metadata - 'feedbackResolutions') is distinct from (old.metadata - 'feedbackResolutions') then
      raise exception 'Feedback command may only update the resolution checklist.' using errcode = '42501'; end if;
    return new;
  end if;
  if new.metadata->'feedbackResolutions' is distinct from old.metadata->'feedbackResolutions' then
    raise exception 'Use the feedback resolution command.' using errcode = '42501'; end if;
  if v_old_status not in ('draft', 'disapproved', 'pending')
     or v_new_status not in ('draft', 'pending')
     or (v_old_status = 'draft' and v_new_status not in ('draft', 'pending')) then
    raise exception 'Submitted event maps are locked until administrator feedback.' using errcode = '42501';
  end if;
  if v_new_status = 'pending' and v_old_status in ('draft', 'disapproved') then
    if coalesce(new.metadata->>'adminComment', '') <> '' or coalesce(new.metadata->'locationFeedback', '{}'::jsonb) is distinct from coalesce(old.metadata->'locationFeedback', '{}'::jsonb) or not public.event_feedback_fully_addressed(old.metadata) then
      raise exception 'Address every feedback pin and preserve the original feedback before resubmitting.' using errcode = '42501';
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


notify pgrst, 'reload schema';
COMMIT;
