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
