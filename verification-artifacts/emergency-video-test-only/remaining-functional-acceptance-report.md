# Remaining Emergency Assembly Point Acceptance

**Run date:** 2026-10-15  
**Environment:** Local PLV NaviSync Student Map and actual CampusEditor components in Chromium/Playwright.  
**Data:** TEST ONLY in-memory copy of the read-only published MAIN CAMPUS – PLV snapshot. All browser mutations were blocked from reaching Supabase.

## Result summary

| Acceptance item | Result | Evidence and scope |
|---|---|---|
| Admin Assembly Point place, connect, edit, assign, approve, save and reload | **PASS** | Prior actual-component Admin browser run; the point remained connected to its authored path after rename, move, undo/redo, review, isolated save and reload. |
| CABA Route A final arrival | **PASS** | Actual Student Map completed the room-to-stair-to-campus route and reached `TEST ONLY - Main Assembly Point A`; route phase was `arrived`, final node was `(146, 380)`, and playback stopped. |
| CEIT Route A final arrival | **PASS** | Reused the prior actual Student Map arrival evidence; complete route ended at the test point. |
| PLV Auditorium Route A final arrival | **PASS** | Reused prior actual Student Map arrival evidence; displayed Floor 5 was retained and the disconnected third door stayed excluded. |
| Assembly Hall single-route arrival | **PASS** | Reused prior actual Student Map arrival evidence; one distinct exit and one route, with no fabricated Route B. |
| Outdoor 2D and 3D destination marker | **PASS** | Chromium showed the 2D marker at `(146, 380)` and route casings ending at the same point. The 3D marker rendered on the campus scene, stayed clear of the route panel, and remained visible after returning to 2D. |
| 2D → 3D → 2D during active navigation | **PASS** | CABA remained at Floor 6, step 3 of 11 (`Take the Right Stair down to Floor 5`) in `navigating` state throughout the renderer round trip. No browser errors occurred. |
| Same renderer round trip while the student is already outdoors and still navigating | **NOT VERIFIED** | The CABA outdoor leg completed quickly after the authored exit Continue action; the captured outdoor 2D/3D/2D marker evidence is at `arrived`. The active-route round trip was captured on Floor 6. |
| Disconnected Assembly Point status | **PASS** | One unavailable card: “No route reaches the assembly point.” Find Route disabled; no technical diagnostics leaked. |
| Unapproved Assembly Point status | **PASS** | One unavailable card: “No approved assembly point for this building.” Find Route disabled. |
| Stale Assembly Point review | **PASS** | One unavailable card: “No approved assembly point for this building.” Find Route disabled. |
| Stale room-route approval | **PASS** | One “Evacuation route needs review” card; Find Route stayed enabled for a complete graph preview, the preview remained marked review-required, and Start was disabled pending review. |

## CABA arrival and route playback

The actual browser route began at CABA Lecture Hall, Floor 6. The earlier accepted Route A run recorded all steps through the indoor stair, Ground Floor, exterior egress, outdoor path, and terminal arrival. This continuation again used the visible Continue action at the first stair transition, observed the authored floors progress from Floor 6 to Floor 5, Floor 4, Floor 3, Floor 2, and Ground Floor, then used Continue at the exterior exit. The map reached the Assembly Point naturally; no route cursor or terminal state was set by the test.

The saved arrival evidence shows **“Arrived at TEST ONLY - Main Assembly Point A”**, a stopped playback state, and the arrival camera focused at the Assembly Point rather than the previous stair. The final route waypoint and 2D marker both resolve to `(146, 380)`. The outdoor destination marker in 3D was visible with no overlap against the mobile route sheet.

The route B alternative remained a distinct selectable CABA exit in the earlier result, but this focused continuation did not replay its terminal arrival. The CEIT, Auditorium, and Assembly Hall Route A arrivals are reused from the accepted prior browser run rather than repeated.

## Admin Assembly Point editing

The actual Outside Map Builder/CampusEditor browser harness verified the Safety Object Library tool, path snap preview, placement on a real authored outdoor path, selection, rename, move, building assignment, review, approval under an isolated `admin` test role, undo/redo, and isolated draft save/reload. Moving the point kept its marker and navigation anchor aligned and changed approval to Needs Re-review; the test reviewer then reapproved the isolated fixture. Reload restored the point, assignment, connected status, approval, and two incident edges.

This was an isolated local editor session with a synthetic authorized wrapper and local draft serialization. It was not a signed-in production Admin session and did not publish a campus snapshot.

## 2D / 3D and mobile evidence

The mid-route renderer round trip preserved the phase, floor, current instruction, and step exactly. The indoor 3D canvas initialized and rendered the active route context before returning to the same 2D state. At the outdoor arrival, both renderers showed the same TEST ONLY point; 2D route casings ended at its world anchor, and the 3D label stayed on screen without covering the route panel.

The prior responsive pass covers 360×800, 390×844, 430×932, tablet, and desktop widths with no horizontal overflow. The new failure-state runs were captured at 390×844. This continuation did not re-run the full responsive matrix.

## SOS status fixes

Browser testing found two real integration issues and they were corrected:

1. An assigned point with no valid outdoor connection was reported as the generic “No emergency route found” when the graph also had no egress candidate. Failure selection now prioritizes that concrete disconnected-destination state when an assigned point has zero valid connections. The actual student message is “No route reaches the assembly point.”
2. A stale room approval had a complete graph route and showed Find Route as enabled, but the click handler refused to produce its preview. The handler now allows a graph-only preview only when the resolved state is `review-required`; incomplete or unavailable routes remain blocked.
3. To preserve the approval boundary, a stale or otherwise unapproved emergency preview cannot be started. The review status and posted-instructions guidance remain visible, while Start is disabled until current Admin review exists.

Changed implementation and focused regression coverage:

- [emergencyRouteStatus.ts](../../src/lib/emergencyRouteStatus.ts)
- [CampusMapPage.tsx](../../src/pages/CampusMapPage.tsx)
- [UnifiedRoutePlannerDialog.tsx](../../src/components/map/UnifiedRoutePlannerDialog.tsx)
- [emergencyRouteStatus.test.ts](../../src/lib/__tests__/emergencyRouteStatus.test.ts)
- [RoutePlannerStudentUx.test.tsx](../../src/components/map/__tests__/RoutePlannerStudentUx.test.tsx)

## Chromium screenshots and result files

### Admin

- [Emergency Assembly Point in Object Library — 1440px](assembly-point-admin-object-library-1440.png)
- [Path placement preview — 1440px](assembly-point-admin-placement-preview-1440.png)
- [Connected, assigned and approved Properties — 1440px](assembly-point-admin-properties-approved-1440.png)
- [Reloaded point and connection — 1440px](assembly-point-admin-reloaded-1440.png)
- [Admin browser results](assembly-point-admin-browser-results.json)

### Student route and renderer

- [CABA active route 2D — 390px](assembly-point-caba-active-roundtrip-2d-mobile-390.png)
- [CABA active route 3D — 390px](assembly-point-caba-active-roundtrip-3d-mobile-390.png)
- [CABA active route returned to 2D — 390px](assembly-point-caba-active-roundtrip-return-2d-mobile-390.png)
- [CABA outdoor arrival 2D — 360px](assembly-point-caba-arrival-outdoor-2d-mobile-360.png)
- [CABA outdoor arrival 3D — 390px](assembly-point-caba-arrival-outdoor-3d-mobile-390.png)
- [CABA desktop arrival — 1440px](assembly-point-caba-arrival-desktop-1440.png)
- [CABA active renderer round-trip results](assembly-point-caba-active-renderer-roundtrip-browser-results.json)
- [CABA Route A arrival results](assembly-point-caba-browser-results.json)
- [CEIT arrival results](assembly-point-ceit-browser-results.json)
- [Auditorium arrival results](assembly-point-auditorium-browser-results.json)
- [Assembly Hall arrival results](assembly-point-assembly-hall-browser-results.json)

### SOS failure states — 390px

- [Disconnected Assembly Point](assembly-point-status-disconnected-390.png)
- [Unapproved Assembly Point](assembly-point-status-unapproved-390.png)
- [Stale Assembly Point review](assembly-point-status-stale-point-390.png)
- [Stale route approval preview with Start disabled](assembly-point-status-stale-route-route-preview-390.png)
- [Disconnected status browser result](assembly-point-status-disconnected-browser-results.json)
- [Unapproved status browser result](assembly-point-status-unapproved-browser-results.json)
- [Stale point status browser result](assembly-point-status-stale-point-browser-results.json)
- [Stale route status browser result](assembly-point-status-stale-route-browser-results.json)

## Automated checks

- Focused Vitest: **71 passed across 4 files** — emergency status resolution, Student route planner, Smart Multi-Exit integration, and Smart Multi-Exit workflow.
- Production build: **passed**. Existing large-chunk warnings remain, including the Student Map and Admin Map Builder bundles.
- TypeScript: **not clean** — 1,039 diagnostics, matching the saved baseline exactly; normalized comparison found zero new diagnostics.
- `git diff --check`: **passed**. Git emitted line-ending conversion advisories only.
- Emergency video playback was not repeated.

Logs: [production build](remaining-functional-build.log), [TypeScript baseline comparison input](remaining-functional-tsc.log), and [diff check](remaining-functional-diff-check.log).

## Isolation and remaining limits

- Student tests used an in-memory TEST ONLY clone of a read-only published snapshot. The browser adapter denied remote writes; no actual map, approval, publication, migration, storage, or production route changed.
- Admin save/reload used local isolated draft serialization. No real publication was performed.
- Route B terminal arrival was not repeated. CABA, CEIT, Auditorium, and Assembly Hall Route A terminal arrivals are verified; the three non-CABA results are reused from the prior acceptance run.
- The same renderer round trip during an outdoor `navigating` phase remains unverified because the active CABA route reached `arrived` shortly after the exit transition. The active Floor 6 round trip and the outdoor arrival marker in 2D/3D are individually verified.
- The Admin run still logs a non-fatal Motion `ref is not a prop` warning; editing and persistence checks completed.
- Test approvals and locations are synthetic. Real assembly areas, building exits, and evacuation routes still require authorized campus safety review.
