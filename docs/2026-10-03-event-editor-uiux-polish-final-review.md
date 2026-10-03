# Event editor UI/UX polish final review

Date: 2026-10-03, Asia/Manila. Reviewed the working-tree implementation against the approved design, implementation plan and implementation report. Product source was not changed during this review.

## Verdict

Follow-up: all four confirmed findings were fixed locally and verified. See [fixes and verification evidence](2026-10-03-event-editor-review-fixes.md). The findings below preserve the original review evidence. Full authenticated routed-editor and physical-device visual acceptance remains separate from these checks.

## Findings

### 1. P1: Move here restores stale furniture after Undo

Sources: `src/components/events/EventFloorEditor.tsx:1744`, `:1057`, `:884`.

The preview stores the entire furniture array. Undo/Redo remain available and change the live array without invalidating the preview. Confirm replaces all furniture with that old array, restoring unrelated state from before Undo.

Reproduced with a focused component test: select a chair, Duplicate it, select the original, choose Move here and click a destination. Undo removes the duplicate (one item remains). Confirm Move here restores it (two items). The test expected one and received two.

Cancel/rebuild the preview when layout/history changes, or apply only the intended translation to current furniture and revalidate it. Add Undo, Redo and unrelated-edit coverage before closing this finding.

### 2. P2: Mobile layout configuration is clipped

Sources: `src/components/events/EventFloorEditor.tsx:2663`, `:2764`, `src/components/events/EventPlacementDock.tsx:58`.

Configuration is inline inside an absolute dock in an overflow-hidden canvas. Its 58vh height limit uses the whole viewport rather than the smaller remaining map area. It does not implement the mobile configuration sheet required by Task 3 and the approved design.

Actual browser checks of the production components with synthetic data: at 320 x 740 the dock occupied y=306.8 through y=866.4, and configuration extended to y=857.6. Lower fields were clipped and the dock covered almost the whole usable map. At 844 x 390 it also extended below the screen (observed bottom approximately 593px). Document width at the narrow viewport was 320px: checking document horizontal overflow alone misses this problem.

Implement the planned scrollable themed configuration sheet with close control, focus management, safe-area padding and a clear return to placement preview/confirmation. Verify portrait, landscape, software keyboard and reachable placement controls.

Screenshot contains synthetic data only and is stored outside the repository:

![Clipped mobile chair configuration](C:/Users/Rj/.codex/visualizations/2026/09/30/01a0f290-8e26-7da3-ab8d-ce3a205c2f44/event-review-mobile-320.jpg)

### 3. P2: Escape does not close Objects

Sources: `src/components/events/EventFloorEditor.tsx:2298`, `:2865`.

Escape clears selection but never closes objectListOpen. The Objects overlay has no local Escape handling or focus restoration. A focused test opened Objects, pressed Escape, and confirmed the panel remained. This is an unmet Task 3 requirement; the old Objects behavior itself is not a newly introduced regression.

Implement topmost-panel dismissal and trigger focus restoration using existing primitives. Test Escape from search and panel body, then subsequent placement cancellation. Closing panels must not leak a canvas click or modify committed data.

### 4. P2: Collapsed desktop Locations removes the tutorial target

Sources: `src/components/events/EventLocationSwitcher.tsx:101`, `src/components/events/EventFloorEditor.tsx:1779`.

The collapsed rail removes the element with data-event-tour=locations. Expand locations has no target attribute, and the step callback never expands the rail. At 1366 x 768, Collapse locations then Help displayed step 1 with zero location targets and zero spotlight outlines.

Reveal the expanded list for this step and restore prior collapse state where practical, or provide a visible compact target with matching guidance. Add a collapsed-desktop tour test and browser verification.

## Fresh verification

- Event/canvas/geometry/presets/validation/viewport/placement/gesture suite: 26 files, 241 tests passed, exit 0.
- Save/approval/student-preview regression suite: 8 files, 34 tests passed, exit 0. This is automated component/hook coverage, not a live database end-to-end check.
- Focused review reproductions: two failures for findings 1 and 3. Temporary test removed after recording evidence; existing tests were not modified.
- Production Vite build: passed, exit 0; large-chunk warnings remain.
- TypeScript: exit 1, 1005 diagnostic lines. None matched event/canvas components, StudentEventEditPage, eventLayoutPresets or eventPlacementCandidate. The repository-wide gate is not green, consistent with the implementation report limitation.
- git diff --check: passed, exit 0 (line-ending notices only).
- Browser checks rendered the real editor and location switcher through a temporary isolated fixture with no backend saves. They establish the described failures, not real login/approval/publication or the full matrix. Temporary fixture files were removed and viewport reset after review.
- The normal local Vite server was started for review and stopped afterward. No package script or environment was changed.

## Required follow-up

Fix stale Move here confirmation first, then complete mobile panel behavior and collapsed-location tour targeting. Add regression coverage and rerun affected suites plus save/approval/student-preview regression tests. Complete the approved light/dark desktop/mobile matrix on the routed editor before visual acceptance. Keep live backend verification separate from mocked tests.

No auth, demo-account, environment, database, dependency, merge, push or deployment changes were made. Existing local implementation work was preserved.
