-- Private per-viewer read receipts. Never modifies event content or publication.
begin;

-- Repair the existing activity-history contract on deployments that missed it.
create table if not exists public.admin_activity_preferences (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  activity_cleared_before timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_activity_preferences enable row level security;
drop policy if exists admin_activity_preferences_select_own on public.admin_activity_preferences;
create policy admin_activity_preferences_select_own on public.admin_activity_preferences
  for select to authenticated using (admin_id = (select auth.uid()) and public.is_admin());
revoke all on public.admin_activity_preferences from public, anon, authenticated;
grant select on public.admin_activity_preferences to authenticated;

create or replace function public.get_admin_activity_clear_cutoff()
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  return (select activity_cleared_before from public.admin_activity_preferences where admin_id = auth.uid());
end $$;
create or replace function public.clear_admin_activity_history()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_id uuid := auth.uid();
begin
  if v_id is null or not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  insert into public.admin_activity_preferences(admin_id, activity_cleared_before, updated_at)
  values (v_id, v_now, v_now) on conflict (admin_id) do update
    set activity_cleared_before = excluded.activity_cleared_before, updated_at = excluded.updated_at;
  return v_now;
end $$;
revoke all on function public.get_admin_activity_clear_cutoff() from public, anon;
revoke all on function public.clear_admin_activity_history() from public, anon;
grant execute on function public.get_admin_activity_clear_cutoff() to authenticated;
grant execute on function public.clear_admin_activity_history() to authenticated;

create table if not exists public.event_notification_receipts (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.map_elements(id) on delete cascade,
  stream text not null check (stream in ('admin_submission', 'org_review')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  read_at timestamptz not null default clock_timestamp(),
  primary key (viewer_id, event_id, stream)
);
-- FK cleanup must also be efficient when an event is removed.
create index if not exists event_notification_receipts_event_id_idx on public.event_notification_receipts(event_id);
alter table public.event_notification_receipts enable row level security;
revoke all on public.event_notification_receipts from public, anon, authenticated;
grant select on public.event_notification_receipts to authenticated;
drop policy if exists event_notification_receipts_select_own on public.event_notification_receipts;
create policy event_notification_receipts_select_own on public.event_notification_receipts
for select to authenticated using (
  viewer_id = (select auth.uid()) and (
    (stream = 'admin_submission' and public.is_admin()) or
    (stream = 'org_review' and public.is_student_org() and exists (
      select 1 from public.map_elements e where e.id = event_id
        and e.metadata->>'createdByUserId' = (select auth.uid())::text
    ))
  )
);

-- Private structural payload avoids relying on JavaScript/JSONB key ordering.
create or replace function public.event_notification_payload(p_metadata jsonb, p_stream text)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_stream = 'admin_submission' and p_metadata->>'status' = 'pending' then
      jsonb_build_array(
        case when jsonb_typeof(p_metadata->'submittedAt') = 'string' then p_metadata->>'submittedAt' else '' end,
        case when jsonb_typeof(p_metadata->'lastEditedAt') = 'string' then p_metadata->>'lastEditedAt' else '' end,
        case when jsonb_typeof(p_metadata->'revision') = 'number' then p_metadata->'revision' else '0'::jsonb end)
    when p_stream = 'org_review' and p_metadata->>'status' in ('approved', 'disapproved') then
      jsonb_build_array(
        case when jsonb_typeof(p_metadata->'submittedAt') = 'string' then p_metadata->'submittedAt' else 'null'::jsonb end,
        p_metadata->>'status',
        case when jsonb_typeof(p_metadata->'adminComment') = 'string' then p_metadata->>'adminComment' else '' end,
        case when jsonb_typeof(p_metadata->'locationFeedback') = 'object' then p_metadata->'locationFeedback' else '{}'::jsonb end)
    else null end;
$$;
revoke all on function public.event_notification_payload(jsonb, text) from public, anon, authenticated;

create or replace function public.get_event_notification_states(
  p_expected_user_id uuid, p_stream text, p_candidates jsonb
) returns table(event_id uuid, is_current boolean, is_read boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_item jsonb; v_event public.map_elements%rowtype; v_payload jsonb; v_event_id uuid;
begin
  if p_stream is null or p_stream not in ('admin_submission', 'org_review') then
    raise exception 'Invalid notification stream.' using errcode = '22023';
  end if;
  if v_id is null or v_id is distinct from p_expected_user_id
    or (p_stream = 'admin_submission' and not public.is_admin())
    or (p_stream = 'org_review' and not public.is_student_org()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'Invalid notification candidates.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_candidates) > 1000 or octet_length(p_candidates::text) > 8388608 then
    raise exception 'Too many notification candidates.' using errcode = '22023';
  end if;
  for v_item in select distinct value from jsonb_array_elements(p_candidates) loop
    v_event_id := (v_item->>'event_id')::uuid;
    event_id := v_event_id;
    if v_event_id is null or not (v_item ? 'payload') then
      raise exception 'Invalid notification candidate.' using errcode = '22023';
    end if;
    select * into v_event from public.map_elements e where e.id = v_event_id
      and e.archived_at is null and (e.element_type = 'event_overlay' or e.metadata->>'kind' = 'event_overlay');
    if found and p_stream = 'org_review' and v_event.metadata->>'createdByUserId' is distinct from v_id::text then
      raise exception 'Notification access denied.' using errcode = '42501';
    end if;
    v_payload := case when found then public.event_notification_payload(v_event.metadata, p_stream) else null end;
    is_current := v_payload is not null and v_payload = v_item->'payload';
    is_read := is_current and exists (
      select 1 from public.event_notification_receipts r where r.viewer_id = v_id
        and r.event_id = v_event_id and r.stream = p_stream
        and r.fingerprint = encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex')
    );
    return next;
  end loop;
end $$;

create or replace function public.ack_event_notification(
  p_expected_user_id uuid, p_stream text, p_event_id uuid, p_payload jsonb
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_event public.map_elements%rowtype; v_payload jsonb; v_now timestamptz := clock_timestamp();
begin
  if p_stream is null or p_stream not in ('admin_submission', 'org_review') then
    raise exception 'Invalid notification stream.' using errcode = '22023';
  end if;
  if v_id is null or v_id is distinct from p_expected_user_id
    or (p_stream = 'admin_submission' and not public.is_admin())
    or (p_stream = 'org_review' and not public.is_student_org()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  -- Serialize against event review/edit; an old screen cannot acknowledge a new update.
  select * into v_event from public.map_elements e where e.id = p_event_id
    and e.archived_at is null and (e.element_type = 'event_overlay' or e.metadata->>'kind' = 'event_overlay') for share;
  if not found then raise exception 'This event changed. Refresh its notification.' using errcode = '40001'; end if;
  if p_stream = 'org_review' and v_event.metadata->>'createdByUserId' is distinct from v_id::text then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  v_payload := public.event_notification_payload(v_event.metadata, p_stream);
  if v_payload is null or v_payload is distinct from p_payload then
    raise exception 'This event changed. Read the latest update first.' using errcode = '40001';
  end if;
  insert into public.event_notification_receipts(viewer_id, event_id, stream, fingerprint, read_at)
    values (v_id, p_event_id, p_stream, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_now)
    on conflict (viewer_id, event_id, stream) do update
      set fingerprint = excluded.fingerprint, read_at = excluded.read_at;
  return v_now;
end $$;
revoke all on function public.get_event_notification_states(uuid,text,jsonb) from public, anon;
revoke all on function public.ack_event_notification(uuid,text,uuid,jsonb) from public, anon;
grant execute on function public.get_event_notification_states(uuid,text,jsonb) to authenticated;
grant execute on function public.ack_event_notification(uuid,text,uuid,jsonb) to authenticated;
comment on table public.event_notification_receipts is 'Private per-viewer event notification receipts; event content and review history are unchanged.';
notify pgrst, 'reload schema';
commit;
