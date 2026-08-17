# PLV NaviSync — Buong System Summary (System Overview)

> **Pamantasan ng Lungsod ng Valenzuela — Smart Campus Navigator**
> Isang kumpletong buod ng buong sistema: lahat ng modules, features, pages, services, at functions.
> Branch: `main` · Updated: August 10, 2026

---

## 1. Ano ang Sistema

Ang **PLV NaviSync** ay isang web-based **Smart Campus Navigator** para sa PLV Main Campus (Tongco St., Brgy. Maysan, Valenzuela City). Pinapagana nito ang:

- **Pampublikong mapa** ng campus — interactive SVG map ng SCB, Canteen, CABA, COED, CEIT, at Guard House
- **Route planning / navigation** — building-to-building, "You are here" (GPS + tap-on-map), walking-dot animation, step-by-step directions
- **Student portal** — My Day, Favorites, Reports, Profile, Settings
- **Admin portal** — Dashboard, Buildings, Users, Map Builder, Floor Plans, Routes, Reports, Accessibility, Events, Announcements, Activity Logs, Settings
- **Supabase backend** — Auth, database, Storage, Edge Functions

**Tech stack:** React 18 · TypeScript · Vite 6 · React Router 7 · Tailwind CSS 4 · Supabase · Vitest · Lucide icons · Motion · Recharts

---

## 2. Architecture (Paano naka-organisa)

```
src/
├── app/            → App.tsx, routes.tsx (LAHAT ng routes), shadcn ui kit
├── components/
│   ├── layout/     → PublicLayout, AdminLayout, Navbar, Footer, Sidebar, MobileBottomNav
│   ├── map/        → Map components (RoutePlannerDialog, RouteStepsPanel, etc.)
│   ├── map-builder/→ Admin Map Builder (37 files — Dev 2 territory)
│   ├── map-builder-v2/ → DEAD code (hindi ginagamit)
│   └── ui/         → Shared UI kit (Button, Badge, Card, StatCard, etc.)
├── contexts/       → CampusDataContext (global campus state)
├── data/           → Mock data (MOCK_BUILDINGS, FLOOR_PLANS, B_POS, schedule)
├── hooks/          → 16 reusable hooks (auth, search, theme, toast, etc.)
├── lib/            → Pure logic (pathfinding, routePlanner, geo, adapters)
├── pages/          → 30 pages (public + student + admin + auth)
├── services/       → 15 services (Supabase data layer)
├── types/          → TypeScript types (database.generated.ts, index.ts, map.ts)
├── config/         → env.ts, constants.ts, animation.ts
└── styles/         → Tailwind, theme, fonts
```

---

## 3. Routing — Lahat ng Pages (src/app/routes.tsx)

### Public pages (`PublicLayout` wrapper)
| Route | Page | Description |
|---|---|---|
| `/` | `LandingPage` | Hero, "Navigate PLV Smarter", features, announcements preview |
| `/map` | `CampusMapPage` | **Flagship interactive campus map** (SVG, routes, floors) |
| `/buildings` | `BuildingsPage` | Building directory grid (category filter, search, favorites) |
| `/buildings/:id` | `BuildingDetailsPage` | Building details, floors, directions CTA, report issue |
| `/help` | `HelpCenterPage` | FAQ, AI knowledge base, emergency info |
| `/announcements` | `AnnouncementsPage` | Public announcements feed (priority hero, category filter) |

### Student portal (public layout, protected ng `useStudentAuth`)
| Route | Page | Description |
|---|---|---|
| `/my-day` | `StudentMyDayPage` | Student daily schedule/agenda |
| `/student` | `StudentProfilePage` | Profile overview |
| `/student/favorites` | `StudentFavoritesPage` | Saved buildings + recent destinations |
| `/student/reports` | `StudentReportsPage` | Submit report + report history (status timeline) |
| `/student/settings` | `StudentSettingsPage` | Preferences, theme, logout |

