# CURRENT_IMPLEMENTATION.md

> **PLV NaviSync — Implementation Inventory**
> Frozen scope baseline: a factual listing of what currently exists in the codebase.
> Authentication checkpoint updated: August 6, 2026.
> This document does NOT recommend improvements. It only records implemented / partially implemented functionality as found in the source.
>
> **Status legend used below:**
> - **Complete** — fully implemented and wired
> - **Partial** — implemented but with gaps (e.g., UI without data wiring)
> - **UI Only** — screen/component exists but performs no real function
> - **Not Connected** — code exists (service/component) but nothing consumes it
> - **Mock Data** — functional UI driven by hardcoded/local in-memory data
> - **Broken** — present but unreachable or non-functional

---

## 1. Authentication

**Status:** Core authentication and the A2 student account lifecycle are implemented. Live Auth/session behavior is verified; final mailbox-link delivery remains a deployment-configuration review check.

**Current Screens:**
- `/admin` — `AdminLoginPage` for administrator and student sign-in.
- `/register` — `RegistrationPage`; creates a real student Auth account with validated profile metadata.
- `/auth/verify` — verification-pending and resend state.
- `/auth/callback` — email-verification callback with checking, success, expired, invalid, and blocked-profile states.
- `/auth/forgot-password` — enumeration-safe reset request.
- `/auth/reset-password` — recovery callback, new-password, expired/invalid-link, and success states.

**Current Components and hooks:**
- `AdminLoginPage.tsx` — calls `supabase.auth.signInWithPassword()`, loads the associated profile, checks `is_active`, redirects administrators to `/admin-dashboard`, redirects students to `/map`, and signs out unknown or invalid roles.
- `studentAccount.ts` — validates registration data and owns typed signup, resend, reset-request, password-update, and active-student profile checks.
- `AuthLifecyclePages.tsx` — owns verification and password-recovery route states while retaining the Supabase session after successful confirmation/reset.
- Demonstration-account dropdown — appears only when demo mode and the relevant Vite variables are configured; Demo Administrator and Demo Student only fill the existing fields and never sign in automatically.
- `useAdminAuth.ts` — restores the Supabase session and administrator profile for protected administration routes.
- `useStudentAuth.ts` — uses `getSession()` and `onAuthStateChange`, loads the `profiles` row, and exposes profile, loading, student state, and Supabase sign-out behavior.
- `AdminLayout.tsx` — protects administration routes using the real administrator session/profile.
- Student pages and shared navigation — wait for authentication loading, protect student-only pages, show the real profile, and use Supabase sign-out.

**Current Database Usage:**
- Supabase Auth validates email/password credentials.
- `public.profiles` supplies the application role and active state.
- Verified roles are `admin` and `student`.

**Verified behavior:**
- Administrator login succeeds and redirects correctly.
- Student login succeeds and redirects to `/map`.
- Both sessions persist after refresh.
- Students cannot access protected administrator routes.
- Logout ends the Supabase session and remains signed out after refresh.
- Public guest pages remain accessible.
- Legacy student `sessionStorage` authentication is no longer used.
- Hosted email signup is enabled and requires confirmation.
- The signup trigger ignores attempted role/active-state metadata and always creates an active `student` profile.
- Student sessions refresh and remain valid; password changes without a session are rejected.

**Security notes:**
- `.env.local` and `.env.demo.local` are ignored by Git.
- Demo accounts are disposable accounts provisioned through the approved local script.
- The service-role key is used only by the local provisioning process and never by React browser code.
- Vite demo credentials are browser-visible by design and must remain disabled in production.

**Remaining functionality:**
- Configure every deployed origin in Supabase Auth Redirect URLs and click through one real verification and recovery email per target environment.
- Configure production SMTP before onboarding real students; the hosted default provider has recipient restrictions.
- Persistent administrator user-management operations through approved protected backend mechanisms.
- Broader cross-feature RLS verification after later packages connect their tables.

**Files involved:** `src/pages/AdminLoginPage.tsx`, `src/pages/RegistrationPage.tsx`, `src/pages/AuthLifecyclePages.tsx`, `src/lib/studentAccount.ts`, `src/hooks/useAdminAuth.ts`, `src/hooks/useStudentAuth.ts`, `src/components/layout/AdminLayout.tsx`, protected student pages, `src/lib/supabase.ts`

**Dependencies:** Supabase Auth, `public.profiles`, React Router, Motion, `useToast`, `useTheme`

---

## 2. User Management

**Status:** Partial / Mock Data — complete admin CRUD UI over a page-local mock user array.

**Current Screens:**
- `/admin-dashboard/users` — `AdminUsersPage` (list, search, add/edit modal, delete, role/status badges)

**Current Components:**
- `AdminUsersPage.tsx` — `MOCK_USERS` array (6 users) loaded on mount via `useEffect`, paginated table, search bar, category badges, CRUD modal with form validation
- `Button`, `Badge`, `FormField`, `EmptyState`, `SearchBar`, `TablePageSkeleton`, custom modal

