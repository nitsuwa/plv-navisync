# PLV NaviSync Emergency Navigation Acceptance Report

**Run date:** 2026-10-15  
**Environment:** Local Vite application with Chromium/Playwright. All synthetic point, route approval, and video data stayed in TEST ONLY fixtures.  
**Production access:** One read-only RPC to clone the currently published MAIN CAMPUS – PLV snapshot. No map, route, video, Storage, or migration writes were made.

## Result at a glance

- The existing published snapshot has no Emergency Assembly Points and no approved room evacuation routes. Its real SOS planner correctly reports one compact unavailable status and does not label Campus Gate as an approved assembly destination.
- In an isolated clone, the existing outdoor graph was reused to connect `TEST ONLY - Main Assembly Point A`. The route resolver produced complete graph paths to that same destination for all four target rooms.
- CABA, CEIT, and PLV Auditorium each retained two alternatives through two distinct physical exits. Assembly Hall retained one alternative through one physical exit. Auditorium’s disconnected assigned door remained ineligible, and the display label remained Floor 5.
- Student Map route selection, emergency-only marker visibility rules, mobile/desktop route panels, and 2D/3D renderer initialization were browser exercised. No horizontal overflow was measured at 360, 390, 430, tablet, 1280, or 1920 widths.
- **Terminal arrival is now browser verified for Route A in all four rooms and Route B in CABA.** Each completed route showed `Arrived at TEST ONLY - Main Assembly Point A`, stopped playback, and set the arrival camera target to the Assembly Point at `(146, 380)`. Admin placement, graph connection and save/reload were exercised in the actual editor against an isolated in-memory campus clone.
- Real campus evacuation guidance is **not ready for release**: the campus has no configured and authorized Assembly Point or current room approvals.

## Four-room results

All route calculations below used a local clone of the published graph. The test point was assigned to each building and given synthetic current approval metadata only inside the test fixture. The outdoor path was an authored connected network; the fixture attached the point to an existing outdoor waypoint and did not create a straight-line shortcut.

| Room | Floor label | Assigned doors | Distinct exits | Test routes to point | Graph result |
|---|---:|---:|---:|---:|---|
| Assembly Hall — COED | Ground Floor | 2 connected | 1 | 1 | PASS: both doors resolve to the same physical exit; no Route B |
| CABA Lecture Hall | Floor 6 | 2 route-ready | 2 | 2 | PASS: both alternatives reach the same test point |
| CEIT Lecture Hall | Floor 6 | 2 route-ready | 2 | 2 | PASS: both alternatives reach the same test point |
| PLV Auditorium | Floor 5 (internal floor 6) | 3 assigned; Door 2 disconnected | 2 route-ready | 2 | PASS: disconnected Door 2 excluded; both valid routes reach the point |

These counts are verified by the actual `TestNavigationPanel` resolver and graph data. In Chromium, all four rooms reached the SOS route-ready state; CABA, CEIT, and Auditorium showed Route A/Route B choices, while Assembly Hall showed a single-route state. Route A was advanced through authored floor transitions to the Assembly Point in all four rooms. CABA Route B was separately selected, advanced to the outdoor destination step, switched through 2D/3D/2D, and completed using the visible Next control.

## Emergency Assembly Point and Student Map

The test point had a stable TEST ONLY ID, an existing outdoor navigation node, three incident graph edges, assignments for all four test buildings, and synthetic `approved` review readiness. All candidate route paths ended at the same point node. This confirms destination resolution and graph connectivity in the isolated fixture; it is not an actual safety approval.

- **SOS destination:** PASS in the browser fixture. The planner displayed `Destination · TEST ONLY - Main Assembly Point A`.
- **Standard and Accessible visibility:** PASS in the browser fixture. The Assembly Point was absent from both modes and present in SOS.
- **2D/3D:** PASS. In 2D the route casing terminates at the marker's world coordinate `(146, 380)`. In 3D the destination overlay remained visible, aligned with the destination focus area, and clear of the mobile route panel. Route B retained the same current step and instruction through a live 2D/3D/2D switch.
- **Arrival:** PASS for all Route A room runs and CABA Route B. The app displayed `Arrived at TEST ONLY - Main Assembly Point A`, ended playback, and kept the camera focused on `(146, 380)` in campus context. No final step was injected by the test harness.
- **No approved point:** PASS in the real published-data state. The single status card says no approved assembly point is available and directs students to posted instructions and campus personnel. It does not suggest switching to Standard navigation.

