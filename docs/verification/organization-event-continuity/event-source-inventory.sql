-- Read-only record inventory. Run as an authorized Supabase administrator.
-- Save the pre-migration output, apply the reviewed migrations, then run the
-- post-migration section and compare source totals. This script writes no data.

-- PRE-MIGRATION / legacy sources
select 'public.events' as source, status, count(*) as rows
from public.events
group by status
union all
select 'public.event_locations', 'all', count(*)
from public.event_locations
order by source, status;

select 'public.map_elements event overlays' as source,
       coalesce(metadata->>'status', 'unknown') as status,
       count(*) as rows
from public.map_elements
where element_type = 'event_overlay'
   or metadata->>'kind' = 'event_overlay'
group by coalesce(metadata->>'status', 'unknown')
order by status;

select 'public.event_layout_revisions' as source, count(*) as rows
from public.event_layout_revisions;

-- POST-MIGRATION ONLY: run after 20261009130000_event_organization_ownership.sql
-- and 20261009140000_event_organization_reuse.sql have been applied.
select case when organization_id is null then 'unbound legacy overlay' else 'organization-bound overlay' end as ownership,
       coalesce(metadata->>'status', 'unknown') as status,
       count(*) as rows
from public.map_elements
where element_type = 'event_overlay'
   or metadata->>'kind' = 'event_overlay'
group by organization_id is null, coalesce(metadata->>'status', 'unknown')
order by ownership, status;

select 'reused event drafts with provenance' as source, count(*) as rows
from public.map_elements
where reused_from_event_id is not null;