### Auth pages (standalone)
| Route | Page | Description |
|---|---|---|
| `/admin` | `AdminLoginPage` | Admin/student sign-in (demo dropdown kapag demo mode) |
| `/register` | `RegistrationPage` | Student registration (real Supabase Auth) |
| `/auth/verify` | `VerificationPendingPage` | Email verification pending + resend |
| `/auth/callback` | `AuthCallbackPage` | Verification callback (success/expired/invalid states) |
| `/auth/forgot-password` | `ForgotPasswordPage` | Enumeration-safe password reset request |
| `/auth/reset-password` | `ResetPasswordPage` | Recovery callback + new password |

### Admin portal (`AdminLayout` — protected ng `useAdminAuth`)
| Route | Page | Description |
|---|---|---|
| `/admin-dashboard` | `AdminDashboardPage` | Metrics, priority items, recent activity, quick actions |
| `/admin-dashboard/buildings` | `AdminBuildingsPage` | Building CRUD (search/filter/pagination via service) |
| `/admin-dashboard/locations` | `AdminLocationsPage` | Campus location management |
| `/admin-dashboard/users` | `AdminUsersPage` | User list/invite/edit, role/status, activation |
| `/admin-dashboard/settings` | `AdminSettingsPage` | Site name, tagline, contact, notification toggles |
| `/admin-dashboard/map-builder` | `AdminMapBuilderPage` | **Map Builder** (campus/building/floor authoring) |
| `/admin-dashboard/floor-plans` | `AdminFloorPlansPage` | Legacy floor plan editor |
| `/admin-dashboard/routes` | `AdminRoutesPage` | Route CRUD (stats, type filter, SVG mini-map) |
| `/admin-dashboard/reports` | `AdminReportsPage` | Report review queue (approve/reject/resolve/archive) |
| `/admin-dashboard/accessibility` | `AdminAccessibilityPage` | Per-building accessibility checklist |
| `/admin-dashboard/events` | `AdminEventsPage` | Events CRUD (scheduled/draft/ended tabs) |
| `/admin-dashboard/announcements` | `AdminAnnouncementsPage` | Announcements CRUD (categories + priorities) |
| `/admin-dashboard/activity-logs` | `AdminActivityLogsPage` | Activity audit logs + CSV/JSON export |

**Lahat ng pages ay lazy-loaded** (code splitting) na may branded shimmer skeleton fallback. May custom 404 page na may quick links.

---

## 4. Services Layer (src/services/) — Data Access

Lahat ng services ay may **live Supabase + in-memory mock fallback** (kapag walang Supabase config, gagamit ng seed data na nagre-reset sa reload).

### Core
| Service | Function | Description |
|---|---|---|
| `crud.ts` | `createCrudService(table)` | Generic CRUD factory (list/create/update/delete) |
| `crud.ts` | `seedMockData()` | Seeds in-memory store mula sa mock data |
| `supabase.ts` | `validateSupabaseConfig`, `isSupabaseConnected` | Config check |
| `database.ts` | search helper | `searchBuildings(query)` |

### Entity services (lahat galing sa `index.ts` barrel export)
| Service | Key functions | Table |
|---|---|---|
| `buildingService` | list (search/filter/paginate), create, update, delete | `buildings` |
| `reportService` | `submitReport`, `getStudentReports`, `uploadReportImage`, `countPendingReports`, `listAllReports`, `updateReportStatus`, `updateReportInternalNotes`, `archiveReport`, `getReportHistory` | `reports` |
| `eventService` | `getPublishedAnnouncements`, `getUpcomingEvents`, `listEvents`, `createEvent`, `updateEvent`, `archiveEvent` | `campus_events` |
| `announcementService` | Realtime public feed plus system-wide/campus-scoped create, update, publish, and archive workflows | `announcements` |
| `settingsService` | `getSettings`, `getPublicSettings`, `upsertSettings`, `DEFAULT_SETTINGS` | `settings` |
| `activityLogService` | `logActivity`, `listActivityLogs`, `readableActionLabel`, `timeAgoLabel` | `activity_logs` |
| `dashboardService` | `getDashboardStats`, `getRecentActivity` | aggregates |
| `adminUserService` | typed `profiles` queries, `admin_update_profile` RPC, `admin-users` Edge Function | `profiles` |
| `studentAccountService` | `getSavedBuildings`, `toggleSaveBuilding`, `getRecentDestinations`, `addRecentDestination` | localStorage-based |
| `campusService` | `listCampuses`, `getCampusById`, `createCampus`, `updateWithVersion` (optimistic conflict), `listCampusVersions`, `uploadCampusImage`, `resolveActiveCampusId`, `toEditorCampus`; `CampusConflictError`/`CampusServiceError` classes | `campuses`, `campus_versions` |
| `locationService` / `routeService` / `userService` | generic CRUD | `locations`, `navigation_routes`, legacy |