### Four-room screenshots

- [CABA Both Routes, mobile 390×844](assembly-point-caba-both-routes-mobile-390.png)
- [CABA Both Routes, desktop 1440×900](assembly-point-caba-both-routes-desktop-1440.png)
- [CABA active 2D route, mobile](assembly-point-caba-active-2d-mobile-390.png)
- [CABA active 3D route, mobile](assembly-point-caba-active-3d-mobile-390.png)
- [CABA paused stair transition, mobile](assembly-point-caba-active-stair-transition-mobile-390.png)
- [CEIT Both Routes, mobile](assembly-point-ceit-both-routes-mobile-390.png)
- [PLV Auditorium Both Routes, mobile](assembly-point-auditorium-both-routes-mobile-390.png)
- [Assembly Hall single route, mobile](assembly-point-assembly-hall-single-route-mobile-390.png)
- [CABA Route B outdoor 2D step, mobile 390](follow-outdoor-marker-acceptance/assembly-point-caba-follow-outdoor-2d-mobile-390.png)
- [CABA Route B outdoor 3D step, mobile 390](follow-outdoor-marker-acceptance/assembly-point-caba-follow-outdoor-3d-mobile-390.png)
- [CABA Route B Assembly Point arrival, mobile 390](follow-outdoor-marker-acceptance/assembly-point-caba-route-b-arrival-after-renderer-roundtrip-mobile-390.png)
- [Consolidated Student Map browser results](assembly-point-student-browser-results.json)

The CABA dual-route desktop panel is compact, has one approval/status section, shows the destination row and two separate exit choices, and keeps the demonstration disclaimer. On mobile, the route sheet can be expanded for details; the document width matched every tested viewport width.

## Emergency video and route coordination

Chromium used the supplied sample MP4/VTT through an in-memory TEST ONLY media adapter. It did not use or modify Supabase Storage.

- Browser decoded the 16-second 960×540 MP4 and advanced playback while muted by default.
- WebVTT captions loaded and displayed the expected sample cue. Seeking, replay, looping, fullscreen, download, and explicit voiceover activation passed. Downloaded bytes matched the sample file. The browser’s audio signal was measured after unmuting; physical speaker volume was not checked.
- During SOS, the video used the compact Watch action. Opening the guide paused route progression; closing it preserved the current stair step and remained paused until an explicit Continue/Resume action.
- Desktop and mobile video positioning were checked. At 360px and 390px, the page had no horizontal overflow.
- Video playback across 2D/3D renderer switches and the actual private Storage/RLS path were not verified.

Evidence: [video browser results](browser-results.json), [route paused with video open, mobile 390×844](final-video-open-route-paused-mobile-390.png), [route paused with video open, desktop](final-caba-route-paused-after-video-desktop.png), and [video/sample integration results](final-full-map-results.json).

## Automated checks and build

- Assembly Point, emergency status, Smart Multi-Exit, Admin section, Student video, route coordination, and planner suites: **11 files, 87 tests passed**.
- Student route flow: **50 tests passed**.
- Admin Test Route room routing: **103 tests passed** after updating two stale test queries to expect `role="img"` for passive transition markers without click handlers. Interactive markers with handlers remain buttons.
- Current focused reliability suite: **9 files, 209 tests passed**, including the new Canvas event-ownership regression, camera focus, Assembly Point validation, Smart Multi-Exit routing, floor transitions and Admin Test Route routing.
- A broader `CampusMapPage.eventOverlayService` run had **41 of 44 tests pass**. Three assertions in the already-edited pathfinding UI suite still reflect earlier copy/layout expectations: the previous accessible-mode wording, the former fixed room-card classes, and a building sheet that is currently suppressed while the route panel is open. These were not introduced or changed during this continuation and remain unresolved.
- Production build: **passed**. Vite emitted its existing large-chunk warning for bundles above 500 kB.
- TypeScript: **failed with 1,039 diagnostics**, matching the previously reported repository count. The new Assembly Point and video module paths did not appear in the diagnostics; `CampusMapPage` and legacy shared services still have existing type errors, so this is not a clean typecheck.
- `git diff --check`: **passed**. Git printed existing LF-to-CRLF working-copy warnings.

### Files in the tested feature path

