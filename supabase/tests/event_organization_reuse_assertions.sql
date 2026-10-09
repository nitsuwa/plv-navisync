-- Disposable PostgreSQL/PGlite fixture only; never run against live project data.
do $$ begin if current_setting('app.continuity_test',true) is distinct from 'isolated' then raise exception 'Disposable continuity fixture required'; end if; end $$;
reset role;
insert into storage.objects(bucket_id,name) values('event_posters','00000000-0000-0000-0000-000000000002/historical.png');
create temporary table reuse_source_before as select to_jsonb(event) as row from public.map_elements event where id='20000000-0000-0000-0000-000000000004';
create temporary table reuse_source_revisions_before as select count(*) as total from public.event_layout_revisions where event_id='20000000-0000-0000-0000-000000000004';
grant select on reuse_source_before,reuse_source_revisions_before to authenticated;

-- Add a separate controlled source whose venue has since disappeared from the published snapshot.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select set_config('app.event_org_command','on',false);
insert into public.map_elements(id,campus_id,organization_id,element_type,name,metadata)
values('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001',(select id from public.event_organizations where code='IT'),'event_overlay','Removed venue source',
  jsonb_build_object('kind','event_overlay','title','Removed venue source','description','Old layout','organizer','IT Organization','createdByUserId','00000000-0000-0000-0000-000000000003','status','draft','isActive',true,'academicYear','2026–2027',
    'locations',jsonb_build_array(jsonb_build_object('id','removed-location','locationRef',jsonb_build_object('type','building','label','Removed Science Floor','buildingId','removed-building','floorId','removed-building-f2'),'eventFurniture','[]'::jsonb,'eventLabels','[]'::jsonb))));
