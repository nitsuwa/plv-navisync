# PLV NaviSync — Feature & Capability Inventory

> **Purpose of this document:** A complete, current, decision-ready inventory of **every feature and capability** in the PLV NaviSync system. Use this as the master reference when **adding, removing, or adjusting features** against your set of criteria.
>
> **How to use it:** Every feature is listed with a stable ID, its status, who it serves, where it lives in code, and what it can do. Use the **Decision Worksheet** at the end to record Keep / Modify / Remove decisions per feature, with the reason tied to your criteria.
>
> **Status legend:**
> - ✅ **Active** — wired up and usable
> - ⚠️ **Partial / Buggy** — works but has known gaps or breakage
> - 🔌 **Built but NOT routed** — component exists, no route/entry point
> - 🧊 **Dead code** — implemented but not referenced anywhere
> - 🧹 **Removed** — recently deleted from the app

---

## 1. System at a Glance

| | |
|---|---|
| **System name** | PLV NaviSync — Smart Campus Navigator |
| **Type** | React SPA (React 18 · TypeScript · Vite · Tailwind 4 · Motion · React Router 7) |
| **Audiences** | Guests/visitors · Students · Faculty · Admins |
| **Data layer** | `CampusDataContext` (global store) + `services/` CRUD over Supabase tables; **mock-first** — runs fully on seed data when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are absent |
| **Persistence** | localStorage (campuses, theme, search hints) · sessionStorage (auth sessions) |
| **Demo accounts** | `admin`/`plv2025` · `student`/`plv2025` · `faculty`/`plv2025` (login UI dropdown lists only Admin & Student) |
| **Design source** | Figma — "Build PLV NaviSync App" |
| **Tests** | Vitest + Testing Library (`src/lib/__tests__/`) |

---

## 2. Cross-Cutting Capabilities (apply to the whole app)

| ID | Capability | Status | Notes |
|----|-----------|--------|-------|
| X-1 | **Dark/light theme** with persistence | ✅ | `useTheme`, `plv-theme` in localStorage |
| X-2 | **Responsive layouts** (desktop → mobile) | ✅ | Admin sidebar collapses; map supports touch; tool panels become sheets on small screens |
| X-3 | **Lazy-loaded routes** with branded skeleton loading states | ✅ | All pages code-split via `React.lazy` |
| X-4 | **Toast notification system** | ✅ | `sonner` (via `useToast` wrapper) |
| X-5 | **PWA-ready** (manifest + service worker) | ✅ | `public/manifest.json`, `public/sw.js` |
| X-6 | **Global error boundary** | ✅ | `ErrorBoundary` in `App.tsx` |
| X-7 | **Keyboard navigation & accessibility** (focus rings, ARIA, reduced-motion) | ✅ | Documented in `SYSTEM_DESCRIPTIVE_SPEC.md` |
| X-8 | **Mock ↔ Supabase dual-mode persistence** | ✅ | All services degrade gracefully when env vars missing |
| X-9 | **3 demo roles** (admin/student/faculty) | ⚠️ | Faculty creds only work if typed manually; not in dropdown |

---

## 3. Auth & Accounts

| ID | Feature | Status | Audience | Where | Capabilities |
|----|---------|--------|----------|-------|--------------|
| A-1 | **Admin login** | ✅ | Admin | `AdminLoginPage` | Role-based redirect to `/admin-dashboard`; inline errors with demo-credential hints; session in sessionStorage (`plv-admin-auth`) |
| A-2 | **Student login** (via admin login page) | ✅ | Student | `AdminLoginPage` | Student/faculty creds route to public `/map`; session in sessionStorage (`plv-student-auth`) |
| A-3 | **Student registration** | ✅ | Student | `RegistrationPage` | Two-step wizard (details → password); validation: name, valid email, student ID, username ≥4, password ≥6, matching passwords; success screen |
| A-4 | **Auth guard for admin portal** | ✅ | — | `AdminLayout` | Redirects unauthenticated users away from `/admin-dashboard/*` |

---

## 4. Public / Student-Facing Modules