**Current Services:** `userService` (in `src/services/userService.ts`) exists, seeded with 6 users via `seedMockData("users", …)`. **Not connected** — the page uses its own `MOCK_USERS`, not the service.

**Current Database Usage:** `users` table defined in migration (`supabase/migrations/001_initial_schema.sql`) with `role`/`status`/`department`/`last_login`. Not queried at runtime.

**Current Problems:**
- Page-local mock array duplicates `userService` seed data (drift risk)
- No persistence — edits are lost on reload
- No image/avatar upload, no user detail page
- Roles are restricted to a fixed dropdown (`admin/faculty/staff/moderator`)

**Missing Functionality:** Wiring to `userService`/Supabase, real CRUD persistence, role permissions model, audit trail, bulk actions.

**Files involved:** `src/pages/AdminUsersPage.tsx`, `src/services/userService.ts`, `src/services/types.ts` (`DbUser`), `src/data/mockData.ts`

**Dependencies:** `useDataList`-style list state (page-local), `useToast`, `Button`/`Badge`/`FormField`/`EmptyState`/`SearchBar`/`TablePageSkeleton`

---

## 3. Dashboard

**Status:** UI Only / Mock Data — all numbers are hardcoded constants; no live aggregation.

**Current Screens:**
- `/admin-dashboard` — `AdminDashboardPage` (4 metric cards, priority items, recent activity, quick actions)

**Current Components:**
- `AdminDashboardPage.tsx` — `KEY_METRICS` (Buildings Mapped, Total Rooms, Active Routes, Pending Reports), `PENDING_ITEMS`, `ACTIVITY`, `QUICK_ACTIONS` — all module-level constants
- `StatCard` (memoized), `EmptyState`, `DashboardSkeleton`, `Link` quick-action tiles
- Simulated 400 ms loading state before render

**Current Services:** None.

**Current Database Usage:** None at runtime. Reads `MOCK_BUILDINGS` and `FLOOR_PLANS` constants for counts only.

**Current Problems:**
- Metrics hardcoded (`12` active routes, `2` pending reports, "4 wheelchair-accessible") — not derived from services
- "Post Announcement" quick action links to `/admin-dashboard/announcements` which is **not a registered route** → 404
- "All systems OK" indicator and `v2.1.0 · Last published: Jan 15, 2025` footer are static text
- Priority items and activity are static arrays, not fetched

**Missing Functionality:** Live aggregation from `buildingService`/`reportService`/`routeService`, real activity feed, real version/publish metadata.

**Files involved:** `src/pages/AdminDashboardPage.tsx`, `src/components/ui/StatCard.tsx`, `src/components/ui/PageSkeleton.tsx`, `src/components/ui/EmptyState.tsx`, `src/data/mockData.ts`, `src/data/floorPlans.ts`

**Dependencies:** `react-router` (`Link`), `motion/react`, `lucide-react`, `lib/utils.ts`

---

## 4. Campus Map (public)

**Status:** Complete (UI + mock data) — the flagship student/visitor screen; fully interactive but driven by hardcoded data.

**Current Screens:**
- `/map` — `CampusMapPage` (~1,800 lines)

**Current Components:**
- `CampusMapPage.tsx` — SVG campus map with:
  - Map modes: `standard | accessible | emergency` (SOS chip, accessible-mode toggle)
  - Layer toggles: buildings, accessibility, emergency
  - Building search, directions (from → to), route rendering, animated route dot
  - Floor selector per building, indoor room rendering from `FLOOR_PLANS`
  - Stair/elevator choice dialog when navigating between floors
  - Building info panel, event popup, report modal, sign-in prompt, QR placeholder, mobile bottom sheet
  - "Find route" from current building, walking time/distance display
- `src/components/map/` — `BuildingInfoPanel.tsx`, `BuildingPicker.tsx`, `EventPopup.tsx`, `MobileBuildingSheet.tsx`, `QRPlaceholder.tsx`, `ReportModal.tsx`, `SignInPrompt.tsx`, `index.ts`

**Current Services:** None directly. Reads `useCampusData()` (published Map Builder campuses) and falls back to legacy `MOCK_BUILDINGS`/`B_POS`/`FLOOR_PLANS` constants via `buildSharedCampus` + `mapDataAdapter`.

**Current Database Usage:** None at runtime. Campus data persists to `localStorage` (via `CampusDataContext`, key `plv-campuses`).

**Current Problems:**
- Single very large file (~1,800 lines)
- Dual data source: legacy hardcoded `B_POS`/`FLOOR_PLANS` vs. Map Builder-generated campuses (adapter bridges them; IDs `b1`–`b6` hardcoded in pathfinding graphs)
- No real GPS geolocation (GPS mode toggles exist but are simulated)
- QR code feature is a placeholder (`QRPlaceholder`)
- Events shown are static/mock; Map Builder-authored events do not flow to this page
- Pathfinding failures silently return "no route" in some cases

