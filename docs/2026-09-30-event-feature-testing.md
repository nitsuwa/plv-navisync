# Event feature changes and testing

Implemented locally on September 30, 2026. The GitHub sync fast-forwarded main to 869d995; existing local changes were preserved and backup/pre-github-sync-20260930 was created. No push or live database migration was performed.

## Where to see changes

| Area | Changes |
| --- | --- |
| Student organization → My Events → Create event | Published campus selector; buildings and floors follow that campus; searchable floor checkboxes; selected-location list; Manila event dates; review summary before creation. |
| My Events → Continue draft | Full viewport editor without site navigation or outside scrolling; compact collapsible Details; fixed furniture sizes; smaller new chairs; configurable seating; placement checks; alignment and spacing guides. |
| Event editor | Debounced draft autosave and save status; edits made during saving remain intact; background refresh no longer replaces the canvas; first-use tutorial with Help replay; pre-submission review of every requested map. |
| My Events | Proposals across campuses; duplicate layout into a new draft; per-location review feedback. |
| Admin → Event Layouts | Approve and publish now or schedule publication; event dates; overlapping venue/time checks; per-location feedback. |
| Student → Map → Event map | Optional event layouts and short details; normal navigation remains available; future publication stays hidden; ended events disappear. |

## Database prerequisite

Apply `supabase/migrations/20260930140000_event_publication_visibility.sql` through the project's normal migration process to a test database first. Then execute `supabase/tests/event_publication_assertions.sql` against that database. These were not run against the live database in this task.

The migration provides publication visibility guards and a safe published-campus projection. Until applied, the app uses a compatibility fallback for campus loading; the new database protections are not deployed. Test publication end to end only after applying the migration. Older events without valid start/end dates are hidden from student preview until their dates are supplied and approved again.

## Manual test sequence

1. Open the local app at http://127.0.0.1:5173 and sign in as a student organization.
2. Create an event. Choose a published campus, then change campuses: buildings must change and incompatible locations must require confirmation before clearing. Select campus grounds and one or more floors. Search for a building. Set start and end dates.
3. Choose Create & design maps. Check the summary; cancel and confirm selections remain. Confirm once to create one proposal.
4. On the editor, verify site navigation is hidden and the page cannot scroll outside the map. Place furniture, rotate it and open Details. Furniture should have no resize handles or width/height fields. Existing saved furniture retains its previous dimensions.
5. Arrange chairs with a total not divisible by chairs per row, such as 12 chairs with 5 per row. Expect 5, 5 and 2. Try an excessive count, an arrangement outside the map, over another asset or in a authored doorway/access region. Invalid placements must show feedback without partially adding the arrangement.
6. Drag one asset near another to see alignment/spacing guides. Wait for the saved status, switch tabs and return: the canvas must remain mounted and assets stay visible. Make another edit while manually saving and confirm the newer edit remains.
7. Replay the tutorial using Help; test Next, Back, Skip and Finish. The first-use completion is stored per account in this browser.
8. Submit to GSO. Review all locations and counts. Empty or critical layouts must block confirmation. Review a location, correct it, and submit again.
9. In My Events, duplicate a proposal. Verify the copy is a new draft with layouts retained, without inherited publication approval or dates.
10. As admin, open Event Layouts. Add location feedback; try an overlapping venue/time request. Approve a valid event with a publication time a few minutes ahead (Asia/Manila).
11. As student, open Map and turn on Event map. Before publication the scheduled event is absent. At publication it appears; open its details/layout, use normal navigation, then switch the preview off. Discovery refreshes on toggle, focus and roughly every 30 seconds; an open event expires at its end time.
12. Reopen a disapproved proposal as the organization and verify location feedback is visible and can be addressed.

Use test accounts and test events for steps that save or approve data. Browser verification during implementation inspected the proposal flow without creating a live proposal.

## Verification and limits

- Focused integration run: 235 tests passed across 27 files, including editor, proposals, publication, services, student preview, autosave and layout isolation.
- Production Vite build passed. Repository-wide TypeScript checking still has pre-existing diagnostics; it is not a clean global check.
- SQL assertions require a database and were not executed here.
- Asset sizes are fixed in map units; maps do not yet provide a calibrated real-world scale or an authoritative venue capacity. Seating checks geometric fit and a 500-chair input limit, not certified occupancy. Outdoor path-clearance checks need authored geometry.
- No commit, push or production deployment was performed.