### 4.1 Landing Page
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| L-1 | Marketing home with hero, feature highlights, CTAs | ✅ | `LandingPage` (`/`) |
| L-2 | Navigation links to Map / Buildings / Help / Announcements | ⚠️ | Footer links to `/announcements` → **404** (see R-9) |

### 4.2 Campus Map (`/map`) — flagship student feature
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| M-1 | Interactive **SVG campus map** — pan (with inertia), wheel/pinch zoom, keyboard pan, double-click zoom, reset | ✅ | `CampusMapPage` + `src/components/map/` |
| M-2 | **Search** buildings (and rooms inside floor plans) with debounce + recent searches | ✅ | `CampusMapPage`, `SearchBar` |
| M-3 | **Directions mode** — pick From/To, animated route (glow, arrows, checkpoints), distance + ETA, step-by-step list | ✅ | `CampusMapPage` |
| M-4 | **3 map modes** — Standard / Accessible (wheelchair-safe routing) / Emergency (exits, rally points, EXIT overlays) | ✅ | `CampusMapPage` |
| M-5 | **Layer toggles** (buildings / accessibility / emergency) | ✅ | `CampusMapPage` |
| M-6 | **Floor plans** — drill into building, switch floors, animated stair/elevator transitions | ✅ | `CampusMapPage` |
| M-7 | **Indoor room routing** — route from nearest stair/elevator to a room with directions | ✅ | `indoorPathfinding.ts` |
| M-8 | **End-to-end combined routing** (outdoor + indoor + multi-floor via stairs/elevators) | ✅ | `combinedPathfinding.ts` |
| M-9 | **Building info panel** — facilities, accessibility, opening status (Open/Busy/Closed), actions | ✅ | `BuildingInfoPanel` |
| M-10 | **Favorites bookmark** (student-only; guests get sign-in prompt) | ✅ | `CampusMapPage` |
| M-11 | **Report an issue** modal (student-only; guests prompted) | ✅ | `ReportModal` |
| M-12 | **Share / QR placeholder** | ✅ | `QRPlaceholder` |
| M-13 | **Multi-campus support** — published + non-archived only, newest first, campus switcher | ✅ | `CampusDataContext` |

### 4.3 Buildings & Content Pages
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| B-1 | **Buildings directory** — search, category filter pills, sort, grid/list toggle | ✅ | `BuildingsPage` (`/buildings`) |
| B-2 | **Building details** — full info, floor plans, facilities, accessibility, deep-link by ID | ✅ | `BuildingDetailsPage` (`/buildings/:id`) |
| B-3 | **Announcements list** — urgent highlighting, category/priority filters, search, empty states | 🔌 | `AnnouncementsPage` — **component exists, NO public route** (see R-9) |
| B-4 | **Help Center** — FAQ + **AI campus assistant chat** (keyword-based KB, 11 topics, suggested-question chips, typing indicator, timestamps) | ✅ | `HelpCenterPage` (`/help`) |
| B-5 | **AI chat guest quota** — 5 queries/day for guests (localStorage-tracked), unlimited when signed in | ✅ | `HelpCenterPage` |

### 4.4 Student Portal (login-gated)
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| P-1 | **My Day** — personalized daily view aggregating schedule/announcements/favorites | ✅ | `StudentMyDayPage` (`/my-day`) |
| P-2 | **Profile** — view/edit profile | ✅ | `StudentProfilePage` (`/student`) |
| P-3 | **Favorites** — list + remove saved buildings | ✅ | `StudentFavoritesPage` (`/student/favorites`) |
| P-4 | **Reports** — history of submitted issue reports + status | ✅ | `StudentReportsPage` (`/student/reports`) |
| P-5 | **Settings** — account/theme/preferences | ✅ | `StudentSettingsPage` (`/student/settings`) |
| P-6 | **Student Dashboard** | 🧹 | `StudentDashboardPage.tsx` **deleted** from repo |

---

## 5. Admin Portal

### 5.1 Admin shell
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| AD-1 | **Admin layout** — sidebar nav, breadcrumbs, mobile adaptation, auth guard | ✅ | `AdminLayout`, `AdminSidebar` |