**Missing Functionality:** Real GPS positioning, live event overlays from `eventService`, live route data from `routeService`, real-time updates, PWA offline map caching beyond the service worker shell.

**Files involved:** `src/pages/CampusMapPage.tsx`, `src/components/map/*`, `src/data/mapData.ts` (`B_POS`), `src/data/floorPlans.ts`, `src/data/mockData.ts`, `src/lib/mapDataAdapter.ts`, `src/lib/pathfinding.ts`, `src/lib/combinedPathfinding.ts`, `src/lib/indoorPathfinding.ts`, `src/contexts/CampusDataContext.tsx`

**Dependencies:** `useCampusData`, `mapDataAdapter`, `combinedPathfinding`, `indoorPathfinding`, `pathfinding`, `useToast`, `motion/react`, `lucide-react`

---

## 5. Navigation

**Status:** Complete (algorithms) / Mock Data (inputs) — a three-tier pathfinding engine exists and is wired into the map page and the Map Builder test panel.

**Current Screens:**
- `/map` directions mode (uses the engines)
- Map Builder `TestNavigationPanel` (runs `findNavigationRoute` live against authored nav graphs)

**Current Components:**
- `TestNavigationPanel.tsx` (Map Builder) — from/to pickers, accessible-only and emergency-mode toggles, route highlighting on canvas, step-by-step diagnostics

**Current Services:** None. Engines are pure functions in `src/lib/`.

**Current Database Usage:** None. Graphs are derived from hardcoded `B_POS`, `FLOOR_PLANS`, `MOCK_BUILDINGS`, or Map Builder-authored `navNodes`/`navEdges`.

**Current Problems:**
- Outdoor graph is hardcoded to legacy IDs (`b1`–`b6`) — Map Builder-authored buildings are adapted rather than natively routed
- Accessible/emergency constraints exist per-edge (`accessible`, `emergencySafe`, `inaccessibleReason`) only in Map Builder data; legacy `FLOOR_PLANS` have separate assumptions
- No persistence of computed routes

**Missing Functionality:** Routing from real published route tables (`navigation_routes`), GPS start point, live obstacle/closure data, ETA recalculation.

**Files involved:** `src/lib/pathfinding.ts` (outdoor A*), `src/lib/indoorPathfinding.ts` (indoor A* over `FLOOR_PLANS`), `src/lib/combinedPathfinding.ts` (outdoor+indoor stitching, `findOutdoorRoute`, `findIndoorRoute`, `findCombinedRoute`), `src/lib/mapDataAdapter.ts`, `src/components/map-builder/TestNavigationPanel.tsx`

**Dependencies:** `FLOOR_PLANS`, `MOCK_BUILDINGS`, `B_POS`, Map Builder `Campus` nav graph types

---

## 6. Smart Search

**Status:** Partial — per-page search UI exists with keyboard shortcuts and highlight, but there is no unified/global search index.

**Current Screens/Components:**
- `SearchBar.tsx` (shared component) — search input with `useSearchKeyboard` (Ctrl+K / `/` to focus, Esc to clear, persisted "hint dismissed" flag) and `useSearchHighlight` (`highlightSearch` helper returning highlighted spans)
- Used on: `BuildingsPage`, `CampusMapPage` (building search), `CampusHome` (Map Builder campus search), `AdminUsersPage`, `AdminBuildingsPage`, `AdminAnnouncementsPage`, `AdminEventsPage`, `AdminLocationsPage`, `AdminReportsPage`, `AdminRoutesPage`, `StudentFavoritesPage`, `StudentReportsPage`, `AnnouncementsPage`

**Current Services:** `searchBuildings(query)` exists in `src/services/database.ts` (name/code/category match) but is only reachable through `buildingService`; pages mostly filter local arrays instead.

**Current Database Usage:** None at runtime.

**Current Problems:**
- Each page re-implements its own filtering over local arrays
- No search over rooms, floors, or offices on the public map (room search is limited to floor plans)
- No fuzzy matching, ranking, or recent-searches

**Missing Functionality:** Global command-palette search, room/floor search, fuzzy ranking, persisted recent searches.

**Files involved:** `src/components/ui/SearchBar.tsx`, `src/hooks/useSearchKeyboard.ts`, `src/hooks/useSearchHighlight.ts`, `src/services/database.ts`

**Dependencies:** `useSearchKeyboard`, `useSearchHighlight`, consuming pages

---

## 7. Buildings

**Status:** Complete (public + admin CRUD) / Mock Data — full building catalog experience; admin CRUD is the only page wired to the services layer.

**Current Screens:**
- `/buildings` — `BuildingsPage` (category-filtered grid, search, favorite toggle)
- `/buildings/:id` — `BuildingDetailsPage` (description, category, hours, contact, floors/rooms, directions CTA, "Report an issue", favorite)
- `/admin-dashboard/buildings` — `AdminBuildingsPage` (CRUD table, search, category filter, add/edit modal)