**Important:** `activityLogService.logActivity` ang ginagamit ng report/event/announcement services para sa **audit trail** (bawat admin action may log entry).

---

## 5. Hooks (src/hooks/) — 16 Reusable Hooks

| Hook | Function |
|---|---|
| `useAdminAuth` | Validates admin session, re-checks role/active tuwing 15s + window focus |
| `useStudentAuth` | `getSession()` + `onAuthStateChange`, loads profile, exposes sign-out |
| `usePublishedCampus` | Loads published campuses, localStorage cache + offline fallback (`isCached`) |
| `useCampusSearch` | Unified search across buildings/rooms/offices/labs/facilities with categories + debounce |
| `useTheme` | Dark/light mode (persisted sa `plv-theme`) |
| `useToast` | Toast notifications |
| `useScrollReveal` | Scroll-reveal animation |
| `useUndoRedo` | Undo/redo state (Map Builder) |
| `useDataList` | List state (loading, search, filter, pagination) |
| `useCrudModal` | CRUD modal state machine |
| `useSearchKeyboard` | Ctrl+K / `/` to focus, Esc to clear |
| `useSearchHighlight` | `highlightSearch()` — highlights matches |
| `useDebounce` / `useDebouncedCallback` | Debounce |
| `useReducedMotion` | Respects OS reduced-motion (disables walk animation) |
| `useEscToClose` | Esc key closes dialogs |

---

## 6. Core Logic Library (src/lib/) — Pure Functions

### Pathfinding engine (3 tiers)
| Module | Functions | Description |
|---|---|---|
| `pathfinding.ts` | `findPath` (A*), `findBuildingPath`, `calculateTransition`, `buildTransitionEdges`, `findNavigationRoute` | **Outdoor A\*** sa walkway graph; `BUILDING_ENTRANCE_MAP` nagba-bridge ng legacy `b1`–`b6` + seed IDs (`b_mab`, `b_scb`, `b_guard`…). May `accessible` / `emergencySafe` per edge |
| `indoorPathfinding.ts` | `buildFloorGraphFromRooms`, `findIndoorRoute`, `findIndoorRouteForFloor`, `findMultiFloorIndoorRoute` | **Indoor A\*** over floor plans (rooms, stairs, elevators) |
| `combinedPathfinding.ts` | `findCompleteRoute`, `findCompleteRouteInCampus`, `searchDestinationsInCampus`, `searchDestinations` | **Outdoor+indoor stitching** — buong route mula building to room |

### Route planner (student-facing wrapper — C4)
| Function | Description |
|---|---|
| `planBuildingRoute(from, to, mode, positions, campusGraph?)` | Building→building route: **real graph stats sa LAHAT ng modes** + SVG estimate fallback |
| `planRouteFromPoint(point, dest, mode, campusGraph?, positions?)` | **"You are here"** → building route (snap sa nearest node + graph routing) |
| `planDestinationRoute(from, to, mode)` | Combined building→room route, exposes destination room |
| `stepsFromGraphPath` / `stepsFromCombined` | Structured turn-by-turn steps na may icons (`start/walk/stairs/elevator/enter/arrive/info`) |
| `detectFloorTransitions` | "Take the elevator to Floor 3" badges |
| `formatDistance` / `formatMinutes` | "450 m", "1h 15m" formatting |

### Geo / GPS (kiosk feature)
| Function | Description |
|---|---|
| `latLngToMapPoint(lat, lng, anchor, w, h)` | GPS coordinates → SVG map coordinates |
| `snapToNearest(pt, candidates)` | Snap point sa pinakamalapit na walkway node |
| `pointAlongPolyline(points, t)` | Position ng walking-dot avatar sa route (t = 0..1) |
| `polylineLength(points)` | Route polyline length |
| `dist` / `dist2` / `M_PER_UNIT` (0.22 m/unit) | Distance helpers |

