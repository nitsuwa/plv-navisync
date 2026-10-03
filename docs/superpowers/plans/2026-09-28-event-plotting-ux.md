# Event plotting UX implementation plan

**Goal:** Speed up event map plotting with marquee selection, usable bulk controls, preset placement preview, an object list, and a fully scrollable asset catalog.

**Architecture:** Keep the existing event editor and persistence model. Add a small geometry helper for marquee hits and preset transforms, then connect pointer gestures and UI state in the editor. Keep the asset picker scroll fix local to the palette.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library.

## Global constraints

- Do not add live clearance guidance or electrical features.
- Preserve the published map as read only.
- Preserve existing pan, pinch, drag, snap, undo, and draft save behavior.
- Do not touch the unrelated uncommitted workspace files.

## Tasks

### Task 1: Marquee and bulk selection

- [x] Add failing tests for blank-canvas drag selecting furniture and labels, Shift toggling, and Space pan staying intact.
- [x] Add a geometry helper for item intersection with a world-space marquee.
- [x] Integrate marquee into the existing pointer capture and cancellation lifecycle.
- [x] Show a visible bulk toolbar for any multi-selection, with applicable furniture actions and shared Duplicate/Delete.
- [x] Run the editor tests.

### Task 2: Preset preview

- [x] Add failing tests proving preset click arms a ghost without saving, count changes placement, edge placement matches the ghost, click places, and Escape cancels.
- [x] Extend preset creation to accept adjustable placement options while retaining the current presets as defaults.
- [x] Render ghost items and compact controls; commit only on map click.
- [x] Run preset and editor tests.

### Task 3: Object list and asset picker

- [x] Add a failing test for searching placed items and selecting one from the list.
- [x] Add a compact, scrollable object list that focuses selected items.
- [x] Add a failing test for catalog viewport containment and Safety reachability.
- [x] Make the floating catalog use available viewport height and scroll internally.
- [x] Run tests and a production build.