**Current Components:**
- `BuildingsPage.tsx`, `BuildingDetailsPage.tsx`, `AdminBuildingsPage.tsx`
- `BuildingCard.tsx` (image, badge, favorite heart), `Badge.tsx` (`BuildingCategoryBadge`), `SearchBar`, `EmptyState`, `StatCard`, `FormField`, `TablePageSkeleton`, `ImageWithFallback` (via `PLVLogo`/building images)

**Current Services:** `buildingService` — **the only page using the services layer**. `AdminBuildingsPage` uses `useDataList` + `buildingService.list` (search/filter/pagination through the service) and `useCrudModal` for create/update/delete. Public pages read `MOCK_BUILDINGS` directly (or Map Builder campuses via `useCampusData`).

**Current Database Usage:** `buildings` table in migration; `buildingService` hits it only when Supabase is configured. Otherwise the unified in-memory mock store (seeded from `MOCK_BUILDINGS`) is used and resets on reload.

**Current Problems:**
- Public pages and admin page read different data sources (`MOCK_BUILDINGS` vs service store)
- Mock store resets on page reload (no localStorage for `buildings`)
- Building images rely on external URLs with fallback

**Missing Functionality:** Server persistence, image upload, geocoding for GPS, hours-of-operation scheduling.

**Files involved:** `src/pages/BuildingsPage.tsx`, `src/pages/BuildingDetailsPage.tsx`, `src/pages/AdminBuildingsPage.tsx`, `src/services/buildingService.ts`, `src/data/mockData.ts` (`MOCK_BUILDINGS`), `src/components/ui/BuildingCard.tsx`

**Dependencies:** `buildingService`, `useDataList`, `useCrudModal`, `useCampusData` (public pages), `useToast`, `ImageWithFallback`

---

## 8. Floors

**Status:** Complete (display + authoring) / Mock Data — floors exist as data, are rendered on the public map, managed in the Map Builder, and have a legacy admin CRUD page.

**Current Screens:**
- `/map` — floor selector + per-floor room rendering (from `FLOOR_PLANS`)
- `/admin-dashboard/floor-plans` — `AdminFloorPlansPage` (legacy list/edit UI)
- Map Builder `FloorEditor` — full floor authoring (rooms, walls, stairs, elevators, undo/redo)

**Current Components:**
- `FloorEditor.tsx` (Map Builder) — floor canvas, room palette (`ROOM_TYPES`), wall/door tools, stair & elevator placement with accessibility flags
- `FloorPropertiesPanel.tsx` — floor & room property editing (wheelchair-accessible toggles for stairs, dimensions)
- `AdminFloorPlansPage.tsx` — building/floor list, room summary, edit modal
- `src/data/floorPlans.ts` — `FLOOR_PLANS` (4+ buildings, multi-floor, rooms with types)

**Current Services:** None for floors (no floor service). Floor data lives in `FLOOR_PLANS` constants and inside `Campus` objects (Map Builder).

**Current Database Usage:** None. `FLOOR_PLANS` is a hardcoded module constant; authored floors persist to `localStorage` only inside `Campus` JSON.

**Current Problems:**
- `FLOOR_PLANS` and Map Builder-authored floors are two parallel floor systems
- AdminFloorPlansPage edits a local copy that does not persist

**Missing Functionality:** Floor-level service, persistence of legacy floor-plan edits, floor image upload.

**Files involved:** `src/data/floorPlans.ts`, `src/pages/AdminFloorPlansPage.tsx`, `src/components/map-builder/FloorEditor.tsx`, `src/components/map-builder/FloorPropertiesPanel.tsx`, `src/pages/CampusMapPage.tsx`

**Dependencies:** `ROOM_TYPES`, `useUndoRedo`, `useCampusData`, `MOCK_BUILDINGS`

---

## 9. Map Builder

**Status:** Complete (UI/authoring) / Mock Data (localStorage persistence) — the largest and most feature-complete module; a Canva/Figma-style campus editor.

**Current Screens (view machine in `AdminMapBuilderPage`):**
- `/admin-dashboard/map-builder` — `CampusHome` (campus cards grid, search, duplicate/archive/delete, "Quick Start" tutorial, empty state)
- `CampusEditor` (per-campus) — the main editor
- `FloorEditor` (per building/floor)
- `CampusWizard` (create campus), `CampusCreationSuccess`
- `CanvasSetupWizard`, `CanvasSettingsModal`

