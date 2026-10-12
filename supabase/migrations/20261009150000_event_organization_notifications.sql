-- Per-person review receipts follow the active organization grant. A new
-- representative receives a compact handover summary for unresolved work.
begin;

create table if not exists public.event_organization_handover_receipts (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  grant_id uuid not null references public.event_organization_grants(id) on delete restrict,
  read_at timestamptz not null default clock_timestamp(),
  primary key (viewer_id, grant_id)
);
alter table public.event_organization_handover_receipts enable row level security;
revoke all on public.event_organization_handover_receipts from public, anon, authenticated;

drop policy if exists event_notification_receipts_select_own on public.event_notification_receipts;
create policy event_notification_receipts_select_own on public.event_notification_receipts
for select to authenticated using (
  viewer_id = (select auth.uid()) and (
    (stream = 'admin_submission' and public.is_admin()) or
    (stream = 'org_review' and exists (
      select 1 from public.map_elements e where e.id = event_id
        and ((e.organization_id is not null and public.has_event_organization_access(e.organization_id))
          or (e.organization_id is null and public.is_student_org()
            and e.metadata->>'createdByUserId' = (select auth.uid())::text))
    ))
  )
);

create or replace function public.get_event_organization_handover(p_expected_grant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := auth.uid();
  v_grant public.event_organization_grants%rowtype;
  v_org public.event_organizations%rowtype;
  v_pending integer := 0;
  v_unfinished integer := 0;
  v_open_feedback integer := 0;
begin
  if v_id is null then raise exception 'Organization access denied.' using errcode = '42501'; end if;
  select * into v_grant from public.event_organization_grants g
    where g.id = p_expected_grant_id and g.representative_id = v_id and g.ended_at is null
      and g.starts_at <= clock_timestamp() and g.expires_at > clock_timestamp();
  if not found then raise exception 'This representative assignment has ended.' using errcode = '42501'; end if;
  select * into v_org from public.event_organizations o where o.id = v_grant.organization_id and o.is_active;
  if not found or not private.event_organization_access(v_org.id) then
    raise exception 'This representative assignment has ended.' using errcode = '42501';
  end if;

  select count(*) filter (where e.metadata->>'status' = 'pending'),
         count(*) filter (where e.metadata->>'status' in ('draft','pending','disapproved'))
    into v_pending, v_unfinished
    from public.map_elements e where e.organization_id = v_org.id and e.archived_at is null
      and (e.created_at is null or e.created_at <= v_grant.starts_at)
      and (e.element_type = 'event_overlay' or e.metadata->>'kind' = 'event_overlay');
  select count(*) into v_open_feedback
    from public.map_elements e
    cross join lateral public.event_feedback_pins(e.metadata) pin
    where e.organization_id = v_org.id and e.archived_at is null
      and (e.created_at is null or e.created_at <= v_grant.starts_at)
      and e.metadata->>'status' = 'approved'
      and (e.metadata->'feedbackResolutions'->pin.location_id->pin.pin_id->>'feedback' is distinct from pin.feedback
        or coalesce(e.metadata->'feedbackResolutions'->pin.location_id->pin.pin_id->>'addressedAt','') = ''
        or coalesce(e.metadata->'feedbackResolutions'->pin.location_id->pin.pin_id->>'addressedBy','') = '');

  return jsonb_build_object(
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'grant_id', v_grant.id,
    'academic_year', v_grant.academic_year,
    'expires_at', v_grant.expires_at,
    'starts_at', v_grant.starts_at,
    'pending_count', v_pending,
    'unfinished_count', v_unfinished,
    'open_feedback_count', v_open_feedback,
    'is_read', exists(select 1 from public.event_organization_handover_receipts r where r.viewer_id = v_id and r.grant_id = v_grant.id)
  );
end $$;

create or replace function public.ack_event_organization_handover(p_expected_grant_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_org_id uuid; v_now timestamptz := clock_timestamp();
begin
  if v_id is null then raise exception 'Organization access denied.' using errcode = '42501'; end if;
  select organization_id into v_org_id from public.event_organization_grants
    where id = p_expected_grant_id and representative_id = v_id and ended_at is null;
  if not found then raise exception 'This representative assignment has ended.' using errcode = '42501'; end if;
  -- Match representative replacement's organization-first lock order. Once a
  -- handover commits, the outgoing person cannot acknowledge the new grant.
  perform 1 from public.event_organizations where id = v_org_id for update;
  if not found or not private.event_organization_access(v_org_id) or not exists (
    select 1 from public.event_organization_grants g where g.id = p_expected_grant_id
      and g.organization_id = v_org_id and g.representative_id = v_id and g.ended_at is null
      and g.starts_at <= v_now and g.expires_at > v_now
  ) then raise exception 'This representative assignment has ended.' using errcode = '42501'; end if;
  insert into public.event_organization_handover_receipts(viewer_id, grant_id, read_at)
    values (v_id, p_expected_grant_id, v_now)
    on conflict (viewer_id, grant_id) do update set read_at = excluded.read_at;
  return v_now;
end $$;

create or replace function public.get_event_notification_states(
  p_expected_user_id uuid, p_stream text, p_candidates jsonb
) returns table(event_id uuid, is_current boolean, is_read boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := auth.uid(); v_item jsonb; v_event public.map_elements%rowtype;
  v_payload jsonb; v_event_id uuid; v_grant_start timestamptz;
begin
  if p_stream is null or p_stream not in ('admin_submission','org_review') then
    raise exception 'Invalid notification stream.' using errcode = '22023';
  end if;
  if v_id is null or v_id is distinct from p_expected_user_id
    or (p_stream = 'admin_submission' and not public.is_admin())
    or (p_stream = 'org_review' and not public.is_student_org()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) > 1000 or octet_length(p_candidates::text) > 8388608 then
    raise exception 'Invalid notification candidates.' using errcode = '22023';
  end if;
  for v_item in select distinct value from jsonb_array_elements(p_candidates) loop
    v_event_id := (v_item->>'event_id')::uuid;
    event_id := v_event_id;
    if v_event_id is null or not (v_item ? 'payload') then
      raise exception 'Invalid notification candidate.' using errcode = '22023';
    end if;
    select * into v_event from public.map_elements e where e.id = v_event_id
      and e.archived_at is null and (e.element_type = 'event_overlay' or e.metadata->>'kind' = 'event_overlay');
    v_grant_start := null;
    if found and p_stream = 'org_review' then
      if v_event.organization_id is not null then
        if not private.event_organization_access(v_event.organization_id) then
          raise exception 'Notification access denied.' using errcode = '42501';
        end if;
        select g.starts_at into v_grant_start from public.event_organization_grants g
          where g.organization_id = v_event.organization_id and g.representative_id = v_id
            and g.ended_at is null and g.starts_at <= clock_timestamp() and g.expires_at > clock_timestamp();
        if v_grant_start is null then raise exception 'Notification access denied.' using errcode = '42501'; end if;
      elsif v_event.metadata->>'createdByUserId' is distinct from v_id::text then
        raise exception 'Notification access denied.' using errcode = '42501';
      end if;
    end if;
    v_payload := case when found then public.event_notification_payload(v_event.metadata,p_stream) else null end;
    is_current := v_payload is not null and v_payload = v_item->'payload';
    if is_current and p_stream = 'org_review' and v_event.organization_id is not null then
      is_current := exists (
        select 1 from public.event_layout_revisions revision
          where revision.event_id = v_event.id and revision.created_at >= v_grant_start
            and public.event_notification_payload(revision.after_metadata,'org_review') = v_payload
            and (
              revision.action in ('approved','disapproved')
              or (revision.action = 'edited'
                and (revision.after_metadata->'adminComment' is distinct from revision.before_metadata->'adminComment'
                  or revision.after_metadata->'locationFeedback' is distinct from revision.before_metadata->'locationFeedback'))
            )
      );
    end if;
    is_read := is_current and exists (
      select 1 from public.event_notification_receipts r where r.viewer_id = v_id
        and r.event_id = v_event_id and r.stream = p_stream
        and r.fingerprint = encode(sha256(convert_to(v_payload::text,'UTF8')),'hex')
    );
    return next;
  end loop;
end $$;

create or replace function public.ack_event_notification(
  p_expected_user_id uuid, p_stream text, p_event_id uuid, p_payload jsonb
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := auth.uid(); v_event public.map_elements%rowtype; v_payload jsonb;
  v_org_id uuid; v_grant_start timestamptz; v_now timestamptz := clock_timestamp();
begin
  if p_stream is null or p_stream not in ('admin_submission','org_review') then
    raise exception 'Invalid notification stream.' using errcode = '22023';
  end if;
  if v_id is null or v_id is distinct from p_expected_user_id
    or (p_stream = 'admin_submission' and not public.is_admin())
    or (p_stream = 'org_review' and not public.is_student_org()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  if p_stream = 'org_review' then
    select organization_id into v_org_id from public.map_elements e where e.id = p_event_id
      and e.archived_at is null and (e.element_type = 'event_overlay' or e.metadata->>'kind' = 'event_overlay');
    if not found then raise exception 'This event changed. Refresh its notification.' using errcode = '40001'; end if;
    if v_org_id is not null then
      perform 1 from public.event_organizations where id = v_org_id for update;
      if not found or not private.event_organization_access(v_org_id) then
        raise exception 'Notification access denied.' using errcode = '42501';
      end if;
    end if;
  end if;
  -- Lock the event only after the organization row, matching handover writes.
  select * into v_event from public.map_elements e where e.id = p_event_id
    and e.archived_at is null and (e.element_type = 'event_overlay' or e.metadata->>'kind' = 'event_overlay') for share;
  if not found or v_event.organization_id is distinct from v_org_id and p_stream = 'org_review' then
    raise exception 'This event changed. Refresh its notification.' using errcode = '40001';
  end if;
  if p_stream = 'org_review' then
    if v_org_id is not null then
      if not private.event_organization_access(v_org_id) then raise exception 'Notification access denied.' using errcode = '42501'; end if;
      select g.starts_at into v_grant_start from public.event_organization_grants g
        where g.organization_id = v_org_id and g.representative_id = v_id and g.ended_at is null
          and g.starts_at <= v_now and g.expires_at > v_now;
      if v_grant_start is null then raise exception 'Notification access denied.' using errcode = '42501'; end if;
    elsif v_event.metadata->>'createdByUserId' is distinct from v_id::text then
      raise exception 'Notification access denied.' using errcode = '42501';
    end if;
  end if;
  v_payload := public.event_notification_payload(v_event.metadata,p_stream);
  if v_payload is null or v_payload is distinct from p_payload then
    raise exception 'This event changed. Read the latest update first.' using errcode = '40001';
  end if;
  if p_stream = 'org_review' and v_org_id is not null and not exists (
    select 1 from public.event_layout_revisions revision where revision.event_id = v_event.id
      and revision.created_at >= v_grant_start
      and public.event_notification_payload(revision.after_metadata,'org_review') = v_payload
      and (revision.action in ('approved','disapproved')
        or (revision.action = 'edited'
          and (revision.after_metadata->'adminComment' is distinct from revision.before_metadata->'adminComment'
            or revision.after_metadata->'locationFeedback' is distinct from revision.before_metadata->'locationFeedback')))
  ) then raise exception 'This review update is not new for the current representative.' using errcode = '40001'; end if;

  insert into public.event_notification_receipts(viewer_id,event_id,stream,fingerprint,read_at)
    values(v_id,p_event_id,p_stream,encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_now)
    on conflict(viewer_id,event_id,stream) do update set fingerprint=excluded.fingerprint,read_at=excluded.read_at;
  return v_now;
end $$;

revoke all on function public.get_event_organization_handover(uuid) from public,anon;
revoke all on function public.ack_event_organization_handover(uuid) from public,anon;
revoke all on function public.get_event_notification_states(uuid,text,jsonb) from public,anon;
revoke all on function public.ack_event_notification(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.get_event_organization_handover(uuid) to authenticated;
grant execute on function public.ack_event_organization_handover(uuid) to authenticated;
grant execute on function public.get_event_notification_states(uuid,text,jsonb) to authenticated;
grant execute on function public.ack_event_notification(uuid,text,uuid,jsonb) to authenticated;
comment on table public.event_organization_handover_receipts is 'Private per-representative acknowledgement of unresolved work at the start of each organization grant.';
notify pgrst, 'reload schema';
commit;