### 5.2 Admin management pages
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| AD-2 | **Dashboard** — metric cards (Buildings Mapped, Total Rooms, Active Routes, Pending Reports), priority list, recent activity, quick actions | ✅ | `AdminDashboardPage` (`/admin-dashboard`) |
| AD-3 | **Users** — manage student/admin accounts | ✅ | `AdminUsersPage` (`/admin-dashboard/users`) |
| AD-4 | **Settings** — app config, keybinds, theme | ✅ | `AdminSettingsPage` (`/admin-dashboard/settings`) |
| AD-5 | **Reports** — review/manage student-submitted issues | ✅ | `AdminReportsPage` (`/admin-dashboard/reports`) |
| AD-6 | **Announcements admin CRUD** | 🔌 | `AdminAnnouncementsPage` — **component exists, NO admin route** (see R-9) |

### 5.3 Map Builder (`/admin-dashboard/map-builder`) — flagship admin feature
#### Campus management
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| MB-1 | **Campus Home** — campus cards (status badge, building/floor counts, mini-map preview), search, status filter pills | ✅ | `CampusHome` |
| MB-2 | **Campus quick actions** — open, duplicate, archive, delete (with confirmation) | ✅ | `CampusHome` |
| MB-3 | **Create campus wizard** (canvas dimensions, identity) + empty-state guide + first-time tutorial | ✅ | `CampusWizard`, `CanvasSetupWizard`, `CreateCampusGuide`, `MapBuilderTutorial` |
| MB-4 | **Edit campus details** (full campus preserved on save — recent fix) | ✅ | `AdminMapBuilderPage` |
| MB-5 | **Publish workflow** — validation checklist, save-as-draft, publish/unpublish/archive with progress dialogs | ✅ | `PublishScreen`, `PrePublishDialog`, `ValidationErrorsDialog`, `ActionProgressDialog` |

#### Campus Editor canvas
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| MB-6 | **Canvas workspace** — SVG grid, grid/edge snapping, alignment guides, zoom/pan/reset, cursor coords | ✅ | `CampusEditor`, `Canvas`, `useCanvasControls` |
| MB-7 | **Drawing tools** — Select, Marker (POI), Building (drag-to-draw + palette placement), Path, Erase, Waypoint, Room | ✅ | `CampusEditor` |
| MB-8 | **Building manipulation** — drag (snap), rotation (5° snapping), rotation-aware resize, overlap detection, boundary checks | ✅ | `CampusEditor` |
| MB-9 | **Multi-select** — shift+click, rubber-band box, Ctrl+A, batch move/delete/duplicate, align & distribute | ✅ | `CampusEditor` |
| MB-10 | **Decor assets** — place, rotate, uniformly scale | ✅ | `CampusEditor`, `constants.ts` |
| MB-11 | **5 editing layers** — Campus, Navigation, Accessibility, Emergency, Events (each with own palette/colors/panels) | ✅ | `CampusEditor` |
| MB-12 | **Hierarchy panel** — searchable tree, visibility/lock toggles, floor expansion, reorder | ✅ | `HierarchyPanel` |
| MB-13 | **Properties panel** — contextual fields (basic/style/advanced), route fields, accessibility checklist, event fields | ✅ | `PropertiesPanel`, `FloorPropertiesPanel` |
| MB-14 | **Undo/redo** (30-step history), keyboard shortcuts + `?` cheat sheet, auto-save | ✅ | `useUndoRedo`, `useFloorHistory`, `ShortcutCheatSheet` |
| MB-15 | **Test navigation panel** — simulate a route on the canvas | ✅ | `TestNavigationPanel` |
| MB-16 | **Context menu** + validation issues popover | ✅ | `ContextMenu`, `IssuesPopover` |
| MB-17 | **Building type palette** — click to place pre-sized building types | ✅ | `CampusEditor` (`BUILDING_TYPE_MAP`) |