The relevant implementation already present in the working tree is in [emergencyAssemblyPoints.ts](src/lib/emergencyAssemblyPoints.ts), [studentEmergencyEvacuation.ts](src/lib/studentEmergencyEvacuation.ts), [CampusEditor.tsx](src/components/map-builder/CampusEditor.tsx), [EmergencyAssemblyPointPropertiesSection.tsx](src/components/map-builder/EmergencyAssemblyPointPropertiesSection.tsx), [CampusMapPage.tsx](src/pages/CampusMapPage.tsx), [UnifiedRoutePlannerDialog.tsx](src/components/map/UnifiedRoutePlannerDialog.tsx), [EmergencyRouteStatus.tsx](src/components/map/EmergencyRouteStatus.tsx), [ReadonlyOutdoorVisuals.tsx](src/components/map-builder/ReadonlyOutdoorVisuals.tsx), [StudentCampus3DRenderer.tsx](src/components/map/StudentCampus3DRenderer.tsx), [StudentEmergencyVideoCard.tsx](src/components/map/StudentEmergencyVideoCard.tsx), and [StudentEmergencyVideoOverlay.tsx](src/components/map/StudentEmergencyVideoOverlay.tsx). This acceptance continuation changed two test queries in [TestNavigationPanel.roomRouting.test.ts](src/components/map-builder/__tests__/TestNavigationPanel.roomRouting.test.ts) to expect passive SVG transition markers to have image semantics when no click handler is supplied. The browser driver, JSON results, screenshots, and this report are under `verification-artifacts/emergency-video-test-only/`.

## Admin workflow, limitations, and release setup

Admin browser checks now cover Object Library placement preview, midpoint edge splitting and route-attribute preservation, movement/rename/building assignment/review, undo/redo, deletion cleanup, and save/reload. Additional checks confirm placement directly over an existing outdoor waypoint reuses its graph ID and keeps incident edges, while an off-path point starts disconnected and the Properties action authors a real connector to an existing waypoint. The connector survived draft save and reload with no dangling edges. These checks used a test-only editor clone and blocked every remote mutation. A separate isolated publication action was not exercised in this continuation.

### Admin screenshots

- [Object Library tool, desktop 1440](assembly-point-admin-object-library-1440.png)
- [Path midpoint placement preview](assembly-point-admin-placement-preview-1440.png)
- [Approved point Properties](assembly-point-admin-properties-approved-1440.png)
- [Existing waypoint reused](admin-waypoint-reuse/assembly-point-admin-existing-waypoint-1440.png)
- [Disconnected point Properties](admin-disconnected-connect/assembly-point-admin-disconnected-properties-1440.png)
- [Explicit connector and Connected status](admin-disconnected-connect/assembly-point-admin-explicit-connection-1440.png)
- [Explicit connector after draft reload](admin-disconnected-connect/assembly-point-admin-explicit-connection-reloaded-1440.png)

No actual Assembly Point was added to the published campus, and no real route was approved or published. Before student release, authorized campus safety personnel must select and approve each real gathering location, connect it to a physically verified route network, assign buildings, review complete routes, and publish the resulting snapshot. A system approval or graph check is not a professional site-safety assessment.

The updated Route B browser harness now uses bounded waits and the actual Resume/Next controls. The earlier timeout was a test-driver omission: it resumed Step 10, while the remaining arrival instruction still required the visible Next action. With that interaction, actual terminal arrival and camera framing were verified. The browser emitted no page errors in the Route B follow-up; one Admin reload run reported the existing React Motion `ref` warning.

## Latest continuation

The isolated Browser runs read the published snapshot once to seed the local copy. Synthetic Assembly Point data, review state, edited graph edges, and saved drafts stayed in browser-local test storage. No production map, approvals, video, Storage, or migration writes occurred. The real published campus still has no configured approved Assembly Point, so its unavailable SOS state remains the correct production behavior.

### Defect fixed

Placing an Assembly Point exactly over an existing path waypoint showed the correct snap preview, but the path hit surface stopped the placement mouse event before the map canvas could create the point. The hit surface now lets Assembly Point placement gestures bubble to the placement handler. A focused Canvas regression test passes, and the Admin Chromium run confirms the existing node ID and incident edges are reused. The existing 3D safe-focus adjustment also keeps the outdoor destination visible above mobile route sheets during renderer switches and arrival framing.
