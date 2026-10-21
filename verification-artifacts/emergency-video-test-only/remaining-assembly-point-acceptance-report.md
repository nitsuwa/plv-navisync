# Remaining Assembly Point Acceptance Checks

**Run date:** 2026-10-15  
**Environment:** Local PLV NaviSync Student Map and actual `CampusEditor` component in Chromium/Playwright. This report completes the Admin editing, terminal arrival, and outdoor marker checks left open in the earlier acceptance report.

## Isolation

Student runs used an in-memory TEST ONLY copy of a read-only published MAIN CAMPUS – PLV snapshot. The test adapter supplied an isolated approved point at `(146, 380)` on the existing outdoor graph and blocked remote writes. Admin editing mounted the actual Outside Map Builder editor in a synthetic authorized `admin` test wrapper; save/reload used isolated draft persistence. No real campus edits, approvals, publication, Supabase writes, or migrations occurred. The synthetic student approval is test data, not campus safety approval.

## Results

| Check | Result | Evidence |
|---|---|---|
| Admin object library and path snap | **PASS** | Emergency Assembly Point appeared in the Safety library; placement preview identified a real outdoor path. |
| Admin placement and graph connection | **PASS** | Point created as an assembly navigation node on an existing authored path, with two incident traversable edges and Connected status. |
| Select, rename, assign, move | **PASS** | Renamed to `TEST ONLY - Admin Main Assembly Point A`, assigned to CABA, and moved while remaining attached to its path anchor. |
| Undo/redo and approval invalidation | **PASS** | Undo/redo removed/restored creation and movement. Moving the point set its review to Needs Re-review; the isolated `admin` role reapproved it for persistence verification. |
| Draft save and reload | **PASS** | Name, position, graph anchor, connection, assignment, and approval reloaded together. The marker and graph anchor remained aligned with two incident edges. |
| CABA Route A terminal arrival | **PASS** | Actual UI playback advanced through Floor 6, 5, 4, 3, 2, and Ground Floor, continued through the authored exterior-stair transition and outdoor path, then arrived at the Assembly Point. |
| CEIT Route A terminal arrival | **PASS** | Completed through its authored floor transitions and exterior stair to the same connected point. |
| PLV Auditorium Route A terminal arrival | **PASS** | Completed from displayed Floor 5 (internal floor 6); disconnected assigned door stayed ineligible. |
| Assembly Hall single-route arrival | **PASS** | One route and one distinct exit; no Route B; arrival reached the Assembly Point. |
| Outdoor 2D marker and route geometry | **PASS** | SOS marker at world `(146, 380)`; each applicable route polyline ended at that marker. After pan/zoom, measured screen endpoint deltas were zero (floating-point epsilon only); no overlap with the route panel. |
| Outdoor 3D marker and renderer switch | **PASS** | Marker label rendered on the 3D map, stayed clear of the navigation panel, and the route remained in `arrived` after 2D→3D→2D. Ground anchoring uses the renderer’s small ground epsilon. |
| Marker hidden outside SOS | **PASS** | Browser check found no Assembly Point marker in Standard, Accessible, or indoor SOS planning; marker was visible in outdoor SOS. The visibility check had no page errors or horizontal overflow at 390px. |
| Desktop/mobile layout | **PASS** | No horizontal overflow at 360×800, 390×844, 430×932, 768×1024, 1280×720, 1440×900, or 1920×1080. Outdoor 2D/3D screenshots show the destination above the bottom navigation sheet. |

## Four-room route summary

The isolated fixture preserves the authored exits and uses one shared destination. Route A playback reached arrival in all four rooms. The dual-exit routes remained distinct even though they share the same Assembly Point.

| Room | Display floor | Assigned doors / eligible physical exits | Alternatives | Arrival result |
|---|---|---:|---:|---|
| Assembly Hall — COED | Ground Floor | 2 connected doors / 1 exit | 1 | **PASS** — arrived; Route B unavailable. |
| CABA Lecture Hall | Floor 6 | 2 route-ready doors / 2 exits | 2 | **PASS** — Route A arrived; Route B remained selectable as a separate alternative. |
| CEIT Lecture Hall | Floor 6 | 2 route-ready doors / 2 exits | 2 | **PASS** — Route A arrived; both alternatives resolve to the same point. |
| PLV Auditorium | Floor 5 (internal floor 6) | 3 assigned doors; 2 route-ready / 2 exits | 2 | **PASS** — Route A arrived; the disconnected door remained excluded. |