#### Floor Editor
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| MB-18 | **Room drawing** per floor with room-type palette (classroom, office, lab, lobby, restroom, stairs, storage, elevator) | ✅ | `FloorEditor` |
| MB-19 | **Room properties** (name, type, dimensions, accessibility flag, nav connection) | ✅ | `FloorEditor` |
| MB-20 | **Stair/elevator connectors** between floors → feeds multi-floor routing | ✅ | `FloorEditor` |
| MB-21 | **Copy rooms across floors** | ✅ | `FloorEditor` |

#### Authoring content layers
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| MB-22 | **Navigation routes authoring** (walking/accessible/emergency styles, waypoints, auto distance/duration, from/to markers) | ✅ | `CampusEditor` (Nav layer), `RoutesPanel` |
| MB-23 | **Accessibility authoring** (per-building matrix + canvas markers) | ✅ | CampusEditor (Accessibility layer) |
| MB-24 | **Emergency authoring** (exit markers, assembly areas, fire equipment, emergency routes) | ✅ | CampusEditor (Emergency layer) |
| MB-25 | **Event overlays** (pins with title/date/organizer, restricted-area polygons, one active event at a time) | ✅ | CampusEditor (Events layer) |

### 5.4 Legacy management pages (still routable — candidates for removal/consolidation)
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| LG-1 | **Buildings admin CRUD** | ✅ | `/admin-dashboard/buildings` |
| LG-2 | **Locations admin CRUD** (POIs, auto-generated + custom) | ✅ | `/admin-dashboard/locations` |
| LG-3 | **Floor plans admin** | ✅ | `/admin-dashboard/floor-plans` |
| LG-4 | **Routes admin** | ✅ | `/admin-dashboard/routes` |
| LG-5 | **Accessibility admin** | ✅ | `/admin-dashboard/accessibility` |
| LG-6 | **Events admin** | ✅ | `/admin-dashboard/events` |

> **Note:** These overlap heavily with the Map Builder's capabilities (buildings, floor plans, routes, accessibility, events can all be authored inside the Map Builder). Prime candidates to review for removal/consolidation.

### 5.5 Map Builder v2 (experimental)
| ID | Feature | Status | Where |
|----|---------|--------|-------|
| MB-26 | **Map Builder Workspace v2** — Buildings / FloorPlans / Layers / Routes / Preview tabbed workspace | 🧊 | `src/components/map-builder-v2/` — **dead code, not imported anywhere** |

---

## 6. Navigation & Routing Engine (underpins features M-3, M-7, M-8, MB-22)

| ID | Capability | Status | Where |
|----|-----------|--------|-------|
| N-1 | **Outdoor A\* pathfinding** over calibrated walkway graph (≈0.22 m/SVG unit), entrance maps, distance/time estimates, human-readable steps | ✅ | `lib/pathfinding.ts` |
| N-2 | **Indoor pathfinding** — auto-detects corridors from room positions, per-floor graph | ✅ | `lib/indoorPathfinding.ts` |
| N-3 | **Combined routing** — stitches indoor + outdoor segments (room→room, building→room), multi-floor transitions (~15 s/floor), accessible-only mode excludes stairs | ✅ | `lib/combinedPathfinding.ts` |
| N-4 | **Route graph from Map Builder** — routes/waypoints authored in the editor become routable edges | ✅ | `lib/mapDataAdapter.ts` |

---

## 7. Known Discrepancies & Candidates for Review

These are things worth deciding on as part of your add/remove/adjust pass:

| ID | Issue | Detail | Suggested decision |
|----|-------|--------|-------------------|
| R-1 | **Announcements routes not wired** | `AnnouncementsPage` and `AdminAnnouncementsPage` exist and work, but `routes.tsx` has **no** `/announcements` or `/admin-dashboard/announcements` route. Footer ("Announcements" link), My Day quick links, and the dashboard's "Post Announcement" action all point to a **404**. | Wire the routes (add) or drop the links (remove) |
| R-2 | **Map Builder v2 is dead code** | `src/components/map-builder-v2/` (tabbed workspace) is exported but never imported. | Remove, or wire as an alternative UI |
| R-3 | **Legacy admin pages duplicate Map Builder** | Buildings/Locations/FloorPlans/Routes/Accessibility/Events admin CRUD pages overlap Map Builder authoring capabilities. | Consolidate or remove |
| R-4 | **Faculty role is half-baked** | `faculty`/`plv2025` works only if typed manually; not in the demo-account dropdown; routes to student area. | Complete or remove |
| R-5 | **Student Dashboard deleted** | `StudentDashboardPage.tsx` was removed from the repo; `/my-day` covers this space now. | Confirm it's intentional |
| R-6 | **AI chat is keyword-based** | Help Center "AI assistant" is a deterministic keyword knowledge base (11 topics), not a real LLM. | Keep as-is or upgrade |
| R-7 | **Data self-healing** | `sanitizeCampus()` repairs legacy localStorage campus data on load (recently added). | Keep |
| R-8 | **QR share is a placeholder** | "Share" opens a QR placeholder dialog, not a real share/QR generator. | Complete or remove |

---

## 8. Decision Worksheet (use for your add/remove/adjust pass)

Copy this table and fill it in as you evaluate each feature against your criteria. Suggested criteria columns:

- **Value** — does it serve the target users' core goals? (High / Med / Low)
- **Usage** — is it actually used/reachable? (Used / Unused / Dead)
- **Effort** — cost to maintain/improve it (Low / Med / High)
- **Redundancy** — does another feature already cover it? (None / Partial / Full)
- **Risk** — does removing it break something else? (None / Low / Med / High)
- **Decision** — Keep / Modify / Remove
- **Reason** — one line tied to your criteria

| ID | Feature | Value | Usage | Effort | Redundancy | Risk | Decision | Reason |
|----|---------|-------|-------|--------|-----------|------|----------|--------|
| L-1 | Landing page | | | | | | | |
| M-1 | Campus map pan/zoom | | | | | | | |
| M-3 | Directions mode | | | | | | | |
| M-4 | Map modes (Accessible/Emergency) | | | | | | | |
| M-6 | Floor plans | | | | | | | |
| M-7 | Indoor room routing | | | | | | | |
| B-3 | Announcements (public) | | | | | | | |
| B-4 | Help Center + AI chat | | | | | | | |
| P-1…P-5 | Student portal pages | | | | | | | |
| AD-2 | Admin dashboard | | | | | | | |
| AD-6 | Announcements admin | | | | | | | |
| MB-1…MB-25 | Map Builder features | | | | | | | |
| LG-1…LG-6 | Legacy admin pages | | | | | | | |
| MB-26 | Map Builder v2 | | | | | | | |
| R-4 | Faculty role | | | | | | | |

---

## 9. Feature → Code Map (quick lookup)

| Feature ID | Primary entry files |
|------------|---------------------|
| L-1 | `src/pages/LandingPage.tsx` |
| M-1…M-13 | `src/pages/CampusMapPage.tsx`, `src/components/map/*`, `src/lib/combinedPathfinding.ts`, `src/lib/indoorPathfinding.ts` |
| B-1, B-2 | `src/pages/BuildingsPage.tsx`, `src/pages/BuildingDetailsPage.tsx` |
| B-3 | `src/pages/AnnouncementsPage.tsx` (unrouted) |
| B-4, B-5 | `src/pages/HelpCenterPage.tsx` |
| P-1…P-5 | `src/pages/Student*Page.tsx` |
| AD-2…AD-6 | `src/pages/Admin*Page.tsx` |
| MB-1…MB-25 | `src/pages/AdminMapBuilderPage.tsx`, `src/components/map-builder/*` |
| MB-26 | `src/components/map-builder-v2/*` (dead) |
| LG-1…LG-6 | `src/pages/Admin{Buildings,Locations,FloorPlans,Routes,Accessibility,Events}Page.tsx` |
| N-1…N-4 | `src/lib/pathfinding.ts`, `src/lib/indoorPathfinding.ts`, `src/lib/combinedPathfinding.ts`, `src/lib/mapDataAdapter.ts` |
| Data layer | `src/contexts/CampusDataContext.tsx`, `src/services/*`, `src/lib/campusHelpers.ts` |