**Current Components (37 files in `src/components/map-builder/`):**
- **Editor core:** `CampusEditor.tsx` (~1,200 lines), `Canvas.tsx`, `useCanvasControls.ts`, `useFloorHistory.ts`, `HierarchyPanel.tsx`, `PropertiesPanel.tsx`, `ContextMenu.tsx`
- **Layers:** 5 contextual layers — campus, navigation, accessibility, emergency, events (tool palette changes per layer)
- **Editing features:** multi-select + rubber-band, Ctrl+A select all, align/distribute, batch delete, drag-to-create buildings, path drawing, edge snapping, undo/redo (`useUndoRedo`), keyboard shortcuts, "?" cheat sheet (`ShortcutCheatSheet`)
- **Navigation authoring:** `RoutesPanel.tsx` (route list + drawing), `TestNavigationPanel.tsx` (live route test), nav nodes/edges with `accessible` + `emergencySafe` flags and `inaccessibleReason`
- **Floor authoring:** `FloorEditor.tsx`, `FloorPropertiesPanel.tsx`, `FloorWizardModal.tsx`, `BuildingWizardModal.tsx`
- **Publish flow:** `PublishDialog.tsx`, `PrePublishDialog.tsx`, `ValidationErrorsDialog.tsx` (validation checks incl. accessibility/emergency), `ActionProgressDialog.tsx`, `EditorBackDialog.tsx`
- **Onboarding:** `MapBuilderTutorial.tsx` (persisted via `localStorage` key), `CreateCampusGuide.tsx`, `IssuesPopover.tsx`, `ToolbarTooltip.tsx`
- **Barrel:** `index.ts` exports `SEED_CAMPUSES`, `LAYER_TOOLS`, components, and types

**Current Services:** `campusService` (seeded with `SEED_CAMPUSES`, `Not Connected` — the page does not call it). Persistence is direct `localStorage` in `AdminMapBuilderPage` (key `plv-campuses`) plus `CampusDataContext` (key `plv-campuses`).

**Current Database Usage:** None at runtime. `campuses` table exists in the migration; the migration `001_initial_schema.sql` has no campus-building/floor JSON columns matching the authoring model.

**Current Problems:**
- Persistence is localStorage-only; no server sync
- Second, dead Map Builder implementation exists: `src/components/map-builder-v2/` (`MapBuilderWorkspace`, `BuildingsTab`, `FloorPlansTab`, `LayersTab`, `PreviewTab`, `RoutesTab`) — unused
- `campusService` imports `SEED_CAMPUSES` from the map-builder barrel (upward dependency from services → components)
- Publish copies campus JSON into `CampusDataContext`; the public map consumes it via `mapDataAdapter` (fragile contract)
- Desktop-tuned; mobile support partial (editor has limited responsive fallback)

**Missing Functionality:** Server persistence, versioning/diffing, image upload for floor plans, template library, multi-user editing, live publish.

**Files involved:** `src/pages/AdminMapBuilderPage.tsx`, `src/components/map-builder/*` (37 files), `src/components/map-builder-v2/*` (dead), `src/contexts/CampusDataContext.tsx`, `src/services/campusService.ts`, `src/lib/campusHelpers.ts`

**Dependencies:** `motion/react`, `lucide-react`, `useUndoRedo`, `useToast`, `useCampusData`, `campusHelpers`, shared UI kit

---

## 10. Rooms

**Status:** Complete (data + display + authoring) / Mock Data — rooms exist in floor-plan data, are rendered/searchable on the public map, and are drawn in the Map Builder.

**Current Screens:**
- `/map` — room rendering per floor, room search within floor plans, room highlighting in accessible mode (elevators/restrooms), stair/elevator navigation between floors
- Map Builder `FloorEditor` — room drawing with `ROOM_TYPES` palette (classroom, lab, office, restroom, elevator, stairs, etc.)

**Current Components:**
- `FloorPropertiesPanel.tsx` (room/floor property editing), `FloorEditor.tsx` (room tools), `CampusMapPage.tsx` (room SVG rendering + stair-choice dialog)
- `src/data/floorPlans.ts` — `Room` type, `FLOOR_PLANS` room lists
- `src/components/map-builder/constants.ts` — `ROOM_TYPES`, `ROOM_MAP`

**Current Services:** None (no room service).

**Current Database Usage:** None. Rooms are embedded in `FLOOR_PLANS` constants and in Map Builder `Campus` floor JSON.

**Current Problems:**
- Rooms are duplicated between `FLOOR_PLANS` and Map Builder campuses; the public map prefers `FLOOR_PLANS` for legacy buildings
- No room detail data (capacity, equipment) beyond type/name

**Missing Functionality:** Room search across all buildings, room booking/reservation, room-level details (capacity, facilities, photos).

**Files involved:** `src/data/floorPlans.ts`, `src/pages/CampusMapPage.tsx`, `src/components/map-builder/FloorEditor.tsx`, `src/components/map-builder/FloorPropertiesPanel.tsx`, `src/components/map-builder/constants.ts`

**Dependencies:** `ROOM_TYPES`, `FLOOR_PLANS`, `indoorPathfinding` (room-level routing)

---

## 11. Routes

**Status:** Partial / Mock Data — route authoring is complete inside Map Builder; a legacy admin page and a seeded service exist but the public map does not consume route tables.

**Current Screens:**
- Map Builder Navigation layer — route drawing via `RoutesPanel` (waypoints, type: walking/accessible/emergency, distance/duration auto-calc, active toggle)
- `/admin-dashboard/routes` — `AdminRoutesPage` (legacy CRUD: stats cards, type filter, route SVG mini-map, edit modal)
- `/map` — route highlighting for computed directions (engine-derived, not from route tables)

