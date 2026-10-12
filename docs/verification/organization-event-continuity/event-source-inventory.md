# Event data source inventory

This is the source map used before consolidating the admin navigation. No records are copied, deleted, or automatically converted by the workspace route change.

| Source | Purpose | Existing owner | New workspace action |
| --- | --- | --- | --- |
| `public.events` | Legacy campus-wide event listings | Existing event creator/admin contract | Remains in Campus listings and keeps its create, edit, publish, and archive actions. |
| `public.event_locations` | Venue labels attached to legacy campus events | `event_id` foreign key to `events` | Continues to be read and written by the legacy listing service. |
| `public.map_elements` rows with `element_type = 'event_overlay'` (or legacy `metadata.kind`) | Student organization event maps and approval/publication state | `organization_id` after the ownership migration; unbound rows retain restricted legacy access | Shown in Needs review, Approved & publication, and History. They are never presented as legacy campus listings. |
| `public.event_layout_revisions` | Version and review history for event layouts | Event overlay access policy | Remains attached to the same original overlay and creator history. |
| `public.event_notification_receipts` and organization handover receipts | Per-person read state and representative handover notices | Authenticated viewer + event/grant | Updated only by their RPCs; acknowledgements do not change pending totals. |
| Poster objects referenced by event metadata | Event artwork | Existing poster access rules plus protected reference checks | Existing object paths stay intact; reuse creates a new draft and does not copy private credentials or public approval state. |

## Routes and feeds preserved

- `/admin-dashboard/events` without a `view` query continues to open the previous Campus Events listing page. The new Events sidebar entry opens `/admin-dashboard/events?view=review`.
- `/admin-dashboard/events?view=listings` is the explicit legacy listing view.
- `/admin-dashboard/event-layouts` redirects to the unified workspace and preserves its query parameters, including `review=<event-id>`.
- `/admin-dashboard/event-layouts/:id/preview` remains a valid preview URL.
- Student public map/event feeds keep their existing published/approved and schedule visibility rules. The consolidation changes only the admin navigation and organization ownership does not publish an event.

## Count status

Exact counts were captured through the existing active administrator's API/RLS view before continuity SQL installation: `events` 2, `event_locations` 0, event overlays 8, and revisions 419. Timestamp and scope are in [`live-source-counts.json`](./live-source-counts.json). The capture creates no event/grant/QA record and uses no persisted login session.

These API counts do not replace owner-level SQL counts or the post-migration comparison. Live SQL remains the user's action. Run [`event-source-inventory.sql`](./event-source-inventory.sql) and the preflight/postflight scripts, then compare production source totals and protected record fields. The inventory labels its post-migration section because ownership/reuse columns do not exist before installation. Fixture/PGlite counts are not production counts.
