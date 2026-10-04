-- Read-only: verify RPC availability and identify stored event records.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
('review_event_layout', 'save_pending_event_layout', 'withdraw_event_submission', 'list_event_revisions');

select to_regclass('public.event_layout_revisions') as revision_table;

select id, name, metadata->>'title' as title, metadata->>'status' as status,
metadata->>'createdByUserId' as owner_id, metadata->>'submittedAt' as submitted_at,
updated_at
from public.map_elements
where element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay'
order by updated_at desc;
