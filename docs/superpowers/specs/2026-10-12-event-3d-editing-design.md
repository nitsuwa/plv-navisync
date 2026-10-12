# Direct event editing in 3D

The user approved implementing direct 3D placement, movement, rotation and resizing together with GitHub main integration before their combined manual test. The previously completed preview is committed as `247d23b`. Integrate the latest teammate map work before extending it.

## Chosen approach

Use a dedicated event interaction layer inside the existing indoor/outdoor renderers, controlled by EventFloorEditor's existing event arrays. This keeps permanent map elements read-only and reuses event history, drafts and saves. Embedding the full admin Map Builder would also expose unrelated tools and require a large permission adaptation. Numeric fields alone would not satisfy direct map manipulation, so include pointer dragging and visible transform handles alongside accessible inputs.

## Editing behavior

- Editable event layouts offer 3D edit tools and the same 14 event assets. Choose an asset or label, click/tap the map to preview its position, then explicitly place it. Use the existing placement assessment; never place a prohibited access obstruction or non-finite/out-of-bounds item.
- Select event furniture or labels on the map or through an accessible item list. Drag event items in Move mode. A grouped furniture selection moves together; a locked group member blocks the group move. Rotation/resize operate on one ungrouped furniture item; group members can be ungrouped through the existing 2D workflow first.
- Rotate or resize using visible 3D handles, with number inputs as a keyboard/touch alternative. Furniture footprint sizes remain map units; heights stay illustrative. Labels support movement, text, font size and color editing.
- A drag previews geometry locally in the scene. Pointer release commits one history entry. Escape, pointer cancellation, lost capture, blur, a second pointer, context loss or unmount cancels the pending drag. The camera is disabled during an item gesture and restored afterward. A release must use the last pointer sample.
- Save/submit/history controls are blocked while a gesture is pending. Only completed edits enter parent state and the existing autosave pipeline. Undo/redo, deletion, locks, duplication and view switching work through the existing EventFloorEditor callbacks.
- Incoming removal, locking or geometry changes invalidate stale gestures. The event editor must validate commits against current event additions rather than blindly replacing a snapshot. Base map arrays never enter editable state.
- 2D and 3D share event coordinates and data. Switching views preserves completed edits. Unsupported graphics still offers 2D editing. Admin/public renderers receive no editing callbacks, and feedback placement stays in 2D.

## Data and integration

No new database schema, dependency or query is needed for direct event editing. The fetched teammate commit separately contains `20261012033256_cache_event_safe_published_snapshots.sql`; preserve that file and identify its optional performance deployment in the handoff without running live SQL.

Commit only this feature and its documentation/evidence. Preserve the unrelated conversation and continuity handoff files. Fetch again immediately before updating main, merge any new upstream work and use a normal non-force push. Do not create a PR.

## Verification

Use literal geometry tests for ray-coordinate conversion, moved/grouped positions, snapping, rotated resize, rotation normalization, cancellation/locks and stale commits. Editor integration tests assert the actual 2D layout/save after 3D changes, undo/redo, placement validation and read-only boundaries; only mock the unavailable GPU surface. Exercise actual pointer interactions with the real renderers in local Playwright fixtures, desktop/mobile, indoor/outdoor and fallback. Run affected teammate route/map tests, build and independent review, comparing unrelated failures with the baseline.
