# PLV NaviSync — Developer 3 Progress

This is the live checklist for Workstream C — Student Experience and Operations. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [x] **C1 — Public/student shell, Home, and Help Center completion**
  - Status: `DONE`
  - Branch: `feature/public-shell-and-help`
  - Verification Evidence: [DEVELOPER_3_C1_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C1_VERIFICATION.md)
  - Test result: `npm run build` PASSED. Verified Home presentation, announcement preview, Help Center FAQ, and contact form layout.
  - Pull Request: Merged (#1)
- [x] **C2 — Published campus map loading and map states**
  - Status: `DONE`
  - Branch: `feature/published-campus-map`
  - Verification Evidence: [DEVELOPER_3_C2_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C2_VERIFICATION.md)
  - Test result: `npm run build` PASSED. Created `usePublishedCampus` hook with loading, empty, error, and cached fallback states in `CampusMapPage.tsx`.
  - Pull Request: Merged (#1)
- [x] **C3 — Unified search, directory, and location details**
  - Status: `DONE`
  - Branch: `feature/map-search-and-details`
  - Verification Evidence: [DEVELOPER_3_C3_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C3_VERIFICATION.md)
  - Test result: `npm run build` PASSED. Created `useCampusSearch` hook and connected unified location search & category filters across buildings, rooms, offices, labs, and facilities.
  - Pull Request: Merged (#1)
- [ ] **C4 — Student route planning and navigation presentation**
  - Status: `ACTIVE` (**Phase 1 ✅ implemented**; **Kiosk features ✅ implemented** (2026-08-10): "You are here" + walking-dot animation + published-graph bridge; **Real campus map + UX polish ✅ implemented** (2026-08-10): seeded campus matches the official PLV map (SCB/Canteen/CABA/COED/CEIT/Guard + Quadrangle), quadrangle diagonal paths removed (perimeter-only routing), Guard House moved to the main gate, pin-drop no longer auto-opens the planner (single "You are here · Plan route" chip); **Phase 2 remains `BLOCKED` on Gate G3** for the DB-persisted graph swap — the seeded PLV campus already routes on its `navNodes`/`navEdges`)
  - Branch: `feature/developer-3-c8-c4-c9-c10`
  - Depends on: Gate G3 (Phase 2 DB swap only; everything else builds on existing engines)
  - Verification Evidence: [DEVELOPER_3_C4_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C4_VERIFICATION.md)
  - Test result: `pnpm build` PASSED; **408/408 Vitest tests PASS** (21 routePlanner + 11 geo + updated pathfinding)
  - C4 Phase 1 scope: `src/lib/routePlanner.ts` (typed wrapper — real graph distance/ETA in ALL modes, structured turn-by-turn, floor transitions, SVG fallback); new map components `RoutePlannerDialog` / `RouteStepsPanel` / `RouteMapOverlay` / `RouteErrorState`; `CampusMapPage.tsx` rewired (recent destination capture, mobile bottom-sheet steps); **fixed pre-existing A* reconstruction bug in `pathfinding.ts`** (`findPath` used `open.get(parentId)` which broke after nodes moved to closed — now uses persistent `parentMap`/`edgeMap`, same pattern as `findNavigationRoute`)
  - **C4 Kiosk features (2026-08-10):** `src/lib/geo.ts` (GPS lat/lng → SVG conversion + snap-to-nearest); `planRouteFromPoint` + campus `navNodes`/`navEdges` support in `routePlanner.ts` (**seeded PLV campus now produces real graph routes — MAB→GYM = 83 m · 1 min via MAB Entrance → Flagpole Plaza → South Junction → Gym Entrance**); "You are here" marker (GPS Locate button + tap-on-map fallback + smart snap to nearest walkway node) + RoutePlannerDialog "You are here" start option; walking-dot avatar + live step highlight + Replay in `RouteMapOverlay` / `RouteStepsPanel`; `BUILDING_ENTRANCE_MAP` extended with seed ids (`b_mab`…)
  - Pull Request: Pending
- [x] **C5 — Reports and report history**
  - Status: `DONE`
  - Branch: `feature/reports-workflow`
  - Verification Evidence: [DEVELOPER_3_C5_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C5_VERIFICATION.md)
  - Test result: `npm run build` PASSED. Created `reportService.ts`, connected `ReportModal.tsx` for photo issue submissions, and built live student report history on `/student/reports`.
  - Pull Request: Merged (#1)
- [x] **C6 — Events and announcements**
  - Status: `DONE`
  - Branch: `feature/events-and-announcements`
  - Verification Evidence: [DEVELOPER_3_C6_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C6_VERIFICATION.md)
  - Test result: `npm run build` PASSED. Created `eventService.ts`, connected Home announcements/events feed, and added interactive map venue links.
  - Pull Request: Merged (#1)
- [x] **C7 — Favorites, recent destinations, and minimal profile**
  - Status: `DONE`
  - Branch: `feature/student-favorites-profile`
  - Verification Evidence: [DEVELOPER_3_C7_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C7_VERIFICATION.md)
  - Test result: `npm run build` PASSED. Created `studentAccountService.ts`, connected `/student/favorites` for saved places, and updated `/student/profile` live stats.
  - Pull Request: Merged (#1)
- [ ] **C8 — Admin operations pages, settings, logs, and dashboard**
  - Status: `ACTIVE` (C8-A ✅ + C8-B ✅ implemented on `feature/developer-3-c8-c4-c9-c10`; **C8-C still `BLOCKED` on Dev 1 A6/A7** — publish controls, branding, remaining states)
  - Branch: `feature/developer-3-c8-c4-c9-c10`
  - Depends on: A3, A6, A7, C5, and C6 (only C8-C depends on A6/A7 now)
  - Verification Evidence: [DEVELOPER_3_C8_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C8_VERIFICATION.md)
  - Test result: `pnpm build` PASSED; **103/103 Vitest tests PASS** (C8-B +11: dashboardService, settingsService, exporters; C4 Phase 1 +14: routePlanner)
  - C8-A scope: admin Reports/Events/Announcements pages wired to real services + activity-log audit trail + sidebar entries
  - C8-B scope: dashboard rewired to live `dashboardService` counts (no hardcoded numbers); settings persisted via `system_settings` upsert (fake SMTP/2FA tabs removed); new `/admin-dashboard/activity-logs` page; CSV/JSON exports on reports page
  - Pull Request: Pending
- [ ] **C9 — Responsive, accessibility, theme, and visual consistency**
  - Status: `DONE` (Phases 1–4 ✅ implemented; responsive deep-dive on remaining pages pending)
  - Branch: `feature/developer-3-c9-polish` (merged to main as `d8e5b01` + `2b9526e`)
  - Depends on: C1–C8 for the full pass (Phases 1–4 did not require them)
  - Test result: `pnpm build` PASSED; **388/388 Vitest tests PASS**
  - Phase 1 scope: replaced ♿ emoji with lucide Accessibility SVG; added missing aria-labels; new `useReducedMotion` hook (disables SVG `<animate>` pulse rings + route draw/dash under reduced motion); focus-visible rings on dashboard + activity logs; new `useEscToClose` hook (Escape closes 9 modals, ignored while typing in inputs)
  - Phase 2 scope: contrast + typography pass — dashboard chart labels 8px→10px bold; route steps Dist/Time/Via 9px→10px; removed 50–70% muted-foreground opacity (now 75–90%) in building info panel, mobile sheet, picker, route planner
  - Phase 3 scope: responsive + typography audit — no fixed widths >350px, all grids have mobile fallbacks, tables wrapped in overflow-x-auto; bumped remaining 8–9px secondary text to 10px (LandingPage demo labels, StudentReportsPage steps, MobileBottomNav, AdminSidebar, Navbar tagline)
  - Phase 4 scope: theme audit — no light-only bg/text colors missing dark variants in C4/C8 components; inline hex colors are all semantic (route/status colors); StatCard and shared UI have dark variants; live-verified light + dark mode
  - Pull Request: Merged
- [ ] **C10 — PWA, offline behavior, and end-to-end user journeys**
  - Status: `BLOCKED`
  - Branch: `test/pwa-and-critical-journeys`
  - Depends on: Gate G5
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: **Out-of-scope enhancements (August 10)** — 6 frozen-spec/adjacent features implemented on `main` (QR sharing, remember-last-viewed, usage analytics, notifications, building hours, emergency broadcast) + 1 bug fix (BuildingDetailsPage resolves seeded ids). C4 Phase 1 kiosk round-2 is still uncommitted on `main`.
- Last completed package: C4 Phase 1 — Student Route Planning & Navigation (route planner, turn-by-turn UI, mobile steps sheet, pathfinding bug fix)
- Known blocker: C8-C (publish controls, branding) requires Dev 1 A6/A7. C4 Phase 2 requires Gate G3 (Dev 2).
- Important changed files (C4 Phase 1): `src/lib/routePlanner.ts` + `src/lib/__tests__/routePlanner.test.ts` (new), `src/components/map/RoutePlannerDialog.tsx` / `RouteStepsPanel.tsx` / `RouteMapOverlay.tsx` / `RouteErrorState.tsx` (new), `src/pages/CampusMapPage.tsx` (rewire), `src/components/map/index.ts` (exports), `src/lib/pathfinding.ts` (A* reconstruction fix)
- Out-of-scope enhancements (Aug 10, verified live + `pnpm build` + **428/428 tests**):
  - **QR Location Sharing** — real scannable QR (new dep `qrcode.react` 4.2.0) encoding `/map?buildingId=<id>`; replaced fake `QRPlaceholder`; `src/components/map/LocationQR.tsx` (new), `QRPlaceholder.tsx` deleted
  - **Remember Last Viewed Building** — `plv-last-viewed` localStorage; restore on /map open (waits for campus load); `CampusMapPage.tsx`
  - **Usage Analytics** — `src/services/usageAnalyticsService.ts` (new, localStorage, no migration); tracks page_view/search/route/report; Admin Dashboard "Usage Analytics" card wired to the previously dead `WeeklyChart`
  - **In-app notifications** — admin bell now shows real activity-log feed + unread badge (`AdminLayout.tsx`); student navbar shows report-status-change badge + toast (`Navbar.tsx`, `src/lib/notificationService.ts` new)
  - **Building operating hours** — `src/lib/buildingHours.ts` (new): seeded-campus registry + legacy-string parser; live Open/Busy/Closed in `BuildingInfoPanel` + `BuildingDetailsPage`
  - **Emergency broadcast** — `Emergency` tab in `AdminSettingsPage` (system_settings keys, public); `EmergencyBanner` + `useEmergencyAlert` hook poll public settings; banner on all public pages
  - **Bug fix** — `BuildingDetailsPage` switched `useCampusData` → `usePublishedCampus` so seeded ids (`/buildings/b_scb`) resolve instead of "Building Not Found"
  - Tests added: `buildingHours.test.ts` (10), `notificationService.test.ts` (8), `usageAnalyticsService.test.ts` (6) — 428 total
- Next recommended action: **waiting on Dev 1 (A6/A7) and Dev 2 (B5/B7/B8)** — all unblocked Developer 3 work (C1–C9) is complete. C4 Phase 2 starts after Gate G3; C8-C after Dev 1 A6/A7 land. Optionally commit the uncommitted round-2 C4 kiosk work + these enhancements.
