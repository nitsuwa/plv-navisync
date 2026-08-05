# PLV NaviSync — Detailed Descriptive System Specification

> **Purpose of this document:** Provide a complete, descriptive reference of the PLV NaviSync system so that **test questionnaire authors** can craft accurate, unambiguous **ISO/IEC 25010-based** and **feature-based** evaluation questionnaires.
>
> **Intended use:** Read a module's description → identify the testable behaviors → turn them into questionnaire items. Each module section lists the concrete behaviors a respondent can actually experience.

---

## 0. How to Use This Spec for Questionnaire Writing

Every section below describes **observable behavior**, not marketing. Each feature description is written in the form:

- **What it is** — the screen/widget and its purpose
- **What the user can do** — the concrete interactions
- **What the user sees** — the feedback / output
- **Edge cases** — behaviors worth testing

Use these to write questions such as:
> "I was able to find the building/room I was looking for within a reasonable amount of time." (Usability — ISO 25010)
> "The route directions were accurate and matched the path drawn on the map." (Functional suitability — ISO 25010)

---

## 1. System Identity

| Item | Value |
|------|-------|
| System name | PLV NaviSync |
| Tagline | Smart Campus Navigator |
| Institution | Pamantasan ng Lungsod ng Valenzuela (PLV) |
| Type | Web application (React SPA) |
| Audiences | Students/visitors (public map + portal) and Administrators (management + map building) |
| Original design source | Figma — "Build PLV NaviSync App" |
| Demo accounts | `admin`/`plv2025`, `student`/`plv2025`, `faculty`/`plv2025` (note: the login UI's "Use a Demo Account" dropdown lists only Admin and Student; faculty credentials work only if typed manually) |

**Primary goal:** Let any campus user locate buildings, rooms, facilities, and services — and receive clear, animated, step-by-step navigation — while giving administrators a professional tool to author and publish that campus map data.

---

## 2. Roles & Access Model

| Role | How they sign in | What they can access |
|------|------------------|----------------------|
| **Guest (no login)** | Browse only | Landing page, campus map, buildings directory, help center, announcements |
| **Student** | `student` demo, or self-registration | Everything guests see + favorites, reports, My Day, profile/settings; 5 daily AI-chat queries when not signed in, unlimited when signed in |
| **Faculty** | `faculty` demo | Same landing area as student |
| **Admin** | `admin` demo | Everything above + the full admin portal (dashboard, users, settings, reports, map builder, floor plans, routes, locations, accessibility, events) |

**Login behavior worth testing:**
- Admin credentials route to `/admin-dashboard`.
- Student/faculty credentials route to the public campus map (`/map`).
- Wrong credentials show an inline error with a hint listing demo credentials.
- Session persists per tab via `sessionStorage` (`plv-admin-auth`, `plv-student-auth`).

**Registration behavior worth testing:**
- Two-step wizard (1: details, 2: password) with field-level validation.
- Validations: name required, valid email (must contain `@`), student ID required, username ≥ 4 chars, password ≥ 6 chars, passwords must match.
- Success screen with "Go to Sign In" action.

---

## 3. Public / Student Modules

### 3.1 Landing Page (`/`)
**What it is:** Marketing front page. Hero section, feature highlights, navigation CTA, theme toggle.
**Testable behaviors:**
- Responsive rendering on desktop / tablet / mobile.
- All navigation links (Map, Buildings, Help, Announcements) work.
- Dark/light theme toggle persists.

### 3.2 Campus Map (`/map`) — flagship student feature
**What it is:** An interactive SVG map of the PLV campus with buildings, walkways, accessibility and emergency overlays, plus drill-down floor plans.

**Core interactions:**
- **Pan** — drag the map; momentum/inertia on release; keyboard arrow keys pan.
- **Zoom** — mouse wheel, `+`/`-` keys, `0` resets; double-click zooms in; mobile pinch-to-zoom.
- **Select building** — click a building to open the info panel; the map smooth-pans to it.
- **Search** — type to filter buildings by name/code (and rooms when inside a floor plan); recent searches shown.
- **Directions mode** — pick From and To; an animated route (glow, arrows, checkpoints, start/end markers) is drawn; distance (meters) and time (minutes) shown; step-by-step instructions listed.
- **Map modes** — Standard / Accessible / Emergency toggles change the visual overlay and route calculation (accessible mode uses wheelchair-safe graph routing).
- **Layer toggles** — buildings / accessibility / emergency overlays can be shown or hidden.
- **Floor plans** — double-click a building to enter its floor plan view; switch floors; click stair/elevator nodes to travel between floors (with animated transition); rooms render as color-coded slabs.
- **Indoor routing** — click a room to draw an indoor route from the nearest stair/elevator to that room, with step-by-step directions and estimated distance/time.
- **Favorites** — bookmark a building (requires student login; guests get a sign-in prompt).
- **Report an issue** — modal per building to submit an issue report (requires login; guests prompted to sign in).
- **QR / share** — share or view a QR placeholder for the building.
- **Multi-campus** — if several campuses are published, a campus selector appears; switching shows a brief transition.

**Info panel content:** building name, code, category, description, facilities list, accessibility features, opening status (Open/Busy/Closed), and action buttons (Directions, Save, Report, Share). The Share action opens a QR placeholder dialog (`QRPlaceholder`).

**Edge cases to test:** searching while inside a floor plan searches rooms instead of buildings; Escape closes the floor plan and resets zoom; dragging vs. clicking is distinguished (a drag does not count as a click); when multiple campuses are published, only published + non-archived campuses appear and the newest published is selected first.

### 3.3 Buildings Directory (`/buildings`)
**What it is:** Searchable, filterable, sortable catalog of campus buildings.
**Testable behaviors:**
- Search by name, code, description, category (debounced).
- Category filter pills (Academic, Administration, Facilities, Sports, Dormitory).
- Sort (Name A–Z, Z–A, Most Floors, Category).
- Grid / list view toggle.
- Each card links to the building details page.
- Data derives from the *published campus* (fallback to mock data if none).

### 3.4 Building Details (`/buildings/:id`)
**What it is:** Dedicated page for one building.
**Testable behaviors:** Shows full info, floor plans, facilities, accessibility, and navigation entry points; deep-linking by ID works; unknown IDs handled.

### 3.5 Announcements
**What it is:** Official notices list (`AnnouncementsPage.tsx`) with urgent-alert highlighting, category/priority filters, and search.
**⚠️ Route note for testers:** As of this writing, `src/app/routes.tsx` does **not** register a public `/announcements` route or an admin `/admin-dashboard/announcements` route, even though the Footer, the My Day page, the admin dashboard's "Post Announcement" quick action, and `ROUTE_LABELS` all reference those URLs (they currently resolve to the 404 page). The page component and admin CRUD page (`AdminAnnouncementsPage.tsx`) exist and work; the routing is simply not wired. **Verify whether the routes have been added before including these items in the test scope** — otherwise mark them N/A.
**Testable behaviors (if reachable):**
- Urgent announcements highlighted in a distinct alert box.
- Filter by category (General, Academic, Events, Emergency, Maintenance) and priority (Urgent, High, Normal, Low).
- Search by title/content/author.
- Empty states when filters match nothing, with a "clear filters" action.

### 3.6 Help Center (`/help`)
**What it is:** FAQ-style support page with a built-in **AI campus assistant chat** (keyword-based knowledge base, 11 topics).
**Testable behaviors:**
- Suggested questions render as clickable chips.
- Chat answers about Registrar, Cashier, Library, Admissions, Gymnasium, Emergency, Floor plans, Parking, Wi-Fi, Events, Routes.
- **Guest limit:** non-signed-in users get 5 queries per day (localStorage-tracked); signed-in users unlimited.
- Typing indicator and message timestamps.

### 3.7 Student Portal (login-gated)
| Page | Route | Testable behaviors |
|------|-------|--------------------|
| **My Day** | `/my-day` | Personalized daily view aggregating schedule/announcements/favorites |
| **Profile** | `/student` | View/edit profile details |
| **Favorites** | `/student/favorites` | List of saved buildings; remove items |
| **Reports** | `/student/reports` | History of submitted issue reports and their status |
| **Settings** | `/student/settings` | Account/theme/preference settings |

---

## 4. Admin Modules

### 4.1 Admin Layout
- Sidebar navigation with all admin sections; breadcrumbs; mobile-adapted layout.
- Auth guard: redirects unauthenticated users.

### 4.2 Dashboard (`/admin-dashboard`)
**What it is:** Overview of campus operations.
**Testable behaviors:**
- Key metric cards (Buildings Mapped, Total Rooms, Active Routes, Pending Reports) render with correct values.
- Priority items list (high/medium priority reports) links to the Reports page.
- Recent activity feed.
- Quick actions (Open Map Builder, Review Reports, Post Announcement, Manage Users).

### 4.3 Map Builder (`/admin-dashboard/map-builder`) — flagship admin feature
**What it is:** A GIS-style campus authoring tool. Users manage **campuses**; each campus contains **buildings**, **floor plans**, **markers**, **paths**, **routes**, **accessibility features**, and **event overlays**.

**Campus Home screen:**
- Grid of campus cards showing a mini-map preview, status badge (Published/Draft), building/floor counts, updated date.
- Quick actions per card: Open Editor, Duplicate, Archive, Delete (with confirmation).
- Create a new campus (wizard) with canvas dimensions.
- Empty state guides first-time users; "Quick Start" wizard / tutorial available.

**Campus Editor** (the main canvas workspace):
- **Canvas** — SVG workspace with grid snapping, edge snapping, alignment guides, zoom/pan/reset, cursor coordinates in status bar.
- **Tools** — Select, Marker (place POI), Building (drag-to-draw or palette placement), Path (click waypoints, double-click to finish), Erase, Waypoint, Room (in floor editor).
- **Building operations** — drag to move (snap + edge-snap), resize via corners (rotation-aware), rotate via a handle (snapped to 5°), edit properties (name, code, category, description, color, floors).
- **Multi-select** — shift+click, rubber-band box selection, Ctrl+A select-all, batch move/delete/duplicate, align/distribute toolbar, grouping.
- **Layers** — Campus, Navigation, Accessibility, Emergency, Events; each layer changes the tool palette, colors, and side panels.
- **Hierarchy panel** — searchable tree of buildings/markers/paths with visibility toggles, lock icons, floor expansion, drag-to-reorder, context menus.
- **Properties panel** — contextual fields for the selected item (basic/style/advanced tabs for buildings; route fields for routes; accessibility checklist for buildings; event fields for event markers).
- **Decor assets** — place, rotate, uniformly scale decorative assets on the canvas.
- **Test navigation panel** — simulate a route on the Navigation layer and preview it on canvas.
- **Undo/redo** (30-step history), keyboard shortcuts (V/B/M/P/E, 1–5 layers, Ctrl+Z/Y/S/A/D/G, Delete, arrow nudge, `?` cheat sheet), auto-save indicator, validation issues popover.

**Floor Editor:**
- Per-floor canvas (440×290 SVG space) with room drawing tools.
- Room palette by type (classroom, office, lab, lobby, restroom, stairs, storage, elevator).
- Room properties panel (name, type, dimensions, accessibility flag, navigation connection point).
- Stairs/elevators link floors for multi-floor indoor routing.
- Copy rooms across floors within the same building.

**Navigation layer:**
- Draw **routes** (walking / accessible / emergency) with color-coded styles.
- Place **waypoints**; routes become routable graph edges.
- Route properties: name, type, distance (auto-calculated), duration (auto-calculated), from/to markers.
- Routes feed the student map's navigation engine.

**Accessibility layer:**
- Per-building accessibility matrix (ramp, elevator, accessible restroom, wide corridors).
- Place accessibility markers (accessible entrance, elevator, ramp) on canvas.
- Data flows into pathfinding's `accessibleOnly` parameter.

**Emergency layer:**
- Place exit markers, assembly areas, fire equipment.
- Emergency routes marked as emergency-safe for evacuation routing.

**Events layer:**
- Place event pins with title/date/organizer/description; restricted areas drawn as shaded polygons.
- Only one event can be "active" at a time; active events overlay on the student map.

**Publish workflow:**
- Validation checklist (empty buildings, missing descriptions, floors without rooms, missing route configs).
- Publish now / save as draft / unpublish / archive actions with progress dialogs.
- Published campuses appear to students; drafts and archived campuses are hidden.

### 4.4 Legacy Management Pages (still routable)
| Page | Route | Purpose |
|------|-------|---------|
| Buildings | `/admin-dashboard/buildings` | CRUD on buildings |
| Locations | `/admin-dashboard/locations` | Manage campus locations/POIs |
| Floor Plans | `/admin-dashboard/floor-plans` | Manage floor plans |
| Routes | `/admin-dashboard/routes` | Manage navigation routes |
| Accessibility | `/admin-dashboard/accessibility` | Manage accessibility data |
| Events | `/admin-dashboard/events` | Manage event maps |
| Reports | `/admin-dashboard/reports` | Review student issue reports |
| Users | `/admin-dashboard/users` | Manage user accounts |
| Settings | `/admin-dashboard/settings` | App settings and keybinds |

---

## 5. Cross-Cutting Behaviors Worth Testing

1. **Data persistence / mock mode** — with no Supabase env vars, the app runs on seeded mock data; with credentials set, it persists to Supabase. All CRUD should behave consistently in both modes.
2. **Theme system** — dark/light toggle available on auth pages; theme persists.
3. **Responsive behavior** — admin layout collapses to mobile; map supports touch gestures; tool panels become sheets/modals on small screens.
4. **Notifications** — toast notifications for save/publish/login/success/error feedback.
5. **Loading states** — branded skeletons on map load, page transitions, and skeleton lists.
6. **Pathfinding correctness** — outdoor distances (≈0.22 m/SVG unit) and indoor distances (≈0.12 m/SVG unit); walking speed assumptions (~80 m/min outdoors, ~1.2 m/s indoors); multi-floor transitions add ~15 s/floor.
7. **Accessibility mode** — accessible-only routing excludes stairs; accessible markers shown; elevator transitions allowed.
8. **Emergency mode** — emergency routes, exits, assembly areas, and evacuation-safe edges honored.

---

## 6. Environment & Known Setup

| Item | Detail |
|------|--------|
| Run | `npm i` then `npm run dev` |
| Build | `npm run build` |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (optional; mock mode otherwise) |
| Tests | Vitest + Testing Library (`src/lib/__tests__/`) |
| Demo logins | `admin`/`plv2025` (admin), `student`/`plv2025` (student), `faculty`/`plv2025` (faculty) |

---

## 7. Quick Reference: Feature → Module Map (for questionnaire authors)

| # | Feature | Where (page/component) | Audience |
|---|---------|------------------------|----------|
| F1 | Login (role-based redirect) | AdminLoginPage | All |
| F2 | Student registration | RegistrationPage | Student |
| F3 | Landing page | LandingPage | Guest |
| F4 | Campus map pan/zoom/search | CampusMapPage | Student/Guest |
| F5 | Directions (animated route) | CampusMapPage | Student/Guest |
| F6 | Map modes (Standard/Accessible/Emergency) | CampusMapPage | Student/Guest |
| F7 | Floor plans + stair/elevator travel | CampusMapPage | Student/Guest |
| F8 | Indoor room routing | CampusMapPage | Student/Guest |
| F9 | Favorites | CampusMapPage + StudentFavoritesPage | Student |
| F10 | Report an issue | CampusMapPage + StudentReportsPage | Student |
| F11 | Building directory + details | BuildingsPage, BuildingDetailsPage | Guest/Student |
| F12 | Announcements (filters, urgent) | AnnouncementsPage | Guest/Student |
| F13 | Help Center + AI assistant chat | HelpCenterPage | Guest/Student |
| F14 | Student portal (My Day, profile, settings) | Student* pages | Student |
| F15 | Admin dashboard (metrics, quick actions) | AdminDashboardPage | Admin |
| F16 | Campus management (CRUD, archive, duplicate) | CampusHome | Admin |
| F17 | Campus editor canvas (draw/edit buildings) | CampusEditor | Admin |
| F18 | Multi-select & batch operations | CampusEditor | Admin |
| F19 | Layers (Campus/Nav/Accessibility/Emergency/Events) | CampusEditor | Admin |
| F20 | Floor editor (rooms, stairs/elevators) | FloorEditor | Admin |
| F21 | Navigation routes authoring | CampusEditor (Nav layer) | Admin |
| F22 | Accessibility data authoring | CampusEditor (Accessibility layer) | Admin |
| F23 | Event overlays | CampusEditor (Events layer) | Admin |
| F24 | Publish / draft / archive workflow | CampusHome + PublishScreen | Admin |
| F25 | Undo/redo + shortcuts | CampusEditor | Admin |
| F26 | Admin reports review | AdminReportsPage | Admin |
| F27 | User management | AdminUsersPage | Admin |
| F28 | App settings | AdminSettingsPage | Admin |
| F29 | Theme + responsiveness | Global | All |
| F30 | Data persistence (mock vs Supabase) | services/, contexts/ | (Technical) |
