# Event Editor Drag Stability and Interaction Polish Implementation Plan

> **For agentic workers:** Use the available `executing-plans` skill to execute this plan task by task. If unavailable, follow the checked steps directly. No additional design approval is needed for these authorized fixes. Do not stop after writing tests or after only changing the warning UI.

**Goal:** Make student event-map placement, drag, resize, rotation, pan, and zoom predictable, with the grabbed point tracking the pointer and no canvas movement caused by validation UI.

**Architecture:** Keep the existing React/DOM editor and shared published-map renderers. Establish one pointer-gesture owner, freeze the viewport during item transformations, keep validation outside the drag update path, and render its details without changing canvas dimensions. Retain the existing immutable item snapshots and viewport-motion hook, correcting their integration rather than replacing the editor.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Tailwind, existing Radix UI primitives. Browser QA through available browser automation. No new dependency required.

## Global constraints and handoff

- Working repository: `C:/Users/Rj/Documents/GitHub/plv-navisync`.
- User has authorized fixing the event editor and asked for this detailed plan for Luna at Max effort. This document is a plan, not a claim that its fixes have been implemented.
- Preserve the dirty checkout, including earlier event-editor improvements. Inspect `git status --short` and existing diffs before editing. Do not reset, delete local drafts, restore files, stage everything, commit, push, or publish without a separate request.
- Do not create a clean worktree from HEAD and accidentally omit the uncommitted fixes this plan depends on.
- Scope: student event builder and directly shared utilities where necessary. No database/schema, authentication, submission-workflow, or admin-editor redesign.
- Preserve published maps as read-only backgrounds. Preserve multi-location editing, draft recovery, save/submit contracts, undo/redo, grouping, duplication, labels, keyboard nudging, and locked items.
- Use `apply_patch` for code and document edits. Read repository instructions before modifying files.
- No promises of universally perfect performance. Completion requires the measurable checks below; report any remaining failures honestly.
- Do not invoke live Save Draft or Submit to GSO during browser QA. Use component mocks or a disposable local fixture for persistence tests. Real editing may write local recovery drafts even without clicking Save; use an isolated browser context/fixture for mutation testing.

## Evidence and uncertainties

These observations come from the current source, not just the screenshots:

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Warning strip can alter canvas position/height | `EventFloorEditor.tsx`: conditional `layoutWarnings.length > 0`, `flex-wrap`, variable message buttons above the flex canvas | Likely source of vertical jumps when warnings appear/disappear/wrap; prove with real layout measurements |
| Snap off does not disable sibling alignment | Editor passes `snapToGrid: snapEnabled`; `snapLayoutPosition` always gathers sibling edges/centers | Confirmed behavior defect; Snap off must mean all snapping off |
| Item transformation does not stop viewport animation | Pan start calls `cancelViewportMotion`; ordinary item mouse-down does not | A zoom animation can continue changing the coordinate transform during drag |
| Pan toolbar ignores temporary mode | Button style and `aria-pressed` use `activeTool === tool.id` | Space changes status/cursor but not highlighted tool |
| Browser native selection remains possible | Item start does not prevent default for ordinary drag; screenshot shows selected toolbar text | Likely contributor to drag interference; reproduce and prevent only on canvas gestures |
| Drag causes expensive nonvisual work | Furniture updates drive pairwise validation and parent draft callbacks every move | Potential performance bottleneck; measure and defer to gesture commit |
| Warning geometry is approximate | `eventLayoutValidation.ts` uses unrotated rectangles, fixed 12-unit spacing | Do not call these certified safety findings; clarify UI copy and test rotation geometry |
| Mouse/touch paths are split | Window mouse listeners plus independent touch pan/pinch handlers | Consolidate ownership to avoid competing paths, with regression coverage |

The previous response called the editor presentation-ready based on focused tests. The new screenshots demonstrate uncovered interaction failures. Do not cite the earlier 63-test pass as proof that this task is complete.

## File map

Modify:

- `src/components/events/EventFloorEditor.tsx`: interaction integration, stable chrome, effective tool state, draft/validation commit boundaries.
- `src/components/events/useEventViewportMotion.ts`: interrupt-and-synchronize behavior and continuous wheel animation only as required by tests.
- `src/lib/eventLayoutGeometry.ts`: all-snap switch, screen-space threshold integration, truthful guides, deterministic bounds.
- `src/lib/eventLayoutValidation.ts`: rotation-aware checks and accurate spacing copy.
- `src/pages/StudentEventEditPage.tsx`: memoize published floor resolution and stabilize draft callback dependencies if profiling confirms identity churn; no service changes.
- Existing tests: `src/components/events/__tests__/EventFloorEditor.test.tsx`, `src/components/events/__tests__/useEventViewportMotion.test.tsx`, `src/lib/__tests__/eventLayoutGeometry.test.ts`, `src/lib/__tests__/eventLayoutValidation.test.ts`.

Create:

- `src/components/events/EventLayoutIssues.tsx`: fixed-height summary and nonmodal, non-reflowing details panel.
- `src/components/events/__tests__/EventLayoutIssues.test.tsx`: disclosure, selection, dismissal, and interaction isolation.
- `src/lib/eventGestureCoordinates.ts` and `src/lib/__tests__/eventGestureCoordinates.test.ts`: small pure coordinate helper with explicit units.
- `docs/superpowers/verification/2026-09-21-event-editor-drag-stability.md`: actual test results, browser measurements, limitations, screenshot paths.

Read/reuse, do not rewrite unnecessarily:

- `src/components/canvas/useSpacePan.ts` (shared with other editors).
- `src/components/map-builder/ReadonlyFloorPlanVisuals.tsx` and existing outdoor renderer.
- `src/lib/eventViewport.ts`, `src/lib/mapViewport.ts`, `src/lib/eventDraftPersistence.ts`.
- `src/components/events/EventLocationSwitcher.tsx`.
- `src/app/components/ui/popover.tsx` if reusing the local popover primitive.

Line numbers from prior messages may move. Locate named handlers/functions, not hard-coded line ranges.

## Task 1 — Baseline and reproduce the actual jump

- [ ] Read `AGENTS.md` instructions if present; inspect current diff in the files above. Keep the earlier immutable-drag, click-through protection, and full-floor renderer fixes.
- [ ] Start from the existing `floorPlan`, `overlay`, and `overlayWithChair` test fixtures in `EventFloorEditor.test.tsx`. Add a fixture with three booths, a chair, a rotated booth, and one pre-existing out-of-bounds item. Do not alter the user's event to manufacture fixtures.
- [ ] Run the existing focused baseline once:

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/useEventViewportMotion.test.tsx src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts --reporter=dot --maxWorkers=1
```

- [ ] In a real browser, reproduce a continuous drag across overlap/spacing thresholds at 70% and 145% zoom. Record canvas `getBoundingClientRect()` before/after each warning transition, viewport transform, pointer coordinates, item coordinates, and grabbed-point screen position.
- [ ] Distinguish three mechanisms: canvas top changes; viewport transform continues animating; snapping adjusts item position. Do not treat a screenshot alone as proof of the first mechanism.
- [ ] Record expected coordinate relation, using the untransformed canvas rect:

```ts
screenX = canvasRect.left + pan.x + zoom * worldX;
screenY = canvasRect.top + pan.y + zoom * worldY;
// With snap off, inside bounds, and a fixed viewport:
nextItemX = startItemX + (clientX - startClientX) / startZoom;
nextItemY = startItemY + (clientY - startClientY) / startZoom;
```

**Gate:** Write the observed baseline and confirmed versus suspected causes in the verification document before changing behavior. If authenticated browser access is unavailable, continue with local fixture tests and explicitly leave live-browser validation pending.

## Task 2 — Remove validation-driven layout shifts

**Interfaces:** `EventLayoutIssues` consumes `warnings: readonly LayoutWarning[]`, `onFocusItems: (ids: string[]) => void`, and `disabled?: boolean`. It owns disclosure state only, never furniture or viewport state.

- [ ] Add a fixed `h-9 shrink-0 relative` row that stays mounted for editable editors even when there are zero issues. Use `Layout checks` for zero, `1 layout issue` / `N layout issues` otherwise. Avoid green approval language: zero checks is not GSO approval.
- [ ] Render details in an absolute, nonmodal panel below the row (or the existing nonmodal popover with equivalent sizing). Opening must not alter row height, canvas height, body scrollbar, or page scroll position. Use `max-h-64 overflow-y-auto`, width constrained to the viewport, wrapping detail text, and visible severity labels.
- [ ] Use `aria-expanded`, `aria-controls`, an accessible panel label, Escape/outside-click dismissal, and focus return. Do not trap focus or lock body scroll. Mark all panel controls `data-event-editor-chrome` and stop gesture/placement propagation.
- [ ] Each issue gets a clear `Show items` action. Select all valid referenced furniture IDs, not just the first. Keep the view stationary if already visible; do not auto-fit on every warning update. Explicit focus may center an offscreen selection when no gesture is active.
- [ ] Replace `Focus: ...` chips. Describe spacing as a design hint: `Items are close together; review walking space.` Secondary copy may explain `Uses a 12 map-unit spacing heuristic; not a physical-distance measurement.` Do not imply meters or verified safety compliance.
- [ ] Close the details panel at item-gesture start. Keep committed issue content steady during transformations and recalculate after completion. Undo/redo, keyboard nudges, delete, presets, and inspector edits must refresh the checks too.
- [ ] Add component behavior tests, then verify layout stability in browser; jsdom does not perform CSS layout.

```tsx
// In EventLayoutIssues.test.tsx, construct real LayoutWarning values.
const issue = { code: "overlap", severity: "warning", itemIds: ["a", "b"],
  message: "Booth overlaps Booth. Consider adding clearance between them." } as const;