**Current Components:**
- `RoutesPanel.tsx` (Map Builder), `AdminRoutesPage.tsx`, `TestNavigationPanel.tsx`
- `routeService` — seeded with 5 mock routes (`navigation_routes`), **Not Connected** (AdminRoutesPage uses page-local data)

**Current Services:** `routeService` (createCrudService over `navigation_routes`) — unused by any page.

**Current Database Usage:** `navigation_routes` table in migration; unused at runtime.

**Current Problems:**
- Three parallel route representations: Map Builder `Campus.routes[]`, `routeService` mock rows, and the hardcoded `B_POS` nav graph used by the public engine
- AdminRoutesPage edits do not persist and do not reach the public map
- No route validation against current campus geometry at runtime

**Missing Functionality:** Public map consumption of authored routes, route approval workflow, scheduled/active route propagation to `combinedPathfinding`.

**Files involved:** `src/components/map-builder/RoutesPanel.tsx`, `src/components/map-builder/TestNavigationPanel.tsx`, `src/pages/AdminRoutesPage.tsx`, `src/services/routeService.ts`, `src/lib/combinedPathfinding.ts`

**Dependencies:** `createCrudService`, `SEED_CAMPUSES` types (`CampusRoute`), `useToast`

---

## 12. Accessibility

**Status:** Partial / Mock Data — full authoring tooling and a public accessible map mode exist; data is hardcoded or localStorage-bound.

**Current Screens:**
- `/map` — **Accessible mode** (green mode chip): avoids stairs, highlights elevators/restrooms, prefers accessible edges
- Map Builder Accessibility layer — place ramps, elevators, accessible entrances; per-building accessibility checklist in `PropertiesPanel`
- `/admin-dashboard/accessibility` — `AdminAccessibilityPage` (legacy per-building checklist CRUD with page-local mock)

**Current Components:**
- `PropertiesPanel.tsx` — building accessibility checklist (`wheelchairAccessible`, `hasElevator`, `hasRamp`, `accessibleEntrance`), nav-node accessible toggle, nav-edge accessible toggle + `inaccessibleReason` (stairs/narrow_path/restricted_access/uneven_surface)
- `FloorPropertiesPanel.tsx` — wheelchair-accessible flags for stairs/elevators
- `Canvas.tsx` — accessibility layer rendering; `CampusMapPage.tsx` — accessible-mode room highlighting
- `AdminAccessibilityPage.tsx` — 6-building mock checklist

**Current Services:** None (no accessibility service).

**Current Database Usage:** None at runtime (migration has no accessibility table; features are nested in campus JSON).

**Current Problems:**
- Accessibility data split across legacy mock checklist, `FLOOR_PLANS` room flags, and Map Builder campus JSON
- PrePublishDialog validation checks `no_elevator_accessible` / `no_accessible_rooms` exist, but authored data isn't re-validated against legacy floor plans
- Accessible map mode relies on legacy assumptions for buildings not authored in Map Builder

**Missing Functionality:** Unified accessibility data model, standards compliance scoring, accessible route testing on the public map for Map Builder-authored campuses.

**Files involved:** `src/pages/AdminAccessibilityPage.tsx`, `src/components/map-builder/PropertiesPanel.tsx`, `src/components/map-builder/FloorPropertiesPanel.tsx`, `src/components/map-builder/PrePublishDialog.tsx`, `src/pages/CampusMapPage.tsx`

**Dependencies:** `MOCK_BUILDINGS`, `PropertiesPanel` callbacks, `CampusDataContext`

---

## 13. Emergency Routing

**Status:** Partial — emergency authoring (exits, assembly areas, safe edges) and an emergency map mode exist; no standalone evacuation engine beyond filtered pathfinding.

**Current Screens:**
- `/map` — **SOS / Emergency mode** (red chip): highlights emergency exits, evacuation routes, assembly points, clinic; tints map red; filters routing
- Map Builder Emergency layer — place exit markers, assembly areas; mark nav edges `emergencySafe` with `emergencyReason` (hazard/blocked)
- `TestNavigationPanel` — emergency-mode route testing against safe edges
- `HelpCenterPage` — emergency-mode FAQ answers in the AI knowledge base

**Current Components:**
- `CampusMapPage.tsx` (emergency mode), `Canvas.tsx` (emergency layer tint), `TestNavigationPanel.tsx`, `ValidationErrorsDialog.tsx` (checks `emergency_exit_no_nav`, `emergency_route_blocked`), `PropertiesPanel.tsx` (edge `emergencySafe` toggles)

**Current Services:** None.

**Current Database Usage:** None at runtime.

**Current Problems:**
- Emergency features are authored per-campus but the public map's emergency mode applies generic filters over legacy data
- No assembly-area/exit data for legacy buildings (only authored campuses have it)
- No evacuation-path computation distinct from accessible-mode filtering in the shared engine (`findNavigationRoute(…, emergencyMode)` only exists in the Map Builder test panel)

