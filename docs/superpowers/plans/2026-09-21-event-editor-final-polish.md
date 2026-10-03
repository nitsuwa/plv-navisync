# Student Event Builder Final Polish Implementation Plan

> **For agentic workers:** Execute each task test-first. Keep all edits scoped to the student event editor and its direct support files; do not stage, commit, or push the existing dirty checkout.

**Goal:** Remove the remaining plotting, transform, location-state, and responsive UI defects so the Student Event Builder behaves and feels like the Admin Map Builder while preserving event-only ownership.

**Architecture:** `StudentEventEditPage` becomes the coordinator for unsaved per-location display state. `EventFloorEditor` reports its current draft to that coordinator and uses the shared floor-boundary constraint for creation as well as resize. The editor keeps transient selection/gesture state locally, while `EventLocationSwitcher` receives display locations with current draft counts.

**Tech Stack:** React 18, TypeScript, Tailwind, Vitest, Testing Library, Vite.

## Global Constraints

- Published map data stays read-only; only event furniture and labels may change.
- Save and submit continue through `replaceEventOverlayLocation` and `eventOverlayService`.
- Do not save or submit the QA event during browser verification.
- Use `constrainFurnitureToFloor` for new event furniture; do not duplicate boundary math.
- Existing recovered drafts remain location-scoped and usable after a reload.

### Task 1: Synchronize the location rail with unsaved draft state

**Files:**

- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/EventLocationSwitcher.tsx`
- Modify: `src/pages/StudentEventEditPage.tsx`
- Test: `src/components/events/__tests__/EventLocationSwitcher.test.tsx`

- [ ] Add a failing switcher test that supplies a draft count override for a location and expects the override rather than the persisted count.
- [ ] Add an optional `onDraftChange(furniture, labels)` callback to `EventFloorEditor`; emit it after draft hydration and every furniture/label change.
- [ ] In `StudentEventEditPage`, retain a draft location list updated with `replaceEventOverlayLocation` and render that list in both the switcher and focused overlay.
- [ ] Run the switcher/editor tests and confirm current counts update before Save Draft.

### Task 2: Bound every new furniture placement

**Files:**

- Modify: `src/components/events/EventFloorEditor.tsx`
- Test: `src/components/events/__tests__/EventFloorEditor.test.tsx`

- [ ] Add a failing click-placement test that clicks beyond the floor's bottom-right corner and expects the created item to remain inside `canvasW × canvasH`.
- [ ] Add a failing asset-drop test with the same expected boundary behavior.
- [ ] Change `placeFurniture` to create the template item once, then pass it through `constrainFurnitureToFloor` before state/history updates.
- [ ] Re-run the focused placement tests plus existing resize-boundary coverage.

### Task 3: Keep direct transform controls reachable

**Files:**

- Modify: `src/components/events/EventFloorEditor.tsx`
- Test: `src/components/events/__tests__/EventFloorEditor.test.tsx`

- [ ] Add a failing test selecting an item near the top boundary and asserting the action bubble is placed below the item while the rotate handle stays interactive.
- [ ] Derive a collision-safe action-bubble top position from transformed item bounds, current zoom, and the handle clearance. Use the below-item fallback whenever the above-item anchor overlaps the rotate-handle zone.
- [ ] Keep the direct rotate handle above the item and pointer-reachable; retain the button-based rotate action as a backup.
- [ ] Re-run direct rotation, eight-handle, and boundary-crossing gesture tests.

### Task 4: Complete labels and responsive feedback UI

**Files:**

- Modify: `src/components/events/EventFloorEditor.tsx`
- Test: `src/components/events/__tests__/EventFloorEditor.test.tsx`

- [ ] Add a failing test that selects a label, opens its details control, edits its text, and verifies the overlay label changes without adding a duplicate label.
- [ ] Add a failing test that renders several layout notes and expects the warning controls to wrap or be vertically scrollable rather than clip horizontally.
- [ ] Add a label inspector with text, size, color, rotation, and lock controls. In Text mode, clicking an existing event label selects it instead of placing a duplicate.
- [ ] Convert the warning strip to a responsive wrapping/scrollable presentation with a concise count and focus actions.
- [ ] Add accessible names/titles for icon-only header and viewport controls.
- [ ] Re-run label, warning, keyboard, and read-only tests.

### Task 5: Responsive canvas dock and verification

**Files:**

- Modify: `src/components/events/EventFloorEditor.tsx`
- Test: `src/components/events/__tests__/EventFloorEditor.test.tsx`

- [ ] Add a failing test for an asset-dock compact/collapse control that does not remove the active placement tool.
- [ ] Implement a compact dock state for constrained viewports, preserving click and drag placement when expanded.
- [ ] Run the complete focused event editor, location switcher, event geometry, validation, and viewport suites.
- [ ] Run the production Vite build and `git diff --check`.
- [ ] Start the local app with the prescribed test helper, then manually test all asset types, drag/click placement, resize handles, rotate handles, pan/zoom/snap, location switching, labels, warnings, and a narrow viewport. Report unrelated baseline Admin-suite failures separately.