### Adapters & helpers
| Module | Functions |
|---|---|
| `mapDataAdapter.ts` | `buildingPositionsFromCampus`, `floorPlansFromCampus`, `buildingsFromCampus`, `facilitiesFromCampus`, `accessibilityFromCampus`, `locationsFromCampus` — bridges Map Builder campus JSON → legacy shapes |
| `campusHelpers.ts` | Campus CRUD helpers, validation |
| `campusValidation.ts` | Pre-publish validation rules (accessibility/emergency checks) |
| `campusGroupMove.ts`, `campusArrangement.ts`, `campusStack.ts`, `campusLayerOrder.ts`, `campusSelection.ts` | Map Builder editing operations |
| `exporters.ts` | CSV/JSON export (activity logs) |
| `decorAsset.ts` / `decorVisual.ts` / `editorPlacement.ts` / `color.ts` | Map Builder visual tools |
| `buildingEntrances.ts` | Building entrance definitions |
| `studentAccount.ts` | Registration validation, typed signup/resend/reset flows |

---

## 7. Map Components (src/components/map/)

| Component | Description |
|---|---|
| `RoutePlannerDialog` | Start/destination pickers, mode chips (Standard/Accessible/SOS), "You are here" start option, swap button, route summary, mobile bottom-sheet layout |
| `RouteStepsPanel` | Step-by-step directions na may icons, DIST/TIME/VIA stats, **live step highlight** habang gumagalaw ang walking dot, **Replay** button, End, Zoom-to-route |
| `RouteMapOverlay` | Route line rendering, A/B markers, direction arrows, **walking-dot avatar** (`walkProgress` 0..1) |
| `RouteErrorState` | "No route found" state |
| `BuildingPicker` | Searchable combobox para sa building selection |
| `BuildingInfoPanel` | Building details side panel (directions, share, save, report, floor plan) |
| `MobileBuildingSheet` | Mobile bottom-sheet version ng info panel |
| `EventPopup` | Event pin popup (venue/date/description) |
| `ReportModal` | "Report an issue" form (photo + description) |
| `SignInPrompt` | Login prompt para sa student actions |
| `QRPlaceholder` | QR code placeholder (not yet wired) |

---

## 8. Map Builder (src/components/map-builder/) — Admin Authoring

**37 files** — kumpletong visual editor para sa campus maps. **Ito ang teritoryo ng Developer 2 (B-package)**; ang `SEED_CAMPUSES` dito ang pinagmumulan ng seeded PLV campus.

### View machine (`AdminMapBuilderPage`)
- `CampusHome` — campus cards grid, search, duplicate/archive/restore, Quick Start tutorial
- `CampusEditor` (~1,200 lines) — pangunahing editor
- `FloorEditor` — per-building/floor authoring
- `CampusWizard` / `CanvasSetupWizard` — creation flows
- `PublishDialog` / `PrePublishDialog` / `ValidationErrorsDialog` — publish pipeline

### Key features
- 5 layers: campus, navigation, accessibility, emergency, events
- Multi-select + rubber-band, Ctrl+A, align/distribute, batch delete, drag-to-create
- Path drawing + edge snapping
- Undo/redo (`useUndoRedo`), keyboard shortcuts, cheat sheet
- `RoutesPanel` (route authoring), `TestNavigationPanel` (live route test)
- Nav nodes/edges na may `accessible` + `emergencySafe` flags
- `SEED_CAMPUSES` — ang **seeded PLV Main Campus** (SCB, Canteen, CABA, COED, CEIT, Guard House + Tongco Street + Quadrangle + red brick walkways + nav graph)

---

## 9. Shared UI Kit (src/components/ui/)

`Button` · `Badge` · `BuildingCard` · `SearchBar` · `EmptyState` · `Skeleton` / `PageSkeleton` · `StatCard` (memoized) · `FormField` · `PLVLogo` · `HeroBackground` · `ThemeToggle` · `Tooltip` · `ConfirmDialog` / `TypeToConfirmDialog` · `Combobox` · `ColorPicker` · `MapPicker` · `Reveal` · `PageTransition` · `ErrorBoundary` · `NavigationProgress` · `StudentPageHeader` · `WeeklyChart` (unused) · `AnnouncementCard`

