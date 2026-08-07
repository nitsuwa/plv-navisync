# Developer 2 — B1 Map Builder Baseline Audit and Regression Protection

**Package:** B1 — Map Builder baseline audit and regression protection
**Branch:** `test/map-builder-baseline`
**Status:** DONE — merged through Pull Request #5 (`test/map-builder-baseline` → `main`, merge commit `b19d974`). FOR REVIEW was granted August 7, 2026 after all automated checks (17 files / 171 tests, clean build, clean diff) and every manual retest checklist item (§9, §10.6, §11.5) were confirmed; the merged PR marked it officially DONE.
**Date:** August 7, 2026

This document records the truthful baseline of the existing Map Builder,
navigation, and floor-editor behavior before B2–B10 development begins, plus
the regression tests added to protect that baseline. It is the evidence for
the B1 definition of done:

- Evidence-based baseline and regression checklist → this document.
- Existing working behavior is protected before persistence integration → regression suites below.
- `pnpm build` and relevant tests pass → recorded in the Command results section.

---

## 1. What was already working (verified by inspection)

| Area | Files | State |
|---|---|---|
| Campus lifecycle CRUD, versioning, images, active-campus selection | `src/services/campusService.ts`, `AdminMapBuilderPage.tsx` | Working — live Supabase (A4, Developer 1) |
| Map Builder shell: campus home, wizard, editor, canvas, layers (campus / navigation / accessibility / emergency / events) | `src/components/map-builder/*` (37 files) | Working — in-memory editor; building/marker/path placement, select/move/resize/rotate, multi-select, align tools, grid + edge snap, undo/redo (30-step snapshots), keyboard shortcuts, context menus, hierarchy & properties panels, rubber-band selection |
| Floor editor: structure (walls/rooms/doors/windows/stairs/elevators/text) and interior (furniture) modes, per-floor undo/redo | `src/components/map-builder/FloorEditor.tsx`, `useFloorHistory.ts` | Working — in-memory per floor |
| Navigation layer authoring: nav nodes/edges, route list, live TestNavigationPanel with accessible/emergency modes | `src/components/map-builder/RoutesPanel.tsx`, `TestNavigationPanel.tsx` | Working (authoring) — `findNavigationRoute` (authored graph) has a persistent-parent A* that routes and stitches cross-floor stair/elevator transitions |
| Pathfinding engines | `src/lib/pathfinding.ts`, `indoorPathfinding.ts`, `combinedPathfinding.ts` | Mostly working — `findNavigationRoute` and `aStarFloor` use persistent parent maps; `findPath` had a truncated-path bug (fixed, see §4) |
| Campus data transforms / serialization | `src/lib/mapDataAdapter.ts`, `campusHelpers.ts` (incl. `sanitizeCampus`, `createCampusClone`) | Working — covered by tests |
| Validation (baseline slice) | `validateCampus` inside `CampusEditor.tsx` | Working — extracted to `src/lib/campusValidation.ts` without behavior change (full validation workflow is B7) |
| Undo/redo hook | `src/hooks/useUndoRedo.ts`, `useFloorHistory.ts` | Working |
| Build + existing tests | `vite build`, Vitest | Baseline: build passed, 7 files / 64 tests passed |

## 2. What is partial, mock-only, broken, or missing (baseline checklist)

| Area | Status | Evidence |
|---|---|---|
| Building/floor/room/map-element authoring persistence | Mock/localStorage only | Authored structures live in the in-memory `Campus` JSON; structure tables not connected until A5/B6 |
| Publish flow | Disabled/partial | Publishing controls gated; publish copies campus JSON into `CampusDataContext` (localStorage) — real atomic publish is A6/B9 |
| Validation | Partial | Only the baseline checks (`missing_campus_name/name/code`, `boundary`, `no_floors`, `overlap`) run today; B7 owns the complete validation and issues workflow |
| `findPath` (legacy outdoor graph) | **Broken — fixed in B1** | Path reconstruction looked up parents in the A* `open` set; once an ancestor moved to `closed`, the route was truncated to a single node (`gate_main → ent_mab` returned `["ent_mab"]`). The same bug class was already fixed in `findNavigationRoute` and `aStarFloor` via a persistent parent map; `findPath` was missed. Fixed with the same pattern (§4). |
| Public map navigation inputs | Mock/hardcoded | Public map still routes over hardcoded `B_POS`/legacy graph (b1–b6); authored campus graphs are adapted rather than natively routed (B8/G3 work) |
| Structure services (A5) | Not connected to editor | `campusStructureService` exists (Developer 1) but the Map Builder does not consume it yet — required by B6 |
| Floor backgrounds / image upload | Not implemented in editor | B4 deliverable |
| Dead code | `src/components/map-builder-v2/` (6 files) | Unused; cleanup is a separate reviewed task |
| Type-check script | Not available | No `tsconfig.json` exists; `vite build` is the only project compile check (documented in `02_SYSTEM_ARCHITECTURE.md` and A1 verification) |

