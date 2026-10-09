-- Read-only preflight. Run before the four October 9 continuity migrations.
select name as required_table, to_regclass(name) is not null as present
from unnest(array[
  'public.profiles','public.map_elements','public.campuses','public.campus_versions',
  'public.event_layout_revisions','public.event_notification_receipts','public.activity_logs',
  'storage.buckets','storage.objects'
]) name;

select signature as required_function, to_regprocedure(signature) is not null as present
from unnest(array['public.is_admin()','public.is_student_org()',
  'public.list_event_safe_published_campuses()','public.event_notification_payload(jsonb,text)',
  'public.get_event_notification_states(uuid,text,jsonb)',
  'public.ack_event_notification(uuid,text,uuid,jsonb)'
]) signature;

select 'event_overlays' as source, count(*) as records from public.map_elements
where element_type='event_overlay' or metadata->>'kind'='event_overlay'
union all select 'event_layout_revisions',count(*) from public.event_layout_revisions
union all select 'event_notification_receipts',count(*) from public.event_notification_receipts
union all select 'event_poster_objects',count(*) from storage.objects where bucket_id='event_posters';

select id,campus_id,created_at,updated_at,archived_at,
  metadata->>'title' as title,metadata->>'createdByUserId' as original_creator,
  metadata->>'status' as approval_status,metadata->>'dateStart' as event_start,
  metadata->>'dateEnd' as event_end,metadata->>'publicationAt' as publication_at
from public.map_elements
where element_type='event_overlay' or metadata->>'kind'='event_overlay'
order by created_at,id;

select id,public from storage.buckets where id='event_posters';
-- Preserve the source-specific legacy listing counts using event-source-inventory.sql
-- after migration (its organization columns do not exist before installation).