For the completed CABA run, the arrival screen read **“Arrived at TEST ONLY - Main Assembly Point A”** and **“Follow campus personnel's instructions.”** A DOM mutation observer recorded steps **3–11 consecutively** (the route had already opened at step 3); the active instructions included the Ground Floor path to Exterior Stair 1, exit to campus, outdoor path to the point, and the final arrival step. Playback stopped, route phase was `arrived`, and the arrival camera target was the campus point `(146, 380)`, not the previous stair. The route record’s final waypoint matched the Assembly Point node. No browser errors or post-arrival transition changes were observed. CEIT, Auditorium, and Assembly Hall have the same arrival title, stopped playback, and campus camera target in their captured run results.

## Fixes made during these checks

- Linked Assembly Point markers now move with their generated outdoor path anchor. This fixes a drag case where the graph anchor moved but the marker stayed behind. The edit correctly invalidates dependent approval.
- 3D arrival focus now offsets along the projected screen-up vector. This fixes mobile arrival framing that could leave the point obscured by the navigation sheet.
- Added regression coverage for path-anchor movement and the compact mobile arrival sheet.

## Browser evidence

All images below are actual Chromium screenshots. “TEST ONLY” labels identify the isolated fixture.

### Admin editor

- [Safety Object Library — 1440px](assembly-point-admin-object-library-1440.png)
- [Path placement preview — 1440px](assembly-point-admin-placement-preview-1440.png)
- [Approved properties and building assignment — 1440px](assembly-point-admin-properties-approved-1440.png)
- [Reloaded point and connection — 1440px](assembly-point-admin-reloaded-1440.png)
- [Admin browser results](assembly-point-admin-browser-results.json)

### Student route arrival and marker

- [CABA 2D outdoor arrival — 360px](assembly-point-caba-arrival-outdoor-2d-mobile-360.png)
- [CABA 3D outdoor arrival — 390px](assembly-point-caba-arrival-outdoor-3d-mobile-390.png)
- [CABA arrival — 1440px](assembly-point-caba-arrival-desktop-1440.png)
- [CABA Both Routes — 1440px](assembly-point-caba-both-routes-desktop-1440.png)
- [CEIT 2D arrival — 360px](assembly-point-ceit-arrival-outdoor-2d-mobile-360.png)
- [CEIT 3D arrival — 390px](assembly-point-ceit-arrival-outdoor-3d-mobile-390.png)
- [Auditorium 2D arrival — 360px](assembly-point-auditorium-arrival-outdoor-2d-mobile-360.png)
- [Auditorium 3D arrival — 390px](assembly-point-auditorium-arrival-outdoor-3d-mobile-390.png)
- [Assembly Hall 2D arrival — 360px](assembly-point-assembly-hall-arrival-outdoor-2d-mobile-360.png)
- [Assembly Hall 3D arrival — 390px](assembly-point-assembly-hall-arrival-outdoor-3d-mobile-390.png)
- [Standard mode marker hidden — 390px](assembly-point-standard-marker-hidden-390.png)
- [Accessible mode marker hidden — 390px](assembly-point-accessible-marker-hidden-390.png)
- [CABA browser results](assembly-point-caba-browser-results.json)
- [CEIT browser results](assembly-point-ceit-browser-results.json)
- [Auditorium browser results](assembly-point-auditorium-browser-results.json)
- [Assembly Hall browser results](assembly-point-assembly-hall-browser-results.json)
- [Mode visibility browser results](assembly-point-marker-visibility-browser-results.json)

## Verification

- Focused tests: **65 passed across 4 files** (`student3dCameraFocus`, `emergencyAssemblyPoints`, `studentRouteFlow`, and Smart Multi-Exit workflow integration).
- Production build: **passed**. Vite still reports existing large chunks above 500 kB, including the Student Map and Admin Map Builder bundles.
- TypeScript: **not clean** — 1,039 diagnostics, the existing baseline count. The saved normalized comparison found no new diagnostics from the Assembly Point fixes.
- `git diff --check`: **passed**. Git emitted working-copy LF-to-CRLF advisories only.
- Video playback was not repeated in this continuation, as requested.

## Remaining limits

- The Admin browser harness exercised the real editor component and local draft save/reload inside a synthetic authorized `admin` wrapper. It did not exercise a signed-in Admin production route, remote persistence, or publication.
- The completed terminal walkthroughs used Route A. CABA Route B was confirmed selectable and distinct; terminal playback of Route B was not repeated in this remaining-check pass.
- The Admin browser emitted a non-fatal React `ref is not a prop` warning from Motion's `PopChild`; the placement, edit, undo/redo, and reload checks completed.
- Real campus Assembly Points, exit approvals, and evacuation plans still require authorized campus safety review. No test result should be read as real-world safety certification or release approval.
