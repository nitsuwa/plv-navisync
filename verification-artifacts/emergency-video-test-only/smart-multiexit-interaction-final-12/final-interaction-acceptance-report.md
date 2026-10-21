# Smart Multi-Exit Interaction Acceptance — Continuation

## Result

The desktop backward-floor anomaly was caused by the browser harness waiting past the brief atomic stair handoff. CABA's same-shaft run advances floor-by-floor after Continue; Pause must be requested while a handoff is active. The harness now requests that Pause in the handoff window. Desktop and mobile both stopped on Floor 5, and Previous restored Floor 6 and the exact prior stair instruction.

No Student Map source code was changed in this continuation. The existing [CampusMapPage.tsx](../../../../src/pages/CampusMapPage.tsx) marker de-duplication and Explore step synchronization fixes from the previous work remain in the checkout and were retested below. The browser harness update is in [smart-multiexit-interaction-browser.cjs](../smart-multiexit-interaction-browser.cjs).

## Acceptance results

| Interaction | Result | Evidence |
|---|---|---|
| Both Routes overview | **PASS** — preview phase, no active progress marker | [Desktop 1440×900](smart-multiexit-desktop-1440-both-routes.png) |
| Select Route A or B | **PASS** — one marker, selected route highlighted, no playback; camera moved across multiple sampled frames | [Route A preview](smart-multiexit-desktop-1440-route-a-preview.png), [Route B focus transition](smart-multiexit-desktop-1440-route-b-transition.png), [390×844](smart-multiexit-mobile-390-route-b-preview.png), [360×800](smart-multiexit-mobile-360-route-b-preview.png) |
| Pause and Resume | **PASS** — marker, instruction, step, and camera held for 2.2 seconds; Resume continued from the same step and the marker moved | Results: [browser run JSON](smart-multiexit-interaction-browser-results.json) |
| Next and Previous | **PASS** — each moved exactly one step and restored the expected instruction | Results: [browser run JSON](smart-multiexit-interaction-browser-results.json) |
| Forward and backward floor transition | **PASS** on desktop and 390×844 — Continue moved Floor 6→5; Pause settled at Floor 5; Previous returned to Floor 6, Step 3, “Take the Left Stair down to Floor 5.” | Results: [browser run JSON](smart-multiexit-interaction-browser-results.json) |
| Follow and Explore | **PASS** — Explore retained manual pan/zoom while Previous/Next changed route state; returning to Follow preserved the route | [Desktop Explore](smart-multiexit-desktop-1440-route-b-active-explore.png), [mobile Explore](smart-multiexit-mobile-390-route-b-active-explore.png) |
| 2D→3D→2D during navigation | **PASS** — phase, route step, instruction, and Floor 6 were preserved on desktop and mobile | [Desktop 3D](smart-multiexit-desktop-1440-route-b-active-3d-paused.png), [mobile 3D](smart-multiexit-mobile-390-route-b-active-3d-paused.png) |
| Switch alternatives during playback | **PASS by captured browser state** — active Route B changed to selected Route A preview, remained there for 900 ms with Start visible and one marker; switching back to Route B behaved the same | [Captured interaction JSON](../smart-multiexit-interaction-final-13/smart-multiexit-interaction-browser-results.json) |
| CABA Route B arrival | **PASS, reused prior actual-browser run** — steps 3–11 observed without skips or repeats; Floors 6, 5, 4, 3, 2, Ground; playback stopped; final camera target was campus point (146, 380) | [Arrival results](../route-b-terminal/assembly-point-caba-browser-results.json), [desktop arrival screenshot](../route-b-terminal/assembly-point-caba-arrival-desktop-1440.png) |
| Assembly Point outdoor marker | **PASS, reused prior actual-browser run** — marker at world (146, 380), route lines ended there, marker remained visible in 2D and 3D, and the 2D→3D→2D round trip preserved Step 10 | [Outdoor renderer results](../follow-outdoor-marker-acceptance/assembly-point-caba-browser-results.json), [2D destination](../follow-outdoor-marker-acceptance/assembly-point-caba-arrival-outdoor-2d-mobile-360.png), [3D destination](../follow-outdoor-marker-acceptance/assembly-point-caba-arrival-outdoor-3d-mobile-390.png) |
| Emergency video handoff | **NOT REPEATED** as requested; prior browser evidence retained | [Video open with route paused](../final-video-open-route-paused-desktop.png) |

The 3D active progress marker is rendered inside the WebGL scene, so a DOM query for the 2D SVG marker correctly returns zero in 3D. The active 3D screenshot and the existing Three.js human-marker path were inspected; the 3D renderer consumes the same route progress ref.

## Route-switch harness note

The first active-switch run recorded the expected preview state and visible Start control after both selections, but its combined assertion returned false because an auxiliary Playwright `:visible` Pause-button count disagreed with the captured visible controls. The assertion was corrected to inspect the rendered Start/Pause actions and route phase. Applying that corrected assertion offline to the saved Chromium state passes for desktop and mobile. A fresh browser rerun after the correction could not start: the harness's read-only published-snapshot RPC returned HTTP 500 twice before Chromium launch. No map or approval writes occurred.

## Verification

- Focused Vitest: **121 passed, 5 files** (`studentRouteFlow`, 3D camera focus, Student route planner, indoor navigation controls, and video/route coordination).
- Production build: **passed**. Vite emitted its existing large-chunk warning for the Student Map and Admin Map Builder bundles.
- TypeScript: **not clean** — 1,039 diagnostics. Normalized comparison with the saved [baseline log](../pathfinding-ui-tsc.log) reported **0 differences**; this run's [diagnostics](typescript-check.txt) are retained.
- `git diff --check`: **passed**; Git printed existing LF→CRLF working-copy advisories.
- Chromium: no browser errors in the completed interaction run. The isolated test cloned the published snapshot read-only, kept approvals in the browser fixture, and blocked remote mutations.
- No production map, route approval, Storage, migration, or publication was changed. No commit or push was made.

## Remaining limits

- The corrected active-route-switch assertion is supported by the captured real-browser states but was not rerun in a fresh Chromium session because the read-only snapshot service returned HTTP 500.
- Video playback was not rerun in this continuation.
- These results describe isolated test data; they do not approve real campus evacuation guidance.