select set_config('app.event_org_command','off',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('app.event_admin_command','on',false);
update public.map_elements set metadata=metadata||jsonb_build_object('status','approved') where id='20000000-0000-0000-0000-000000000008';
select set_config('app.event_admin_command','off',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select continuity_test.assert('current successor has the verified organization and year',(select count(*)=1 from public.get_my_event_organizations() where organization_id=(select id from public.event_organizations where code='IT') and academic_year='2026–2027'));
create temporary table reuse_current_context as select organization_id,grant_id from public.get_my_event_organizations();
select continuity_test.denied('reuse blocks a venue removed from current published map',$q$select public.reuse_organization_event('20000000-0000-0000-0000-000000000008',(select updated_at from public.map_elements where id='20000000-0000-0000-0000-000000000008'),(select id from public.event_organizations where code='IT'),(select grant_id from public.get_my_event_organizations()),'Missing venue draft','2026–2027','50000000-0000-0000-0000-000000000008')$q$,'23514');
create temporary table reuse_created as
select public.reuse_organization_event('20000000-0000-0000-0000-000000000004',(select updated_at from public.map_elements where id='20000000-0000-0000-0000-000000000004'),(select id from public.event_organizations where code='IT'),(select grant_id from public.get_my_event_organizations()),'New College Week','2026–2027','50000000-0000-0000-0000-000000000001') as result;
select continuity_test.assert('reuse creates a new organization-owned draft with actual successor attribution',(select count(*)=1 from public.map_elements event,reuse_created created where event.id=(created.result->>'id')::uuid and event.id<>'20000000-0000-0000-0000-000000000004' and event.organization_id=(select id from public.event_organizations where code='IT') and event.reused_from_event_id='20000000-0000-0000-0000-000000000004' and event.metadata->>'status'='draft' and event.metadata->>'createdByUserId'='00000000-0000-0000-0000-000000000003' and event.metadata->>'academicYear'='2026–2027' and event.metadata->>'organizer'='IT Organization'));
select continuity_test.assert('reuse resets schedule approval feedback and uses a fresh revision',(select event.metadata->>'revision' is distinct from source.row->'metadata'->>'revision' and not (event.metadata ?| array['dateStart','dateEnd','publicationAt','submittedAt','adminComment','locationFeedback','feedbackResolutions']) and event.metadata->>'status'='draft' and event.metadata->>'revision'='1' from public.map_elements event,reuse_created created,reuse_source_before source where event.id=(created.result->>'id')::uuid));
select continuity_test.assert('reuse copies only supported layout fields and generates fresh location and item IDs',(select event.metadata->>'description'='Past event description' and event.metadata#>>'{locations,0,id}' is distinct from 'old-location' and event.metadata#>>'{locations,0,eventFurniture,0,id}' is distinct from 'old-booth' and event.metadata#>>'{locations,0,eventFurniture,0,assetConfig,style}'='fabric' and not (event.metadata->'locations'->0->'eventFurniture'->0 ? 'privateData') and not (event.metadata->'locations'->0->'eventFurniture'->0->'assetConfig' ? 'privateToken') and event.metadata#>>'{locations,0,eventLabels,0,id}' is distinct from 'old-label' and not (event.metadata->'locations'->0->'eventLabels'->0 ? 'privateData') from public.map_elements event,reuse_created created where event.id=(created.result->>'id')::uuid));
select continuity_test.assert('public poster reference and original event remain unchanged',(select event.metadata->>'posterUrl'='https://example.test/storage/v1/object/public/event_posters/00000000-0000-0000-0000-000000000002/historical.png' and source.row=to_jsonb(original) from public.map_elements event,reuse_created created,reuse_source_before source,public.map_elements original where event.id=(created.result->>'id')::uuid and original.id='20000000-0000-0000-0000-000000000004'));
select continuity_test.assert('reuse starts a separate revision history and leaves source revisions untouched',(select (select count(*)=1 from public.event_layout_revisions where event_id=(created.result->>'id')::uuid) and (select count(*)=source.total from public.event_layout_revisions where event_id='20000000-0000-0000-0000-000000000004') from reuse_created created,reuse_source_revisions_before source));
select continuity_test.assert('retry with identical request ID returns the same single draft',(select repeated.result->>'id'=created.result->>'id' and (select count(*)=1 from public.map_elements where reused_from_event_id='20000000-0000-0000-0000-000000000004' and metadata->>'title'='New College Week') from reuse_created created cross join lateral (select public.reuse_organization_event('20000000-0000-0000-0000-000000000004',(select updated_at from public.map_elements where id='20000000-0000-0000-0000-000000000004'),(select id from public.event_organizations where code='IT'),(select grant_id from public.get_my_event_organizations()),'New College Week','2026–2027','50000000-0000-0000-0000-000000000001') as result) repeated));
select continuity_test.denied('same reuse request ID cannot carry a different payload',$q$select public.reuse_organization_event('20000000-0000-0000-0000-000000000004',(select updated_at from public.map_elements where id='20000000-0000-0000-0000-000000000004'),(select id from public.event_organizations where code='IT'),(select grant_id from public.get_my_event_organizations()),'Different title','2026–2027','50000000-0000-0000-0000-000000000001')$q$,'40001');
select continuity_test.denied('changed reuse source requires refresh',$q$select public.reuse_organization_event('20000000-0000-0000-0000-000000000004',(select updated_at-interval '1 second' from public.map_elements where id='20000000-0000-0000-0000-000000000004'),(select id from public.event_organizations where code='IT'),(select grant_id from public.get_my_event_organizations()),'Stale source draft','2026–2027','50000000-0000-0000-0000-000000000004')$q$,'40001');
select continuity_test.assert('poster reference check sees history and reused drafts',(select public.is_event_poster_referenced('00000000-0000-0000-0000-000000000002/historical.png')));
select continuity_test.assert('current representative can list a poster through organization access',(select count(*)=1 from storage.objects where bucket_id='event_posters' and name='00000000-0000-0000-0000-000000000002/historical.png'));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select continuity_test.denied('another organization cannot reuse the source event',$q$select public.reuse_organization_event('20000000-0000-0000-0000-000000000004',(select updated_at from public.map_elements where id='20000000-0000-0000-0000-000000000004'),(select id from public.event_organizations where code='ART'),(select grant_id from public.get_my_event_organizations()),'Cross organization draft','2026–2027','50000000-0000-0000-0000-000000000009')$q$,'42501');
delete from storage.objects where bucket_id='event_posters' and name='00000000-0000-0000-0000-000000000002/historical.png';
reset role;
select continuity_test.assert('former uploader cannot delete a poster still referenced by event history',(select count(*)=1 from storage.objects where bucket_id='event_posters' and name='00000000-0000-0000-0000-000000000002/historical.png'));
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
delete from storage.objects where bucket_id='event_posters' and name='00000000-0000-0000-0000-000000000002/historical.png';
reset role;
select continuity_test.assert('administrator deletion is also blocked while a poster is referenced',(select count(*)=1 from storage.objects where bucket_id='event_posters' and name='00000000-0000-0000-0000-000000000002/historical.png'));

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.admin_set_event_representative((select id from public.event_organizations where code='IT'),'00000000-0000-0000-0000-000000000002','2026–2027',clock_timestamp()+interval '1 year',(select id from public.event_organization_grants where organization_id=(select id from public.event_organizations where code='IT') and ended_at is null));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select continuity_test.denied('revoked representative cannot reuse after handover',$q$select public.reuse_organization_event('20000000-0000-0000-0000-000000000004',(select (row->>'updated_at')::timestamptz from reuse_source_before),(select organization_id from reuse_current_context),(select grant_id from reuse_current_context),'After handover','2026–2027','50000000-0000-0000-0000-000000000010')$q$,'42501');
reset role;