## 3. Files changed in B1

- `src/lib/campusValidation.ts` — **new.** Pure, framework-free extraction of the editor's baseline validation (`validateCampusData`) and overlap detection (`computeBuildingOverlaps`); identical issue types, messages, and dedupe behavior.
- `src/components/map-builder/CampusEditor.tsx` — delegates `validateCampus` → `validateCampusData(campus, overlappingBuildings)` and `computeOverlaps` → `computeBuildingOverlaps`; removed the now-unused `getRotatedAABB` import. No behavior change.
- `src/lib/pathfinding.ts` — fixed `findPath` path reconstruction with a persistent parent map (same pattern already used by `findNavigationRoute`/`aStarFloor`). Public API unchanged.
- `package.json` — added `"test": "vitest run"` script (none existed; required to run B1's regression suite via pnpm).

## 4. Tests added (regression protection)

| Test file | Covers |
|---|---|
| `src/lib/__tests__/pathfinding.test.ts` (22 tests) | Legacy outdoor graph `findPath`/`findBuildingPath`/`calculateTransition` (incl. the fixed truncated-path behavior), authored-graph `findNavigationRoute` (shortest route, same-node, disconnected graphs, accessible-only filtering, emergency-safe filtering, one-way edges), `buildTransitionEdges` (elevator/stairs accessibility, same-floor and single-node groups skipped), multi-floor routing through shared transitions, graph data sanity |
| `src/lib/__tests__/indoorPathfinding.test.ts` (13 tests) | `buildFloorGraphFromRooms` (empty/stairs/elevator, accessible-only filtering), `findIndoorRouteForFloor` (reachable/unknown rooms, accessible-only entry-point rules), `findMultiFloorIndoorRoute` (same-floor, cross-floor segments, missing floor data, elevator transit in accessible mode) |
| `src/lib/__tests__/mapDataAdapter.test.ts` (10 tests) | Campus → legacy transforms: building positions, floor plans (empty floors omitted), building rows, facilities/accessibility maps, `locationsFromCampus` (marker typing, structural-room skipping, elevator/stair facility locations, room labels) |
| `src/lib/__tests__/campusValidation.test.ts` (17 tests) | Extracted `validateCampusData` (all issue types, per-building dedupe, rotated-boundary detection, overlap from geometry or passed-in set) + `computeBuildingOverlaps` + `getRotatedAABB` transform |
| `src/lib/__tests__/campusHelpers.test.ts` (extended) | New `sanitizeCampus` cases: legacy campus defaults, missing floors/rooms/paths normalization, preservation of provided values |
| `src/hooks/__tests__/useUndoRedo.test.tsx` (new) | Generic undo/redo hook state behavior: snapshots, undo/redo, functional updates, redo-branch discard, max-history pruning, reset |

**Totals (first pass):** 12 test files / 135 tests passing (baseline was 7 files / 64 tests; 71 new tests added).

**Totals (after manual-failure repair, §8):** 14 test files / **152 tests passing** (+17: placement/conversion/connector/cleanup tests and the Floor Editor render regression).

**Totals (after round-2 repair, §10):** 16 test files / **167 tests passing** (+15: Floor Editor undo/redo integration incl. whole-wall drag, full-state `useFloorHistory`, and the map_elements null-x save contract).

**Totals (after round-3 repair, §11):** 17 test files / **171 tests passing** (+4: Floor Editor canvas selection deselection integration — empty-click deselect, no-bubble object selection, endpoint-drag selection preservation, Escape deselect + transient-state cleanup).

**Notes on pinned behavior (intentional regression pins):**

- `findNavigationRoute` across floors uses the virtual stair/elevator transition edge for *routing* but today excludes it from the reported `distanceM`/`steps` (authored edges only). This current behavior is pinned by a test with an explicit `NOTE` comment so package B8 can decide deliberately whether to change it.
- `getRotatedAABB` remains in `src/components/map-builder/constants.ts`; `src/lib/campusValidation.ts` imports it from there. This inverts the documented lib → components layering slightly. It is acceptable for B1, but when the full validation engine lands in B7 the geometry helper should move into `src/lib/` so the validation module stays framework-light.
- `validateCampus` in `CampusEditor.tsx` keeps the original narrow memo deps (`campus.name/buildings/canvasW/canvasH` + overlap state), so the extraction does not change memoization behavior.

## 5. Command results (August 7, 2026)

| Command | Result |
|---|---|
| `git branch --show-current` | `test/map-builder-baseline` ✓ |
| `pnpm exec vitest run` (before changes) | 7 files, 64 tests passed |
| `pnpm build` (before changes) | Passed (pre-existing >500 kB chunk warning for `AdminMapBuilderPage`) |
| `pnpm exec vitest run src/lib/__tests__` (after changes) | 6 files, 86 tests passed |
| `pnpm test` (full suite, after changes) | **12 files, 135 tests passed** |
| `pnpm build` (after changes) | **Passed** (same pre-existing chunk-size warning only) |
| `git diff --check` | Clean |
| `pnpm test` (full suite, after manual-failure repair) | **14 files, 152 tests passed** |
| `pnpm build` (after manual-failure repair) | **Passed** (same pre-existing chunk-size warning only) |
| `git diff --check` (after repair) | Clean |
| `pnpm exec vitest run` (round-2 targeted: useFloorHistory + FloorEditor undo/redo + service contract) | 4 files, 21 tests passed |
| `pnpm test` (full suite, after round-2 repair) | **16 files, 167 tests passed** |
| `pnpm build` (after round-2 repair) | **Passed** (same pre-existing chunk-size warning only) |
| `git diff --check` (after round-2 repair) | Clean |
| `pnpm exec vitest run src/components/map-builder/__tests__/FloorEditor.selection.test.tsx` (round-3 targeted) | 1 file, 4 tests passed |
| `pnpm test` (full suite, after round-3 repair) | **17 files, 171 tests passed** |
| `pnpm build` (after round-3 repair) | **Passed** (same pre-existing chunk-size warning only) |
| `git diff --check` (after round-3 repair) | Clean |

No lint or type-check scripts exist in `package.json` (no `tsconfig.json`); the Vite production build is the available project compile check and it passes. No existing failures were hidden; the only failure encountered during B1 was the `findPath` bug discovered by the new tests, which was fixed (§4).

## 6. Remaining issues intentionally deferred to B2–B10

- B2: outdoor authoring polish — includes the visual asset redesign, campus-card styling, and the complete toolbar/tab redesign (only the minimal tool/layer state-reset isolation was done in B1, see §8).
- B3/B4: building entrances and floor-plan authoring with real floor backgrounds.
- B5: full navigation graph authoring contract and the complete navigation workflow (the nav-layer entrance-connector indicator is gated but not redesigned in B1).
- B6: persistence integration over A5 structure services (Gate G1).
- B7: complete validation and issues workflow (current baseline checks only).
- B8: route testing over published graph data; public map native routing (removes hardcoded legacy assumptions).
- B9: save/publish/tutorial UX over A6 orchestration.
- B10: polish, accessibility, performance, regression pass — includes the app-level Error Boundary, which was explicitly NOT built during this repair.
- Known non-blocking facts recorded: dead `map-builder-v2/`, `AdminMapBuilderPage` chunk size warning, no `tsconfig.json`/lint script, public map still mock/hardcoded-driven.

## 7. B1 readiness statement (updated after manual-verification repair)

B1 is **ready for review (FOR REVIEW)**. The automated checks pass (171 tests / 17 files, clean build, clean diff), all reported manual blockers from three repair rounds were repaired (§8: LandPlot crash, building placement, green nav connector, tool/layer isolation; §10: Floor Editor undo/redo, wall movement, map_elements save error; §11: empty-canvas deselection), and the reviewer confirmed every manual retest checklist item in §9, §10.6 and §11.5 on August 7, 2026 (§12). It becomes officially `DONE` only after its PR is merged. Evidence for the first-pass work (baseline audit + 135 tests + `findPath` fix) remains valid above.

## 8. Manual-verification repair round (August 7, 2026)

Manual verification found four runtime/interaction failures that the automated B1 checks could not catch. Each was investigated to its root cause and minimally repaired. No Map Builder redesign was performed; the items below marked as deferred are recorded for B2/B5/B10.

### 8.1 Floor Editor runtime crash — `ReferenceError: LandPlot is not defined`

- **Root cause:** `src/components/map-builder/FloorEditor.tsx` renders `<LandPlot>` (the Window tool button in the structure sidebar) but the lucide-react import list never included `LandPlot`. The Floor Editor crashes with a `ReferenceError` the moment it renders in structure mode (its default). The Vite build does not catch this because only imported symbols are checked.
- **Fix:** Added `LandPlot` to the lucide-react import. Nothing else changed.
- **Regression test:** `src/components/map-builder/__tests__/FloorEditor.render.test.tsx` renders the Floor Editor with a minimal campus and asserts it mounts and shows the structure sidebar (Draw Wall / Door / Window / Stairs / Elevator + Structure/Interior mode toggle).

### 8.2 Broken building placement (preview did not follow the cursor; building could land at the top-left)

- **Root cause (three contributing holes):**
  1. The canvas `onMouseLeave` ran the **same handler as `mouseup`** (`handleSvgUpResize`), which *finalizes* a drag-to-create building. The moment the cursor exited the SVG — e.g., a drag that slipped toward the top-left of the window — a building was committed at the exit point (clamped toward 0,0) **before the user released the button**, so the building looked stuck at the top-left and the cursor kept moving without it.
  2. `Escape` and tool changes never cleared `buildingDrag`/`rubberBand`, so a cancelled or interrupted placement left a stuck dashed preview and could create an accidental building on a later click (the stale state is finalized by the next `mouseup`).
  3. The preview and the finalize step computed geometry with **different rules** (preview: raw `min/max` + `Math.abs`, unsnapped start; finalize: `Math.round` + min-size clamps + canvas clamp), so they could disagree.
- **Fix (minimal):**
  - New `handleSvgLeave` wired as the Canvas `onCanvasLeave`: leaving the canvas now **cancels** placement/selection gestures (clears `buildingDrag`, `rubberBand`, drag/rotate/resize refs) instead of finalizing them. A building is created only on a real `mouseup` inside the canvas.
  - `Escape`, tool switches, and layer switches now clear `buildingDrag`/`rubberBand` (and the other transient state, see §8.4).
  - New pure helper `computeBuildingPlacement` (in `src/lib/editorPlacement.ts`) is the **single source of truth** for both the preview rect and the final building (same clamping, same 40×30 minimum, same rounding). The preview therefore always matches the created building exactly, and a plain click yields the minimum footprint at the click point — never an accidental (0,0) placement.
  - `useCanvasControls.getPoint` now delegates to the tested `screenToWorld` helper so the production coordinate math is exactly the math under test (zoom/pan-invariant cursor→world conversion).

### 8.3 Unrequested green dotted line below newly placed buildings

- **Meaning & cause:** The line is the **Navigation-layer “building → walking network” connector indicator** in `src/components/map-builder/Canvas.tsx` (`layer === "navigation"`). It draws a green dashed line from every building's bottom center down to 90% of the canvas height plus a waypoint dot. It is a static decoration — it creates **no** path, edge, nav node, or persisted data — but it was drawn for **every** building even with zero navigation data, so a bare new building looked like it had an accidental path.
- **Fix:** The connector is now gated by `shouldDrawNavConnector(buildingId, navNodes, entranceNodeId)` — it only renders for buildings that actually have navigation data: a nav node referencing the building (`navNode.buildingId`) **or** an `entranceNodeId` set from the Properties panel (the authoritative link used by `TestNavigationPanel`). With no nav data, no green line appears. Existing saved navigation data is untouched.

### 8.4 Tool-state isolation across Campus / Navigation / Accessibility / Emergency / Events

- **Root cause:** Layer tab buttons called `setLayer(l.id)` with no cleanup (only the `1–5` keyboard shortcut reset state), and the tool palette called `setTool(t.id)` without clearing unfinished drawing state. Switching tabs could leave the Building/Path tool active or an unfinished path preview on screen, enabling accidental building/marker/path placement.
- **Fix (minimal, no redesign):**
  - `switchLayer(layer)` — used by the tabs, the `1–5` shortcuts, and shared cleanup: resets the tool to `select`, clears selection, multi-selection, align tools, guides, drawing path, building drag, rubber band, selected building type, and the test-route highlight.
  - `switchTool(tool)` — used by the palette and the single-letter shortcuts: clears the drawing path, building drag, rubber band, and guides, and clears a stale selected building type when leaving the building tool.
  - `Escape` clears the same transient state (incl. `buildingDrag`/`rubberBand`).
  - The pure reset contract is captured by `resetTransientToolState()` in `src/lib/editorPlacement.ts` and unit-tested.

### 8.5 Files changed in the repair round

- `src/lib/editorPlacement.ts` — **new.** Pure helpers: `screenToWorld` (zoom/pan-aware screen→canvas conversion, now used by `getPoint`), `computeBuildingPlacement` (shared preview/final geometry), `shouldDrawNavConnector`, `resetTransientToolState`.
- `src/components/map-builder/FloorEditor.tsx` — added missing `LandPlot` import.
- `src/components/map-builder/CampusEditor.tsx` — `handleSvgLeave` (cancel on mouse-leave); `switchTool`/`switchLayer` wired to palette, layer tabs, and keyboard shortcuts; `Escape` clears `buildingDrag`/`rubberBand`; drag-to-create finalize uses `computeBuildingPlacement`.
- `src/components/map-builder/Canvas.tsx` — `onCanvasLeave` prop (defaults to `onCanvasUp` for compatibility); drag preview uses `computeBuildingPlacement`; nav-layer connector gated by `shouldDrawNavConnector`.
- `src/components/map-builder/useCanvasControls.ts` — `getPoint` delegates to `screenToWorld`.
- `src/lib/__tests__/editorPlacement.test.ts` — **new** (15 tests).
- `src/components/map-builder/__tests__/FloorEditor.render.test.tsx` — **new** (2 tests).

### 8.6 Repair-round command results

| Command | Result |
|---|---|
| `pnpm exec vitest run src/lib/__tests__/editorPlacement.test.ts src/components/map-builder/__tests__/FloorEditor.render.test.tsx` | 2 files, 17 tests passed |
| `pnpm test` (full suite) | **14 files, 152 tests passed** |
| `pnpm build` | Passed (pre-existing >500 kB chunk warning only) |
| `git diff --check` | Clean |

## 9. Manual retest checklist (for the reviewer)

1. **Floor Editor** — Open a building floor: it must render normally (no `LandPlot`/`ReferenceError`, no red console errors). Select and move an existing room/wall/furniture; undo (Ctrl+Z) and redo (Ctrl+Shift+Z) must still work.
2. **Building placement** — With the Build tool (B): drag on the canvas → the dashed preview must follow the cursor and the created building must appear exactly where the preview was. Repeat at zoomed-in and panned views — placement must remain correct. A plain click creates a minimum 40×30 footprint at the click point (never at 0,0). Dragging the cursor outside the canvas cancels the placement (no building created, preview disappears). Press Escape mid-drag: preview disappears, nothing is created.
3. **Green dotted line** — On the Campus layer, place a new building; switch to the Navigation tab: no green dashed line under the new building. Once a nav node is linked to a building (or `entranceNodeId` is set in Properties), the connector appears for that building only. No saved nav data is lost.
4. **Tool isolation** — While the Build or Path tool is active, switch between Campus / Navigation / Accessibility / Emergency / Events tabs: the tool must reset to Select, no unfinished path preview or drag preview may remain, and clicking the canvas must not create anything accidentally. Start a path (P), click a few points, switch to Select (V): the path preview disappears.
5. **Regression** — Rubber-band selection still works when the whole gesture stays inside the canvas; moving/resizing/rotating existing buildings still works; undo/redo unaffected.

> Note: the repair was verified by code inspection, the unit tests above, and a clean build. In this environment the authenticated browser flow could not be driven end-to-end reliably, so the checklist above is the human confirmation gate for B1 → FOR REVIEW.

---

## 10. Round-2 repair — Floor Editor undo/redo, wall movement, and the map_elements save error (August 7, 2026)

Manual verification found that Floor Editor undo/redo did not work at all, walls could not be moved, and saving a campus failed with a database NOT NULL constraint error. Each was traced to its root cause and minimally repaired. B1 remains `ACTIVE` (not `FOR REVIEW`) until the §10.6 checklist is confirmed. The preview building-count issue is confirmed fixed and closed (no further work).

### 10.1 Undo/redo did not work — root cause and repair

- **Root cause:** `useFloorHistory` snapshotted **only `rooms` and `paths`** — every other element array (`walls`, `doors`, `windows`, `furniture`, `stairs`, `elevators`, `labels`) was `undefined` in history entries, so undoing a wall/room/door move or delete restored nothing. Independently, item drags (move) **never committed history at all** (no per-frame pushes, no pointer-release commit), while the wall-endpoint drag pushed *twice* per gesture. `canUndo`/`canRedo` were derived from refs, so toolbar disabled states were also stale. This is why the toolbar buttons, Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z all appeared dead.
- **Repair (no history-system replacement — the existing hook was repaired):**
  - `useFloorHistory` rewritten to snapshot the **complete floor state** in every entry (`rooms, paths, walls, doors, windows, furniture, stairs, ramps, elevators, labels`) and to bump a version state on every mutation so `canUndo`/`canRedo` recompute reactively (correct disabled states). History remains **per floor** — `resetHistory(floorSnapshot())` runs on floor switch.
  - Every mutation now flows through `updFloor`, which records the **POST-change state as the new history tip exactly once**. During drag gestures `suppressHistoryRef` suppresses per-frame pushes; `handleSvgUp` commits **exactly one post-gesture entry on pointer release**, so Undo restores the pre-gesture state and Redo re-applies the gesture. Discrete ops (add/delete/rotate/endpoint edit) record one entry each.
  - New `applyEntry` applies a history entry while suppressing history recording, so undo/redo never record themselves. It is the single path used by the toolbar Undo/Redo buttons, Ctrl+Z, Ctrl+Y **and** Ctrl+Shift+Z — all four now share the same history source and work.
  - The keyboard listener guards against firing while focus is inside an `INPUT` or `TEXTAREA`, and its dependency array includes the live arrays so stale closures cannot eat shortcuts.
- **Manual-disproved claim corrected:** the §1 table listed per-floor undo/redo as "Working" (by inspection); manual testing disproved it and §10.1 documents the actual repair.

### 10.2 Wall movement — broken, not never-implemented

- **Truthful finding:** whole-wall dragging **was implemented but broken**. The generic drag path computed `{ ...orig, x: orig.x + dx, y: orig.y + dy }`, but walls store `x1/y1/x2/y2` and have no `x`/`y`, so `undefined + dx` produced **NaN** on the wall object: the wall did not visually move, and the NaN later serialized as `null` (see §10.3). Endpoint-handle editing (drag either white endpoint circle) was the only working method and double-pushed history.
- **Repair:** the wall branch of the drag pipeline now translates `x1/y1/x2/y2` directly (a pure geometry fix, not an interaction redesign), so whole-wall dragging moves the segment. Endpoint editing is preserved and now records exactly one history entry per gesture. Walls therefore remain editable both by whole-wall drag and by endpoint handles.
- **Recorded as B4 follow-up:** full wall manipulation polish — resizing, snapping refinements, context menus, and visual improvements. This repair does **not** claim "all floor objects can be moved" beyond what is implemented (rooms, walls, doors, windows, furniture, stairs, ramps, elevators, labels all translate; rooms also resize via corner handles).

### 10.3 map_elements save error — `null value in column "x" violates not-null constraint`

- **Root cause chain (traced end-to-end):** FloorEditor wall drag wrote `x: NaN` onto the wall object → `serializeCampusStructure`'s `element()` did `Number(value.x ?? 0)` → **NaN** → `JSON.stringify(NaN)` → **`null`** → the Supabase `map_elements` insert hit the NOT NULL constraint on `x`. No null was authored by the user; NaN→null is standard JSON behavior, and `x`/`y`/`rotation` are NOT NULL in the existing A5 contract (verified in `supabase/migrations/20260806113935_establish_campus_structure_contract.sql`).
- **Which element:** walls (endpoint-based `x1/y1/x2/y2`, no `x`/`y`) — reproduced by a new test that serializes a campus containing a wall with a NaN `x`.
- **Coordinate representation:** for endpoint-based elements such as walls, the canonical anchor location is the **start point** (`x1`/`y1`); the full segment geometry is retained in `metadata.ui` (and `geometry` where applicable), so no endpoint data is lost.
- **Repair (no migration or contract change):**
  - New `finiteNumber(value, kind, id, label)` coerces `undefined`/`null` to `0` for the NOT NULL numeric columns and **throws a descriptive developer-facing error naming element kind + id + field** for genuinely corrupt non-finite values — so a bad element is diagnosed instead of silently emitting null. Normal users see the existing friendly toast with the message text.
  - `element()` uses the wall start point for `x`/`y`; buildings, rotation, and `navigation_nodes` coordinates get the same safe coercion (they had the same NaN→null exposure).
  - The hydrate path (`deserializeCampusStructure`) normalizes legacy local data by stripping stray non-finite `x`/`y` from endpoint-based walls, so pre-existing localStorage data saves cleanly.
- **Required behavior verified by tests:** every persisted `map_elements` record satisfies the contract (finite `x`/`y`/`rotation`), walls keep `x1/y1/x2/y2`, and a campus containing buildings, floors, walls, rooms, doors, windows, labels, stairs, elevators, and furniture serializes with no null required coordinates.

### 10.4 Files changed in round 2

- `src/components/map-builder/useFloorHistory.ts` — rewritten: full floor-state snapshots, reactive `canUndo`/`canRedo`, `resetHistory` on floor switch.
- `src/components/map-builder/FloorEditor.tsx` — `updFloor` records post-change history once; `suppressHistoryRef` + one post-gesture commit in `handleSvgUp`; `applyEntry` for toolbar buttons + Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z (input-focus guarded); wall drag translates `x1/y1/x2/y2`; endpoint drag single-entry; toolbar disabled states; Escape clears gesture state.
- `src/services/campusStructureService.ts` — `finiteNumber` coercion (walls anchor at `x1`/`y1`), descriptive errors naming kind + id, hardened buildings/rotation/nav-node coords, hydrate strips legacy NaN wall coords.
- `src/components/map-builder/__tests__/useFloorHistory.test.ts` — **new**.
- `src/components/map-builder/__tests__/FloorEditor.undoRedo.test.tsx` — **new** (integration: toolbar, shortcuts, wall drag, single-undo-step behavior).
- `src/services/__tests__/campusStructureService.test.ts` — extended with the null-x reproduction and contract-compliance cases.

### 10.5 Round-2 command results

| Command | Result |
|---|---|
| `pnpm exec vitest run src/components/map-builder/__tests__/useFloorHistory.test.ts src/components/map-builder/__tests__/FloorEditor.undoRedo.test.tsx src/services/__tests__/campusStructureService.test.ts` | 3 files, 21 tests passed |
| `pnpm test` (full suite) | **16 files, 167 tests passed** |
| `pnpm build` | **Passed** (pre-existing >500 kB chunk warning only) |
| `git diff --check` | Clean |

No lint or type-check scripts exist (`no tsconfig.json`); the Vite production build is the compile check and it passes.

### 10.6 Round-2 manual retest checklist (for the reviewer)

1. **Undo/redo** — In a floor with some walls/rooms/furniture: select a wall and drag it → Undo (Ctrl+Z) restores the original position; Redo (Ctrl+Y or Ctrl+Shift+Z) re-applies the drag. Repeat for moving a room and for deleting a wall (Delete key / erase). The toolbar Undo/Redo buttons work and their disabled states match availability. Create a wall (W), add a door (D), then undo twice: each step restores exactly one change. While typing in a text input (e.g. room name in Properties), Ctrl+Z must not undo the canvas.
2. **Wall editing** — Select a wall: whole-body drag moves it; the white endpoint circles still reshape it. Each gesture is exactly one undo step.
3. **Save** — In a campus with buildings + floors containing walls, rooms, doors, windows, labels, stairs, elevators, and furniture: Save must succeed (no `null value in column "x"` error), and the structure is persisted.
4. **Regression** — Floor switch resets undo history for the new floor (undoing on floor B does not affect floor A). The §9 checklist items (render, placement preview/final match, green connector gating, tool/layer isolation) still hold.

---

## 11. Round-3 repair — Floor Editor empty-canvas deselection (August 7, 2026)

Manual verification confirmed wall movement, endpoint editing, undo/redo, and saving all pass. One final baseline interaction defect remained: clicking an empty area of the Floor Editor canvas did not deselect the currently selected object. B1 stays `ACTIVE` until the §11.5 step is confirmed.

### 11.1 Root cause

The canvas marks its background with `data-bg="true"` on the **outer** rect only. The visible "empty floor" the user clicks is covered by two **floor-area decoration rects** (`#e0dcd6` and `#cdc9c3`), which had no `data-bg` marker. `handleSvgDown` computed `isBg = target === svgRef.current || target.dataset.bg === "true"`, so a click on the floor interior resolved to a decoration rect → `isBg === false` → the `setSelected(null)` branch never ran → the object stayed highlighted. (Grid lines in the outer margin had the same gap.)

### 11.2 Exact repair (minimal, no behavior redesign)

- The decorative background layer — outer rect, grid lines, and both floor-area rects — is now wrapped in a single `<g data-bg="true">` group.
- `isBg` now also matches **descendants** of that group via `target.closest?.('[data-bg="true"]')`, so a click anywhere on genuinely empty canvas space (floor interior, outer margin, grid lines, or the svg itself) clears the selection.
- Object `<g>`s are **siblings** of the background group (rendered after it), so `closest('[data-bg]')` never matches an object click — and `onItemDown` already calls `stopPropagation()` — so clicking an object selects it and never bubbles into an accidental deselection.
- Wall endpoint handles call `stopPropagation()` and do not touch selection state, so endpoint clicks/drags preserve the wall selection.
- `Escape` already cleared the selection plus all transient drawing/dragging state (`wallStart`, `wallPreview`, `setDP([])`, `dragging`, gesture refs) — no change needed there; the behavior is now pinned by a test.
- Deselection is pure UI state (`setSelected(null)`): it does not mutate or delete the object and does not create an undo-history entry (verified by test — `onUpdate` never fires).
- Existing behavior preserved: in Select tool an empty-canvas mousedown still also starts pan (the deselecting click is the same gesture start as before, per the editor's existing conventions).

### 11.3 Files changed in round 3

- `src/components/map-builder/FloorEditor.tsx` — decorative background wrapped in `<g data-bg="true">`; `isBg` uses `closest('[data-bg="true"]')`; `data-testid="selection-glow"` and `data-testid="wall-endpoint-handle"` added to the wall selection visuals (test-only, no behavior change).
- `src/components/map-builder/__tests__/FloorEditor.selection.test.tsx` — **new** (4 integration tests).

### 11.4 Round-3 command results

| Command | Result |
|---|---|
| `pnpm exec vitest run src/components/map-builder/__tests__/FloorEditor.selection.test.tsx` | 1 file, 4 tests passed |
| `pnpm test` (full suite) | **17 files, 171 tests passed** |
| `pnpm build` | **Passed** (pre-existing >500 kB chunk warning only) |
| `git diff --check` | Clean |

### 11.5 Round-3 manual retest step (for the reviewer)

1. In a floor, select a wall (or room/furniture) so the selection glow and endpoint/resize handles appear.
2. Click empty floor space (not on any object): the object must deselect — glow, handles, and the Properties panel selection must disappear, and the object must remain unchanged.
3. Click another object: it selects normally. Click the same object again: it stays selected (no accidental deselect).
4. Drag a wall endpoint: the wall stays selected while being reshaped.
5. Press Escape with an object selected: selection clears. Start drawing a wall (W), click to start, move to preview, then Escape, then click again: the aborted wall must not be completed.
6. Regression: undo/redo, wall drag, endpoint editing, and saving still work (wall movement, endpoint editing, undo/redo, and saving already confirmed manually in the previous round).

### 11.6 Recorded B4 follow-up work (NOT implemented in B1)

The following are intentionally deferred to B4 — Floor-plan authoring polish (no B4 work was started in this repair):

- Wall endpoints snap to nearby wall endpoints and grid intersections.
- Horizontal, vertical, and optional 45-degree alignment.
- Doors and windows attach to walls, rotate with them, and move along them.
- Doors and windows must not remain floating away from walls.
- Cleaner wall joins and clearer wall-selection visuals.
- Improved asset appearance and manipulation experience.

---

## 12. Final manual verification — PASSED → B1 FOR REVIEW (August 7, 2026)

The reviewer confirmed the following manual checks passed on `test/map-builder-baseline`:

- Floor Editor opens without runtime errors.
- Whole-wall dragging works.
- Wall endpoint editing works.
- Ctrl+Z undo works.
- Ctrl+Y redo works.
- Ctrl+Shift+Z redo works.
- Toolbar Undo and Redo work.
- Empty-canvas clicking deselects objects.
- Object selection works correctly.
- Wall endpoint dragging preserves selection.
- Escape clears selection and unfinished previews.
- Campus structure saves successfully without the map_elements x-null error.
- Building placement and cancellation behave correctly.
- Unrequested navigation connector lines no longer appear.
- No new red browser-console errors were observed.

**Result:** All §9, §10.6 and §11.5 checklist items are confirmed. B1 status was set to **FOR REVIEW**; it became **DONE** when Pull Request #5 was merged into `main` (merge commit `b19d974`).

### 12.1 Deferred requirements by package (assignments kept)

- **B2 — Outdoor Campus Editor and asset visual improvements:** visual asset redesign, campus-card styling, and the complete toolbar/tab redesign (B1 only performed the minimal tool/layer state-reset isolation, §8.4).
- **B4 — Floor Editor overhaul:** wall endpoint snapping to nearby endpoints/grid intersections; horizontal, vertical, and optional 45-degree alignment; doors and windows attach to walls, rotate with them, and move along them (must not float away); cleaner wall joins and clearer wall-selection visuals; improved floor asset appearance and manipulation experience; panning, resizing, context menus, and interaction polish.
- **B5 — Navigation/path workflow and appropriate mode-specific tools:** the full navigation graph authoring contract and the complete navigation workflow (the nav-layer entrance-connector indicator is gated, §8.3, but not redesigned).
- **B10 — Final polish:** responsiveness, error boundaries, performance, and the final accessibility/regression pass (the app-level Error Boundary was explicitly not built during B1).
