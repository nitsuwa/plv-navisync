# Student Pathfinding UI Simplification — Browser Audit

**Run date:** 2026-10-15  
**Environment:** Local Vite app, Chromium/Playwright, TEST ONLY in-memory campus fixture.  
**Production access:** One read-only published snapshot RPC. No campus, route, approval, video, Storage, or migration writes were made.

## Result

The Student SOS planner now presents one concise unavailable state, one primary reason, and one instruction. The technical diagnostic paragraphs are no longer rendered in the Student status card. The route resolver and its diagnostic model remain intact.

The browser audit exercised the published CABA unavailable state and a connected, approved TEST ONLY Assembly Point fixture. Four authored rooms resolved to the correct single or dual route count in the isolated graph. Chromium reported no page errors, and the tested responsive widths had no horizontal overflow.

## Copy changes

| Before | After |
|---|---|
| Several stacked SOS warnings with assignment, connection, graph, room-to-exit, and review diagnostics | **SOS route unavailable** — “No approved assembly point for this building.” — “Follow posted evacuation instructions.” |
| Repeated “SOS route unavailable” on both the status card and disabled main button | One status message; the button remains **Find Route** and is disabled only for the known unavailable prerequisite |
| “Choose a different destination above … or switch to Standard mode” | Removed from emergency failure messaging |
| Repeated floor/location prose in a stair/elevator transition prompt | “Tap the Right Stair or press Continue.” The main step retains the destination floor |
| Long step list dominating route preview | Steps remain available under a compact disclosure |
| Repeated route destination in secondary summary text | Destination appears once in the compact destination row or route heading |

For a connected approved fixture, the planner shows the destination and Route A/Route B choices. For route preview/arrival, it retains the relevant approval state and the concise instruction to follow campus personnel.

## Student states audited

- **Planning:** Standard, Accessible, and SOS mode controls; start room; automatic SOS destination; unavailable and route-ready states.
- **Unavailable SOS:** CABA from the current published snapshot, which has no approved Assembly Point. The card count was 1, technical `details` disclosures were 0, Find Route was disabled, and no Standard-mode substitute advice appeared.
- **Route preview:** Approved destination row, one route, and two distinct route alternatives. Both Routes cards show concise door-to-exit identities.
- **Active navigation:** Current step, next step, floor transition, Follow/Explore controls, Previous/Continue/speed controls, and compact Steps disclosure. Stair prompt text was shortened without removing the floor from the main instruction.
- **2D and 3D:** Active indoor route views captured for CABA, CEIT, and PLV Auditorium. Assembly Point markers remain SOS-only in the tested Standard and Accessible browsing states.
- **Arrival:** Arrival copy is short in the component and unit coverage, but terminal arrival was not reached in this UI audit.
- **Emergency video:** The current compact video/route coordination tests pass. Earlier browser evidence in [the emergency acceptance report](verification-artifacts/emergency-video-test-only/acceptance-report.md) records sample MP4/VTT playback and route pause/resume coordination. This UI audit did not repeat the full video playback walkthrough.

Technical diagnostics remain in the route availability model and Admin-facing tools; the Student status renderer intentionally does not expose the model's diagnostic list.

## Four-room TEST ONLY route results

All graph counts below come from an isolated in-memory clone of the published MAIN CAMPUS – PLV snapshot. The fixture reused an existing authored outdoor waypoint as `TEST ONLY - Main Assembly Point A`; it did not create a straight-line shortcut or alter production data.

| Room | Display floor | Door/exit result | Routes in fixture | Browser result |
|---|---|---|---:|---|
| Assembly Hall, COED | Ground Floor | 2 connected doors, 1 distinct physical exit | 1 | PASS — single-route state; no Route B |
| CABA Lecture Hall | Floor 6 | 2 route-ready doors, 2 distinct exits | 2 | PASS — Both Routes, active 2D/3D route |
| CEIT Lecture Hall | Floor 6 | 2 route-ready doors, 2 distinct exits | 2 | PASS — Both Routes, active 2D/3D route |
| PLV Auditorium | Floor 5 (internal floor 6) | 3 assigned doors; disconnected door excluded; 2 distinct exits | 2 | PASS — Both Routes, active 2D/3D route; Floor 5 label retained |

Each fixture route reaches the same assigned Assembly Point node. Standard and Accessible views hid the emergency-only point in the tested room flows; SOS showed the assigned destination. These are synthetic approvals and do not represent approved real campus guidance.

## Responsive and visual evidence

The unavailable CABA state was captured at 360×800, 390×844, 430×932, tablet 768×1024, and desktop 1440×900. The four-room fixture was captured at mobile 390×844, with a CABA Both Routes desktop capture at 1440×900. Additional width measurements at 1280×720 and 1920×1080 also matched the viewport width.