**Missing Functionality:** Public-map evacuation routing for authored campuses, safety-status propagation, emergency alert distribution (AdminSettings has decorative email/SMS alert toggles only).

**Files involved:** `src/pages/CampusMapPage.tsx`, `src/components/map-builder/TestNavigationPanel.tsx`, `src/components/map-builder/PropertiesPanel.tsx`, `src/components/map-builder/ValidationErrorsDialog.tsx`, `src/pages/HelpCenterPage.tsx`

**Dependencies:** `findNavigationRoute` (map-builder nav graph), `combinedPathfinding`, `CampusDataContext`

---

## 14. Reports

**Status:** Partial / Mock Data — student submission + admin review flows are complete as UI; data is page-local mock arrays.

**Current Screens:**
- `/student/reports` — `StudentReportsPage` (submit report form, my-reports list, status timeline, search/filter)
- `/admin-dashboard/reports` — `AdminReportsPage` (review queue, approve/reject/resolve actions, status filters, search)
- `/map` — `ReportModal` (report an issue from a building, opens from info panel)

**Current Components:**
- `StudentReportsPage.tsx`, `AdminReportsPage.tsx`, `ReportModal.tsx`
- `MOCK_REPORTS` in `AdminReportsPage` (8 reports) and page-local arrays in `StudentReportsPage`

**Current Services:** `reportService` (seeded with 8 reports, `reports` table) — **Not Connected**; neither page uses it.

**Current Database Usage:** `reports` table in migration; unused at runtime.

**Current Problems:**
- Page-local mock arrays duplicate `reportService` seed data
- No persistence; report status changes lost on reload
- `has_image` field exists but no image upload implemented
- No notification when report status changes

**Missing Functionality:** Service wiring, image upload, notifications, report assignment to staff, severity scoring.

**Files involved:** `src/pages/StudentReportsPage.tsx`, `src/pages/AdminReportsPage.tsx`, `src/components/map/ReportModal.tsx`, `src/services/reportService.ts`

**Dependencies:** `SearchBar`, `Badge`, `Button`, `useToast`, `useCampusData` (building list)

---

## 15. Events

**Status:** Partial / Mock Data — admin CRUD UI, a mock event popup on the map, and an events authoring layer in Map Builder exist; services are not connected.

**Current Screens:**
- `/admin-dashboard/events` — `AdminEventsPage` (CRUD with status tabs scheduled/draft/ended, `MOCK_EVENTS`, stats cards)
- `/map` — `EventPopup` (click an event pin on the map; shows venue/date/description)
- Map Builder Events layer — place event pins, draw restricted areas, temp features

**Current Components:**
- `AdminEventsPage.tsx`, `EventPopup.tsx`, `Canvas.tsx` (events layer), `PropertiesPanel.tsx` (event marker properties)
- `eventService` — seeded with 4 mock events (`campus_events`), **Not Connected**

**Current Services:** `eventService` — unused by any page.

**Current Database Usage:** `campus_events` table in migration; unused at runtime.

**Current Problems:**
- Event data on the map popup is hardcoded; Map Builder-authored event overlays never reach the public map
- AdminEventsPage edits do not persist
- Date fields stored as display strings ("Jan 25, 2025"), not ISO

**Missing Functionality:** Event service wiring, event propagation to public map, date-based visibility (scheduled → live), restricted-area enforcement in routing.

**Files involved:** `src/pages/AdminEventsPage.tsx`, `src/components/map/EventPopup.tsx`, `src/components/map-builder/Canvas.tsx`, `src/services/eventService.ts`

**Dependencies:** `SearchBar`, `Badge`, `useToast`, `useCampusData`

---

## 16. Announcements

**Status:** Broken — both the admin and public announcement pages exist with full UI, but **neither is registered in the router**, so all entry points 404.

**Current Screens (unreachable):**
- `AdminAnnouncementsPage` (admin CRUD — categories general/academic/event/emergency/maintenance, priority badges, search) — intended at `/admin-dashboard/announcements`
- `AnnouncementsPage` (public feed — priority hero, category filter, search) — intended at `/announcements`

**Current Components:**
- `AdminAnnouncementsPage.tsx`, `AnnouncementsPage.tsx`, `AnnouncementCard.tsx` (used by `AnnouncementsPage`)
- `announcementService` — seeded with `MOCK_ANNOUNCEMENTS`, **Not Connected**

**Current Services:** `announcementService` — unused.

**Current Database Usage:** `announcements` table in migration; unused at runtime.

**Current Problems:**
- **Broken links:** the footer "Announcements" link and the Dashboard "Post Announcement" quick action point to unrouted paths → 404
- Pages use page-local `MOCK_ANNOUNCEMENTS` rather than the service
- No persistence

**Missing Functionality:** Route registration, service wiring, priority-based push (settings toggles are decorative), scheduling.

