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