Layout components: `PublicLayout` · `AdminLayout` (route guard) · `Navbar` · `Footer` · `AdminSidebar` · `MobileBottomNav` · `ScrollToTop` · `LoadingScreen`

---

## 10. Seeded PLV Campus Map (data)

Ang **`SEED_CAMPUSES`** sa `src/components/map-builder/constants.ts` ay naglalaman ng:

- **6 buildings:** `b_scb` (Student Center), `b_canteen` (University Canteen), `b_caba` (CABA), `b_coed` (COED), `b_ceit` (CEIT), `b_guard` (Guard House sa main gate)
- **Visual paths:** Tongco Street (road), Quadrangle (green area), Main Gate walkway, Quad perimeter, 6 building walkways — **lahat red brick paths; WALANG diagonal shortcuts sa quad**
- **Nav graph:** 12 nodes (gate, entrances, Quad NW/NE/SE/SW, West Junction) + 13 edges — ang route ay sumusunod LANG sa red brick walkways
- **Decorative assets:** trees, benches, lamp posts, fountain
- **Assembly points** (emergency) + **accessibility features** (ramps, elevator)
- Demo student favorites: `b_scb`, `b_caba`

**Verified routes (live):**
- CABA → COED = **155 m · 2 min** (via Quad SW → NW → NE)
- SCB → COED = **102 m · 1 min** (via Quad NW → NE)
- "You are here" → GYM = **46 m · 1 min**

---

## 11. Campus Map Page (src/pages/CampusMapPage.tsx) — Ang Flagship

Interactive SVG map (~2,000 lines) na may:

- **Map modes:** `standard | accessible | emergency` (SOS)
- **Search:** buildings/offices/rooms + popular destinations
- **Directions:** `RoutePlannerDialog` + `RouteStepsPanel` + `RouteMapOverlay`
- **"You are here" (kiosk-style):** crosshair button → GPS `getCurrentPosition` (6s safety timeout) → fallback **tap-on-map** → marker na naka-snap sa nearest walkway node → chip na may **"Plan route"** button (HINDI auto-open ang planner)
- **Walking dot animation:** blue avatar gumagalaw sa route (~40 m/s visual), live step highlight, Replay
- **Floor plans:** per-building floor selector, room rendering, stair/elevator choice dialog
- **Building info panel** + mobile bottom sheet, event popup, report modal, sign-in prompt
- **Map tools:** layers toggle, zoom in/out, locate, reset view, campus selector, scale bar
- **Offline mode:** "Viewing cached campus map (offline mode)" banner kapag naka-cache

---

## 12. Student Portal Features

| Feature | Where | Details |
|---|---|---|
| My Day | `/my-day` | Student schedule/agenda |
| Favorites | `/student/favorites` | Saved buildings + recent destinations (localStorage) |
| Reports | `/student/reports` | Submit (photo + description), history, status timeline (Submitted → Under Review → Resolved), search/filter |
| Profile | `/student` | Profile info from Supabase `profiles` |
| Settings | `/student/settings` | Preferences, theme, logout |
| Announcements | `/announcements` | Public feed (priority hero, category filter) |

---

## 13. Admin Portal Features

| Feature | Where | Details |
|---|---|---|
| Dashboard | `/admin-dashboard` | 4 metric cards, pending items, recent activity, quick actions |
| Buildings CRUD | `/admin-dashboard/buildings` | Live service-backed CRUD (only page using services layer) |
| Users | `/admin-dashboard/users` | Invite/edit, role/status badges, activate/deactivate, session enforcement, audited |
| Map Builder | `/admin-dashboard/map-builder` | Full campus/building/floor authoring |
| Floor Plans | `/admin-dashboard/floor-plans` | Legacy floor CRUD |
| Routes | `/admin-dashboard/routes` | Route list, type filter, SVG mini-map |
| Reports | `/admin-dashboard/reports` | Review queue, approve/reject/resolve/archive, status filters |
| Accessibility | `/admin-dashboard/accessibility` | Per-building checklist |
| Events | `/admin-dashboard/events` | CRUD + status tabs (scheduled/draft/ended) |
| Announcements | `/admin-dashboard/announcements` | CRUD + categories + priorities + publish/archive |
| Activity Logs | `/admin-dashboard/activity-logs` | Audit trail + CSV/JSON export |
| Settings | `/admin-dashboard/settings` | Site name, tagline, contact, notification toggles |