// Use a mutable array for itemIds if the existing LayoutWarning interface requires it.
const onFocusItems = vi.fn();
render(<EventLayoutIssues warnings={[{ ...issue, itemIds: ["a", "b"] }]} onFocusItems={onFocusItems} />);
fireEvent.click(screen.getByRole("button", { name: /1 layout issue/i }));
fireEvent.click(screen.getByRole("button", { name: /show items/i }));
expect(onFocusItems).toHaveBeenCalledWith(["a", "b"]);
```

**Gate:** Actual browser canvas top and height differ by at most 1 CSS pixel across 0→1→3→0 issues and disclosure open/close at desktop and mobile widths.

## Task 3 — Correct gesture coordinates and viewport interruption

**Interfaces:** Export these exact pure interfaces from `eventGestureCoordinates.ts`:

```ts
export interface ScreenPoint { x: number; y: number }
export interface GestureFrame {
  left: number;
  top: number;
  zoom: number;
  pan: ScreenPoint;
}
export function clientToEventWorld(point: ScreenPoint, frame: GestureFrame): ScreenPoint {
  const zoom = Number.isFinite(frame.zoom) && frame.zoom > 0 ? frame.zoom : 1;
  return { x: (point.x - frame.left - frame.pan.x) / zoom,
    y: (point.y - frame.top - frame.pan.y) / zoom };
}
```

- [ ] Write coordinate tests at zoom 0.7, 1, 1.45, and 3 with nonzero canvas origin and negative pan. Include inverse round-trip checks and fallback for invalid zoom.

```ts
expect(clientToEventWorld({ x: 470, y: 340 }, {
  left: 300, top: 200, zoom: 0.7, pan: { x: 30, y: 0 },
})).toEqual({ x: 200, y: 200 });
```

- [ ] At accepted drag/resize/rotate start, stop viewport motion and synchronize target to the currently displayed transform with `setImmediateTransform(currentRef.current)`. Merely cancelling RAF leaves the old target behind and can jump on the next wheel input.
- [ ] Snapshot the current canvas rect and displayed transform once into the gesture. Use that frame for all world-coordinate conversions within the gesture, along with existing immutable item origins. Preserve the grabbed local point even for rotated items; translation is a world-space delta, not an inverse rotation of the pointer delta.
- [ ] While transforming items, consume/ignore wheel viewport navigation and disable Fit/zoom actions. Never run two gestures at once. Starting a viewport pan must not also move furniture.
- [ ] If actual viewport resize/orientation changes during a gesture, finish the last valid preview, clear ownership, then update viewport bounds. Do not continue with a stale frame across a resized editor. Ordinary warning updates must no longer trigger resize.
- [ ] Add editor regressions with a nonzero mocked canvas rect and explicit zoom setup. Start a zoom animation, advance halfway, start a drag, then advance remaining RAF callbacks: viewport must stay fixed and item displacement must equal client delta divided by the captured zoom.
- [ ] Cover unrotated and 30° rotated assets, labels, grouped items, resize, and rotation. Do not count unit coordinate tests alone as editor integration coverage.

**Gate:** With snapping off and no boundary contact, grabbed-point screen error is ≤2 CSS pixels throughout a real continuous drag; no jump at start/end or after pending animation frames run.

## Task 4 — Make snapping and bounds deterministic

- [ ] Extend `LayoutMoveSnapshot` with `snapEnabled?: boolean` (default true for compatibility) and bypass `snapLayoutPosition` entirely when false. Pass the UI boolean explicitly. Keep `snapToGrid` as the grid-specific option; it cannot stand in for all snapping.

```ts
const shouldSnap = snapshot.snapEnabled !== false && snapshot.movingItems.length === 1;
const snapped = shouldSnap
  ? snapLayoutPosition({ item: snapshot.anchor, x: requestedX, y: requestedY,
      items: snapshot.furnitureItems, selectedIds: snapshot.selectedIds,
      grid: snapshot.grid, threshold: snapshot.threshold, snapToGrid: snapshot.snapToGrid })
  : { x: requestedX, y: requestedY, guides: [] };
