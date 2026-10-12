-- Disposable PostgreSQL/PGlite fixture only; never run against live project data.
do $$ begin if current_setting('app.continuity_test',true) is distinct from 'isolated' then raise exception 'Disposable continuity fixture required'; end if; end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('app.event_admin_command','on',false);
update public.map_elements set metadata=metadata||jsonb_build_object('locationFeedback',jsonb_build_object(
  'campus-grounds','@event-feedback/v1:{"text":"Review","pins":[{"id":"pin-1","x":10,"y":20,"comment":"Review newly placed stage"}]}'
))
where id='20000000-0000-0000-0000-000000000004';
update public.map_elements set metadata=(metadata-'publicationAt'-'dateStart'-'dateEnd'-'adminComment'-'locationFeedback'-'feedbackResolutions')||jsonb_build_object('status','pending')
where id='20000000-0000-0000-0000-000000000002';
select set_config('app.event_admin_command','off',false);
select public.admin_set_event_representative(
  (select id from public.event_organizations where code='IT'),
  '00000000-0000-0000-0000-000000000003','2026–2027',clock_timestamp()+interval '1 year',
  (select id from public.event_organization_grants where organization_id=(select id from public.event_organizations where code='IT') and ended_at is null)
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
create temporary table notification_grant as select grant_id from public.get_my_event_organizations() where organization_id=(select id from public.event_organizations where code='IT');
create temporary table handover_before as select public.get_event_organization_handover(grant_id) as data from notification_grant;
select continuity_test.assert('successor receives an unread handover scoped to the new grant',
  (select data->>'is_read'='false' from handover_before));
select continuity_test.assert('handover reports one pending submission and all unfinished organization work',
  (select (data->>'pending_count')::integer=1 and (data->>'unfinished_count')::integer>=3 from handover_before));
select continuity_test.assert('handover summarizes unresolved feedback pins',
  (select (data->>'open_feedback_count')::integer=1 from handover_before));
select public.create_organization_event(
  '60000000-0000-4000-8000-000000000099',
  (select organization_id from public.get_my_event_organizations() where grant_id=(select grant_id from notification_grant)),
  (select grant_id from notification_grant),'10000000-0000-0000-0000-000000000001',
  (select academic_year from public.get_my_event_organizations() where grant_id=(select grant_id from notification_grant)),
  '{"title":"Incoming representative own new draft","locations":[{"id":"campus-grounds","locationRef":{"type":"campus","label":"Campus Grounds"},"eventFurniture":[],"eventLabels":[]}]}'::jsonb
);
select continuity_test.assert('work created by the incoming representative after appointment is not a handover alert',
  (select public.get_event_organization_handover(grant_id)->'unfinished_count'=(select data->'unfinished_count' from handover_before)
   from notification_grant));
select public.ack_event_organization_handover((select grant_id from notification_grant));
select continuity_test.assert('handover acknowledgement is private to and remembered by the current grant',
  (select (public.get_event_organization_handover(grant_id)->>'is_read')::boolean from notification_grant));

-- Prior representative decisions are inherited work, not a new approval alert.
select continuity_test.assert('successor does not receive old approval as a new review notification', (
  select not state.is_current from public.map_elements e cross join lateral public.get_event_notification_states(
    auth.uid(),'org_review',jsonb_build_array(jsonb_build_object('event_id',e.id,'payload',jsonb_build_array(
      e.metadata->>'submittedAt',e.metadata->>'status',coalesce(e.metadata->>'adminComment',''),coalesce(e.metadata->'locationFeedback','{}'::jsonb)
    )))
  ) state where e.id='20000000-0000-0000-0000-000000000004'
));

-- Admin reviews a pending event after the incoming grant begins.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.review_event_layout(
  '20000000-0000-0000-0000-000000000002',(select updated_at from public.map_elements where id='20000000-0000-0000-0000-000000000002'),
  'approved',clock_timestamp()+interval '1 day',clock_timestamp()+interval '3 days','now',null,'New rep: keep this path clear.',
  '{"campus-grounds":"Keep the path clear."}'::jsonb
);
create temporary table pending_count_after_approval as select count(*) as total from public.map_elements where metadata->>'status'='pending' and archived_at is null;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select continuity_test.assert('approval made during the current grant is unread', (
  select state.is_current and not state.is_read from public.map_elements e cross join lateral public.get_event_notification_states(
    auth.uid(),'org_review',jsonb_build_array(jsonb_build_object('event_id',e.id,'payload',jsonb_build_array(
      e.metadata->>'submittedAt',e.metadata->>'status',coalesce(e.metadata->>'adminComment',''),coalesce(e.metadata->'locationFeedback','{}'::jsonb)
    )))
  ) state where e.id='20000000-0000-0000-0000-000000000002'
));
select public.ack_event_notification(auth.uid(),'org_review','20000000-0000-0000-0000-000000000002',(
  select jsonb_build_array(metadata->>'submittedAt',metadata->>'status',coalesce(metadata->>'adminComment',''),coalesce(metadata->'locationFeedback','{}'::jsonb))
  from public.map_elements where id='20000000-0000-0000-0000-000000000002'
));
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select continuity_test.assert('admin pending total is unchanged by acknowledgement',
  (select total=(select count(*) from public.map_elements where metadata->>'status'='pending' and archived_at is null) from pending_count_after_approval));

-- A later administrator feedback change on the same approved event is a new fingerprint.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('app.event_admin_command','on',false);
update public.map_elements set metadata=metadata||jsonb_build_object('locationFeedback','{"campus-grounds":"Updated after handover."}'::jsonb)
where id='20000000-0000-0000-0000-000000000002';
select set_config('app.event_admin_command','off',false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select continuity_test.assert('later administrator feedback becomes a new unread notification', (
  select state.is_current and not state.is_read from public.map_elements e cross join lateral public.get_event_notification_states(
    auth.uid(),'org_review',jsonb_build_array(jsonb_build_object('event_id',e.id,'payload',jsonb_build_array(
      e.metadata->>'submittedAt',e.metadata->>'status',coalesce(e.metadata->>'adminComment',''),coalesce(e.metadata->'locationFeedback','{}'::jsonb)
    )))
  ) state where e.id='20000000-0000-0000-0000-000000000002'
));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select continuity_test.denied('outgoing representative cannot read successor review receipts',$q$select * from public.get_event_notification_states(auth.uid(),'org_review','[{"event_id":"20000000-0000-0000-0000-000000000002","payload":[]}]'::jsonb)$q$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select continuity_test.denied('another organization cannot read private review receipts',$q$select * from public.get_event_notification_states(auth.uid(),'org_review','[{"event_id":"20000000-0000-0000-0000-000000000002","payload":[]}]'::jsonb)$q$,'42501');
reset role;
