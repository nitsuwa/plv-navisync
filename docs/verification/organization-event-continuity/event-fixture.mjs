export const eventFixtureSql=`
create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(p_name text) returns text[] language sql immutable set search_path='' as $$
  select case when position('/' in p_name)=0 then '{}'::text[] else string_to_array(regexp_replace(p_name,'/[^/]*$',''),'/') end
$$;
create table campuses(id uuid primary key,status text,archived_at timestamptz,latest_published_version_id uuid);
create table campus_versions(id uuid primary key,campus_id uuid,state text,snapshot jsonb,published_at timestamptz default clock_timestamp());
create table activity_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,campus_id uuid,action text not null,entity_type text,entity_id uuid,metadata jsonb default '{}',created_at timestamptz not null default clock_timestamp());
create table map_elements(id uuid primary key default gen_random_uuid(),campus_id uuid,element_type text,name text,metadata jsonb not null default '{}',archived_at timestamptz,updated_at timestamptz default clock_timestamp(),created_at timestamptz default clock_timestamp(),x numeric default 0,y numeric default 0,is_visible boolean default true,is_searchable boolean default false,is_accessible boolean default false,is_emergency_asset boolean default false);
alter table map_elements enable row level security;alter table campus_versions enable row level security;
grant select,insert,update,delete on map_elements to authenticated;grant select on map_elements,campuses,campus_versions to anon,authenticated;
create policy test_broad_read on map_elements for select to anon,authenticated using(true);
create policy test_admin_mutate on map_elements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy test_versions_read on campus_versions for select to anon,authenticated using(true);
create function public.save_campus_structure_unchecked(p_campus_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_element_ids uuid[];
begin
  select coalesce(array_agg((item->>'id')::uuid),'{}'::uuid[]) into v_element_ids from jsonb_array_elements(coalesce(p_payload->'map_elements','[]'::jsonb)) item;
  update public.map_elements existing set name=item->>'name',x=coalesce((item->>'x')::numeric,existing.x)
    from jsonb_array_elements(coalesce(p_payload->'map_elements','[]'::jsonb)) item where existing.id=(item->>'id')::uuid;
  update public.map_elements set archived_at=now(),updated_at=now()
    where campus_id=p_campus_id and archived_at is null and not (id=any(v_element_ids));
  return jsonb_build_object('map_elements',cardinality(v_element_ids));
end $$;
create function public.save_campus_structure(p_campus_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'campus structure payload must be an object' using errcode = '22023';
  end if;
  return public.save_campus_structure_unchecked(p_campus_id,p_payload);
end $$;
create function campus_is_published(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.campuses c join public.campus_versions v on v.id=c.latest_published_version_id where c.id=p_id and c.status='published' and c.archived_at is null and v.state='published') $$;
insert into campuses values('10000000-0000-0000-0000-000000000001','published',null,'10000000-0000-0000-0000-000000000002');
insert into campus_versions(id,campus_id,state,snapshot) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','published','{"campus":{"id":"10000000-0000-0000-0000-000000000001"},"buildings":[]}');
insert into map_elements(id,campus_id,element_type,name,metadata) select
('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','event_overlay','Legacy '||status,
jsonb_build_object('kind','event_overlay','title','Legacy '||status,'organizer','IT','createdByUserId','00000000-0000-0000-0000-000000000002','status',status,'revision',4,'locations',jsonb_build_array(jsonb_build_object('id','campus-grounds','locationRef',jsonb_build_object('type','campus','label','Campus Grounds'),'eventFurniture','[]'::jsonb,'eventLabels','[]'::jsonb)))
|| case when status='approved' then jsonb_build_object('description','Past event description','isActive',true,'publicationAt','2020-01-01T00:00:00Z','dateStart','2026-01-01T00:00:00Z','dateEnd','2030-01-01T00:00:00Z','posterUrl','https://example.test/storage/v1/object/public/event_posters/00000000-0000-0000-0000-000000000002/historical.png','locations',jsonb_build_array(jsonb_build_object('id','old-location','locationRef',jsonb_build_object('type','campus','label','Campus Grounds'),'eventFurniture',jsonb_build_array(jsonb_build_object('id','old-booth','type','booth','name','Old Booth','category','event','x',20,'y',30,'width',50,'height',30,'rotation',0,'color','#f00','assetConfig',jsonb_build_object('style','fabric','privateToken','do-not-copy'),'privateData','do-not-copy')),'eventLabels',jsonb_build_array(jsonb_build_object('id','old-label','x',1,'y',2,'text','Stage','fontSize',14,'color','#000','rotation',0,'privateData','do-not-copy')))),'locationFeedback',jsonb_build_object('campus-grounds','@event-feedback/v1:{"text":"Follow up","pins":[{"id":"pin-1","x":10,"y":20,"comment":"Check aisle"}]}')) else '{}'::jsonb end
from (values(1,'draft'),(2,'pending'),(3,'disapproved'),(4,'approved')) t(n,status);
insert into map_elements(id,campus_id,element_type,name,metadata) values('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','tree','Campus tree','{}');
insert into map_elements(id,campus_id,element_type,name,metadata,updated_at) values('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','event_overlay','Unbound malformed pending event',
  jsonb_build_object('kind','event_overlay','title','Unbound malformed pending event','organizer','IT','status','pending','revision',1,
    'locations',jsonb_build_array(jsonb_build_object('id','campus-grounds','locationRef',jsonb_build_object('type','campus','label','Campus Grounds'),'eventFurniture','[]'::jsonb,'eventLabels','[]'::jsonb))),'2026-10-09T00:00:00Z');
insert into map_elements(id,campus_id,element_type,name,metadata,archived_at) values('20000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','event_overlay','Archived historical event',
  jsonb_build_object('kind','event_overlay','title','Archived historical event','organizer','IT','createdByUserId','00000000-0000-0000-0000-000000000002','status','approved','isActive',false,'dateStart','2025-01-01T09:00:00Z','dateEnd','2025-01-01T17:00:00Z','publicationAt','2024-12-01T00:00:00Z','revision',3,
    'locations',jsonb_build_array(jsonb_build_object('id','campus-grounds','locationRef',jsonb_build_object('type','campus','label','Campus Grounds'),'eventFurniture','[]'::jsonb,'eventLabels','[]'::jsonb))),clock_timestamp());
insert into map_elements(id,campus_id,element_type,name,metadata,updated_at) values(
  '20000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','custom','TEST: College Week 2026',
  jsonb_build_object('kind','event_overlay','ui',jsonb_build_object(
    'id','20000000-0000-0000-0000-000000000009','kind','event_overlay','title','TEST: College Week 2026',
    'description','Legacy event details','organizer','OSA','status','draft',
    'createdByUserId','00000000-0000-0000-0000-000000000002','isActive',true,
    'revision',4,
    'locations',jsonb_build_array(jsonb_build_object('id','grounds','locationRef',jsonb_build_object('type','campus','label','Campus Grounds'),'eventFurniture','[]'::jsonb,'eventLabels','[]'::jsonb)),
    'eventFurniture',jsonb_build_array(jsonb_build_object('id','legacy-booth','name','Legacy Booth')),
    'eventLabels',jsonb_build_array(jsonb_build_object('id','legacy-stage','text','Stage')))),
  '2026-09-30T13:42:20.804809Z');
insert into map_elements(id,campus_id,element_type,name,metadata,updated_at) values
('20000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','custom','Nested approved event',
  jsonb_build_object('kind','event_overlay','ui',jsonb_build_object('title','Nested approved event','status','approved','createdByUserId','00000000-0000-0000-0000-000000000002','locations','[]'::jsonb)),
  '2026-09-30T13:42:20.804809Z'),
('20000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','custom','Nested pending event',
  jsonb_build_object('kind','event_overlay','ui',jsonb_build_object('title','Nested pending event','status','pending','createdByUserId','00000000-0000-0000-0000-000000000002','locations','[]'::jsonb)),
  '2026-09-30T13:42:20.804809Z'),
('20000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000001','custom','Hybrid approved event',
  jsonb_build_object('kind','event_overlay','createdByUserId','00000000-0000-0000-0000-000000000002','ui',jsonb_build_object('title','Hybrid approved event','status','approved','locations','[]'::jsonb)),
  '2026-09-30T13:42:20.804809Z');
`;
export const baselineEventMigrations=[
'20260905120000_event_overlay_schema.sql',
'20260930140000_event_publication_visibility.sql',
'20261002090000_event_publication_management.sql',
'20261003150000_event_revision_history.sql',
'20261003180000_event_feedback_resolution.sql',
'20261003213000_event_poster_storage.sql',
'20261004120000_event_review_integrity_forward_fixes.sql',
'20261005033712_isolate_event_overlays_from_campus_structure_save.sql',
'20261007100000_allow_approved_event_feedback_resolution.sql',
'20261008120000_event_notification_receipts.sql',
];
export const eventPreOwnershipHistorySql=`
insert into public.event_layout_revisions(event_id,owner_id,actor_id,action,before_metadata,after_metadata)
select id,metadata->>'createdByUserId','00000000-0000-0000-0000-000000000002','edited','{}'::jsonb,metadata
from public.map_elements where id in (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000007'
);
`;