```

- [ ] Write the failing geometry test with an anchor at x=24, a sibling edge at x=100, a requested x=98, and `snapEnabled:false`; result must be x=98 and guides empty. Repeat for grid proximity.
- [ ] Use a fixed **6 CSS-pixel** attraction threshold converted as `6 / capturedZoom`. Remove `Math.max(5, ...)`, whose minimum world-space tolerance grows in screen pixels at high zoom. Tie-breaking must remain deterministic (stable item ID ordering after distance, then explicit edge/center before grid).
- [ ] Preserve group offsets; do not independently snap each member. Continue unsnapped group movement unless an anchor-based group snap is explicitly covered by tests.
- [ ] After bounds clamping, discard guides for axes whose snapped coordinates were not actually reached. Do not display a guide unrelated to the rendered item.
- [ ] Handle pre-existing invalid/out-of-bounds items without teleporting on the first move. For each axis, extend the legal coordinate interval to include the starting position; allow movement toward the valid interval but not farther out. Once released, validation remains until actually corrected. No automatic destructive repair.
- [ ] For oversized groups with an impossible fit, preserve offsets and allow recovery movement in the union of the start extents and authored bounds; do not pass inverted min/max limits to a clamp. Test a group wider than the canvas.
- [ ] Compute rotated furniture footprint from corners around the item's center for boundary/overlap checks. Use polygon overlap (separating-axis test) for rotated rectangles rather than treating a rotated AABB overlap as proof of overlap. Keep the 12-unit spacing check an explicitly approximate hint; suppress duplicate spacing hints for overlapping pairs.
- [ ] Add validation fixtures for rotated true overlap, rotated AABB-only overlap, exact edge contact, outside rotated corner, and zero rotation compatibility. Keep blocked-region checks optional; do not fabricate access regions from screenshots.

**Gate:** Snap off permits exact free movement; Snap on displacement never exceeds the configured screen threshold except explicit boundary limits. Boundary contact never moves the item discontinuously away from its previous valid position.

## Task 5 — Own each pointer gesture once and prevent native interference

- [ ] Consolidate editor manipulation onto Pointer Events with one active pointer ID and gesture record. Use pointer capture on a stable editor surface. Remove competing window mouse move/up paths after equivalent tests exist; do not run both.
- [ ] On accepted primary item drag, resize, rotate, or middle-button pan: `preventDefault`, stop propagation, capture pointer. Use `user-select:none` on canvas surfaces; text inputs and editable label controls remain selectable. Prevent native `dragstart` on placed asset visuals, but preserve intentional palette HTML drag-and-drop.
- [ ] Keep latest gesture/preview values in refs so move/up handlers cannot commit stale React render state. No new document listeners on every furniture update. Ignore unrelated pointers for single-pointer item manipulation.
- [ ] Use a 3 CSS-pixel move threshold before treating a click as a drag. A click selects without producing a history entry or suppressing its legitimate UI action. After a real drag, suppress the synthesized placement click exactly once.
- [ ] On pointerup, process its final coordinates even if the last move RAF has not run, commit one history entry only if geometry changed, release capture, clear guides and interaction state.
- [ ] Escape restores the gesture-start item geometry and adds no history entry. Pointer cancellation, window blur, or hidden document commits the last displayed preview once and clears ownership. Lost capture cleanup must be idempotent and cannot double-commit.
- [ ] Hide the floating selection action toolbar during move/resize/rotate/pan. It returns after release at a position clamped inside the viewport, not under the pointer during movement. Keep selection outline visible. During pan, item cursor overrides must not mask `grab/grabbing`.
- [ ] Touch policy: one finger on an editable item manipulates it; one finger on blank canvas pans; two fingers navigate the viewport. When the second touch arrives, finish any item preview once, then transfer ownership to pinch without adding another item move. Pinch handles midpoint translation as well as scale. Track both pointers in one system; remove old competing touch handlers.
- [ ] Preserve palette tap-to-place for mobile and keyboard controls. Do not require HTML drag-and-drop on a touch device.
- [ ] Update existing mouse-based tests to meaningful pointer events where migrated; include pointer IDs/capture support in test setup, not production-only testing switches.

**Gate:** Drag works across overlays and canvas edges; release outside stops movement; right click does not drag; rapid pointer release, blur, Escape, and a second finger never leave stuck tools or duplicated items.

## Task 6 — Synchronize Pan highlight, cursor, and interaction state

- [ ] Derive an effective displayed tool without overwriting the persistent selected tool:

```ts
const itemGestureActive = dragging !== null || resizing !== null || rotating !== null;
const effectiveTool = isPanning || (spaceHeld && !itemGestureActive) ? "pan" : activeTool;
// Both aria-pressed and toolbar selected classes use effectiveTool.
```

- [ ] Space while idle temporarily highlights only Pan; release restores Select/Furniture/Label. Explicit Pan stays selected after Space release. While a drag is already active, Space must not silently change its ownership; finish that gesture first.
- [ ] Use `grab` when Pan is armed and `grabbing` only during actual movement. Propagate cursor inheritance to placed items and control overlays where appropriate.
- [ ] Replace the redundant floating `Release Space to stop panning` pill with a short existing-status-bar hint `Pan · Space held`. Keep screen-reader status changes only at mode transitions; do not announce coordinates/zoom every frame.
- [ ] Preserve the shared `useSpacePan` input/contenteditable exclusions and keyup/blur cleanup. If shared code changes, run its other consumer tests; prefer editor-local presentation fixes.
- [ ] Regression test: starting in Furniture, keydown Space sets Pan `aria-pressed=true` and Furniture false, keyup restores Furniture, item count remains unchanged; typing Space in a label input has no tool effect.

**Gate:** Exactly one toolbar button appears active, matching the action the next pointer gesture will perform.

## Task 7 — Keep drag work small and wheel motion responsive

- [ ] Schedule at most one item-preview render per animation frame using the latest pointer sample. Do not ease or animate item position: the item must follow the pointer immediately. Flush the last sample on release and before save/location change.
- [ ] Update a live draft ref synchronously with every accepted preview. Keep a separate committed layout snapshot for validation, parent `onDraftChange`, and history. Publish once after a gesture; non-gesture edits publish immediately. Do not debounce data past unmount or discard a just-finished gesture on location change.
- [ ] Ensure local recovery persistence receives the final preview on blur/unmount using the existing persistence contract. Preserve event/location keys and do not cross-write locations. Use latest refs, not a delayed state closure.
- [ ] Memoize unchanged published background scenes so pointer previews do not reconstruct full SVG floor/campus content. Keep memo props stable; if `StudentEventEditPage` recreates floor data for each draft update, memoize resolution before conditional returns without violating Hook ordering.
- [ ] Profile a local fixture with 100 event assets and a representative published floor. Pairwise validation must not run per pointer sample. Parent draft publication count must not scale with pointermove count.
- [ ] Inspect wheel animation behavior under continuous events. Current `animateTo` restarts easing on each event and begins timing on the first RAF; this can lag under frequent input. If reproduced, use one ongoing RAF loop for wheel retargeting, with current/target refs and time-based interpolation; keep button/Fit motion bounded around 180ms.
- [ ] Any wheel retargeting change must preserve cursor anchoring, normalized delta modes, zoom limits, reduced-motion behavior, and instant interruption. Add a hook test with repeated targets every simulated 8ms: frames must progress before the input stream ends and settle to the last target after input stops.
- [ ] Avoid `transition-all` on anything controlling item position or viewport transform. Color/shadow transitions on controls are sufficient.

**Gate:** No state update loop, no dropped final position, no repeated history entries per drag. On the tested desktop, target p95 frame interval ≤25ms with 100 assets and no editor-attributable >100ms main-thread stalls during a 5-second drag. Record environment and actual timings; treat this as a measured target, not a universal FPS guarantee.

## Task 8 — Regression and real-browser acceptance

- [ ] Run the focused suite, including every new test:

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/EventLayoutIssues.test.tsx src/components/events/__tests__/useEventViewportMotion.test.tsx src/lib/__tests__/eventGestureCoordinates.test.ts src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts src/lib/__tests__/eventLocationData.test.ts --reporter=dot --maxWorkers=1
node node_modules/vite/bin/vite.js build
git diff --check
```

