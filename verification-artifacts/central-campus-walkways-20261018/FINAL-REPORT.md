# Central campus walkway and navigation verification

## Result

The compiler now derives intersections for same-level paths that share an authored Walking Network, own navigation vertices, and have no explicit disconnect or visual-only attachment. It splits the affected graph edges without changing the authored centerlines, preserves their direction and eligibility metadata, and reuses generated identifiers across recompiles. The changes are in [campusPathNavigation.ts](../../src/lib/campusPathNavigation.ts) with regression coverage in [campusPathNavigation.test.ts](../../src/lib/__tests__/campusPathNavigation.test.ts).

## Graph findings

- The current central X crossing is at `(520, 560)`. It lies on two authored segments in the same same-level network and is eligible for derived junction generation. The former suspected positions `(540, 440)` and `(507.397, 540.274)` are stale; current authored disconnection keys at those locations do not prohibit the crossing at `(520, 560)`.
- The compiler previously connected owned path vertices but did not split owned segments at an interior X/T intersection. The route could therefore use only an existing perimeter component even though its same-network centerlines crossed.
- A separate compiler defect trusted `visualAttachments.targetSegmentIndex` / `targetT` after the target path was split. Those references can become stale. A visual-only attachment could then be mistaken for navigable topology. The compiler now identifies that case from the source endpoint and target path identity, so the visual attachment stays disconnected.
- Intersections remain disconnected across different network IDs or elevations, and where a path records an explicit disconnected point or visual-only attachment. Decorative paths without owned navigation topology are not promoted into the graph.

## Route comparison

- Published CABA Entrance 2 → CEIT Primary Entrance: prior selected route `191 m`; after compilation the central route is `190 m`. The browser route uses this coordinate sequence: `(240,713) → (360,713) → (360,740) → (360,800) → (520,560) → (680,620) → (680,680) → (680,713) → (774,713)`. The earlier `188 m` candidate crossed a visual-only branch and is correctly rejected.
- Editable MAIN CAMPUS CABA → its assigned Assembly Point: previous perimeter route `259 m`; compiled central route `181 m`. This is editable/read-only graph evidence; it does not change the published snapshot.
- Chromium screenshots: [2D route preview](caba-ceit-central-route-1440.png), [3D route preview](caba-ceit-central-route-3d-1440.png), [3D Guided Navigation preview](caba-ceit-guided-3d-1440.png), [2D Guided Navigation arrival](caba-ceit-guided-2d-arrival-final.png), [3D Guided Navigation arrival](caba-ceit-guided-3d-arrival-final.png), and [390px mobile arrival](caba-ceit-guided-mobile-arrival-final.png).
- A fresh browser run starts with **Start from Entrance 2**, advances along the central campus path toward the CEIT Primary Entrance, and reaches **You've arrived** at the real endpoint. This building-to-building itinerary has no pending indoor/outdoor handoff and therefore no Continue action at its origin. The earlier run's apparent wait was not reproducible as a stuck transition.
- The actual defect was that the building-origin start left `navigationPhase` at `idle` even though playback was on the outdoor leg. The canonical arrival gate requires the `outdoor` phase, so the route could reach its last instruction without satisfying arrival. The start-context decision now uses `studentRouteInitialContext` and sets the campus phase consistently; it does not skip any authored transition. Regression coverage checks arrival after the animated outdoor leg.
- Chromium interaction checks: Pause/Resume, Follow/Explore, Previous/Next availability, and switching between 2D and 3D while paused preserve the active route step. The Next control is disabled during active animation/seek; arrival appears after playback reaches the endpoint. Both renderers show the same central route and final destination.
- At 390×844, the arrival state remains usable in the mobile map sheet and the bottom navigation stays visible. Desktop playback was verified at 1440×900.

## Safety and publication status

- Published MAIN CAMPUS still has no Assembly Point entity. A complete published SOS route to an assigned Assembly Point is therefore **BLOCKED BY CAMPUS DATA**.
- CABA-201 remains **BLOCKED BY CAMPUS DATA** for SOS. The Right Stair transition `677a5a24-9d4d-4855-8011-9eacb0944a2a` and Left Stair transition `23c676f3-27fc-4d8c-9308-8a1571c89b6c` remain `emergencySafe: false`. Nothing in this work establishes whether those are prohibitions or unreviewed suitability; campus safety personnel must determine eligibility before an authorized Builder change.
- No published campus snapshot, graph geometry, emergency flags, Assembly Point, database, or migration was changed.

