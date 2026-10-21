# PLV NaviSync — Final SOS Routing Audit

Audit date: 2026-10-18. This report separates published MAIN CAMPUS evidence from TEST ONLY fixture results.

## A. Testing environment

- The current published MAIN CAMPUS snapshot was read through Chromium with remote mutations blocked. Latest version: `796ca114-5a70-44d3-92b1-4c8db11b7eac`, published 2026-10-13.
- No isolated staging Supabase project is configured. The local environment selectors point to the same production project, and campus duplication/publishing uses that project. Creating or publishing a copy there could expose it to students, so no duplicate was created or published.
- Browser end-to-end work used a local saved draft named **TEST ONLY - Isolated Assembly Point Editor** and an in-memory published-like adapter. Supabase writes were blocked; the room-video RPC was also blocked. No video or Storage content was touched.
- For positive route cases only, the harness marked 12 fixture stair assets/edges emergency-eligible and approved the fixture Assembly Point in memory. Those assumptions do not establish real-campus safety.
- The original published MAIN CAMPUS, editable campus geometry, approvals, Assembly Point assignments, database schema, and publication state were not changed.

## B. Automatic SOS routing

The route planner discovers doors, authored indoor paths, stair occurrences, exterior stair discharge nodes, building egresses, outdoor graph paths, and assigned Assembly Points from the existing campus graph. It does not need saved room Route A/B assignments.

It calculates complete paths first and only ranks candidates that pass the canonical emergency eligibility assessment. The resulting policy is:

1. A complete direct same-level Emergency Exit is preferred when it avoids an unnecessary stair detour.
2. A complete exterior emergency stair route is preferred over a regular-stair egress, including a route that first descends on eligible indoor stairs to a lower floor served by the exterior stair.
3. Eligible ordinary stairs can lead to a lower-floor Emergency Exit or another permitted building egress when no complete exterior-stair route is available.
4. A general entrance is a final egress fallback. Passenger elevators are not treated as emergency-safe vertical transitions.

Exterior stairs must be open, explicitly designated emergency-safe, connected through their authored served-floor occurrences, and connected from their discharge to the outdoor network. Unknown stairs and unresolved edge metadata remain blocked. No missing landing or graph edge is synthesized.

Fixed Primary resolves the approved assigned Primary Assembly Point. Nearest Eligible is used only when configured. Campus Gate fallback is allowed only when no Assembly Point is assigned; an assigned but disconnected point does not silently fall back. Both alternatives must end at the same resolved destination and independently pass eligibility.

The mixed-floor regressions now cover same-level exit priority, an indoor-stair-to-lower-floor-exterior-stair route, a ground-only exterior stair reached from an upper floor, a disconnected landing, blocked exterior stairs, eligible ordinary-stair fallback, and safe rejection of unresolved CABA stairs.

## C. Route coverage

### Published MAIN CAMPUS — read-only evidence

The published snapshot contains **zero Assembly Point entities**. Buildings consequently have no published Assembly Point assignment. The only published destination available to the tested routes is Campus Gate fallback.

| Building / sample | Published Assembly Point | Tested egress result | Student availability | Status / blocker |
|---|---|---|---|---|
| CABA / CABA-201, Floor 2 | None | Two graph-connected candidates reach a Ground Floor exterior stair and Campus Gate; both require unresolved ordinary-stair/edge eligibility | No eligible route; Start remains unavailable | **BLOCKED BY DATA** |
| CABA / upper-floor sample | None | No eligible route in the sampled upper-floor path | No complete emergency-safe Campus Gate route | **BLOCKED BY DATA** |
| CANTEEN | None | No room with authored Door access was available to sample | Not established | **NOT VERIFIED** |
| COED / ground and upper-floor samples | None | One eligible Campus Gate route for each sampled room; the current selected graph path remains within the COED building graph | Gate fallback is usable for those samples; no Assembly Point arrival | **PASS** for tested Gate paths; Assembly Point **BLOCKED BY DATA** |
| CEIT / ground-floor sample | None | Two eligible Campus Gate candidates | Gate fallback is usable for the sampled room | **PASS** for tested Gate paths; Assembly Point **BLOCKED BY DATA** |
| CEIT / upper-floor sample | None | Connected candidates require stair eligibility that is not established | No eligible route | **BLOCKED BY DATA** |
| Student Center / sampled ground and upper floors | None | Two eligible Campus Gate candidates in each tested sample | Gate fallback is usable for those samples; no Assembly Point arrival | **PASS** for tested Gate paths; Assembly Point **BLOCKED BY DATA** |

