-- Read-only postflight after all four October 9 migrations.
select name as required_table,to_regclass(name) is not null as present
from unnest(array[
  'public.event_organizations','public.event_organization_grants','public.event_organization_audit',
  'public.event_organization_reuse_requests','public.event_organization_handover_receipts'
]) name;

select signature as required_function,to_regprocedure(signature) is not null as present
from unnest(array[
  'public.admin_list_event_organizations()',
  'public.admin_save_event_organization(uuid,text,text,boolean,timestamp with time zone)',
  'public.admin_set_event_representative(uuid,uuid,text,timestamp with time zone,uuid)',
  'public.admin_revoke_event_representative(uuid,uuid,text)',
  'public.get_my_event_organizations()',
  'public.get_event_edit_access(uuid)',
  'public.list_organization_events(uuid,text,text,integer,integer,boolean)',
  'public.reuse_organization_event(uuid,timestamp with time zone,uuid,uuid,text,text,uuid)',
  'public.get_event_organization_handover(uuid)',
  'public.ack_event_organization_handover(uuid)',
  'public.can_upload_event_poster()','public.is_event_poster_referenced(text)',
  'public.admin_preview_event_organization_reconciliation()'
]) signature;

select c.relname,c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('event_organizations','event_organization_grants',
  'event_organization_audit','event_organization_reuse_requests','event_organization_handover_receipts');

select 'event_overlays' as source,count(*) as records from public.map_elements
where element_type='event_overlay' or metadata->>'kind'='event_overlay'
union all select 'event_layout_revisions',count(*) from public.event_layout_revisions
union all select 'event_notification_receipts',count(*) from public.event_notification_receipts
union all select 'event_poster_objects',count(*) from storage.objects where bucket_id='event_posters';

select id,organization_id,reused_from_event_id,created_at,updated_at,archived_at,
  metadata->>'title' as title,metadata->>'createdByUserId' as original_creator,
  metadata->>'status' as approval_status,metadata->>'dateStart' as event_start,
  metadata->>'dateEnd' as event_end,metadata->>'publicationAt' as publication_at
from public.map_elements where element_type='event_overlay' or metadata->>'kind'='event_overlay'
order by created_at,id;

-- Must return no rows: two open assignments for one organization.
select organization_id,count(*) as open_assignments from public.event_organization_grants
where ended_at is null group by organization_id having count(*)>1;
