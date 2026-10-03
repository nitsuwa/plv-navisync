# Event workflow polish

## Scope

Improve the event feature across student organization proposals, layout editing, administrator review/publication, and student map previews. Shared shell and map changes must be conditional on event behavior. Preserve ordinary campus navigation and existing local work. Existing unrelated map-builder test failures are a baseline limitation, not part of this feature.

## Approach

Extend the current event overlay model and services. Reuse published campus snapshots, event location resolution, draft recovery, layout validation, and read-only event rendering. Build in three verifiable stages: proposal/editor usability; fixed asset sizing and seating; publication/student preview/tutorial.

An alternative is a new independent event editor, but it duplicates persistence and map rendering. A cosmetic-only update would leave campus selection, scheduling, and focus reload behavior unresolved. Extending the current feature is recommended.

## Proposal creation

Use one published campus per proposal and allow multiple requested locations within it. Show a campus selector in the locations step. Derive building and floor choices from that campus's published snapshot, never another campus or an unpublished draft. When switching campuses with locations selected, confirm clearing incompatible selections before applying the change. Existing proposals retain their campus identity.

Replace the building/floor/add cycle with searchable building groups and directly selectable floor checkboxes. Show campus grounds as a separate selectable card and maintain a compact selected-location summary with remove actions. Prevent duplicates and describe unavailable buildings/floors. Preserve existing service-side fresh-snapshot validation.

Create & design maps opens a confirmation dialog showing event title, event dates, campus, requested locations, and the number of maps to design. Back returns to editable selections. Confirm creates the proposal once and opens the editor; disable duplicate submission and retain inputs after errors.

## Focused editor

Hide global navigation, mobile navigation, and ordinary page chrome only on the event editing route. Use a viewport-height workspace with the canvas occupying remaining space; internal menus and lists may scroll, but the outer page must not scroll. Retain Back, Save draft, Submit, undo/redo, tools, zoom, and location switching. Back continues to protect unsaved work through the existing dialog.

Replace the permanently reserved empty inspector column with a compact, collapsible contextual panel. Show it on explicit Details or selection, support close, and use a sheet on small screens. Prioritize name/type, rotation, duplicate/delete, and existing relevant appearance controls. Keep the objects list available without occupying the canvas unnecessarily.

Investigate focus/auth/campus refresh causing Loading event map. After initial data is usable, background refresh must preserve the mounted editor, current campus, selected location, viewport, and unsaved assets. Initial loading and true missing/unauthorized data still need explicit states. Preserve gesture cancellation and draft recovery on blur; those are independent from page loading.

## Assets and seating

New physical event assets use canonical template dimensions scaled consistently with the base map. Allow move, rotate, duplicate, and delete, but remove user-controlled width/height and resize handles for physical items. Text labels retain their relevant editing controls. Do not silently normalize dimensions of existing saved layouts; preserve them until explicitly replaced.

Audit chair scale against the map's actual coordinate/unit conventions before choosing dimensions. Do not claim physical accuracy when a map has no calibrated scale. Use consistent map-relative dimensions in that case.

Provide seating configuration with total chairs and chairs per row, including five-chair rows. Generate partial final rows when the total is not divisible by row size. Show a placement preview and valid spacing rather than creating oversized repeated presets.

Validate proposed seating against usable map bounds, blocked spaces, existing items, and protected access paths where geometry supports those checks. Reject invalid placement and show an actionable message before committing assets. If a venue has an authoritative capacity, also enforce it; otherwise report spatial fit without inventing an occupancy limit. Recheck on save/submit through event validation.

## Approval and student preview

Extend administrator approval with Publish now or Schedule publication. Store the scheduled instant separately from event start/end; display and enter dates in Asia/Manila. Approval, publication eligibility, and event occurrence are separate concepts. Only approved layouts with publication time reached and event end not passed are available in student previews, including upcoming events. Enforce visibility in the data-access layer, not just a hidden button.

Students get an Event map control on the campus map. It opens/closes approved, published event overlays for the currently viewed campus and floor. Show concise title, date/time, organizer, and location details. Keep campus routing, navigation graph, and destinations unchanged. Event furniture is preview data and must not modify route calculations. Define empty, loading, and failed-fetch states without replacing the base map.

Database changes, if needed after inspecting the schema, are additive migrations limited to event publication and access. Do not apply migrations to a live database as part of local implementation.

## First-use tutorial

Show a short guided tour the first time a student organization account enters the event editor. Cover locations, asset placement, arrangement, item details, save, and submit. Include Next, Back, Skip, and a Help action to replay. Store completion per account and version. Keep keyboard focus accessible, avoid covering the targeted control, and tolerate responsive layouts or absent targets.

## Verification

Test campus switching and floor filtering, confirmation cancellation and duplicate submission, editor-only shell isolation, focus refresh preserving drafts, locked asset dimensions, seating counts/partial rows and invalid placement, publication boundary/date handling and access, preview toggling without routing changes, and tutorial completion/replay. Run focused event tests and production build. Report existing unrelated failures separately. Verify mobile and desktop layout, keyboard dialog operation, and no outer editor scrolling.
