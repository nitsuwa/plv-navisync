# Student Organization Event Workflow Design

**Status:** Approved for implementation on 2026-09-12

## Outcome

Student organizations can request several campus locations in one event proposal, design additions on top of the administrator-published maps, and submit the complete request for one combined administrator decision. The application keeps the base map read-only to student organizations: they can add and remove only event furniture and labels that belong to their overlay.

## Roles and verification

- A normal `student` can use the student portal but cannot create or edit event overlays.
- The office verifies the student's physical document outside the application.
- After the offline verification, an administrator manually changes the profile role to `student_org` in the existing user-management screen.
- The app does not upload, store, or track the physical document.
- The student-org event route remains blocked unless the active profile is an active `student_org`.

## Event proposal

The proposal keeps the event title, description, organization name, poster, requested locations, and map layout. The event date range is removed from create, edit, list, review, and active-map behavior. An event is visible after approval and while active; its visibility is no longer controlled by dates.

## Multiple locations

Creation uses a short two-step flow:

1. Enter event information.
2. Select one or more requested locations. Campus Grounds is one option; building floors can be added as separate locations.

The editor uses the hybrid layout chosen during consultation:

- setup is guided and location selection is grouped;
- editing presents one large focused canvas at a time with a clear location switcher;
- the administrator review shows every requested location and can open a read-only map preview.

Each location stores its own event furniture and labels. Existing single-location records are normalized into this shape when read so the change remains backward-compatible with saved data.

## Map permissions

- The published campus/building map is the base layer and is always read-only in the student editor.
- Student additions are stored only in the event overlay's location-specific furniture and label arrays.
- Delete actions operate only on those event-owned arrays; there is no student operation that writes to base map elements.
- The administrator approves or disapproves the requested locations and all location-specific additions together.

## Asset palette

The event palette uses native vector previews and includes Booth, Chair, Stage, Speaker, Projector, Monitor, Tent, Table, Barrier, and Signage. The assets use the existing `FloorFurniture` data model, so they remain movable, selectable, undoable, and removable like other event additions.

## Admin review

The admin queue shows a location summary and total additions across all requested locations. The review action remains one decision for the event. The map action opens a read-only multi-location preview under the admin portal; it cannot save, delete, or submit student changes.

## Compatibility and data boundary

No new database table is required. The JSON metadata for `map_elements.element_type = event_overlay` gains an optional `locations` array. Legacy `locationRef`, `eventFurniture`, and `eventLabels` are read and normalized. New writes use the multi-location array and omit date fields.