The earlier COED concern about a candidate crossing CANTEEN's interior was **not reproduced** on the current sampled COED paths. This does not verify every COED room or establish an Assembly Point route.

### CABA-201 connection trace

CABA's authored floor labels are explicit: floor number 1 is **Ground Floor** (`29938739-2688-4436-836e-ddbf5e89cd27`); floor number 2 is **Floor 2** (`a0d6e1e6-0ea3-4118-9e86-4d3f0f9937d3`). Both exterior emergency stairs serve Ground Floor only. Their authored open/safe metadata and outdoor nodes do not create access from Floor 2.

CABA-201 (`a70e7c23-8866-4f73-acca-0f24a272c76d`) has two authored Doors. Candidate paths use an ordinary stair to reach Ground Floor, then a Ground Floor exterior emergency stair:

- Right Stair candidate: transition edge `677a5a24-9d4d-4855-8011-9eacb0944a2a`; Floor 2 stair `d274be75-6a2e-4f83-bae2-5355e431bae6`; Ground Floor stair `e544a56a-2aa2-410a-bc8e-44b0804a6087`.
- Left Stair candidate: transition edge `23c676f3-27fc-4d8c-9308-8a1571c89b6c`; Floor 2 stair `06a37ec2-ed12-415b-9f43-54fdc896d0ca`; Ground Floor stair `db24d52c-1457-485f-a5b5-d89df4fc977e`.

Both paths are graph-connected, but their transitions and ordinary Stair assets have not been designated for emergency use. The Student resolver correctly rejects both; it does not let Campus Gate fallback bypass the same safety gate. There is no published Assembly Point to test as CABA-201's destination.

### TEST ONLY fixture evidence

The browser fixture uses the saved CABA Lecture Hall on Floor 6 and a TEST ONLY Primary Assembly Point. After in-memory eligibility assumptions, the engine discovered two complete alternatives through distinct exterior emergency stairs (273 m and 305 m), both ending at the same fixture Assembly Point. The selected route descended on actual authored ordinary stair transitions to Ground Floor, approached the exterior stair, handed off to the outdoor network, followed campus paths, and reached the named Assembly Point.

This verifies mixed-stair discovery and playback in software only. It does not certify the corresponding MAIN CAMPUS stairs.

## D. Student UI and Chromium results

The fixture flow ran in Chromium at 320×568, 360×640, 390×844, 430×932, 768×1024, 1024×768, and 1440×900 in light mode. Dark mode was also exercised at 320×568 and 1440×900. Each run started navigation, progressed through the multi-floor route, switched 2D ↔ 3D and back, and arrived at the exact fixture Assembly Point.

Route A/B controls are visible in the preview screenshots. Playwright successfully selected Route B and confirmed the destination remained unchanged at 320×568, 360×640, 390×844, 768×1024, 1024×768, and 1440×900 in light mode, and 1440×900 in dark mode. At 430×932 and dark 320×568 the responsive selector was not detected by the harness, so browser Route B interaction at those two combinations is **NOT VERIFIED**; unit/component tests cover the route chooser.

### Screenshots

- [320×568 light Route B preview](viewport-320x568/student-automatic-sos-route-preview-320.png)
- [320×568 light 3D stair transition](viewport-320x568/student-automatic-sos-active-3d-320.png)
- [320×568 light 2D arrival](viewport-320x568/student-automatic-sos-arrival-2d-320.png)
- [390×844 light Route B preview](test-only-browser-390x844/student-automatic-sos-route-preview-390.png)
- [1440×900 light Route B preview](viewport-1440x900/student-automatic-sos-route-preview-1440.png)
- [1440×900 light 3D stair transition](viewport-1440x900/student-automatic-sos-active-3d-1440.png)
- [1440×900 light Assembly Point arrival](viewport-1440x900/student-automatic-sos-arrival-2d-1440.png)
- [320×568 dark preview](dark-320x568/student-automatic-sos-route-preview-320.png)
- [1440×900 dark preview](dark-1440x900/student-automatic-sos-route-preview-1440.png)
- [Published CABA-201 unavailable state, 390px](main-campus-caba201-sos-unavailable-deep3-390.png)
- [Published CABA-201 unavailable state, desktop](main-campus-caba201-sos-unavailable-deep3-1440.png)