---

## 14. Authentication & Security

- **Supabase Auth** ang may-ari ng credentials (email/password)
- `public.profiles` ang may-ari ng role (`admin` / `student`) + `is_active`
- **Signup trigger** — palaging gumagawa ng `student` profile (hindi maaaring i-set ang role sa signup)
- `useAdminAuth` — re-check ng role/active tuwing 15s + window focus; agad na inaalis ang access kapag na-deactivate
- **Admin users** — `admin_update_profile` RPC (RLS-protected, active-admin-validated) + `admin-users` Edge Function (service-role Auth invitations)
- **RLS** sa lahat ng tables; demo credentials ay browser-visible LANG sa demo mode
- `activity_logs` — append-only audit trail para sa privileged actions

---

## 15. Database (Supabase)

| Table | Purpose |
|---|---|
| `profiles` | Users (role, is_active, metadata) |
| `campuses` / `campus_versions` | Map Builder campuses + version history |
| `buildings` | Building catalog |
| `reports` | Issue reports (status, internal notes, image) |
| `campus_events` | Events |
| `announcements` | Announcements |
| `settings` | Key-value site settings |
| `activity_logs` | Audit log |
| `navigation_routes` | Route records |
| `locations` | Campus locations |
| Storage | `campus-images` (private) para sa campus logo/overview |

---

## 16. Testing & Verification

- **`pnpm build`** — TypeScript + Vite build (project compile check)
- **`pnpm test`** (`vitest run`) — **408/408 tests passing** across 43 test files:
  - `routePlanner.test.ts` (21) — graph routes, campus graph bridge, point routing
  - `pathfinding.test.ts` (24) — A*, transitions, nav graph, seed ids
  - `geo.test.ts` (11) — GPS→SVG, snapping, polyline interpolation
  - Map-builder component tests, hooks tests, service tests, UI tests
- **Verification scripts:** `verify:a1` (Supabase), `verify:a2` (auth), `verify:a3` (admin users), `verify:a5` (campus structure), `demo:accounts`
- **Per-package verification docs** sa `docs/progress/` (A1–A5, B1, C1–C8)

---

## 17. Developer 3 Progress (Workstream C)

| Package | Status |
|---|---|
| C1 — Public shell + Home + Help | ✅ DONE |
| C2 — Published campus map loading | ✅ DONE |
| C3 — Unified search + directory | ✅ DONE |
| C4 — Route planning + navigation | ✅ DONE (Phase 1 + Kiosk features: "You are here", walking dot, real campus map, UX polish) |
| C5 — Reports + history | ✅ DONE |
| C6 — Events + announcements | ✅ DONE |
| C7 — Favorites + recent + profile | ✅ DONE |
| C8-A/B — Routes fix + Dashboard/Activity logs | ✅ DONE |
| C9 — Responsive + typography + theme audit | ✅ DONE |
| C4 Phase 2 (DB graph swap) | 🔒 BLOCKED (Gate G3 — Dev 2) |
| C8-C (publish controls, branding) | 🔒 BLOCKED (Dev 1 A6/A7) |
| C10 | 🔒 BLOCKED (Gate G5) |

---

## 18. Alam na Isyu / Limitation (mula sa CURRENT_IMPLEMENTATION.md)

- Dashboard metrics ay hardcoded (hindi live aggregation) — naka-record na may fixes plan
- `map-builder-v2/` at malaking bahagi ng `src/app/components/ui/` ay **dead code**
- QR feature ay placeholder pa
- Dual data source: legacy `FLOOR_PLANS`/`B_POS` vs Map Builder campuses (bridged ng adapter)
- Public pages (Buildings, Details) at Admin pages ay iba ang data source (mock vs service)
- Walang `tsconfig.json` — `vite build` lang ang compile check
- C4 Phase 2 (DB-persisted graph) at C8-C (publish orchestration) ay naghihintay sa ibang developers