## Checks

- Compiler and topology: `campusPathNavigation.test.ts` **28 passed**, including deterministic mid-segment X/T splitting, stale visual-attachment rejection, serialization/hydration, and reversible serialized snapshots.
- Route/path safety: `pathwayRegressionSafety`, `routePlanner`, and `validateNavigationGraph` **111 passed**.
- Assembly Point and SOS eligibility/integration: **49 passed** across four focused suites.
- Fresh central topology and SOS fixture rerun: **64 passed** across `campusPathNavigation`, `emergencyOutdoorConnectivity`, `emergencyPathEligibility`, and `smartMultiExitEvacuation.integration`, including a TEST ONLY Room-origin SOS route through `(520,560)` to its assigned Assembly Point with current emergency eligibility revalidation.
- Guided route flow: **69 passed**. The page-level arrival test passed when isolated (**1 passed, 44 skipped**); when run alongside other heavy suites it first hit its 15-second test timeout, then passed alone. The live Chromium route independently reached arrival in both 2D and 3D.
- Connect preview/commit midpoint joins: **3 passed**.
- Campus pathway save/reload route case: **1 passed**.
- Production build: **PASS**; Vite reports the existing large-chunk warning.
- `git diff --check`: **PASS** (Git emitted existing LF/CRLF worktree notices).
- TypeScript: `tsc --noEmit` exits nonzero with **1,029 diagnostics**, the same count as the saved pre-task baseline. Identity comparison found four substitutions and four resolved diagnostics, all in pre-existing generic casts in `src/services/database.ts`; **zero new diagnostic identities occur in the route/compiler/test files touched for this task**. See [fresh diagnostics](typescript-current-final-codex.txt) and [comparison](typescript-diagnostic-comparison-final.json).
- Fresh Map Builder rerun: `CampusEditor.navGraph` **53 failed / 86 passed (139)**; `FloorEditor.indoorNav` **21 failed / 18 passed (39)**; `CampusEditor.saveDraft` **8/8 passed**; `FloorEditor.undoRedo` **7/7 passed**. The 74 failures classify as **30 missing-element/text queries**, **8 ambiguous Connect queries**, and **36 assertion mismatches**. Missing queries mostly target superseded labels/controls such as Waypoint, old Navigation/Design tabs, removed Room emergency diagnostics, and old `nav-library-link` IDs. Ambiguous queries use `/Connect/` where more than one visible action matches. The assertion mismatches include old label/edge-count expectations and pointer fixtures that send world coordinates as screen coordinates or omit a full mouse gesture; several entrance-link, snap, and delete assertions remain behavior-shaped and were not independently proven to be either current application defects or invalid fixtures. They remain reported as unresolved suite failures, not relabeled as passes. The dedicated authored-network junction, midpoint Connect, save/reload, and Undo/Redo checks pass; no failing assertion was suppressed or weakened.

Failure classification against the requested categories:

| Category | Result |
| --- | --- |
| Outdated selectors/copy | **38 confirmed query failures**: 30 missing queries and 8 ambiguous Connect selectors. |
| Invalid or stale fixtures | **Confirmed examples, count not isolated**: world coordinates supplied as screen coordinates, visual-only pathway snapping expectations, and a junction-delete test missing the mouse-up half of a click. |
| Actual editor interaction defects | **NOT VERIFIED**: the remaining 36 assertions are behavior-shaped, but the current UI gesture/coordinate contract was not independently exercised for each one. |
| Save/reload regressions | **None observed in focused coverage**: Save Draft 8/8 and Undo/Redo 7/7 passed. |
| New junction regressions | **None observed**: compiler, explicit X/T fixtures, central route, and central SOS fixture pass. |
| Unrelated/pre-existing failures | **NOT ESTABLISHED**: the failures concern legacy editor expectations, but there is no clean pre-task baseline proving which were already present. |

## Feature statuses