No horizontal overflow was measured at 360, 390, 430, 768, 1280, 1440, or 1920px. The 2D/3D screenshots show route geometry and the active step without repeated diagnostic cards. The mobile Both Routes view keeps two exit choices, destination, and one concise posted-guidance reminder visible after expanding the route sheet.

Selected screenshots:

- [CABA SOS unavailable, mobile 390×844](verification-artifacts/emergency-video-test-only/pathfinding-ui-caba-unavailable-390x844.png)
- [CABA SOS unavailable, desktop 1440×900](verification-artifacts/emergency-video-test-only/pathfinding-ui-caba-unavailable-1440x900.png)
- [CABA Both Routes, mobile 390×844](verification-artifacts/emergency-video-test-only/pathfinding-ui-caba-both-routes-mobile-390.png)
- [CABA Both Routes, desktop 1440×900](verification-artifacts/emergency-video-test-only/pathfinding-ui-caba-both-routes-desktop-1440.png)
- [CABA active route, 2D mobile](verification-artifacts/emergency-video-test-only/pathfinding-ui-caba-active-2d-mobile-390.png)
- [CABA active route, 3D mobile](verification-artifacts/emergency-video-test-only/pathfinding-ui-caba-active-3d-mobile-390.png)
- [CEIT Both Routes, mobile](verification-artifacts/emergency-video-test-only/pathfinding-ui-ceit-both-routes-mobile-390.png)
- [PLV Auditorium Both Routes, mobile](verification-artifacts/emergency-video-test-only/pathfinding-ui-auditorium-both-routes-mobile-390.png)
- [Assembly Hall single route, mobile](verification-artifacts/emergency-video-test-only/pathfinding-ui-assembly-hall-single-route-mobile-390.png)
- [Complete Chromium results and measurements](verification-artifacts/emergency-video-test-only/pathfinding-ui-audit-results.json)

## Implementation and regression checks

- [EmergencyRouteStatus.tsx](src/components/map/EmergencyRouteStatus.tsx): one short status, no student-facing diagnostic disclosure, compact destination/approval presentation.
- [UnifiedRoutePlannerDialog.tsx](src/components/map/UnifiedRoutePlannerDialog.tsx): concise route preview, destination, Route A/B, disabled Find Route behavior, compact active steps and controls.
- [RouteErrorState.tsx](src/components/map/RouteErrorState.tsx): shortened error guidance without advising Standard mode as emergency fallback.
- [CampusMapPage.tsx](src/pages/CampusMapPage.tsx): short Explore/arrival/transition copy and consistent SOS state presentation.
- [StudentEmergencyVideoCard.tsx](src/components/map/StudentEmergencyVideoCard.tsx) and [StudentEmergencyVideoOverlay.tsx](src/components/map/StudentEmergencyVideoOverlay.tsx): short supporting copy and labels.
- [Browser audit harness](verification-artifacts/emergency-video-test-only/pathfinding-ui-audit.cjs): TEST ONLY adapter, responsive captures, and isolated four-room route run.
- [RoutePlannerStudentUx.test.tsx](src/components/map/__tests__/RoutePlannerStudentUx.test.tsx), [EmergencyVideoRouteCoordination.integration.test.tsx](src/components/map/__tests__/EmergencyVideoRouteCoordination.integration.test.tsx), [StudentEmergencyVideoCard.test.tsx](src/components/map/__tests__/StudentEmergencyVideoCard.test.tsx), [smartMultiExitEvacuation.workflow.integration.test.tsx](src/lib/__tests__/smartMultiExitEvacuation.workflow.integration.test.tsx), and [emergencyRouteStatus.test.ts](src/lib/__tests__/emergencyRouteStatus.test.ts): **5 files, 66 tests passed**.
- Production build: **passed**. Vite reported the existing large-chunk warning for bundles over 500 kB.
- TypeScript: **not clean**. It reports 1,039 diagnostics, the same count as the saved baseline; diagnostics normalized without line numbers compare equal. No new diagnostic was introduced by this change. [TypeScript log](verification-artifacts/emergency-video-test-only/pathfinding-ui-tsc.log).
- `git diff --check`: **passed**. Git emitted existing LF-to-CRLF working-copy warnings.

## Limits and release note

This browser pass visually verified the real published-data no-approved-destination state and the connected/approved TEST ONLY route fixture. Disconnected, stale, and unapproved variants have focused resolver/component coverage, but were not each captured as separate browser screenshots. Terminal arrival and an actual 2D→3D→2D round trip were not verified in this run. Full video playback browser evidence is in the earlier acceptance report linked above.

The real campus snapshot still has no approved Assembly Point configuration. No evacuation route was published or represented as officially ready. Authorized campus safety personnel must approve real locations and complete routes before student release.