- [ ] Run TypeScript using the project's available compiler and `tsconfig.json`; do not mistake Vite transpilation for type checking. Record baseline unrelated errors separately if present.
- [ ] Add/run relevant location-switch and draft-persistence tests because commit timing changed. Verify Save receives final geometry through mocks and multi-location drafts survive switching.
- [ ] Do not rerun a known warning-flooding full suite indefinitely. If a broader suite stalls, identify the test, stop only the process started for this task, and report focused results plus the limitation.
- [ ] Use actual browser layout and pointer gestures for this matrix. Reuse available tooling; if writing a browser harness, run locally in an isolated test context without introducing a production debug route.

| Scenario | Required result |
| --- | --- |
| Desktop 1440×900 and 1920×1080 | Full canvas usable; controls not clipped |
| Mobile 390×844; tablet 768×1024 | No horizontal document overflow; warnings/palette reachable; touch works |
| Zoom 70%, 100%, 145%, 300%; pan offset nonzero | Snap-off grab-point error ≤2px inside bounds |
| 0→1→3→0 warnings during continuous drag | Canvas rect stable ≤1px; no vertical jump |
| Drag rotated booth across overlap thresholds | No teleport; release preserves actual position |
| Snap off near sibling/grid | No attraction, no guides |
| Snap on near sibling/grid | Predictable ≤6px attraction; truthful guides |
| Pending zoom then immediate drag | Viewport stops at displayed transform; no late motion |
| Space down/up; middle button; explicit Pan | Highlight, cursor, action agree; no furniture movement |
| Drag across floating controls/outside viewport | Capture retained, no control activation; release ends gesture |
| Pointerup before preview RAF | Final pointer position committed; Undo returns start in one step |
| Escape/blur/cancel/lost capture | Correct cancel/commit policy; no stuck gesture |
| Palette click, Snap, Fit, zoom, issues buttons | No unintended asset spawn |
| One-touch drag then two-touch pinch | Clear ownership transfer; no duplicate movement |
| Location switch then return | Latest draft restored to correct location |
| Light/dark mode, reduced motion | Readable controls, usable scene, immediate reduced-motion viewport |