Active 3D screenshots show the current stair transition cue and floor label; 2D/3D switching returns to the same route step. The test harness records one blocked room-video read RPC (403 by design); it did not attempt a media upload or Storage write. Arrival chime behavior has focused hook tests, but audible output was not evaluated by a human in headless Chromium.

## E. Defects fixed and regression coverage

- **Mixed-route ranking:** a same-level Emergency Exit now outranks a needless exterior stair detour, while a complete exterior-stair route remains preferred when it starts with an eligible indoor stair descent. Coverage is in `TestNavigationPanel.roomRouting.test.ts`.
- **Compact map route labels:** campus map route overlays use `Route A` / `Route B` while retaining descriptive exit names in route instructions and the route sheet.
- **Mobile building inspection during planning:** the route planner previously hid the building detail sheet whenever planning was active, leaving its suspend-and-return UI unreachable. Selecting a building from the map now opens the details sheet and suspends the planner while preserving the selected route form; returning restores it.
- **Stale integration expectations:** the Accessible note assertion now checks current copy, and the room details layout test now checks the actual fixed stack plus relative card ownership.

Changed source/test files include `src/components/map-builder/TestNavigationPanel.tsx`, `src/components/map-builder/__tests__/TestNavigationPanel.roomRouting.test.ts`, `src/lib/studentEmergencyEvacuation.ts`, `src/pages/CampusMapPage.tsx`, and `src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx`. The reusable TEST ONLY Chromium harness is `../sos-priority-audit-20261018/test-only-sos-playback.cjs`.

## F. Admin corrections required before real Assembly Point evacuation

No production correction was made. Campus personnel should:

1. Confirm whether the CABA Floor 2 and Ground Floor Left/Right stairs are physically suitable for emergency descent. If they are, establish their authoritative emergency-use metadata and the two transition edge eligibility states after physical review. If not, author a physically correct alternate route; do not connect stairs based on visual proximity.
2. Publish an approved Assembly Point entity with a valid outdoor navigation anchor, then assign it as the appropriate building Primary. Recalculate against the published version and confirm the whole path from room Door to exact Assembly Point endpoint.
3. Review CEIT's upper-floor stairs and inspect CANTEEN rooms lacking authored Door access. Confirm other building paths before claiming campus-wide readiness.

The legacy Fixed Primary default works without the pending destination-policy migration. Persistently selecting Nearest Eligible requires the policy setting to be available in the deployed schema/configuration; no migration was run here.

## G. Verification and release gate

- **PASS:** 20 focused test files, 424 tests.
- **PASS:** Chromium fixture route completion, 2D/3D switching, named TEST ONLY Assembly Point arrival, and supported viewport runs listed above.
- **PASS:** Production build. Vite reports large output chunks over 500 kB; build completed successfully.
- **PASS:** `git diff --check` (only existing LF/CRLF conversion warnings).
- **NO NEW TYPESCRIPT DIAGNOSTICS:** baseline 1,029; current 1,029; 0 new and 0 resolved diagnostic identities. The repository's `tsc --noEmit` command exits 1 on the same pre-existing diagnostics.
- **BLOCKED BY DATA:** production MAIN CAMPUS has no published Assembly Point entities, and CABA-201's only connected candidates require stair/edge emergency-use confirmation. Do not describe real Student Assembly Point evacuation as ready.
- **NOT VERIFIED:** production CANTEEN route; Route B browser interaction at 430×932 and dark 320×568; headless audible chime; campus-wide room-by-room physical eligibility.

**Software readiness:** automatic discovery, complete-path safety gating, mixed-floor route selection, fallback labeling, and playback are covered and passing in code/tests. **Operational readiness:** MAIN CAMPUS still needs authoritative stair eligibility and a published, assigned, connected Assembly Point before students can reach an Assembly Point in real SOS navigation.
