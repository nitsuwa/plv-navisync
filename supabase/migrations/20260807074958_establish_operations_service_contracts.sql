-- A7: operational service contracts consumed by Workstream C.

create table public.recent_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete cascade,
  map_element_id uuid references public.map_elements(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 160),
  code text check (code is null or char_length(code) <= 80),
  visit_count integer not null default 1 check (visit_count > 0),
  last_visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recent_destinations_single_target check (num_nonnulls(building_id, map_element_id) = 1)
);
create unique index recent_destinations_user_building_uq on public.recent_destinations(user_id, building_id) where building_id is not null;
create unique index recent_destinations_user_element_uq on public.recent_destinations(user_id, map_element_id) where map_element_id is not null;
create index recent_destinations_user_last_visited_idx on public.recent_destinations(user_id, last_visited_at desc);
alter table public.recent_destinations enable row level security;
create policy "recent_destinations_select_own" on public.recent_destinations for select to authenticated using ((select auth.uid()) = user_id);
create policy "recent_destinations_insert_own" on public.recent_destinations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recent_destinations_update_own" on public.recent_destinations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recent_destinations_delete_own" on public.recent_destinations for delete to authenticated using ((select auth.uid()) = user_id);

create table public.event_stalls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_location_id uuid references public.event_locations(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 160),
  description text check (description is null or char_length(description) <= 1000),
  x double precision not null,
  y double precision not null,
  width double precision not null default 24 check (width > 0),
  height double precision not null default 18 check (height > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_stalls_event_idx on public.event_stalls(event_id, created_at, id);
alter table public.event_stalls enable row level security;
create policy "event_stalls_select_public" on public.event_stalls for select to anon, authenticated using (
  exists (select 1 from public.events e where e.id=event_id and e.status='published' and e.archived_at is null and e.ends_at >= now() and public.campus_is_published(e.campus_id))
);
create policy "event_stalls_select_admin" on public.event_stalls for select to authenticated using ((select public.is_admin()));
create policy "event_stalls_insert_admin" on public.event_stalls for insert to authenticated with check ((select public.is_admin()));
create policy "event_stalls_update_admin" on public.event_stalls for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "event_stalls_delete_admin" on public.event_stalls for delete to authenticated using ((select public.is_admin()));
create trigger set_updated_at before update on public.event_stalls for each row execute function public.set_updated_at();

create or replace function public.check_recent_destination_integrity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_campus uuid;
begin
  if new.building_id is not null then select campus_id into v_campus from public.buildings where id=new.building_id;
  else select campus_id into v_campus from public.map_elements where id=new.map_element_id; end if;
  if v_campus is distinct from new.campus_id then raise exception 'recent destination target must belong to the same campus'; end if;
  return new;
end $$;
create trigger recent_destinations_cross_campus_check before insert or update on public.recent_destinations for each row execute function public.check_recent_destination_integrity();

create or replace function public.check_event_stall_integrity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.event_location_id is not null and not exists (
    select 1 from public.event_locations l where l.id=new.event_location_id and l.event_id=new.event_id
  ) then raise exception 'event stall location must belong to the same event'; end if;
  return new;
end $$;
create trigger event_stalls_event_check before insert or update on public.event_stalls for each row execute function public.check_event_stall_integrity();

create or replace function public.update_report_workflow(
  p_report_id uuid, p_status text, p_resolution_notes text default null, p_internal_notes text default null
) returns public.reports language plpgsql security invoker set search_path='' as $$
declare v_old public.reports; v_new public.reports;
begin
  if not public.is_admin() then raise exception 'administrator access required' using errcode='42501'; end if;
  if p_status not in ('pending','under_review','in_progress','resolved','rejected') then raise exception 'invalid report status' using errcode='22023'; end if;
  select * into v_old from public.reports where id=p_report_id for update;
  if not found then raise exception 'report not found' using errcode='P0002'; end if;
  update public.reports set status=p_status,
    resolution_notes=case when p_resolution_notes is null then resolution_notes else nullif(btrim(p_resolution_notes),'') end,
    internal_notes=case when p_internal_notes is null then internal_notes else nullif(btrim(p_internal_notes),'') end,
    resolved_at=case when p_status='resolved' then coalesce(resolved_at,now()) else null end,
    updated_at=now() where id=p_report_id returning * into v_new;
  insert into public.report_history(report_id,action,old_status,new_status,note,performed_by)
    values(p_report_id,'status_change',v_old.status,v_new.status,p_resolution_notes,(select auth.uid()));
  insert into public.activity_logs(actor_id,campus_id,action,entity_type,entity_id,metadata)
    values((select auth.uid()),v_new.campus_id,'report.'||p_status,'report',p_report_id,jsonb_build_object('old_status',v_old.status,'new_status',v_new.status));
  return v_new;
end $$;

create or replace function public.upsert_system_settings(p_entries jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare v_entry jsonb; v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'administrator access required' using errcode='42501'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries)>100 then raise exception 'settings entries must be an array of at most 100 items' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if btrim(coalesce(v_entry->>'key',''))='' or char_length(v_entry->>'key')>100 then raise exception 'invalid settings key' using errcode='22023'; end if;
    insert into public.system_settings(campus_id,key,value,is_public,updated_by)
      values(null,v_entry->>'key',coalesce(v_entry->'value','null'::jsonb),coalesce((v_entry->>'is_public')::boolean,false),(select auth.uid()))
    on conflict (key) where campus_id is null do update set value=excluded.value,is_public=excluded.is_public,updated_by=(select auth.uid()),updated_at=now();
    v_count:=v_count+1;
  end loop;
  insert into public.activity_logs(actor_id,action,entity_type,metadata)
    values((select auth.uid()),'settings.update','settings',jsonb_build_object('count',v_count));
  return v_count;
end $$;

create index if not exists reports_active_status_created_idx on public.reports(status, created_at desc) where archived_at is null;
create index if not exists events_public_schedule_idx on public.events(starts_at, ends_at) where status='published' and archived_at is null;
create index if not exists announcements_public_schedule_idx on public.announcements(starts_at, expires_at) where status='published' and archived_at is null;
create index if not exists activity_logs_entity_created_idx on public.activity_logs(entity_type, entity_id, created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);

update storage.buckets set public=false,file_size_limit=8388608,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='report-images';

revoke all on table public.recent_destinations, public.event_stalls from anon, authenticated;
grant select on table public.event_stalls to anon;
grant select,insert,update,delete on table public.recent_destinations, public.event_stalls to authenticated;
grant all on table public.recent_destinations, public.event_stalls to service_role;
revoke execute on function public.update_report_workflow(uuid,text,text,text), public.upsert_system_settings(jsonb) from public, anon;
grant execute on function public.update_report_workflow(uuid,text,text,text), public.upsert_system_settings(jsonb) to authenticated, service_role;
revoke execute on function public.check_recent_destination_integrity(), public.check_event_stall_integrity() from public, anon, authenticated, service_role;

comment on function public.update_report_workflow(uuid,text,text,text) is 'Administrator-only atomic report workflow update with history and activity audit records.';
comment on function public.upsert_system_settings(jsonb) is 'Administrator-only atomic global settings batch upsert with one audit record.';