- [ ] Save before/after screenshots and numeric pointer-error/canvas-rect measurements. Capture console warnings/errors after a clean load and the full interaction sequence. Browser test assertions must examine actual positions, not just class names.
- [ ] Review the final diff against the file map; remove temporary diagnostics and local fixture routes. Keep the existing full-floor rendering intact.
- [ ] Update the verification document with commands, exit codes, test counts, measured browser results, and unresolved limitations. Check off this plan only for work actually completed.

## Definition of done

All eight tasks are completed, targeted tests/build succeed (or genuine unrelated baseline failures are documented), the real-browser matrix passes for desktop and mobile, and the user-reported drag jump is reproduced before and absent after the fix. Warning checks remain available without moving the canvas. Snap off is genuinely free movement. Space visibly activates Pan. Saving/draft recovery still preserve final geometry. No fabricated claim of 100% perfection or completion based solely on unit tests.

## Copy-paste execution prompt for Luna Max

> Implement `docs/superpowers/plans/2026-09-21-event-editor-drag-stability-luna.md` completely in this existing working directory. The user has approved fixing the event editor; proceed through the plan without additional design approval. Preserve all uncommitted work. First reproduce and record the drag jump, then implement the stable warning UI, gesture coordinates and ownership, snapping, bounds, Pan feedback, and measured performance improvements in the stated order. Read the current code rather than assuming examples are drop-in patches. Use regression tests for interaction defects and real-browser measurements for layout/drag smoothness. Complete mobile and desktop checks, update the verification document, and report only verified results. Do not commit, push, submit an event, alter database data, or erase local drafts. If a tool or authenticated browser is unavailable, finish all independent implementation/testing and clearly report the remaining verification gap rather than claiming success.