**Files involved:** `src/pages/AdminAnnouncementsPage.tsx`, `src/pages/AnnouncementsPage.tsx`, `src/components/ui/AnnouncementCard.tsx`, `src/services/announcementService.ts`, `src/app/routes.tsx` (missing entries), `src/components/layout/Footer.tsx`, `src/pages/AdminDashboardPage.tsx` (link targets)

**Dependencies:** `SearchBar`, `Badge`, `Button`, `EmptyState`, `useToast`

---

## 17. Settings

**Status:** UI Only / Not Connected — settings screens render fully but nothing persists and nothing is wired to services.

**Current Screens:**
- `/admin-dashboard/settings` — `AdminSettingsPage` (site name/tagline/contact/address, notification toggles, "Test Connection" / "Send Test Email" buttons)
- `/student/settings` — `StudentSettingsPage` (preferences, theme, logout)

**Current Components:**
- `AdminSettingsPage.tsx` (local `SettingRow` component), `StudentSettingsPage.tsx`, `PLVLogo`, `Button`, `ThemeToggle`

**Current Services:** `settingsService` (seeded with 6 settings: site name, tagline, contact email, address, lat/lng) — **Not Connected**.

**Current Database Usage:** `settings` table in migration; unused at runtime.

**Current Problems:**
- Toggles and inputs are local `useState` — reset on navigation/reload
- "Test Connection" and "Send Test Email" are decorative (no network call)
- No settings are read anywhere else in the app (site name/tagline are hardcoded in layouts)
- Theme is the only setting that persists (via `useTheme`/`localStorage` key `plv-theme`)

**Missing Functionality:** Service wiring, persistence, consumption of settings across the app, real SMTP/connection testing.

**Files involved:** `src/pages/AdminSettingsPage.tsx`, `src/pages/StudentSettingsPage.tsx`, `src/services/settingsService.ts`, `src/hooks/useTheme.ts`

**Dependencies:** `settingsService`, `useTheme`, `useStudentAuth` (logout)

---

## 18. Analytics

**Status:** Not Implemented — no analytics module exists anywhere.

**Current Screens:** None.

**Current Components:**
- `src/components/ui/WeeklyChart.tsx` — an SVG weekly bar-chart component with a Vitest test, but **no page imports it** (unused)
- `src/app/components/ui/chart.tsx` — shadcn Recharts wrapper, **unused** (dead shadcn kit)
- `StatCard` (used on Dashboard and AdminBuildingsPage) — displays static numbers, not analytics

**Current Services:** None.

**Current Database Usage:** None.

**Current Problems:**
- Dashboard "metrics" are hardcoded constants, not computed analytics
- Two chart primitives exist (WeeklyChart, Recharts chart) but neither is consumed
- No tracking, no page-view events, no usage statistics

**Missing Functionality:** Any analytics feature — the module is entirely absent.

**Files involved:** `src/components/ui/WeeklyChart.tsx`, `src/components/ui/__tests__/WeeklyChart.test.tsx`, `src/app/components/ui/chart.tsx`, `src/pages/AdminDashboardPage.tsx`

**Dependencies:** none (components are unused)

---

## Appendix A — Cross-Cutting Implementation Facts

| Area | Fact |
|---|---|
| Router | `createBrowserRouter` in `src/app/routes.tsx` — 29 registered routes, including the A2 verification/recovery routes; `AdminAnnouncementsPage` and `AnnouncementsPage` are **not** registered (broken) |
| State | One global context (`CampusDataContext`, localStorage key `plv-campuses`); all other state is local `useState` |
| Persistence | Supabase Auth persists administrator and student sessions. `localStorage` still stores `plv-campuses`, `plv-theme`, `plv-tutorial-done`, `plv-search-hint-dismissed`, and Help Center guest chats. Campus and most feature data are not yet server-authoritative. |
| Data layer | The generated `Database` contract types the single browser client in `src/lib/supabase.ts`, which is active for authentication and profile lookup. Most feature services and pages still use mock, page-local, or localStorage data. |
| Service consumers | Only `AdminBuildingsPage` imports the services layer; every other page uses page-local mock arrays |
| Database | The reviewed `001` schema is preserved unchanged; the live-baseline marker, A1 security/Storage correction, and A2 safe student-profile signup trigger are tracked as later migrations. Core guest/student/admin RLS, Storage, and student signup-trigger behavior are exercised against the live project. |
| PWA | `public/manifest.json` + `public/sw.js` service worker; no offline map-data caching |
| Type safety | Live database types are generated at `src/types/database.generated.ts` and applied to the browser client. No `tsconfig.json` is present, so `vite build` remains the only project compile check. |
| Tests | 4 Vitest files (54 tests), live A1/A2 verification scripts, and rollback-safe A1/A2 SQL assertions. `package.json` exposes `verify:a1` and `verify:a2`; no general `test` script is defined. |
| Dead code | `map-builder-v2/` (6 files), 43-file unused shadcn kit under `src/app/components/ui/` (only `sonner` + `utils` consumed), `WeeklyChart` (unused), `QRPlaceholder` (placeholder-only) |
