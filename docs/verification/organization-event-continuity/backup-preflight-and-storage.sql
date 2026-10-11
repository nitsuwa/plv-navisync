-- READ-ONLY. Run BEFORE apply-continuity.sql in the intended Supabase SQL Editor.
-- One result row: export it as CSV into your private backup folder.
-- The restoreSql field is saved text; this SELECT does not execute that text.
-- Snapshotting access rules is not a completed restore test or a whole-project backup.
with required_tables as (
  select name, to_regclass(name) is not null as present
  from unnest(array['public.profiles','public.map_elements','public.campuses','public.campus_versions',
    'public.event_layout_revisions','public.event_notification_receipts','public.activity_logs',
    'public.events','public.event_locations','storage.buckets','storage.objects']) name
), required_functions as (
  select signature, to_regprocedure(signature) is not null as present
  from unnest(array['public.is_admin()','public.is_student_org()',
    'public.list_event_safe_published_campuses()','public.event_notification_payload(jsonb,text)',
    'public.get_event_notification_states(uuid,text,jsonb)',
    'public.ack_event_notification(uuid,text,uuid,jsonb)']) signature
), expected_policies as (
  select name from unnest(array['event_posters_insert_owner','event_posters_select_owner_admin',
    'event_posters_delete_owner_admin']) name
), captured_policies as (
  select p.*,
    format('drop policy if exists %I on %I.%I;%screate policy %I on %I.%I as %s for %s to %s%s%s;',
      policyname, schemaname, tablename, E'\n', policyname, schemaname, tablename, permissive, cmd,
      (select string_agg(case when r='public' then 'public' else quote_ident(r) end, ', ' order by r) from unnest(roles) r),
      case when qual is null then '' else ' using ('||qual||')' end,
      case when with_check is null then '' else ' with check ('||with_check||')' end) as restore_sql
  from pg_policies p where schemaname='storage' and tablename='objects'
    and policyname in (select name from expected_policies)
)
select jsonb_build_object(
  'capturedAt', clock_timestamp(),
  'preflightReady', (select bool_and(present) from required_tables) and (select bool_and(present) from required_functions),
  'requiredTables', (select jsonb_agg(to_jsonb(t) order by name) from required_tables t),
  'requiredFunctions', (select jsonb_agg(to_jsonb(f) order by signature) from required_functions f),
  'storagePolicyCaptureReady', (select count(*)=3 from captured_policies)
    and exists(select 1 from storage.buckets where id='event_posters'),
  'missingPosterPolicies', (select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from expected_policies e
    where not exists(select 1 from captured_policies p where p.policyname=e.name)),
  'posterPolicies', (select coalesce(jsonb_agg(to_jsonb(p)-'restore_sql' order by policyname),'[]'::jsonb) from captured_policies p),
  'restoreSql', 'begin;'||E'\n'||coalesce((select string_agg(restore_sql,E'\n\n' order by policyname) from captured_policies),'')||E'\ncommit;',
  'posterBucket', (select to_jsonb(b) from storage.buckets b where id='event_posters'),
  'posterObjects', (select coalesce(jsonb_agg(to_jsonb(o) order by name,id),'[]'::jsonb) from storage.objects o where bucket_id='event_posters'),
  'counts', jsonb_build_object(
    'events', (select count(*) from public.events),
    'eventLocations', (select count(*) from public.event_locations),
    'eventOverlays', (select count(*) from public.map_elements where element_type='event_overlay' or metadata->>'kind'='event_overlay'),
    'eventRevisions', (select count(*) from public.event_layout_revisions),
    'notificationReceipts', (select count(*) from public.event_notification_receipts),
    'posterObjects', (select count(*) from storage.objects where bucket_id='event_posters')
  ),
  'eventRecords', (select coalesce(jsonb_agg(to_jsonb(e) order by created_at,id),'[]'::jsonb) from public.map_elements e
    where element_type='event_overlay' or metadata->>'kind'='event_overlay'),
  'limitation', 'Database export and this metadata snapshot exclude actual Storage file bytes. Review and test restoration separately; never execute restoreSql on production merely to test it.'
) as backup_json;
