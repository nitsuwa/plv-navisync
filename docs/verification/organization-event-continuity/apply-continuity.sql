-- ORGANIZATION EVENT CONTINUITY: USER-RUN SUPABASE INSTALLATION
-- First save a recoverable database backup, then run preflight.sql.
-- Required dependencies must all be present. Save preflight results for comparison.
-- These are four unchanged migration files in their validated dependency order.
-- Each migration has its own transaction. If any query fails, stop and report it;
-- earlier completed migrations may remain applied. Do not enable assignments yet.
-- Run this installation ONCE. Do not repeat it after success or a partial failure;
-- the ownership guard deliberately rejects an already-adapted function definition.
-- After the whole file succeeds, run postflight.sql and compare protected records.
-- This package does not create organizations, representatives, or QA event records.
-- It does not automatically bind historical events to an organization.

-- SOURCE: supabase/migrations/20261009120000_event_organization_access.sql
-- Verified organization identity and one current representative. Additive; no event content changes.
begin;
create schema if not exists private;
create table if not exists public.event_organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and length(code) between 1 and 40),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.event_organization_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.event_organizations(id) on delete restrict,
  representative_id uuid not null references public.profiles(id) on delete restrict,
  academic_year text not null check (length(btrim(academic_year)) between 1 and 40),
  starts_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  end_reason text,
  check (expires_at > starts_at),
  check ((ended_at is null and ended_by is null and end_reason is null)
    or (ended_at is not null and ended_by is not null and length(btrim(end_reason)) between 1 and 500))
);
create unique index if not exists event_organization_one_open_grant on public.event_organization_grants(organization_id) where ended_at is null;
create index if not exists event_organization_grants_representative_idx on public.event_organization_grants(representative_id,organization_id) where ended_at is null;
create index if not exists event_organization_grants_granted_by_idx on public.event_organization_grants(granted_by);
create index if not exists event_organization_grants_ended_by_idx on public.event_organization_grants(ended_by);
create table if not exists public.event_organization_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.event_organizations(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists event_organization_audit_org_idx on public.event_organization_audit(organization_id,created_at desc);
create index if not exists event_organization_audit_actor_idx on public.event_organization_audit(actor_id);
alter table public.event_organizations enable row level security;
alter table public.event_organization_grants enable row level security;
alter table public.event_organization_audit enable row level security;
revoke all on public.event_organizations,public.event_organization_grants,public.event_organization_audit from public,anon,authenticated;
grant select on public.event_organizations,public.event_organization_grants,public.event_organization_audit to authenticated;

create or replace function private.event_organization_access(p_organization_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select auth.uid() is not null and public.is_student_org() and exists (
    select 1 from public.event_organization_grants g join public.event_organizations o on o.id=g.organization_id
    where o.id=p_organization_id and o.is_active and g.representative_id=auth.uid()
      and g.ended_at is null and g.starts_at <= clock_timestamp() and g.expires_at > clock_timestamp()
  );
$$;
revoke all on function private.event_organization_access(uuid) from public,anon,authenticated;
-- Boolean wrapper needed for policies; never accepts an actor supplied by the client.
create or replace function public.has_event_organization_access(p_organization_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select private.event_organization_access(p_organization_id);
$$;
revoke all on function public.has_event_organization_access(uuid) from public,anon;
grant execute on function public.has_event_organization_access(uuid) to authenticated;
drop policy if exists event_organizations_read on public.event_organizations;
create policy event_organizations_read on public.event_organizations for select to authenticated
  using (public.is_admin() or public.has_event_organization_access(id));
drop policy if exists event_organization_grants_read on public.event_organization_grants;
create policy event_organization_grants_read on public.event_organization_grants for select to authenticated
  using (public.is_admin() or public.has_event_organization_access(organization_id));
drop policy if exists event_organization_audit_read on public.event_organization_audit;
create policy event_organization_audit_read on public.event_organization_audit for select to authenticated
  using (public.is_admin() or public.has_event_organization_access(organization_id));

create or replace function public.get_my_event_organizations()
returns table(organization_id uuid,organization_name text,grant_id uuid,academic_year text,expires_at timestamptz)
language sql volatile security definer set search_path='' as $$
  select o.id,o.name,g.id,g.academic_year,g.expires_at
  from public.event_organizations o join public.event_organization_grants g on g.organization_id=o.id
  where private.event_organization_access(o.id) and g.representative_id=auth.uid() and g.ended_at is null
  order by o.name,o.id;
$$;

create or replace function public.admin_save_event_organization(
  p_id uuid,p_code text,p_name text,p_is_active boolean,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before public.event_organizations%rowtype; v_after public.event_organizations%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_code is null or length(btrim(p_code)) not between 1 and 40 or p_name is null or length(btrim(p_name)) not between 1 and 120 or p_is_active is null then
    raise exception 'Enter an organization code and name.' using errcode='23514'; end if;
  if p_id is null then
    insert into public.event_organizations(code,name,is_active) values(upper(btrim(p_code)),btrim(p_name),p_is_active) returning * into v_after;
  else
    select * into v_before from public.event_organizations where id=p_id for update;
    if not found then raise exception 'Organization not found.' using errcode='23514'; end if;
    if p_expected_updated_at is null or v_before.updated_at is distinct from p_expected_updated_at then
      raise exception 'Organization changed. Refresh before saving.' using errcode='40001'; end if;
    update public.event_organizations set code=upper(btrim(p_code)),name=btrim(p_name),is_active=p_is_active,updated_at=clock_timestamp() where id=p_id returning * into v_after;
  end if;
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data)
    values(v_after.id,auth.uid(),case when p_id is null then 'organization_created' else 'organization_updated' end,to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end $$;

create or replace function public.admin_set_event_representative(
  p_organization_id uuid,p_profile_id uuid,p_academic_year text,p_expires_at timestamptz,p_expected_grant_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org public.event_organizations%rowtype; v_old public.event_organization_grants%rowtype;
  v_new public.event_organization_grants%rowtype; v_target public.profiles%rowtype; v_now timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select * into v_org from public.event_organizations where id=p_organization_id for update;
  if not found or not v_org.is_active then raise exception 'Choose an active organization.' using errcode='23514'; end if;
  select * into v_old from public.event_organization_grants where organization_id=p_organization_id and ended_at is null;
  if v_old.id is distinct from p_expected_grant_id then raise exception 'Representative changed. Refresh before assigning.' using errcode='40001'; end if;
  select * into v_target from public.profiles where id=p_profile_id for share;
  if not found or v_target.role <> 'student_org' or not v_target.is_active then
    raise exception 'Choose an active Student Organization account.' using errcode='23514'; end if;
  v_now:=clock_timestamp();
  if p_academic_year is null or length(btrim(p_academic_year)) not between 1 and 40 or p_expires_at is null or p_expires_at <= v_now or not isfinite(p_expires_at) then
    raise exception 'Enter an academic year and a future access expiry.' using errcode='23514'; end if;
  if v_old.id is not null then
    update public.event_organization_grants set ended_at=v_now,ended_by=auth.uid(),end_reason='replaced' where id=v_old.id;
  end if;
  insert into public.event_organization_grants(organization_id,representative_id,academic_year,starts_at,expires_at,granted_by)
    values(v_org.id,p_profile_id,btrim(p_academic_year),v_now,p_expires_at,auth.uid()) returning * into v_new;
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data)
    values(v_org.id,auth.uid(),'representative_assigned',to_jsonb(v_old),to_jsonb(v_new));
  return jsonb_build_object('organization_id',v_org.id,'organization_name',v_org.name,'grant_id',v_new.id,'academic_year',v_new.academic_year,'expires_at',v_new.expires_at);
end $$;

create or replace function public.admin_revoke_event_representative(p_organization_id uuid,p_expected_grant_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_old public.event_organization_grants%rowtype; v_new public.event_organization_grants%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  perform 1 from public.event_organizations where id=p_organization_id for update;
  if not found then raise exception 'Organization not found.' using errcode='23514'; end if;
  select * into v_old from public.event_organization_grants where organization_id=p_organization_id and ended_at is null;
  if v_old.id is null or v_old.id is distinct from p_expected_grant_id then raise exception 'Representative changed. Refresh before revoking.' using errcode='40001'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Enter the reason for ending access.' using errcode='23514'; end if;
  update public.event_organization_grants set ended_at=clock_timestamp(),ended_by=auth.uid(),end_reason=btrim(p_reason) where id=v_old.id returning * into v_new;
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data) values(p_organization_id,auth.uid(),'representative_revoked',to_jsonb(v_old),to_jsonb(v_new));
end $$;

create or replace function public.admin_list_event_organizations()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('grants',coalesce((
    select jsonb_agg(to_jsonb(g) || jsonb_build_object('representative_name',concat_ws(' ',p.first_name,p.last_name),'profile_active',p.is_active,'profile_role',p.role) order by g.starts_at desc,g.id)
    from public.event_organization_grants g join public.profiles p on p.id=g.representative_id where g.organization_id=o.id
  ),'[]'::jsonb)) order by o.name,o.id),'[]'::jsonb) into v_result from public.event_organizations o;
  return v_result;
end $$;
revoke all on function public.get_my_event_organizations() from public,anon;
revoke all on function public.admin_save_event_organization(uuid,text,text,boolean,timestamptz) from public,anon;
revoke all on function public.admin_set_event_representative(uuid,uuid,text,timestamptz,uuid) from public,anon;
revoke all on function public.admin_revoke_event_representative(uuid,uuid,text) from public,anon;
revoke all on function public.admin_list_event_organizations() from public,anon;
grant execute on function public.get_my_event_organizations(),public.admin_save_event_organization(uuid,text,text,boolean,timestamptz),public.admin_set_event_representative(uuid,uuid,text,timestamptz,uuid),public.admin_revoke_event_representative(uuid,uuid,text),public.admin_list_event_organizations() to authenticated;
notify pgrst,'reload schema';
commit;


-- SOURCE: supabase/migrations/20261009130000_event_organization_ownership.sql
-- Organization ownership is relational. Original creator metadata remains attribution.
begin;
alter table public.map_elements add column if not exists organization_id uuid references public.event_organizations(id) on delete restrict;
create index if not exists map_elements_event_organization_idx on public.map_elements(organization_id,created_at desc) where organization_id is not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.map_elements'::regclass and conname='map_elements_organization_event_only') then
    alter table public.map_elements add constraint map_elements_organization_event_only check(organization_id is null or coalesce(element_type,'')='event_overlay' or coalesce(metadata->>'kind','')='event_overlay');
  end if;
end $$;

create or replace function private.event_actor_access(p_organization_id uuid,p_metadata jsonb)
returns boolean language sql volatile security definer set search_path='' as $$
  select coalesce(auth.uid() is not null and case when p_organization_id is not null
    then private.event_organization_access(p_organization_id)
    else public.is_student_org() and p_metadata->>'createdByUserId'=auth.uid()::text end,false);
$$;
revoke all on function private.event_actor_access(uuid,jsonb) from public,anon,authenticated;
create or replace function public.can_access_event_overlay(p_overlay_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.map_elements e where e.id=p_overlay_id
    and (e.element_type='event_overlay' or e.metadata->>'kind'='event_overlay')
    and (public.is_admin() or private.event_actor_access(e.organization_id,e.metadata)));
$$;
revoke all on function public.can_access_event_overlay(uuid) from public,anon;
grant execute on function public.can_access_event_overlay(uuid) to authenticated;

-- Browser writes on bound events use definer RPCs. RLS prevents direct SQL-client bypass.
drop policy if exists map_elements_select_event_overlay on public.map_elements;
create policy map_elements_select_event_overlay on public.map_elements for select to authenticated using(public.can_access_event_overlay(id));
drop policy if exists map_elements_event_publication_guard on public.map_elements;
create policy map_elements_event_publication_guard on public.map_elements as restrictive for select to authenticated
  using ((element_type<>'event_overlay' and coalesce(metadata->>'kind','')<>'event_overlay') or public.can_access_event_overlay(id));
drop policy if exists map_elements_event_publication_guest_guard on public.map_elements;
create policy map_elements_event_publication_guest_guard on public.map_elements as restrictive for select to anon
  using(element_type<>'event_overlay' and coalesce(metadata->>'kind','')<>'event_overlay');
drop policy if exists map_elements_insert_event_overlay_owner on public.map_elements;
create policy map_elements_insert_event_overlay_owner on public.map_elements for insert to authenticated
  with check(organization_id is null and element_type='event_overlay' and public.is_student_org() and metadata->>'createdByUserId'=auth.uid()::text);
drop policy if exists map_elements_update_event_overlay_owner on public.map_elements;
create policy map_elements_update_event_overlay_owner on public.map_elements for update to authenticated
  using((element_type='event_overlay' or metadata->>'kind'='event_overlay') and (public.is_admin() or (organization_id is null and public.is_student_org() and metadata->>'createdByUserId'=auth.uid()::text)))
  with check((element_type='event_overlay' or metadata->>'kind'='event_overlay') and (public.is_admin() or (organization_id is null and public.is_student_org() and metadata->>'createdByUserId'=auth.uid()::text)));
drop policy if exists map_elements_delete_event_overlay_owner on public.map_elements;
create policy map_elements_delete_event_overlay_owner on public.map_elements for delete to authenticated
  using((element_type='event_overlay' or metadata->>'kind'='event_overlay') and (public.is_admin() or (organization_id is null and public.is_student_org() and metadata->>'createdByUserId'=auth.uid()::text)));
drop policy if exists event_revision_read on public.event_layout_revisions;
create policy event_revision_read on public.event_layout_revisions for select to authenticated using(public.can_access_event_overlay(event_id));

create or replace function private.event_row_result(p_event public.map_elements)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p_event.id,'campusId',p_event.campus_id,'updatedAt',p_event.updated_at,'createdAt',p_event.created_at,
    'organizationId',p_event.organization_id,'metadata',p_event.metadata,'creatorName',
    (select concat_ws(' ',p.first_name,p.last_name) from public.profiles p where p.id::text=p_event.metadata->>'createdByUserId'));
$$;
revoke all on function private.event_row_result(public.map_elements) from public,anon,authenticated;

create or replace function private.lock_event_for_write(p_overlay_id uuid,p_expected_grant_id uuid,p_require_expected boolean)
returns public.map_elements language plpgsql security definer set search_path='' as $$
declare v_event public.map_elements%rowtype; v_org uuid; v_grant uuid;
begin
  select organization_id into v_org from public.map_elements where id=p_overlay_id and archived_at is null and (element_type='event_overlay' or metadata->>'kind'='event_overlay');
  if not found then raise exception 'Event access changed or this event is unavailable.' using errcode='42501'; end if;
  if v_org is not null then
    perform 1 from public.event_organizations where id=v_org for update;
    if not private.event_organization_access(v_org) then raise exception 'Your organization access has ended.' using errcode='42501'; end if;
    select id into v_grant from public.event_organization_grants where organization_id=v_org and ended_at is null and representative_id=auth.uid();
    if p_require_expected and (p_expected_grant_id is null or p_expected_grant_id is distinct from v_grant) then raise exception 'Your representative assignment changed. Refresh before saving.' using errcode='40001'; end if;
  end if;
  select * into v_event from public.map_elements where id=p_overlay_id and archived_at is null and (element_type='event_overlay' or metadata->>'kind'='event_overlay') for update;
  if not found or v_event.organization_id is distinct from v_org then raise exception 'Event ownership changed. Refresh before saving.' using errcode='40001'; end if;
  if not private.event_actor_access(v_event.organization_id,v_event.metadata) then raise exception 'Event access denied.' using errcode='42501'; end if;
  if v_org is not null then
    perform set_config('app.event_org_command','on',true);
    if p_require_expected then perform set_config('app.event_org_expected_command','on',true); end if;
  end if;
  return v_event;
end $$;
revoke all on function private.lock_event_for_write(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function public.get_event_edit_access(p_event_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_event public.map_elements%rowtype;v_grant uuid;
begin
  if not public.can_access_event_overlay(p_event_id) then raise exception 'Event access denied.' using errcode='42501'; end if;
  select * into v_event from public.map_elements where id=p_event_id;
  if v_event.organization_id is not null then select id into v_grant from public.event_organization_grants where organization_id=v_event.organization_id and representative_id=auth.uid() and ended_at is null; end if;
  return jsonb_build_object('organizationId',v_event.organization_id,'grantId',v_grant,'isArchived',v_event.archived_at is not null,
    'canEditContent',v_event.archived_at is null and v_event.metadata->>'status' in ('draft','disapproved','pending'),
    'canAddressFeedback',v_event.archived_at is null);
end $$;

create or replace function public.get_organization_event(p_event_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_event public.map_elements%rowtype;
begin
  if not public.can_access_event_overlay(p_event_id) then raise exception 'Event history access denied.' using errcode='42501'; end if;
  select * into v_event from public.map_elements where id=p_event_id;
  return private.event_row_result(v_event)||jsonb_build_object('archivedAt',v_event.archived_at);
end $$;

create or replace function public.list_organization_events(p_organization_id uuid,p_academic_year text default null,p_search text default '',p_limit integer default 50,p_offset integer default 0,p_include_archived boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_events jsonb;v_total integer;
begin
  if auth.uid() is null or not (public.is_admin() or private.event_organization_access(p_organization_id)) then raise exception 'Organization event history access denied.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 or length(coalesce(p_search,''))>200 then raise exception 'Invalid history page.' using errcode='22023'; end if;
  select count(*) into v_total from public.map_elements e where organization_id=p_organization_id
    and (p_include_archived or archived_at is null) and (p_academic_year is null or e.metadata->>'academicYear'=p_academic_year)
    and position(lower(coalesce(p_search,'')) in lower(coalesce(e.metadata->>'title','')))>0;
  select coalesce(jsonb_agg(private.event_row_result(e)||jsonb_build_object('archivedAt',e.archived_at) order by e.created_at desc,e.id),'[]'::jsonb) into v_events
    from (select * from public.map_elements e where organization_id=p_organization_id and (p_include_archived or archived_at is null)
      and (p_academic_year is null or e.metadata->>'academicYear'=p_academic_year)
      and position(lower(coalesce(p_search,'')) in lower(coalesce(e.metadata->>'title','')))>0
      order by created_at desc,id limit p_limit offset p_offset) e;
  return jsonb_build_object('events',v_events,'total',v_total);
end $$;

create or replace function public.create_organization_event(p_event_id uuid,p_organization_id uuid,p_expected_grant_id uuid,p_campus_id uuid,p_academic_year text,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.map_elements%rowtype;v_grant uuid;v_org public.event_organizations%rowtype;v_after jsonb;v_snapshot jsonb;
begin
  select * into v_org from public.event_organizations where id=p_organization_id for update;
  if not found or not private.event_organization_access(p_organization_id) then raise exception 'An active organization assignment is required.' using errcode='42501'; end if;
  select id into v_grant from public.event_organization_grants where organization_id=p_organization_id and representative_id=auth.uid() and ended_at is null;
  if p_expected_grant_id is null or v_grant is distinct from p_expected_grant_id then raise exception 'Representative changed. Refresh before creating this proposal.' using errcode='40001'; end if;
  if p_event_id is null or jsonb_typeof(p_metadata) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_metadata) k where k<>all(array['title','description','locations','posterUrl'])) then raise exception 'Invalid proposal content.' using errcode='23514'; end if;
  if jsonb_typeof(p_metadata->'title') is distinct from 'string' or length(btrim(p_metadata->>'title')) not between 1 and 200
    or p_academic_year is null or length(btrim(p_academic_year)) not between 1 and 40 then raise exception 'Enter a title and academic year.' using errcode='23514'; end if;
  if (p_metadata?'description' and (jsonb_typeof(p_metadata->'description') is distinct from 'string' or length(p_metadata->>'description')>5000))
    or (p_metadata?'posterUrl' and (jsonb_typeof(p_metadata->'posterUrl') is distinct from 'string' or length(p_metadata->>'posterUrl')>2048)) then
    raise exception 'Description or poster reference is invalid.' using errcode='23514'; end if;
  if jsonb_typeof(p_metadata->'locations') is distinct from 'array' or jsonb_array_length(p_metadata->'locations')=0 then raise exception 'Request at least one event location.' using errcode='23514'; end if;
  v_after:=p_metadata||jsonb_build_object('id',p_event_id,'kind','event_overlay','organizer',v_org.name,'createdByUserId',auth.uid(),'status','draft','isActive',true,'academicYear',btrim(p_academic_year),
    'locationRef',p_metadata#>'{locations,0,locationRef}','eventFurniture',coalesce(p_metadata#>'{locations,0,eventFurniture}','[]'::jsonb),'eventLabels',coalesce(p_metadata#>'{locations,0,eventLabels}','[]'::jsonb),'markers','[]'::jsonb,'restrictedAreas','[]'::jsonb);
  select v.snapshot into v_snapshot from public.campuses c join public.campus_versions v on v.id=c.latest_published_version_id and v.campus_id=c.id and v.state='published' where c.id=p_campus_id and c.status='published' and c.archived_at is null;
  if v_snapshot is null or not public.event_locations_match_snapshot(v_snapshot,v_after) then raise exception 'Requested locations must exist on the current published campus.' using errcode='23514'; end if;
  select * into v_event from public.map_elements where id=p_event_id for update;
  if found then
    if v_event.organization_id=p_organization_id and v_event.campus_id=p_campus_id and v_event.metadata->>'createdByUserId'=auth.uid()::text and v_event.metadata->>'status'='draft'
      and v_event.metadata->'title'=p_metadata->'title' and v_event.metadata->'locations'=p_metadata->'locations'
      and coalesce(v_event.metadata->'description','null'::jsonb)=coalesce(p_metadata->'description','null'::jsonb)
      and coalesce(v_event.metadata->'posterUrl','null'::jsonb)=coalesce(p_metadata->'posterUrl','null'::jsonb)
      and v_event.metadata->>'academicYear'=btrim(p_academic_year) then return private.event_row_result(v_event); end if;
    raise exception 'This creation attempt already completed with different content. Refresh your event list.' using errcode='40001';
  end if;
  perform set_config('app.event_org_command','on',true);
  insert into public.map_elements(id,campus_id,organization_id,element_type,name,metadata,x,y,is_visible,is_searchable,is_accessible,is_emergency_asset)
    values(p_event_id,p_campus_id,p_organization_id,'event_overlay',btrim(p_metadata->>'title'),v_after,0,0,true,false,false,false) returning * into v_event;
  perform set_config('app.event_org_command','off',true);return private.event_row_result(v_event);
end $$;

-- Forward-adapt known guard/RPC definitions. Refuse unexpected source rather than silently weakening it.
do $migration$
declare v_definition text; v_name text; v_source text;
begin
  select pg_get_functiondef('public.guard_event_overlay_review()'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,chr(13),'');
  v_source:='if not public.is_admin() and not (public.is_student_org() and old.metadata->>''createdByUserId'' = auth.uid()::text) then';
  if position(v_source in v_definition)=0 then raise exception 'Event guard source changed; organization migration requires review.'; end if;
  v_definition:=replace(v_definition,v_source,'if not public.is_admin() and not private.event_actor_access(old.organization_id,old.metadata) then');
  v_source:='if not public.is_student_org()'||chr(10)||'     or old.metadata->>''createdByUserId'' is distinct from auth.uid()::text';
  if position(v_source in v_definition)=0 then raise exception 'Event update authorization source changed.'; end if;
  v_definition:=replace(v_definition,v_source,'if not private.event_actor_access(old.organization_id,old.metadata)');
  v_definition:=replace(v_definition,'begin'||chr(10),$guard$begin
  if tg_op='INSERT' and (new.element_type='event_overlay' or new.metadata->>'kind'='event_overlay') then
    if new.organization_id is null or coalesce(current_setting('app.event_org_command',true),'')<>'on' or not private.event_organization_access(new.organization_id)
      or new.metadata->>'createdByUserId' is distinct from auth.uid()::text then
      raise exception 'Create this proposal through an active organization assignment.' using errcode='42501'; end if;
  elsif tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.metadata->'academicYear' is distinct from old.metadata->'academicYear' then
      if not public.is_admin() or coalesce(current_setting('app.event_org_bind_command',true),'')<>'on' then
        raise exception 'Organization identity and academic year are administrator controlled.' using errcode='42501'; end if;
    end if;
    if old.organization_id is not null and not public.is_admin() and (coalesce(current_setting('app.event_org_command',true),'')<>'on' or coalesce(current_setting('app.event_org_expected_command',true),'')<>'on') then
      raise exception 'Use the organization event save command.' using errcode='42501'; end if;
  elsif tg_op='DELETE' and old.organization_id is not null and not public.is_admin() and (coalesce(current_setting('app.event_org_command',true),'')<>'on' or coalesce(current_setting('app.event_org_expected_command',true),'')<>'on') then
    raise exception 'Use the organization event delete command.' using errcode='42501';
  end if;
$guard$);
  execute v_definition;

  foreach v_name in array array['public.save_pending_event_layout(uuid,timestamptz,jsonb)','public.withdraw_event_submission(uuid,timestamptz)','public.set_event_feedback_pin_addressed(uuid,timestamptz,text,text,boolean,text)'] loop
    select pg_get_functiondef(v_name::regprocedure) into v_definition;
    v_definition:=replace(v_definition,chr(13),'');
    v_source:=$source$select * into v_event from public.map_elements where id = p_overlay_id and archived_at is null
    and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay') for update;$source$;
    if position(v_source in v_definition)=0 then raise exception 'Event command lock source changed: %',v_name; end if;
    v_definition:=replace(v_definition,v_source,'v_event := private.lock_event_for_write(p_overlay_id,null,false);');
    v_source:='if not found or not public.is_student_org() or v_event.metadata->>''createdByUserId'' is distinct from auth.uid()::text then';
    if position(v_source in v_definition)=0 then raise exception 'Event command authorization source changed: %',v_name; end if;
    v_definition:=replace(v_definition,v_source,'if not private.event_actor_access(v_event.organization_id,v_event.metadata) then');
    v_source:=$source$return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id, 'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);$source$;
    if position(v_source in v_definition)=0 then raise exception 'Event command result source changed: %',v_name; end if;
    v_definition:=replace(v_definition,v_source,'return private.event_row_result(v_event);');
    execute v_definition;
  end loop;
  select pg_get_functiondef('public.list_event_revisions(uuid)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,chr(13),'');
  v_source:='public.is_admin() or (public.is_student_org() and v_event.metadata->>''createdByUserId'' = auth.uid()::text)';
  if position(v_source in v_definition)=0 then raise exception 'Revision read authorization source changed.'; end if;
  execute replace(v_definition,v_source,'public.can_access_event_overlay(v_event.id)');
  select pg_get_functiondef('public.stamp_event_revision()'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,chr(13),'');
  v_source:='if tg_op = ''UPDATE'' and new.metadata = old.metadata and new.name is not distinct from old.name then return new; end if;';
  if position(v_source in v_definition)=0 then raise exception 'Event revision stamp source changed.'; end if;
  v_definition:=replace(v_definition,v_source,'if tg_op = ''UPDATE'' and (new.organization_id is distinct from old.organization_id or (new.metadata = old.metadata and new.name is not distinct from old.name)) then return new; end if;');
  v_definition:=replace(v_definition,'''isActive'',''revision'',''lastEditedAt''','''isActive'',''revision'',''lastEditedAt'',''academicYear''');
  execute v_definition;
  select pg_get_functiondef('public.capture_event_revision()'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,chr(13),'');
  v_source:='if new.metadata = old.metadata and new.name is not distinct from old.name then return new; end if;';
  if position(v_source in v_definition)=0 then raise exception 'Event revision capture source changed.'; end if;
  v_definition:=replace(v_definition,v_source,'if new.organization_id is distinct from old.organization_id or (new.metadata = old.metadata and new.name is not distinct from old.name) then return new; end if;');
  execute v_definition;
  foreach v_name in array array[
    'public.review_event_layout(uuid,timestamptz,text,timestamptz,timestamptz,text,timestamptz,text,jsonb)',
    'public.manage_event_publication(uuid,timestamptz,text,timestamptz)'] loop
    select pg_get_functiondef(v_name::regprocedure) into v_definition;
    v_definition:=replace(v_definition,chr(13),'');
    v_source:=$return$return jsonb_build_object('id', v_event.id, 'campusId', v_event.campus_id,
    'updatedAt', v_event.updated_at, 'metadata', v_event.metadata);$return$;
    if position(v_source in v_definition)=0 then raise exception 'Admin event result source changed: %',v_name; end if;
    v_definition:=replace(v_definition,v_source,'perform set_config(''app.event_admin_command'',''off'',true); return private.event_row_result(v_event);');
    execute v_definition;
  end loop;
end $migration$;

create or replace function public.admin_bind_event_organization(p_event_id uuid,p_organization_id uuid,p_academic_year text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.map_elements%rowtype; v_before jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  perform 1 from public.event_organizations where id=p_organization_id for update;
  if not found then raise exception 'Organization not found.' using errcode='23514'; end if;
  select * into v_event from public.map_elements where id=p_event_id and (element_type='event_overlay' or metadata->>'kind'='event_overlay') for update;
  if not found then raise exception 'Event not found.' using errcode='23514'; end if;
  if v_event.organization_id is not null then raise exception 'This event already belongs to an organization.' using errcode='23514'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then raise exception 'Event changed. Refresh before assigning its organization.' using errcode='40001'; end if;
  if p_academic_year is null or length(btrim(p_academic_year)) not between 1 and 40 then raise exception 'Enter the verified historical academic year.' using errcode='23514'; end if;
  v_before:=to_jsonb(v_event);
  perform set_config('app.event_org_bind_command','on',true);perform set_config('app.event_admin_command','on',true);
  update public.map_elements set organization_id=p_organization_id,metadata=metadata||jsonb_build_object('academicYear',btrim(p_academic_year)),updated_at=clock_timestamp() where id=p_event_id returning * into v_event;
  perform set_config('app.event_org_bind_command','off',true);perform set_config('app.event_admin_command','off',true);
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data) values(p_organization_id,auth.uid(),'legacy_event_assigned',v_before,to_jsonb(v_event));
  return private.event_row_result(v_event);
end $$;

create or replace function public.admin_correct_event_organization(
  p_event_id uuid,p_organization_id uuid,p_academic_year text,p_expected_organization_id uuid,
  p_expected_updated_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.map_elements%rowtype;v_locked_orgs integer;v_before jsonb;v_reason text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_organization_id is null or p_expected_organization_id is null or p_organization_id=p_expected_organization_id then
    raise exception 'Choose a different verified organization for this correction.' using errcode='23514'; end if;
  v_reason:=btrim(coalesce(p_reason,''));
  if length(v_reason) not between 1 and 500 then raise exception 'A correction reason of up to 500 characters is required.' using errcode='23514'; end if;
  if p_academic_year is null or length(btrim(p_academic_year)) not between 1 and 40 then raise exception 'Enter the verified academic year.' using errcode='23514'; end if;
  perform id from public.event_organizations where id in (p_expected_organization_id,p_organization_id) order by id for update;
  get diagnostics v_locked_orgs=row_count;
  if v_locked_orgs<>2 then raise exception 'Both organizations must exist before correcting ownership.' using errcode='23514'; end if;
  select * into v_event from public.map_elements where id=p_event_id and (element_type='event_overlay' or metadata->>'kind'='event_overlay') for update;
  if not found then raise exception 'Event not found.' using errcode='23514'; end if;
  if v_event.organization_id is distinct from p_expected_organization_id then raise exception 'Event organization changed. Refresh before correcting it.' using errcode='40001'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then raise exception 'Event changed. Refresh before correcting its organization.' using errcode='40001'; end if;
  v_before:=to_jsonb(v_event);
  perform set_config('app.event_org_bind_command','on',true);
  perform set_config('app.event_admin_command','on',true);
  update public.map_elements set organization_id=p_organization_id,metadata=metadata||jsonb_build_object('academicYear',btrim(p_academic_year)),updated_at=clock_timestamp() where id=p_event_id returning * into v_event;
  perform set_config('app.event_admin_command','off',true);
  perform set_config('app.event_org_bind_command','off',true);
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data)
    values(p_organization_id,auth.uid(),'event_organization_corrected',v_before,
      jsonb_build_object('event',to_jsonb(v_event),'reason',v_reason,'previousOrganizationId',p_expected_organization_id));
  return private.event_row_result(v_event);
end $$;

create or replace function public.admin_preview_event_organization_reconciliation()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',e.id,'campusId',e.campus_id,'title',coalesce(nullif(e.metadata->>'title',''),e.name,'Untitled event'),
    'status',coalesce(e.metadata->>'status','draft'),'creatorUserId',e.metadata->>'createdByUserId',
    'creatorName',nullif(concat_ws(' ',p.first_name,p.last_name),''),'organizerLabel',e.metadata->>'organizer',
    'createdAt',e.created_at,'updatedAt',e.updated_at,'archivedAt',e.archived_at,'academicYear',nullif(btrim(e.metadata->>'academicYear'),''),
    'suggestedOrganizationId',case when suggestion.match_count=1 then suggestion.organization_id end,
    'suggestedOrganizationName',case when suggestion.match_count=1 then suggestion.organization_name end,
    'validation',case when nullif(btrim(e.metadata->>'academicYear'),'') is null then 'academic_year_required'
      when suggestion.match_count=1 then 'suggestion_requires_confirmation'
      when suggestion.match_count>1 then 'ambiguous_organizer_label' else 'choose_verified_organization' end
  ) order by e.created_at asc,e.id),'[]'::jsonb) into v_items
  from public.map_elements e
  left join public.profiles p on p.id::text=e.metadata->>'createdByUserId'
  cross join lateral (
    select count(distinct o.id) as match_count,(array_agg(o.id order by o.id))[1] as organization_id,
      (array_agg(o.name order by o.id))[1] as organization_name
    from public.event_organizations o where lower(btrim(o.name))=lower(btrim(coalesce(e.metadata->>'organizer','')))
      or lower(btrim(o.code))=lower(btrim(coalesce(e.metadata->>'organizer','')))
  ) suggestion
  where e.organization_id is null and (e.element_type='event_overlay' or e.metadata->>'kind'='event_overlay');
  return v_items;
end $$;

create or replace function public.mutate_organization_event(p_event_id uuid,p_expected_updated_at timestamptz,p_expected_grant_id uuid,p_command text,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.map_elements%rowtype; v_after jsonb; v_snapshot jsonb; v_allowed text[];
begin
  v_event:=private.lock_event_for_write(p_event_id,p_expected_grant_id,true);
  if v_event.organization_id is null then raise exception 'Use the legacy draft workflow for this unassigned event.' using errcode='23514'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then raise exception 'Event changed. Refresh before saving.' using errcode='40001'; end if;
  if p_command='delete' then
    if jsonb_typeof(p_changes) is distinct from 'object' or p_changes<>'{}'::jsonb then raise exception 'Invalid organization event delete command.' using errcode='22023'; end if;
    if v_event.metadata->>'status' not in ('draft','disapproved') then raise exception 'Only a draft or disapproved proposal can be deleted.' using errcode='42501'; end if;
    delete from public.map_elements where id=v_event.id;
    perform set_config('app.event_org_command','off',true);perform set_config('app.event_org_expected_command','off',true);return jsonb_build_object('id',v_event.id,'deleted',true);
  end if;
  if v_event.metadata->>'status'='approved' then raise exception 'Approved event layouts remain locked.' using errcode='42501'; end if;
  if p_command is null or p_command not in ('details','layout','submit','withdraw') or jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'Invalid organization event command.' using errcode='22023'; end if;
  if p_command='withdraw' then
    if v_event.metadata->>'status'<>'pending' or p_changes<>'{}'::jsonb then raise exception 'Only a pending proposal can be withdrawn.' using errcode='42501'; end if;
    v_after:=v_event.metadata||jsonb_build_object('status','draft','submittedAt',null);
    update public.map_elements set metadata=v_after where id=v_event.id returning * into v_event;
    perform set_config('app.event_org_command','off',true);perform set_config('app.event_org_expected_command','off',true);
    return private.event_row_result(v_event);
  end if;
  if p_command='details' and v_event.metadata->>'status'='pending' then raise exception 'Pending proposal details remain locked.' using errcode='42501'; end if;
  v_allowed:=case p_command when 'details' then array['title','description','organizer','posterUrl','locations'] when 'layout' then array['locations'] else array['locations']::text[] end;
  if exists(select 1 from jsonb_object_keys(p_changes) k where k<>all(v_allowed)) then raise exception 'This command includes protected event fields.' using errcode='42501'; end if;
  v_after:=v_event.metadata||p_changes;
  if p_changes?'locations' then
    if jsonb_typeof(p_changes->'locations') is distinct from 'array' or jsonb_array_length(p_changes->'locations')=0 then raise exception 'Request at least one event location.' using errcode='23514'; end if;
    v_after:=v_after||jsonb_build_object('locationRef',p_changes#>'{locations,0,locationRef}','eventFurniture',coalesce(p_changes#>'{locations,0,eventFurniture}','[]'::jsonb),'eventLabels',coalesce(p_changes#>'{locations,0,eventLabels}','[]'::jsonb));
  end if;
  if p_command='submit' then v_after:=v_after||jsonb_build_object('status','pending','adminComment',null);
  elsif v_event.metadata->>'status'<>'pending' then v_after:=v_after||jsonb_build_object('status','draft','submittedAt',null); end if;
  if p_command='details' then v_after:=v_after||jsonb_build_object('organizer',(select name from public.event_organizations where id=v_event.organization_id)); end if;
  if jsonb_typeof(v_after->'title') is distinct from 'string' or length(btrim(v_after->>'title')) not between 1 and 200 then raise exception 'Enter an event title of up to 200 characters.' using errcode='23514'; end if;
  if (p_changes?'description' and (jsonb_typeof(p_changes->'description') is distinct from 'string' or length(p_changes->>'description')>5000))
    or (p_changes?'posterUrl' and (jsonb_typeof(p_changes->'posterUrl') is distinct from 'string' or length(p_changes->>'posterUrl')>2048)) then
    raise exception 'Description or poster reference is invalid.' using errcode='23514'; end if;
  select v.snapshot into v_snapshot from public.campuses c join public.campus_versions v on v.id=c.latest_published_version_id and v.campus_id=c.id and v.state='published' where c.id=v_event.campus_id and c.status='published' and c.archived_at is null;
  if v_snapshot is null or not public.event_locations_match_snapshot(v_snapshot,v_after) then raise exception 'Requested locations must exist on the current published campus.' using errcode='23514'; end if;
  update public.map_elements set metadata=v_after,name=v_after->>'title' where id=v_event.id returning * into v_event;
  perform set_config('app.event_org_command','off',true);perform set_config('app.event_org_expected_command','off',true);
  return private.event_row_result(v_event);
end $$;

-- Legacy clients can keep their feedback payload contract, but bound rows require
-- a grant token checked under the organization lock before the existing operation.
create or replace function public.set_organization_event_feedback_pin_addressed(
  p_overlay_id uuid,p_expected_updated_at timestamptz,p_expected_grant_id uuid,
  p_location_id text,p_pin_id text,p_addressed boolean,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.map_elements%rowtype;
begin
  v_event:=private.lock_event_for_write(p_overlay_id,p_expected_grant_id,true);
  if v_event.organization_id is null then raise exception 'This event has no organization assignment.' using errcode='23514'; end if;
  if p_expected_updated_at is null or v_event.updated_at is distinct from p_expected_updated_at then raise exception 'Event changed. Refresh before saving feedback.' using errcode='40001'; end if;
  perform public.set_event_feedback_pin_addressed(p_overlay_id,p_expected_updated_at,p_location_id,p_pin_id,p_addressed,p_note);
  perform set_config('app.event_org_command','off',true);perform set_config('app.event_org_expected_command','off',true);
  select * into v_event from public.map_elements where id=p_overlay_id;
  return private.event_row_result(v_event);
end $$;
revoke all on function public.admin_bind_event_organization(uuid,uuid,text,timestamptz),public.admin_correct_event_organization(uuid,uuid,text,uuid,timestamptz,text),public.admin_preview_event_organization_reconciliation(),public.mutate_organization_event(uuid,timestamptz,uuid,text,jsonb),public.set_organization_event_feedback_pin_addressed(uuid,timestamptz,uuid,text,text,boolean,text) from public,anon;
grant execute on function public.admin_bind_event_organization(uuid,uuid,text,timestamptz),public.admin_correct_event_organization(uuid,uuid,text,uuid,timestamptz,text),public.admin_preview_event_organization_reconciliation(),public.mutate_organization_event(uuid,timestamptz,uuid,text,jsonb),public.set_organization_event_feedback_pin_addressed(uuid,timestamptz,uuid,text,text,boolean,text) to authenticated;
revoke all on function public.get_event_edit_access(uuid),public.get_organization_event(uuid),public.list_organization_events(uuid,text,text,integer,integer,boolean),public.create_organization_event(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.get_event_edit_access(uuid),public.get_organization_event(uuid),public.list_organization_events(uuid,text,text,integer,integer,boolean),public.create_organization_event(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;


-- SOURCE: supabase/migrations/20261009140000_event_organization_reuse.sql
-- Copy historical organization layout content into a new, server-created draft.
-- Approval, schedule, review data, notifications, and revision history never carry over.
begin;

alter table public.map_elements
  add column if not exists reused_from_event_id uuid references public.map_elements(id) on delete restrict;
create index if not exists map_elements_reused_from_event_idx
  on public.map_elements(reused_from_event_id) where reused_from_event_id is not null;

create table if not exists public.event_organization_reuse_requests (
  organization_id uuid not null references public.event_organizations(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  grant_id uuid not null references public.event_organization_grants(id) on delete restrict,
  request_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  event_id uuid references public.map_elements(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,grant_id,request_id)
);
create index if not exists event_organization_reuse_requests_org_idx
  on public.event_organization_reuse_requests(organization_id,created_at desc);
alter table public.event_organization_reuse_requests enable row level security;
revoke all on public.event_organization_reuse_requests from public,anon,authenticated;

create or replace function private.guard_event_reuse_provenance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' and new.reused_from_event_id is not null
    and coalesce(current_setting('app.event_reuse_command',true),'')<>'on' then
    raise exception 'Create a reused event draft through the organization reuse command.' using errcode='42501';
  end if;
  if tg_op='UPDATE' and new.reused_from_event_id is distinct from old.reused_from_event_id
    and coalesce(current_setting('app.event_reuse_command',true),'')<>'on' then
    raise exception 'Event reuse provenance cannot be changed.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_event_reuse_provenance() from public,anon,authenticated;
drop trigger if exists guard_event_reuse_provenance on public.map_elements;
create trigger guard_event_reuse_provenance before insert or update of reused_from_event_id on public.map_elements
for each row execute function private.guard_event_reuse_provenance();

create or replace function private.reusable_event_furniture(p_items jsonb)
returns jsonb language sql volatile set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',to_jsonb(gen_random_uuid()::text),'type',item->'type','name',item->'name','category',item->'category',
    'x',item->'x','y',item->'y','width',item->'width','height',item->'height','rotation',item->'rotation',
    'flipX',item->'flipX','flipY',item->'flipY','color',item->'color','assetKey',item->'assetKey',
    'assetVariant',item->'assetVariant','layer',item->'layer','zOrder',item->'zOrder',
    'visible',item->'visible','locked',item->'locked','groupId',item->'groupId','exteriorZoneId',item->'exteriorZoneId',
    'assetConfig',case when jsonb_typeof(item#>'{assetConfig,style}')='string'
      then jsonb_build_object('style',item#>'{assetConfig,style}') else null end
  )) order by ordinality),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end)
    with ordinality as entries(item,ordinality)
  where jsonb_typeof(item)='object';
$$;
revoke all on function private.reusable_event_furniture(jsonb) from public,anon,authenticated;

create or replace function private.reusable_event_labels(p_items jsonb)
returns jsonb language sql volatile set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',to_jsonb(gen_random_uuid()::text),'x',item->'x','y',item->'y','text',item->'text','fontSize',item->'fontSize',
    'color',item->'color','rotation',item->'rotation','align',item->'align','zOrder',item->'zOrder',
    'visible',item->'visible','locked',item->'locked'
  )) order by ordinality),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end)
    with ordinality as entries(item,ordinality)
  where jsonb_typeof(item)='object';
$$;
revoke all on function private.reusable_event_labels(jsonb) from public,anon,authenticated;

create or replace function private.event_poster_is_referenced(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_path is not null and length(p_path) between 1 and 300 and exists(
    select 1 from public.map_elements event
    where (event.element_type='event_overlay' or event.metadata->>'kind'='event_overlay')
      and position('/event_posters/'||p_path in coalesce(event.metadata->>'posterUrl',''))>0
  );
$$;
revoke all on function private.event_poster_is_referenced(text) from public,anon,authenticated;

create or replace function private.event_poster_has_current_org(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and public.is_student_org() and exists(
    select 1 from public.event_organization_grants grant_row
    join public.event_organizations org on org.id=grant_row.organization_id
    where grant_row.representative_id=p_user_id and grant_row.ended_at is null
      and grant_row.starts_at<=clock_timestamp() and grant_row.expires_at>clock_timestamp() and org.is_active
  );
$$;
revoke all on function private.event_poster_has_current_org(uuid) from public,anon,authenticated;

create or replace function public.can_upload_event_poster()
returns boolean language sql stable security definer set search_path='' as $$
  select private.event_poster_has_current_org(auth.uid());
$$;
revoke all on function public.can_upload_event_poster() from public,anon;
grant execute on function public.can_upload_event_poster() to authenticated;

create or replace function private.can_read_event_poster(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (public.is_admin() or exists(
    select 1 from public.map_elements event
    where (event.element_type='event_overlay' or event.metadata->>'kind'='event_overlay')
      and position('/event_posters/'||p_path in coalesce(event.metadata->>'posterUrl',''))>0
      and public.can_access_event_overlay(event.id)
  ));
$$;
revoke all on function private.can_read_event_poster(text) from public,anon,authenticated;

create or replace function public.can_read_event_poster(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.can_read_event_poster(p_path);
$$;
revoke all on function public.can_read_event_poster(text) from public,anon;
grant execute on function public.can_read_event_poster(text) to authenticated;

create or replace function public.is_event_poster_referenced(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.event_poster_is_referenced(p_path);
$$;
revoke all on function public.is_event_poster_referenced(text) from public,anon;
grant execute on function public.is_event_poster_referenced(text) to authenticated;

-- Uploads and authenticated listing follow active organization access. Public URLs
-- remain public by design; referencing posters cannot be deleted by any uploader.
drop policy if exists event_posters_insert_owner on storage.objects;
create policy event_posters_insert_owner on storage.objects for insert to authenticated
with check (bucket_id='event_posters' and public.can_upload_event_poster()
  and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists event_posters_select_owner_admin on storage.objects;
create policy event_posters_select_owner_admin on storage.objects for select to authenticated
using (bucket_id='event_posters' and public.can_read_event_poster(name));
drop policy if exists event_posters_delete_owner_admin on storage.objects;
create policy event_posters_delete_owner_admin on storage.objects for delete to authenticated
using (bucket_id='event_posters' and (public.is_admin() or
  (public.can_upload_event_poster() and (storage.foldername(name))[1]=auth.uid()::text))
  and not public.is_event_poster_referenced(name));

create or replace function private.event_row_result(p_event public.map_elements)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p_event.id,'campusId',p_event.campus_id,'updatedAt',p_event.updated_at,'createdAt',p_event.created_at,
    'organizationId',p_event.organization_id,'metadata',p_event.metadata,'reusedFromEventId',p_event.reused_from_event_id,
    'creatorName',(select concat_ws(' ',profile.first_name,profile.last_name) from public.profiles profile
      where profile.id::text=p_event.metadata->>'createdByUserId'));
$$;
revoke all on function private.event_row_result(public.map_elements) from public,anon,authenticated;

create or replace function public.reuse_organization_event(
  p_source_id uuid,p_expected_source_updated_at timestamptz,p_organization_id uuid,p_expected_grant_id uuid,
  p_title text,p_academic_year text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_org public.event_organizations%rowtype;
  v_grant public.event_organization_grants%rowtype;
  v_source public.map_elements%rowtype;
  v_new public.map_elements%rowtype;
  v_receipt public.event_organization_reuse_requests%rowtype;
  v_source_locations jsonb;
  v_location jsonb;
  v_locations jsonb;
  v_metadata jsonb;
  v_snapshot jsonb;
  v_missing text[]:='{}'::text[];
  v_title text:=btrim(coalesce(p_title,''));
  v_year text:=btrim(coalesce(p_academic_year,''));
  v_fingerprint text;
  v_source_id uuid:=p_source_id;
  v_request_id uuid:=p_request_id;
  v_ordinal integer;
begin
  if auth.uid() is null or not public.is_student_org() then
    raise exception 'An active organization representative is required.' using errcode='42501';
  end if;
  if v_source_id is null or v_request_id is null or p_organization_id is null or p_expected_grant_id is null then
    raise exception 'Refresh the organization and source layout before reusing it.' using errcode='23514';
  end if;
  if length(v_title) not between 1 and 200 or length(v_year) not between 1 and 40 then
    raise exception 'Enter a new event title and valid academic year.' using errcode='23514';
  end if;

  -- Match representative replacement lock order: organization, grant, source event.
  select * into v_org from public.event_organizations where id=p_organization_id for update;
  if not found or not v_org.is_active or not private.event_organization_access(p_organization_id) then
    raise exception 'Your organization access has ended or expired.' using errcode='42501';
  end if;
  select * into v_grant from public.event_organization_grants
    where organization_id=p_organization_id and representative_id=auth.uid() and ended_at is null
      and starts_at<=clock_timestamp() and expires_at>clock_timestamp() for share;
  if not found or v_grant.id is distinct from p_expected_grant_id then
    raise exception 'Your representative assignment changed. Refresh before reusing this layout.' using errcode='40001';
  end if;
  if v_year is distinct from btrim(v_grant.academic_year) then
    raise exception 'The draft academic year must match your current representative assignment.' using errcode='23514';
  end if;

  v_fingerprint:=md5(jsonb_build_object('sourceId',v_source_id,'sourceVersion',p_expected_source_updated_at,
    'organizationId',p_organization_id,'grantId',p_expected_grant_id,'title',v_title,'academicYear',v_year)::text);
  select * into v_receipt from public.event_organization_reuse_requests
    where actor_id=auth.uid() and grant_id=v_grant.id and request_id=v_request_id for update;
  if found then
    if v_receipt.organization_id is distinct from p_organization_id or v_receipt.request_fingerprint is distinct from v_fingerprint then
      raise exception 'This reuse request was already used with different details. Start a new request.' using errcode='40001';
    end if;
    if v_receipt.event_id is null then raise exception 'The earlier draft was removed. Start a new reuse request.' using errcode='40001'; end if;
    select * into v_new from public.map_elements where id=v_receipt.event_id;
    if not found then raise exception 'The earlier draft is unavailable. Start a new reuse request.' using errcode='40001'; end if;
    return private.event_row_result(v_new)||jsonb_build_object('archivedAt',v_new.archived_at);
  end if;

  select * into v_source from public.map_elements where id=v_source_id
    and (element_type='event_overlay' or metadata->>'kind'='event_overlay') for update;
  if not found or v_source.organization_id is distinct from p_organization_id then
    raise exception 'Only a layout from your current organization can be reused.' using errcode='42501';
  end if;
  if p_expected_source_updated_at is null or v_source.updated_at is distinct from p_expected_source_updated_at then
    raise exception 'The source layout changed. Refresh before reusing it.' using errcode='40001';
  end if;
  if v_source.archived_at is null and v_source.metadata->>'status'<>'approved' then
    raise exception 'Only a historical approved or archived layout can be reused.' using errcode='42501';
  end if;

  if jsonb_typeof(v_source.metadata->'locations')='array' then
    v_source_locations:=v_source.metadata->'locations';
  elsif jsonb_typeof(v_source.metadata->'locationRef')='object' then
    v_source_locations:=jsonb_build_array(jsonb_build_object('id','legacy-location','locationRef',v_source.metadata->'locationRef',
      'eventFurniture',coalesce(v_source.metadata->'eventFurniture','[]'::jsonb),'eventLabels',coalesce(v_source.metadata->'eventLabels','[]'::jsonb)));
  else
    raise exception 'This layout has no reusable event locations.' using errcode='23514';
  end if;
  if jsonb_array_length(v_source_locations)=0 then raise exception 'This layout has no reusable event locations.' using errcode='23514'; end if;
  if exists(select 1 from jsonb_array_elements(v_source_locations) as entries(item)
    where jsonb_typeof(item->'eventFurniture') not in ('array','null')
       or jsonb_typeof(item->'eventLabels') not in ('array','null')) then
    raise exception 'This layout contains invalid placement data. Inspect it before reusing.' using errcode='23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',gen_random_uuid()::text,
    'locationRef',jsonb_strip_nulls(jsonb_build_object('type',location#>'{locationRef,type}','label',location#>'{locationRef,label}',
      'buildingId',location#>'{locationRef,buildingId}','floorId',location#>'{locationRef,floorId}','roomId',location#>'{locationRef,roomId}')),
    'eventFurniture',private.reusable_event_furniture(location->'eventFurniture'),
    'eventLabels',private.reusable_event_labels(location->'eventLabels')
  ) order by ordinality),'[]'::jsonb) into v_locations
  from jsonb_array_elements(v_source_locations) with ordinality as entries(location,ordinality);

  select version.snapshot into v_snapshot
  from public.campuses campus join public.campus_versions version
    on version.id=campus.latest_published_version_id and version.campus_id=campus.id and version.state='published'
  where campus.id=v_source.campus_id and campus.status='published' and campus.archived_at is null;
  if v_snapshot is null then raise exception 'The source campus is no longer published. Its locations cannot be reused.' using errcode='23514'; end if;
  for v_location,v_ordinal in select value,ordinality from jsonb_array_elements(v_locations) with ordinality entries(value,ordinality) loop
    if not public.event_locations_match_snapshot(v_snapshot,jsonb_build_object('locations',jsonb_build_array(v_location))) then
      v_missing:=array_append(v_missing,coalesce(nullif(v_location#>>'{locationRef,label}',''),'Location '||v_ordinal::text));
    end if;
  end loop;
  if cardinality(v_missing)>0 then
    raise exception 'These saved locations are no longer on the published campus: %',array_to_string(v_missing,', ') using errcode='23514';
  end if;

  v_metadata:=jsonb_build_object(
    'id',gen_random_uuid(),'kind','event_overlay','title',v_title,
    'description',case when jsonb_typeof(v_source.metadata->'description')='string' then v_source.metadata->'description' else '""'::jsonb end,
    'organizer',v_org.name,'createdByUserId',auth.uid(),'status','draft','isActive',true,'academicYear',v_year,
    'reusedFromEventId',v_source.id,'locations',v_locations,
    'locationRef',v_locations->0->'locationRef','eventFurniture',coalesce(v_locations->0->'eventFurniture','[]'::jsonb),
    'eventLabels',coalesce(v_locations->0->'eventLabels','[]'::jsonb),'markers','[]'::jsonb,'restrictedAreas','[]'::jsonb
  );
  if jsonb_typeof(v_source.metadata->'posterUrl')='string' then v_metadata:=v_metadata||jsonb_build_object('posterUrl',v_source.metadata->>'posterUrl'); end if;

  perform set_config('app.event_org_command','on',true);
  perform set_config('app.event_reuse_command','on',true);
  insert into public.map_elements(id,campus_id,organization_id,reused_from_event_id,element_type,name,metadata,
    x,y,is_visible,is_searchable,is_accessible,is_emergency_asset)
  values((v_metadata->>'id')::uuid,v_source.campus_id,p_organization_id,v_source.id,'event_overlay',v_title,v_metadata,
    0,0,true,false,false,false) returning * into v_new;
  perform set_config('app.event_reuse_command','off',true);
  perform set_config('app.event_org_command','off',true);
  insert into public.event_organization_reuse_requests(organization_id,actor_id,grant_id,request_id,request_fingerprint,event_id)
    values(p_organization_id,auth.uid(),v_grant.id,v_request_id,v_fingerprint,v_new.id);
  insert into public.event_organization_audit(organization_id,actor_id,action,before_data,after_data)
    values(p_organization_id,auth.uid(),'historical_layout_reused',jsonb_build_object('sourceEventId',v_source.id),
      jsonb_build_object('eventId',v_new.id,'grantId',v_grant.id,'requestId',v_request_id));
  return private.event_row_result(v_new);
end $$;

revoke all on function public.reuse_organization_event(uuid,timestamptz,uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.reuse_organization_event(uuid,timestamptz,uuid,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;


-- SOURCE: supabase/migrations/20261009150000_event_organization_notifications.sql
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


