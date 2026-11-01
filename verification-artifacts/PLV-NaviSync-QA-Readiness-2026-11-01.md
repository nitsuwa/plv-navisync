# PLV NaviSync — QA and Product Readiness Report

**Assessment date:** 2026-11-01
**Branch:** feature/map-builder-final-polish
**Overall verdict:** **PARTIAL**
**Release recommendation:** **READY FOR CONTROLLED USER TESTING**, with the gates below. This does not recommend broad public release or relying on Admin Map Builder persistence.

## 1. Executive summary

PLV NaviSync’s primary Guest workflow is substantially usable in the tested browser: the campus map loaded, Buildings and Rooms could be found, 2D/3D and Building/Floor context switches worked, and the authored Campus Gate → Canteen → COED → Elevator 1 → Floor 3 → COED 303 route was completed through Arrival and Done. An accessible version of that route was calculated and started. The production build served the map, captured data requests succeeded, and the QR scanner opened and released its camera stream when closed.

This supports controlled acceptance testing of Guest wayfinding. It does **not** establish that every important workflow is release-ready. No authenticated Student session was exercised; no authenticated Admin edit/save/reload/publish workflow was tested against isolated data; and no QR code was decoded. Visual 3D frame quality and pacing could not be assessed because the preview window was covered. The captured console did log two Three.js WebGL context-loss messages.

The public-facing experience displayed QA/test content and inconsistent directory information, including Buildings named with “TEST,” a “QA TEST Event Flow” event, duplicate Canteen entries, and a CABA story/Floor-count mismatch. The environment behind the read-only Supabase requests could not be classified as production or staging. These are release-data risks requiring an owner review, not authorization to edit records.

**Answer to the final question:** Guests can likely discover locations and complete the tested cross-campus/indoor route. Students may be confused by the existing-account sign-in path, and account-only features remain unverified. Administrators have a substantial management surface in code, but safe end-to-end editing and persistence are not proven. The main immediate user frustrations are visible test/inconsistent campus content and the Student sign-in route. The main operational risks are unverified Admin persistence, actual QR decoding, and 3D stability on target devices.

## 2. Scope, safety, and evidence method

This work continued the existing acceptance run; it did not repeat every previous interaction or alter source/data. The shared worktree already contained extensive modified and untracked work. It was preserved as found.

- No source code, published map data, Supabase records, or Storage objects were changed by this QA continuation.
- No Admin publish action was run. No destructive Admin action was run.
- Browser evidence came from the local Vite development preview and a local production-build preview. Requests to the configured Supabase endpoint were reads; whether that backend is staging or production is unknown.
- The built preview ran on loopback. Its elapsed times must not be extrapolated to campus Wi-Fi, mobile devices, or public networks.
- Existing screenshots linked below are artifacts from this QA worktree. A new production screenshot could not be captured because the Freebuff browser window was covered. No FPS figure is claimed.
- The temporary production preview started for this task was stopped afterward. The pre-existing development preview on port 4173 was left running.

### Evidence levels

| Level | Meaning |
|---|---|
| **L1 — Live browser** | The actual running application was opened and the described interaction was performed. |
| **L2 — Automated test** | An existing automated test with assertions passed. This does not prove visual quality or real-device behavior. |
| **L3 — Code inspected** | A route or implementation exists in source, but the workflow was not verified at runtime. |
| **L4 — Not tested / blocked** | Evidence was unavailable, unsafe to obtain against live data, or dependent on an unavailable fixture/device/account. |

### Application inventory and coverage