| Feature | Status | Evidence / limit |
| --- | --- | --- |
| Same-network X/T segment junction derivation | **PASS** | Deterministic compiler tests; `(520,560)` route in Chromium |
| Avoiding visual-only/different-level shortcuts | **PASS** | Explicit compiler regression tests |
| Shorter central Standard route | **PASS** | 191 m → 190 m in published CABA→CEIT; browser screenshot |
| Central route to editable assigned Assembly Point | **PASS** | 259 m → 181 m read-only calculation |
| Accessible and SOS use of eligible graph edges | **PASS** | Route eligibility and emergency tests; flags remain enforced |
| TEST ONLY Room SOS through central crossing to assigned Assembly Point | **PASS** | Dedicated integration test verifies the junction, destination ID, and eligibility re-resolution |
| Central route 2D/3D preview geometry | **PASS** | Chromium screenshots show the same central route in both renderers |
| Guided CABA → CEIT progression to actual arrival in 2D and 3D | **PASS** | Live Chromium arrival captures; arrival gated on outdoor endpoint |
| CABA-201 student SOS | **BLOCKED BY CAMPUS DATA** | Stair suitability not established; both transition edges remain false |
| Published MAIN CAMPUS Assembly Point destination | **BLOCKED BY CAMPUS DATA** | No Assembly Point in published snapshot |
| CampusEditor.navGraph legacy suite | **FAIL / NOT CLEAN** | 53 failures; selector drift, stale coordinate/gesture assumptions, and unresolved behavior-shaped assertions |
| FloorEditor.indoorNav legacy suite | **FAIL / NOT CLEAN** | 21 failures; selector drift, ambiguous actions, stale fixture assumptions, and unresolved behavior-shaped assertions |
| CampusEditor.saveDraft and FloorEditor.undoRedo | **PASS** | 8/8 Save Draft; 7/7 Undo/Redo |

## Key changed files

- [campusPathNavigation.ts](../../src/lib/campusPathNavigation.ts) — deterministic same-network intersection derivation and edge splitting.
- [studentRouteFlow.ts](../../src/lib/studentRouteFlow.ts) and [CampusMapPage.tsx](../../src/pages/CampusMapPage.tsx) — canonical initial-context resolution and outdoor arrival phase.
- [campusPathNavigation.test.ts](../../src/lib/__tests__/campusPathNavigation.test.ts), [studentRouteFlow.test.ts](../../src/lib/__tests__/studentRouteFlow.test.ts), and [CampusMapPage.eventOverlayService.test.tsx](../../src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx) — topology and end-to-end arrival regressions.
- [smartMultiExitEvacuation.integration.test.ts](../../src/lib/__tests__/smartMultiExitEvacuation.integration.test.ts) — central-crossing Room SOS test fixture.
- [CampusEditor.saveDraft.test.tsx](../../src/components/map-builder/__tests__/CampusEditor.saveDraft.test.tsx) — current Save Draft persistence coverage.
- [typescript-current-final-codex.txt](typescript-current-final-codex.txt) and [typescript-diagnostic-comparison-final.json](typescript-diagnostic-comparison-final.json) — final TypeScript baseline comparison.

## Final isolated editor rerun (2026-10-19)

The requested editor suites were rerun one at a time against the current shared worktree. These per-suite reports supersede the earlier combined `editor-final-rerun.json` for Save Draft counts; that combined artifact contained two stale failures from an earlier test-file revision.

- [CampusEditor.navGraph current rerun](current-CampusEditor-navGraph.json): **53 failed / 86 passed**. Failures classify as 21 missing queries, 1 ambiguous query, and 31 assertion mismatches.
- [CampusEditor.saveDraft current rerun](current-CampusEditor-saveDraft.json): **8/8 passed**.
- [FloorEditor.indoorNav current rerun](current-FloorEditor-indoorNav.json): **21 failed / 18 passed**. Failures classify as 9 missing queries, 7 ambiguous queries, and 5 assertion mismatches.
- [FloorEditor.undoRedo current rerun](current-FloorEditor-undoRedo.json): **7/7 passed**.

Combined for these suites: **74 failures / 119 passes**. The 38 query failures reflect stale or ambiguous selectors/copy (30 missing, 8 ambiguous); they are not counted as verified application behavior defects. The remaining 36 assertion mismatches remain **NOT VERIFIED** as either current application defects or stale interaction/fixture assumptions. They were not weakened or removed. Save Draft and Undo/Redo have no failures in these isolated reruns.
