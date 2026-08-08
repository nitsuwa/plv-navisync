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
  - Status: `ACTIVE` (**Phase 1 ✅ implemented** on `feature/developer-3-c8-c4-c9-c10`; **Phase 2 still `BLOCKED` on Gate G3** — published navigation graph from Dev 2 B8)
  - Branch: `feature/developer-3-c8-c4-c9-c10`
  - Depends on: Gate G3 (Phase 2 only; Phase 1 builds on existing engines)
  - Verification Evidence: [DEVELOPER_3_C4_VERIFICATION.md](file:///c:/Users/Rj/Documents/GitHub/plv-navisync/docs/progress/DEVELOPER_3_C4_VERIFICATION.md)
  - Test result: `pnpm build` PASSED; **103/103 Vitest tests PASS** (14 new: routePlanner)
  - C4 Phase 1 scope: `src/lib/routePlanner.ts` (typed wrapper — real graph distance/ETA in ALL modes, structured turn-by-turn, floor transitions, SVG fallback); new map components `RoutePlannerDialog` / `RouteStepsPanel` / `RouteMapOverlay` / `RouteErrorState`; `CampusMapPage.tsx` rewired (recent destination capture, mobile bottom-sheet steps); **fixed pre-existing A* reconstruction bug in `pathfinding.ts`** (`findPath` used `open.get(parentId)` which broke after nodes moved to closed — now uses persistent `parentMap`/`edgeMap`, same pattern as `findNavigationRoute`)
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
  - Status: `ACTIVE` (Phases 1–3 ✅ implemented; responsive deep-dive on remaining pages pending)
  - Branch: `feature/developer-3-c9-polish` (merged to main as `d8e5b01` + `2b9526e`)
  - Depends on: C1–C8 for the full pass (Phase 1–3 did not require them)
  - Test result: `pnpm build` PASSED; **388/388 Vitest tests PASS**
  - Phase 1 scope: replaced ♿ emoji with lucide Accessibility SVG; added missing aria-labels; new `useReducedMotion` hook (disables SVG `<animate>` pulse rings + route draw/dash under reduced motion); focus-visible rings on dashboard + activity logs; new `useEscToClose` hook (Escape closes 9 modals, ignored while typing in inputs)
  - Phase 2 scope: contrast + typography pass — dashboard chart labels 8px→10px bold; route steps Dist/Time/Via 9px→10px; removed 50–70% muted-foreground opacity (now 75–90%) in building info panel, mobile sheet, picker, route planner
  - Phase 3 scope: responsive + typography audit — no fixed widths >350px, all grids have mobile fallbacks, tables wrapped in overflow-x-auto; bumped remaining 8–9px secondary text to 10px (LandingPage demo labels, StudentReportsPage steps, MobileBottomNav, AdminSidebar, Navbar tagline)
  - Pull Request: Merged
- [ ] **C10 — PWA, offline behavior, and end-to-end user journeys**
  - Status: `BLOCKED`
  - Branch: `test/pwa-and-critical-journeys`
  - Depends on: Gate G5
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: **C4 Phase 1** (✅ implemented on `feature/developer-3-c8-c4-c9-c10`; C8-C 🔒 still blocked on Dev 1 A6/A7)
- Last completed package: C4 Phase 1 — Student Route Planning & Navigation (route planner, turn-by-turn UI, mobile steps sheet, pathfinding bug fix)
- Known blocker: C8-C (publish controls, branding) requires Dev 1 A6/A7. C4 Phase 2 requires Gate G3 (Dev 2).
- Important changed files (C4 Phase 1): `src/lib/routePlanner.ts` + `src/lib/__tests__/routePlanner.test.ts` (new), `src/components/map/RoutePlannerDialog.tsx` / `RouteStepsPanel.tsx` / `RouteMapOverlay.tsx` / `RouteErrorState.tsx` (new), `src/pages/CampusMapPage.tsx` (rewire), `src/components/map/index.ts` (exports), `src/lib/pathfinding.ts` (A* reconstruction fix)
- Next recommended action: C9 Phase 4 (remaining page states + full dark/light theme audit) — unblocked and ready; C4 Phase 2 after Gate G3; C8-C once Dev 1 A6/A7 land.