The route inventory is based on [routes.tsx](src/app/routes.tsx#L192) and startup wiring in [App.tsx](src/app/App.tsx#L1). “Implemented” means a route/UI exists, not that the complete workflow passed acceptance.

| Product area | Entry point and intended workflow | Implementation and dependencies | Acceptance status |
|---|---|---|---|
| **Guest features** | Landing, Map, Buildings directory/details, Help; discover a place and open it on the map. | Public routes; published campus/building/room data and Supabase read access. | **PARTIAL — L1.** Landing/Map navigation and map search/selection were exercised. Directory rendered 17 Buildings across 3 campuses, but visible test/duplicate/inconsistent content needs review. Help was not deeply exercised. |
| **Student features** | Home, profile, favorites, reports, settings, events and event editing. | Routes under /home and /student/*; session and role/access data for protected actions. | **PARTIAL — L3/L2.** Routes and focused component tests exist. No authenticated Student session was available for acceptance. Guest preferences are covered below. |
| **Administrator features** | /admin login; protected /admin-dashboard for users, settings, reports, Buildings, locations, accessibility, announcements, events and logs. | Admin authorization and Supabase data/policies. | **PARTIAL — L2/L3, L4 live.** Unauthenticated dashboard access redirected to /admin. Admin-only pages were not opened with an authorized account. |
| **Shared campus map** | /map; search, select Building/Room, inspect details, change Building/Floor and render 2D/3D. | Published map geometry, campus/Floor data, WebGL for 3D. | **PASS for exercised core switches — L1.** 2D/3D, COED entry, Floor 3, exit to map and context preservation worked. Visual quality and stable WebGL rendering are **PARTIAL/BLOCKED**. |
| **Navigation and route planning** | Route Planner; choose origin/destination/mode, preview, Follow or Explore, transition Floors, arrive and finish. | Authored indoor/outdoor graph, entrances, vertical connectors, Rooms and routing logic. | **PASS for named route — L1; accessible route PARTIAL — L1.** One authored multi-stage route completed. Other route classes and graph correctness were not exhaustively tested. |
| **QR scanning / You Are Here** | Open scanner, scan a location code, set origin and focus map. | Camera permission, QR payload lookup and location data. | **PARTIAL — L1.** Camera stream opened and was released on close. No code was decoded, so origin/destination handoff is **L4**. |
| **Events and announcements** | Guest Event Map, event details and venue selection; public announcements; Student event workflows. | Published event content and event/map location data; account access for student-owned event tasks. | **PARTIAL — L1/L4.** Guest event details and venue selection worked. A QA-named event appeared in the feed. Student event management and announcement interaction were not accepted end to end. |
| **Emergency and accessibility** | Accessible route mode and emergency route interfaces; Admin emergency tools. | Emergency graph policy, accessible connectors, configured exits/assembly points; safe fixtures for emergency tests. | **PARTIAL — L1/L2/L4.** Accessible Campus Gate to COED 303 Floor 3 route calculated and started. Focused emergency/routing tests mostly passed; video-guide tests were blocked by absent MP4/VTT fixtures. No real emergency was simulated. |
| **Settings and preferences** | Menu settings for sound/haptics; Student settings page. | Browser/device capabilities and preference persistence; account for Student-specific settings. | **PARTIAL — L1/L2.** Guest sound/haptic choices persisted when the menu reopened. Student settings has persistence tests, but authenticated persistence/account sync was not verified live. |
| **Admin Map Builder / publishing** | Admin dashboard → Map Builder/Floor Plans; edit map objects/navigation, validate, save/reload, publish. | Authorized Admin session, isolated writable data, graph/geometry validation and publish controls. | **PARTIAL — L2/L3, L4 live.** Focused campus lifecycle/dirty-state tests passed and the route/implementation exists. No isolated authenticated save/reload or publish was performed. |
| **Authentication/account lifecycle** | Register, verify, sign in, restore session, recover password, invite, sign out. | Supabase auth and correct role-specific routes/accounts. | **PARTIAL — L2/L3, L4 live.** Auth lifecycle tests and routes exist; no real account lifecycle was run. Student-facing existing-account navigation appears to land on /admin and needs correction/confirmation. |
| **Loading, errors, system feedback** | Branded initial load, page skeleton/error boundaries, retry, lazy chunk recovery, map loading. | Network, auth bootstrap, campus data, dynamic imports and browser rendering. | **PARTIAL — L1/L2/L3.** Initial map loaded and captured requests succeeded; dynamic 3D assets loaded on demand. Forced network/chunk failure recovery and retry were not live-tested. |

## 3. Important interaction audit

This records controls actually exercised in the available acceptance run. It is **not** a claim that every control on every route was clicked.

| Screen/workflow | Controls exercised | Expected | Actual / status |
|---|---|---|---|
| Public Home / Map | Home/Map navigation; open Map; return between areas. | Navigate to the correct page without losing the application. | Worked in browser. **PASS — L1.** |
| Campus Map | Search “COED 303”; inspect duplicate result labels; select Floor 4 result; switch 2D/3D; enter COED; select Floor 3; return to 2D/outdoor context. | Keep selected Building/Floor coherent and distinguish same-named Rooms by Floor. | Search showed Floor 3 and Floor 4; selecting Floor 4 updated selected Floor and Room details. Mode switches and Building entry/exit preserved tested context. **PASS — L1.** |
| Building / Room details | Open selected Building and Room information; change selected Floor/Building context during tested route. | Show the matching object and update map context. | COED/Floor 3 and COED 303 selection worked. Other Buildings/Rooms were not comprehensively sampled. **PARTIAL — L1.** |
| Route Planner | Choose endpoints and accessible mode; calculate; start; Follow/Explore; traverse transition; Arrival; Done. | Preserve route/progress through handoffs and arrival. | Standard named route completed; accessible route calculated and started. **PASS for standard scenario; PARTIAL for accessible completion — L1.** |
| Mobile Planner | At 320×568, open Planner and inspect minimized restore state and viewport bounds. | Avoid clipping/overlap and retain a usable restore affordance. | Planner bottom was at y=507; bottom navigation began at y=507; restore pill ended 5 px above navigation; no horizontal overflow was measured. **PASS for this viewport/state — L1.** |
| QR Scanner | Open scanner and close it. | Request camera access, show scanner and release stream on close. | Camera stream opened and its track was released on close. No QR was decoded. **PARTIAL — L1.** |
| Guest account/preferences menu | Reopen sound/haptic settings; select Student sign-in and existing-account link. | Persist preferences and route Student to appropriate auth workflow. | Preferences remained selected. “Student sign in” went to /register; existing-account link went to /admin. The latter is potentially misleading for a Student and is a **P2 issue to resolve**. |
| Event Map | Open Guest Event Map, open an event and choose its venue. | Show details and use the event venue as map context. | Worked. Visible event was “QA TEST Event Flow 0487deca”; backend environment is unknown. **PARTIAL — L1** due to content-hygiene risk. |
| Protected Admin route | Navigate to /admin-dashboard while unauthenticated. | Prevent protected access and offer login. | Redirected to /admin. **PASS for this unauthenticated case — L1.** No authenticated controls were tested. |
| Admin editor controls | Editing, undo/redo, save, reload and publish. | Persist an isolated edit without touching unrelated/live data. | Not exercised in browser; no safe authenticated staging fixture/account was available. **NOT TESTED — L4.** |

### Confirmed interaction concern

**Student existing-account route — P2.** Reproduction: open public account menu → choose “Student sign in” → follow the existing-account sign-in link. The menu first routes to /register; the existing-account link then routes to /admin. Expected behavior is a Student sign-in destination or a clearly role-neutral authentication page. Actual behavior lands on the Admin login route. The resulting auth outcome was not tested, so this is a confirmed routing/UX issue with unverified account impact.

No other dead or inert button was confirmed among the bounded live interactions. Admin editing buttons, deep settings controls, keyboard traversal and all mobile touch targets were not individually audited.

## 4. Navigation and route results

| Origin → destination | Mode / context | Expected | Actual | Result |
|---|---|---|---|---|
| **Campus Gate → Canteen → COED → Elevator 1 → Floor 3 → COED 303** | Standard route; outdoor → Canteen indoor → outdoor → COED indoor → vertical transition to Floor 3. | Follow authored graph through Canteen, exit outdoors, enter COED, reach Elevator 1, change Floor and arrive at COED 303. | Calculated as 11 steps and completed through Follow/Explore, transition handoffs, Arrival and Done. No route reset was reported in this scenario. | **PASS — L1 for this exact scenario.** |
| **Campus Gate → COED 303, Floor 3** | Accessible route. | Provide accessible path through configured connectors and usable first guidance. | Calculated as 11 ordered steps including Canteen and Elevator 1. Starting navigation displayed expected first guidance. Full accessible playback through Arrival was not recorded. | **PARTIAL — L1.** |
| **COED 303, Floor 3 vs Floor 4** | Search disambiguation. | Make same-named destinations distinguishable by Floor. | Both results appeared with Floor 3/Floor 4 labels; selecting Floor 4 updated selected Floor and Room details. | **PASS — L1.** |

This does not prove every campus route is connected or accurate. Routes involving every Building entrance, same-Floor Rooms, other Building-to-Building pairs, all vertical connectors, route-failure behavior, and accessible restrictions across multiple Buildings remain unverified. Doors/walls obscuring route geometry and exact 3D camera framing could not be judged from the covered preview.

## 5. Mobile and desktop UX review

### Verified observations

- At **320×568**, the tested Route Planner state fit without horizontal overflow. Its lower edge met the bottom-navigation boundary and the minimized restore pill remained 5 px above navigation.
- Existing 390×844 QA images are available for initial map, recovered map and COED 303 search:
  - ![Initial map at 390×844](verification-artifacts/acceptance-map-initial-390x844.png)
  - ![Map after recovery at 390×844](verification-artifacts/acceptance-map-recovered-390x844.png)
  - ![COED 303 search results](verification-artifacts/acceptance-search-coed303.png)
- In the tested Floor 3/Floor 4 search, labels disambiguated duplicate COED 303 names.
- The earlier minimized Planner restore overlap concern was not reproduced in the tested 320×568 state.

### Not verified

No complete responsive sweep was recorded at 390×844, 430×932, 575×777 and 1440×900; no fresh production screenshot was available. Keyboard-only operation, screen-reader announcements/focus management, formal contrast measurement, reduced motion, physical-phone safe areas, drag performance and all Room/Building sheet combinations remain unverified.

### UX findings supported by evidence

- The existing-account sign-in path is confusing for Students (P2; see above).
- Test-named Buildings and event data reduce trust in the directory.
- Conflicting story/Floor and Room-type labels make location information harder to trust.
- The tested route planner and map controls provided a usable path through the named route. This is a limited task observation, not a full first-time usability study.

## 6. Data quality and release risks

The public-facing read paths returned data, but the backend environment was not identifiable from available evidence. Treat these as **content findings requiring confirmation**, not permission to write or delete data.

| Observation | User impact | Assessment |
|---|---|---|
| The Building directory showed multiple Buildings containing “TEST” in their names. | Guests may choose a test location or conclude the map is unfinished. | **P2 release-data risk.** Confirm serving environment and intended visibility before release. |
| Guest Event Map showed “QA TEST Event Flow 0487deca” with temporary-QA description. | Public event feed looks uncurated and may direct guests to test content. | **P2 release-data risk.** Environment is unknown; no record was changed. |
| Directory contained duplicate Canteen entries. | Search/browse may show ambiguous destinations. | **P2 data-quality risk.** Determine if campus identities are intentionally separate and label them if so. |
| CABA directory reported 3 stories while details/map exposed 6 Floors; CABA Floor 3 entries such as Comfort Room and Electrical Room appeared classified as “Classroom.” | Guests may misunderstand building extent or Room category. | **P2 data-consistency risk.** Confirm authoritative terminology and source data. |
| COED 303 appeared on Floor 3 and Floor 4. | A generic destination name requires Floor selection. | **Handled in tested search — PASS.** Floor labels were visible; confirm both records are intentional. |

No campus geometry, navigation graph, event, Building, Room or emergency data was edited during this assessment.

## 7. Loading and performance assessment

### Measured in the local built preview

- Cold incognito navigation reached the recorded load event in approximately **435 ms**; script resources totaled about **1.83 MB decoded / 539 kB transferred**.
- Warm reload reached the recorded load event in approximately **215 ms**; script transfer was about **4.8 kB**, consistent with a warm browser cache.
- These are loopback measurements from one browser session. They are not field-network, mobile-device, FCP/LCP or perceived-interactivity measurements. No baseline/after source change exists for this QA run.

### Build and lazy-loading evidence

The production build succeeded. Vite emitted large-chunk warnings. The QA build reported approximately:

| Chunk | Approximate build size |
|---|---:|
| Main entry | 926 kB |
| routeDoorTransit | 863 kB |
| FloorEditor | 828 kB |
| CampusMapPage | 721 kB |

The previous audit snapshot reported approximately 1,214 kB for CampusMapPage, 1,909 kB for AdminMapBuilderPage, and 863 kB for routeDoorTransit. Output chunk shapes/build state differ, so this is **not** a controlled before/after size comparison and no reduction is attributed here.

The built browser session showed Admin Map Builder was not requested during initial Student/Guest map load. QR Scanner, the student 3D renderer and routeDoorTransit were absent from the initial map request set in the earlier capture; selecting 3D caused the renderer and routeDoorTransit assets to load on demand. This supports the existing route/feature lazy loading. Captured requests during map use returned successful HTTP responses; this does not establish offline resilience.

### Responsiveness, rendering and resource limits

- No reliable FPS, frame pacing, input latency, long-task trace, memory-growth measurement or multi-device comparison was obtained.
- The captured console contained two “THREE.WebGLRenderer: Context Lost” log entries. The preview window was covered and visual rendering could not be inspected, so cause and user impact are unknown. Recheck in a visible, stable browser/device before claiming 3D readiness.
- No artificial loading delay or fake progress was observed/introduced by this QA. No performance code was changed.

## 8. Bugs and issues

| ID / severity | Finding and reproduction | Evidence | Release impact |
|---|---|---|---|
| **QA-01 — P2** | Student existing-account link routes to /admin: public menu → Student sign in → existing-account link. | Live route observation. | Confuses Students and may send them to Admin-specific auth. Correct/confirm before Student account acceptance. |
| **QA-02 — P2** | QA/test Buildings and a QA-named event are visible in public-facing experience. | Live directory and event feed. Environment is unknown. | Trust and wayfinding concern. Confirm environment/content policy and curate intended public dataset before broad release. |
| **QA-03 — P2** | Directory contains duplicate Canteen and conflicting CABA story/Floor and Room-category information. | Live directory and Building/Floor details. | Users may choose the wrong place or misunderstand structure. Reconcile source-of-truth data before relying on directory accuracy. |
| **RISK-01 — unconfirmed** | Two WebGL context-loss logs appeared in the production preview capture. | Browser console log; no reliable visual inspection. | 3D stability risk; not a confirmed reproducible application defect. Repeat on visible target hardware. |
| **BLOCK-01 — blocked check** | Emergency evacuation video integration tests could not load MP4/VTT fixtures. | Test runner reported missing PLVSYNC_TEST_MP4 and PLVSYNC_TEST_VTT. | No product failure can be inferred. Rerun with approved test fixtures. |

No P0/P1 defect was confirmed in the workflows actually exercised. This is not evidence that none exists outside the tested scope.

## 9. Feature completeness and prioritized backlog

### Is the product complete enough for its purpose?

**The Guest navigation core is promising and substantially functional for the demonstrated route. The whole product is not yet proven complete enough for unrestricted release.** Essential map search and a representative indoor/outdoor multi-Floor route worked. Release-critical gaps are verification and data readiness: account-specific Student behavior, safe Admin persistence/publishing, broad map-data consistency, real QR decoding, and stable 3D behavior on target devices.

### Classification

- **Must-have before broad release:** Confirm and curate public campus/event data; resolve the Student existing-account route; validate map/route data for intended Buildings/Floors; complete authenticated Admin save/reload validation on isolated staging data; validate 3D on a visible supported device. If accounts/Admin are in release scope, complete their end-to-end acceptance before release.
- **Should-have:** Complete QR decode-to-origin-to-route acceptance; test network/chunk failure recovery; do responsive/keyboard/accessibility sweeps; sample multiple Buildings/Floors for route and geometry correctness.
- **Nice-to-have:** More field performance traces across representative phones/network conditions; broader route-corpus coverage and user testing after data cleanup.
- **Not necessary from current evidence:** Broad visual redesign, arbitrary route/graph changes, new product features or speculative caching/memoization. Evidence here does not support those changes.

### Prioritized next actions

| Priority | Improvement / validation | Why it matters / affected users | Complexity | Regression risk | Required before release? |
|---|---|---|---|---|---|
| 1 | Confirm which backend serves the public map; review and remove/quarantine unintended test Buildings/events and reconcile Canteen/CABA labels through the authorized data workflow. | Guests rely on accurate destinations and trust the map. | Medium | High if records are edited carelessly; use reviewed staging/data-owner process. | **Yes, before broad release.** |
| 2 | Correct and validate Student existing-account routing through real Student auth lifecycle (registration, verification, sign-in, restoration and sign-out). | Existing Students should not be sent to Admin login. | Low–Medium | Medium; auth routing can affect account access. | **Yes, if Student accounts are part of launch.** |
| 3 | Run Admin Map Builder acceptance on disposable/staging campus fixture: edit geometry/graph, undo/redo, save, reload, validate references and verify draft/publish boundaries without publishing live maps. | Admins must maintain data safely. | Medium–High | High; persistence/publishing affects campus data. | **Yes before enabling real Admin maintenance.** |
| 4 | Verify 3D and camera transitions in a visible browser on supported desktop and representative mobile hardware; capture console, frame pacing and memory evidence. | Orientation and navigation depend on stable rendering. | Medium | Low to product, but exposes rendering/device defects. | **Yes before claiming 3D acceptance.** |
| 5 | Decode a known valid QR fixture using camera; verify location resolution, You Are Here, origin handoff, destination preservation and camera cleanup. | QR is a promoted way to identify a starting point. | Low–Medium | Low. | **Should-have; required if QR is advertised for launch.** |

## 10. Verification results

| Check | Result |
|---|---|
| Focused automated suites | **34 files; 633 tests passed; 2 tests blocked/failing due to missing video fixtures.** Fixture failures were in EmergencyEvacuationVideoGuide integration tests; no MP4/VTT fixtures were present. Do not interpret these as confirmed product defects. |
| Build | **PASS.** Production Vite build completed to a temporary directory outside the worktree; 104 files, approximately 34.1 MB output. Large-chunk warnings remain. |
| TypeScript diagnostics | **No clean typecheck.** Baseline and current each had 512 diagnostic identities. Two diagnostic messages in unmodified src/services/database.ts differed from stored baseline, while two prior messages disappeared. tsc exited 1 due to existing diagnostics; no new diagnostic identity was reported. Baseline: [qa-mobile-panel-typescript-current-20261031.txt](verification-artifacts/qa-mobile-panel-typescript-current-20261031.txt). Current output was outside the worktree at D:\\DevTemp\\plv-navisync-qa-typescript-20261101.txt. |
| Browser console/network | Captured app chunks, public settings, campus publication status and image requests returned successful responses in session. Two WebGL context-loss log messages were present. No network-failure injection was performed. |
| Git diff | git diff --check passed with no whitespace errors in tracked diffs (Git emitted only a line-ending normalization warning for CampusMapPage.tsx). Branch and pre-existing modified/untracked files were preserved. |
| Source changes by this assessment | **None.** |
| Production data and publishing | **No writes, map publications or deployments were performed.** |

Focused test grouping recorded in the continuation included Guest/Student map integration and loading/data safety, Building/Floor/map behavior, route playback and emergency routing, settings, QR scanner components, and Admin Map Builder campus/dirty-state coverage. Automated component tests are evidence only for their assertions; they do not substitute for blocked live Student/Admin/device checks.

## 11. Remaining limitations and blockers

1. No authorized Student account was used; session restoration, actual Student-only pages and account-linked preference persistence remain unverified.
2. No authenticated Admin account or isolated writable campus fixture was available; editing, persistence, reload and publish-boundary acceptance remain unverified. Live writes were intentionally avoided.
3. QR camera permission/stream behavior was tested, but a known valid QR payload was not decoded. Camera-denied/no-camera and duplicate-scan recovery were not exercised.
4. The Freebuff preview became visually unavailable/covered. There is no dependable visual acceptance of 3D composition, no FPS/frame-pacing result and no fresh production screenshot. Context-loss logs require a controlled repeat.
5. Only one small viewport’s Planner layout was measured live; the requested multi-size sweep, keyboard-only navigation, assistive technology and formal contrast/reduced-motion checks remain incomplete.
6. Network interruption, lazy-chunk failure, campus-data failure/retry and rapid-switch race scenarios were not injected in the browser.
7. The configured Supabase project could not be classified as staging versus production. All access during this assessment was read-only; confirm environment and test-data policy before any cleanup.

## 12. Final release recommendation

**READY FOR CONTROLLED USER TESTING.** Keep it limited to a curated Guest/Student navigation pilot and treat Admin Map Builder as unaccepted for real data maintenance until its isolated persistence workflow is proven. Do not call the product broadly release-ready on this evidence alone.

Before wider acceptance or public release, resolve visible data-quality concerns, route Student existing-account sign-in correctly, and complete authenticated Student/Admin validation. If 3D and QR are launch-critical, verify them on visible target hardware with real fixtures. The central Guest path demonstrated enough value to justify a controlled test, while the remaining gaps are material enough to prevent a **PASS** verdict.

## 13. Evidence artifacts and source references

Existing screenshots from the QA worktree:

- [Initial map, 390×844](verification-artifacts/acceptance-map-initial-390x844.png)
- [Recovered map, 390×844](verification-artifacts/acceptance-map-recovered-390x844.png)
- [COED 303 search, 390×844](verification-artifacts/acceptance-search-coed303.png)

Relevant implementation entry points:

- [Application startup and auth/data providers](src/app/App.tsx#L1)
- [Public, Student, Auth and Admin routes](src/app/routes.tsx#L192)
- [Campus map and routing workflow](src/pages/CampusMapPage.tsx)
- [Admin Map Builder](src/pages/AdminMapBuilderPage.tsx)
- [QR scanner](src/components/map/LocationQRScanner.tsx)
- [Student preference persistence](src/pages/StudentSettingsPage.tsx)

These source links show where behavior is implemented; they are not acceptance evidence by themselves.
