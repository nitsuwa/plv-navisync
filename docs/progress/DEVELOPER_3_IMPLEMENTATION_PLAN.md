# Developer 3 — Detailed Implementation Plan

**Workstream:** C — Student Experience and Operations
**Author:** Developer 3 (with Freebuff)
**Status:** LIVE PLANNING DOCUMENT (not the official progress checklist — see `DEVELOPER_3_PROGRESS.md`)
**Purpose:** Step-by-step implementation plan for every remaining Developer 3 package: **C4, C8, C9, C10**, plus small gap fixes discovered while double-checking **C6 and C7**.

---

## 0. Double-Check Results (C1, C2, C3, C5, C6, C7)

Status verified against `main` (commit `54aba46`), the verification docs, and live source code.

| Package | Status | Evidence / Notes |
|---|---|---|
| C1 — Public shell, Home, Help Center | ✅ DONE | `LandingPage.tsx` (8 sections), `HelpCenterPage.tsx`, shared UI kit. Build passes. |
| C2 — Published campus map loading | ✅ DONE | `usePublishedCampus.ts`, interactive `CampusMapPage`, panels, URL `?buildingId=` select. *Note: distance/time still Euclidean — C4 replaces with graph-based.* |
| C3 — Unified search, directory, details | ✅ DONE | `useCampusSearch.ts` (fuzzy index), `BuildingsPage`, `BuildingCard`, category filters. |
| C5 — Reports and report history | ✅ DONE (student side) | `reportService.ts` (Supabase + localStorage fallback), `ReportModal` (photo upload), `StudentReportsPage`. **Gap:** the admin workflow (status transitions, internal notes, archive, view-on-map) is still mock — formally moved into **C8-A** scope below. |
| C6 — Events and announcements | ⚠️ DONE with gaps | `eventService.ts` reads `events` + `announcements` tables with mock fallback; Home preview works. **Gap 1:** `/announcements` and `/admin-dashboard/announcements` routes are **NOT registered** in `src/app/routes.tsx` → both pages 404, footer link broken. **Gap 2:** admin events/announcements pages still use page-local mock data. **Gap 3:** DB `events` has no `building_id` → "View on Map" hidden for DB events (schema contract owned by Dev 1 A7). |
| C7 — Favorites, recents, profile | ✅ DONE (device-local) | `studentAccountService.ts` is **localStorage-only** (no Supabase call) despite the verification doc claiming server sync. Acceptable for capstone (persists across sessions on same browser). **Deferred:** server sync of bookmarks/recents after Dev 1 A7 favorites contract lands. |

**Action items from double-check:**
1. ~~Register the two announcement routes + fix the footer link (C6 gap)~~ → ✅ **DONE** (Package 0, §3). Verified: links were already correct; only `routes.tsx` registration was missing.
2. ~~Move admin report workflow into C8-A~~ → ✅ **DONE** (C8-A, §4).
3. Coordinate event-venue contract with Dev 1 (A7) — until merged, keep mock-based event markers on the map. *(Venue is persisted via the existing `event_locations` table — no migration needed.)*

---

## 0.5 Progress Checklist (LIVE)

| # | Package | Status | Branch | Evidence |
|---|---|---|---|---|
| 0 | C6 gap fix — announcement routes | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` | `/announcements` + `/admin-dashboard/announcements` render (no 404); `pnpm build` passes |
| 1 | C8-A — Admin Reports / Events / Announcements wiring | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` | 3 pages wired to real services; 11 new tests; **78/78 tests + build pass** |
| 2 | C4 Phase 1 — Navigation UI/UX | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` | see Package 2 notes below |
| 3 | C8-B — Dashboard, Activity Logs, Settings, Exports | ✅ DONE | same branch | 3 new services/lib + 3 pages rewired + activity-logs page + exports; 11 new tests; **89/89 tests + build pass** |
| 4 | C4 kiosk round-2 — seed campus, walking dot, you-are-here, pin UX | ✅ DONE | `main` | `DEVELOPER_3_C4_VERIFICATION.md` kiosk section; real PLV seed (SCB/Canteen/CABA/COED/CEIT/Guard) + walkway graph; geo.ts; 11+7 new tests; live walking-dot verified |
| 5 | 6 out-of-scope enhancements (QR, last-viewed, analytics, notifications, hours, emergency) | ✅ DONE | `main` | `ADDED_FEATURES.md` §3 + `08_SYSTEM_AUDIT_AND_SUGGESTIONS.md` Part 1–2; 20 new tests; live-verified |
| 6 | BuildingDetailsPage bug fix (seeded ids 404) | ✅ DONE | `main` | `ADDED_FEATURES.md` §4; `/buildings/b_scb` resolves |
| 7 | UI/UX audit fixes P1–P4 + planner/steps overlap fix | ✅ DONE | `main` (uncommitted) | `DEVELOPER_3_UIUX_FIXES_VERIFICATION.md` (new) + `08_SYSTEM_AUDIT_AND_SUGGESTIONS.md` Part 4; `pnpm build` PASS + 639/639 tests |
| 8 | C4 Phase 2 — Published-graph integration | 🔒 blocked on Gate G3 | — | — |
| 9 | C8-C — Publish controls, branding | 🔒 blocked on A6/A7 | — | — |
| 10 | C9 — Responsive / a11y / theme final pass | ✅ DONE | `main` | contrast/typography audit (10px min secondary text, semantic colors, focus rings, reduced motion) + UI/UX fixes P1–P4 (mobile admin drawer, pills overlap, steps-sheet cleanup) |
| 11 | C10 — PWA, offline, e2e | 🔒 blocked on Gate G5 | — | — |

> **Working branch:** all Developer 3 changes accumulate on `feature/developer-3-c8-c4-c9-c10`; ONE commit + push at the end of all packages (per developer instruction). `pnpm-lock.yaml` must be restored before that commit (pnpm rewrites it locally due to a pnpm-version/override mismatch — see §11).

---

## 1. Execution Strategy — Finish Faster Without Waiting on Dev 1 / Dev 2

The roadmap marks C4, C8, C9, C10 as `BLOCKED`, but **most of the work does NOT actually need to wait**:

- The DB tables (`reports`, `events`, `announcements`, `system_settings`, `activity_logs`) already exist and are typed in `src/types/database.generated.ts`.
- The typed services we need already exist or are trivial to write (`reportService`, `eventService`, `settingsService`, `adminUserService`).
- The pathfinding engines (`combinedPathfinding`, `indoorPathfinding`, `pathfinding`) already exist and run against the published-campus adapter.

**Only these pieces truly wait on other developers:**
- C4 Phase 2 — consuming the *published navigation graph* (needs Dev 1 A6 active-version query + Dev 2 B8 verified graph format).
- C8-C — publish/unpublish/archive controls + campus branding (needs Dev 1 A6/A7 contracts).
- C10 — end-to-end release verification (needs Gate G5).

### Recommended package order

| Order | Package | Status | Branch |
|---|---|---|---|
| 0 | C6 gap fix (route registration) | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` |
| 1 | C8-A — Admin Reports / Events / Announcements wiring | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` |
| 2 | C4 Phase 1 — Navigation UI/UX against existing engines | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` |
| 3 | C8-B — Dashboard metrics, activity logs, settings, exports | ✅ DONE | `feature/developer-3-c8-c4-c9-c10` |
| 4 | C4 Phase 2 — Published-graph integration | 🔒 after Gate G3 | continue same branch |
| 5 | C8-C — Publish controls, branding, remaining states | 🔒 after A6/A7 | continue same branch |
| 6 | C9 — Responsive / accessibility / theme final pass | ⬜ after C4 + C8 | `fix/public-operations-polish` |
| 7 | C10 — PWA, offline, e2e journeys | 🔒 after Gate G5 | `test/pwa-and-critical-journeys` |

---

## 2. Global Rules for Every Package (Developer 3)

1. Start from latest `main`: `git switch main && git pull origin main && git switch -c <branch>`.
2. Read the source-of-truth docs listed in `04_TEAM_RULES.md` §9 before coding.
3. Update only `docs/progress/DEVELOPER_3_PROGRESS.md` (never Dev 1/2 files).
4. Before touching a **shared-core file** (`src/app/routes.tsx`, `src/app/App.tsx`, `src/contexts/`, `src/components/layout/`, `package.json`, `src/styles/`), post in the team chat and confirm no other developer is editing it (team rule §7).
5. Run `pnpm build` + relevant Vitest tests before every review.
6. Do NOT create new DB migrations unless the team approves one (team rule §8). All tables needed below already exist.
7. Do NOT present mock data as backend integration. Where backend is unavailable (no Supabase configured), keep an explicit mock/localStorage fallback labeled as such.

---

## 3. PACKAGE 0 — C6 Gap Fix: Announcement Routes (QUICK WIN) — ✅ DONE

**Goal:** Stop `/announcements` and `/admin-dashboard/announcements` from 404-ing; fix the footer link.

**Backend:** None (routes only).

**Actual implementation (Aug 7, 2026):**
- Only `src/app/routes.tsx` was changed (**+4 lines**): 2 lazy imports + 2 route entries. The footer link, dashboard "Post Announcement" tile, and admin sidebar entry were **already pointing to the correct paths** — the routes were simply never registered.
- Verified: `/announcements` renders the full page; `/admin-dashboard/announcements` no longer 404s (redirects to admin login via `AdminLayout` protection); `pnpm build` passes; zero console errors.

**Definition of Done:** ✅ Visiting `/announcements` and `/admin-dashboard/announcements` renders the pages; all links to them work; `pnpm build` passes.

---

## 4. PACKAGE 1 — C8-A: Admin Reports, Events, Announcements (backend wiring) — ✅ DONE

**Goal:** Make the three admin operational pages use real Supabase data — no page-local mock arrays. This also completes the *admin side* of C5 (report workflow) and C6 (admin events/announcements).

**Prerequisites:** C6 route fix (§3). Dev 1 A7 services are NOT required — we build typed services over the existing typed tables and align when A7 lands.

**Backend — Services (new/changed files in `src/services/`):**

### 4a. `reportService.ts` (EXTEND — add admin methods; keep existing student methods)
Tables used: `reports` (+ `report-images` Storage for photo URLs).

| Method | Query / Behavior |
|---|---|
| `listAllReports(filters?: { status?, category?, q? })` | `supabase.from("reports").select("*").order("created_at", { ascending: false })`, optional `.eq("status", …)`, `.eq("category", …)`, `.ilike("title", %q%)`. Map rows via existing `toIssueReport`. |
| `updateReportStatus(id, status, notes?)` | `.update({ status, resolution_notes: notes, resolved_at: status === "resolved" ? new Date().toISOString() : null, updated_at })`. Statuses: `pending → under_review → in_progress → resolved | rejected`. |
| `updateInternalNotes(id, notes)` | `.update({ internal_notes: notes })`. |
| `archiveReport(id)` | `.update({ archived_at: now, status: "resolved" or "rejected"… })` — keep auditable; do not hard-delete. |
| `getReportHistory(id)` | Query `reports` row + `activity_logs` filtered by `entity_type = "report"`, `entity_id = id` (log entries are written by the admin actions below). |

Also add an **activity-log helper** (shared, used by all admin actions):
- `src/services/activityLogService.ts` (NEW) — `logActivity({ action, entityType, entityId, campusId, metadata })` inserting into `activity_logs` (typed table exists); `listActivityLogs({ entityType?, actorId?, from?, to?, limit })` with filters + pagination.

### 4b. `eventService.ts` (EXTEND — add admin CRUD; keep public readers)
Tables used: `events`.

| Method | Behavior |
|---|---|
| `listEvents(filters?: { status?, category?, q? })` | All events ordered by `starts_at`, filterable; include archived via toggle. |
| `createEvent(input)` | Insert with `campus_id`, `created_by` (current user), `title`, `description`, `category`, `organizer`, `starts_at`, `ends_at`, `status` (`draft | published | archived`), optional `cover_image_path` (upload to `report-images`-style private bucket → use `event-images` or reuse campus-images pattern; **verify bucket exists with Dev 1** before upload). |
| `updateEvent(id, changes)` | Typed update, `updated_at`. |
| `archiveEvent(id)` | `.update({ archived_at: now, status: "archived" })`. |
| `getUpcomingEvents()` | Existing public reader — keep, but add `starts_at >= now` filter and auto-expire: treat rows whose `ends_at < now` as hidden unless admin (automatic expiration behavior). |

### 4c. `announcementService.ts` (REWRITE — replace the generic CRUD + mock seed with a real typed service)
Tables used: `announcements`. **Cleanup:** `eventService.ts` currently reads `announcements` directly — move that responsibility here and have `eventService` import from `announcementService` (single source of truth).

| Method | Behavior |
|---|---|
| `listAnnouncements(filters?)` | All rows, filter by `status`, `category`, search on `title`/`content`. |
| `createAnnouncement(input)` | Insert with `campus_id`, `created_by`, `title`, `content`, `category` (`general|academic|urgent|event|maintenance`), `priority` (`low|medium|high|urgent`), `status`, optional `starts_at`/`expires_at`. |
| `updateAnnouncement(id, changes)` | Typed update. |
| `publishAnnouncement(id)` / `archiveAnnouncement(id)` | `status = "published"` / `archived_at = now, status = "archived"`. |
| `getPublishedAnnouncements()` | Public reader moved here; enforce `expires_at` filtering (hide expired). |

### 4d. Service exports
Update `src/services/index.ts` to export `activityLogService`, extended `reportService`/`eventService`, rewritten `announcementService`.

**UI — Pages (all in `src/pages/`):**

### 4e. `AdminReportsPage.tsx` (REWIRE)
- Replace `MOCK_REPORTS` with `reportService.listAllReports()` on mount + manual refresh.
- State machine: `loading | error | empty | data`.
- Status workflow: status badge per report + action buttons per state — Pending → "Start Review" (`under_review`); Under Review → "In Progress" / "Reject" (`rejected`); In Progress → "Resolve" (`resolved`, requires `resolution_notes`); every action calls `updateReportStatus` + `logActivity`, then refreshes.
- Detail drawer/modal: full description, photo (from `imageUrl` — student service stores it; verify private `report-images` access with Dev 1), reporter, timestamps, **internal notes editor** (`updateInternalNotes`), **history timeline** from `getReportHistory`.
- Filters: status pills (All, Pending, Under Review, In Progress, Resolved, Rejected) + category filter + search — all server-side via the service.
- Archive action with `TypeToConfirmDialog`; archived tab (or toggle "Show archived").
- **"View on Map"** button: navigates to `/map?buildingId=<building_id>` when `building_id` present (reuse the URL select handler from C2/C6).
- Export CSV/JSON button (reuse the export helper from C8-B §6e).

### 4f. `AdminEventsPage.tsx` (REWIRE)
- Replace `MOCK_EVENTS` with `eventService.listEvents()`; status tabs (Draft / Published / Archived / All).
- Create/Edit modal: title, description, category, organizer, `starts_at` + `ends_at` (datetime-local inputs), status, cover image upload (with loading/error states), venue label.
- Archive with confirm; publish toggle.
- Validation: title required, `ends_at > starts_at`, category required; inline field errors; loading state on submit; toast on success/failure.

### 4g. `AdminAnnouncementsPage.tsx` (REWIRE + reachable after §3)
- Replace page-local mock with `announcementService.listAnnouncements()`.
- Create/Edit modal: title, content, category, priority, status, optional schedule (`starts_at`/`expires_at`).
- Publish / Archive actions; search + category filter; priority badges.
- Validation: title + content required; toast feedback; loading state.

**Steps (C8-A):**
1. Write `activityLogService.ts`; extend `reportService.ts` with admin methods; extend `eventService.ts`; rewrite `announcementService.ts`. Keep all existing public signatures intact (they are consumed by LandingPage, StudentReportsPage, ReportModal).
2. Update `src/services/index.ts` exports.
3. Rewire `AdminReportsPage` (largest task — status workflow + drawer + history + view-on-map).
4. Rewire `AdminEventsPage`.
5. Rewire `AdminAnnouncementsPage`.
6. Unit tests (Vitest):
   - `activityLogService.test.ts` — payload building, filter params.
   - `reportService.test.ts` — `toIssueReport` mapping, status transition payloads, filter query builder (mock `getSupabase`).
   - `eventService.test.ts` — public reader filters (auto-expire), row→domain mapping.
   - `announcementService.test.ts` — row→domain mapping, expired filtering.
7. Manual checks: log in as admin → reports/events/announcements show real data; perform each workflow; verify `activity_logs` rows appear; verify student side unaffected (LandingPage preview, StudentReportsPage).

**Actual implementation (Aug 7, 2026):**
- **Services:** NEW `activityLogService.ts`; `reportService.ts` extended (admin statuses `pending → under_review → in_progress → resolved | rejected`, `listAllReports`, `updateReportStatus`, `updateReportInternalNotes`, `archiveReport` — archive no longer forces `resolved`, `getReportHistory`); `eventService.ts` extended (admin CRUD; **venue persisted via existing `event_locations` table**, no migration; `getUpcomingEvents` now auto-hides ended events and attaches venue labels); `announcementService.ts` **rewritten** as the single source of truth (owns `getPublishedAnnouncements` with client-side expiry filtering — `eventService` re-exports it; LandingPage consumers unchanged).
- **Pages:** `AdminReportsPage` (workflow UI, internal + resolution notes, history timeline, view-on-map via `buildingId`, refresh w/ race guard), `AdminEventsPage` (CRUD modal with datetime-local + validation, Publish/Archive, status tabs, ongoing-event banner), `AdminAnnouncementsPage` (CRUD modal, Publish on drafts, Archive with confirm). All three have loading/empty/error states and stale-response guards.
- **Admin sidebar:** added **Announcements** and **Events** items to `AdminSidebar.tsx` NAV_ITEMS (they are standalone operational pages now; previously only reachable via URL or dashboard quick-action tile).
- **Tests:** 5 new test files (11 tests) — `activityLogService`, `reportService`, `eventService`, `announcementService` (unit) + `AdminOperationsPages` (page smoke tests). **Full suite: 78/78 pass; `pnpm build` passes.**
- Code-review fixes applied: client-side expiry filter (was brittle PostgREST `.or()`), race guards, removed unused imports + custom SVGs (now lucide icons).

**Definition of Done:** ✅ Admin can process a report Pending → Rejected/Resolved with notes + history; create/edit/archive events and announcements that appear on the public side (Home preview, map events) within the valid window; no page-local mock arrays remain in these three pages; build + tests pass.

---

## 5. PACKAGE 2 — C4 Phase 1: Student Route Planning & Navigation Presentation

**Goal:** Full navigation UX — origin/destination picker with swap, Standard/Accessible/SOS modes, animated route rendering, turn-by-turn steps, distance + ETA, floor-transition guidance, safe no-route handling, polished mobile controls. Phase 1 runs against the **existing engines** (`combinedPathfinding`, `indoorPathfinding`, `pathfinding` + `mapDataAdapter`), so it is fully buildable NOW.

**Prerequisite:** C2 + C3 (done). Phase 2 (after Gate G3) only swaps the data source.

**Backend — none required for Phase 1.** The engines are pure functions in `src/lib/`. The data comes from the published campus (via `usePublishedCampus`) with legacy fallback — the same source C2/C3 use.

**UI — Files (`src/pages/CampusMapPage.tsx` is ~1,800 lines; extract, don't bloat):**

### 5a. Extract route UI into dedicated components (NEW files under `src/components/map/`)
- `RoutePlannerDialog.tsx` — origin/destination pickers (reuse `BuildingPicker`), **swap button** (⇄), mode selector (Standard / Accessible / SOS chips — reuse existing mode state), "Find Route" + "Clear" actions. Desktop: centered dialog; mobile: full-width bottom sheet (reuse `MobileBuildingSheet` patterns).
- `RouteStepsPanel.tsx` — turn-by-turn steps list from the route result (step: icon + instruction + distance), total distance + estimated walking time header, floor-transition indicators ("Take the staircase to Floor 2"), "Cancel navigation" button.
- `RouteMapOverlay.tsx` — SVG polyline rendering (animated dashes via CSS `stroke-dashoffset` keyframes; **reduced-motion alternative**: static polyline + arrowheads, no animation when `prefers-reduced-motion`), start/destination markers, floor-change badges at transition points.
- `RouteErrorState.tsx` — friendly no-route/disconnected/inaccessible message ("No available route found") with retry; never crashes on disconnected graphs.

### 5b. Route computation layer (NEW `src/lib/routePlanner.ts`)
Pure wrapper over the existing engines with typed inputs/outputs:
- `planRoute(from, to, mode, campus)` — dispatches to `findCombinedRoute` / `findOutdoorRoute` / `findIndoorRoute` based on whether from/to are indoor (floor-aware) or outdoor.
- `computeRouteStats(route)` — distance (sum of edge lengths — **replaces the Euclidean approximation**), estimated walking time (`distance / walkingSpeed`, ~1.3 m/s), number of floor transitions.
- `buildTurnByTurn(route)` — generate readable steps from path segments (start, walk straight ~X m, turn left/right, continue hallway, take staircase/elevator to floor N, arrive). Reuse/refactor the step logic already present in `TestNavigationPanel.tsx` (Map Builder) so both share one implementation.
- `filterRouteByMode(route, mode)` — accessible mode: prefer `accessible` edges, avoid stairs (skip or penalize), prefer elevators/ramps; SOS mode: restrict to `emergencySafe` edges toward nearest exit/assembly area. Preserve existing engine behavior; add unit tests.

### 5c. CampusMapPage integration
- Wire `RoutePlannerDialog` to the existing directions state (from/to, mode chips already exist).
- Replace Euclidean distance/time display with `computeRouteStats`.
- Show `RouteStepsPanel` when a route is active; `RouteErrorState` on failure (incl. disconnected graph, inaccessible in accessible-mode).
- Keep the existing stair/elevator choice dialog; render `RouteMapOverlay` for outdoor + indoor segments; floor switching keeps route context.
- Mobile: planner opens as bottom sheet; controls never cover essential map area (reuse existing mobile layout work).
- Add "recent destination" capture: on successful route computation, call `addRecentDestination` (already exists in `studentAccountService`).

**Steps (C4 Phase 1):**
1. Audit current directions implementation in `CampusMapPage.tsx`; list what to extract vs keep.
2. Write `src/lib/routePlanner.ts` + unit tests (`routePlanner.test.ts`: route stats, turn-by-turn generation, mode filtering, no-route handling, floor transitions).
3. Build the four new components.
4. Integrate into `CampusMapPage`; remove duplicated logic; verify map still renders mock + published campuses.
5. Manual checks: route between two buildings (outdoor), building → room (indoor), room → room in different floors (multi-floor w/ transition guidance), accessible mode avoids stairs, SOS mode uses emergency edges, disconnected campus shows no-route state, mobile sheet layout, reduced-motion mode.

**Definition of Done:** Guests and students can plan and follow a valid route through the published (or fallback) campus including multi-floor routes; distance/time come from graph data; no-route cases are handled gracefully; mobile + desktop verified; build + tests pass.

### ✅ C4 Phase 1 — IMPLEMENTED (2026-08-07, branch `feature/developer-3-c8-c4-c9-c10`)

**Files added (6):**
- `src/lib/routePlanner.ts` — typed wrapper: `planBuildingRoute` (graph-based real stats in ALL modes + SVG fallback), `planDestinationRoute` (combined engine, rooms + floor transitions), `stepsFromGraphPath` / `stepsFromCombined` (structured turn-by-turn), `detectFloorTransitions`, `formatDistance` / `formatMinutes`.
- `src/components/map/RoutePlannerDialog.tsx` — origin/destination `BuildingPicker`s + swap button + Standard/Accessible/SOS mode chips + live route summary (dist · ETA · from→to chips · floor-change badge) + `RouteErrorState` on failure + Clear/Find Route actions.
- `src/components/map/RouteStepsPanel.tsx` — stats header (dist/time/via), step-by-step list with per-step icons + distances, floor-transition badges, End/Zoom actions.
- `src/components/map/RouteMapOverlay.tsx` — extracted animated SVG route (glow polyline, marching ants, direction arrows, junction waypoints, A/B markers with pulse rings).
- `src/components/map/RouteErrorState.tsx` — friendly "No available route" with "Try Standard mode" recovery (never crashes).
- `src/lib/__tests__/routePlanner.test.ts` — 14 unit tests (graph vs fallback stats, destination rooms, step generation, floor transitions, formatting).

**Files changed (3):**
- `src/pages/CampusMapPage.tsx` — route memo now uses `planBuildingRoute` (real distance/ETA in every mode, not just accessible); inline directions panel → `RoutePlannerDialog`; inline SVG route group → `RouteMapOverlay`; compact nav card → `RouteStepsPanel` (+ mobile bottom sheet above the app's bottom nav); recent destination saved on successful route (`addRecentDestination`).
- `src/components/map/index.ts` — exports the 4 new components.
- `src/lib/pathfinding.ts` — **fixed pre-existing A* reconstruction bug** in `findPath`: it read parents via `open.get(parentId)`, which returns `null` once the parent node is expanded into `closed`, yielding degenerate 1-waypoint paths. Now uses persistent `parentMap`/`edgeMap` (same pattern as `findNavigationRoute`). Verified: `findBuildingPath('b1','b5')` now returns 5 waypoints + 4 real steps (was 1 waypoint). This made real graph stats possible for ALL modes.

**Verified:** `pnpm build` ✅ · `pnpm exec vitest run` ✅ 103/103 tests (was 89, +14). Live preview tested on mobile viewport: dialog opens, MAB→GYM produces "231 m · 3 min", Navigate shows the bottom-sheet steps (Start from MAB → Walk 231 m toward GYM → Arrive at GYM), route overlay + A/B markers render, GYM saved as recent destination.

**C4 Phase 2 (after Gate G3 — small):** In `usePublishedCampus`/adapter layer, read the published navigation graph (Dev 1 A6 active-version query + Dev 2 B8 graph format) and feed it into `routePlanner` unchanged. UI does not change. Update verification doc.

---

## 6. PACKAGE 3 — C8-B: Dashboard, Activity Logs, Settings, Exports

**Goal:** Remove all hardcoded dashboard metrics; show truthful live data; make settings persist; add exports.

**Prerequisites:** A3 users page already wired (verify only). A7 not required — `system_settings`, `activity_logs` tables exist and are typed.

**Backend — Services:**

### 6a. `dashboardService.ts` (NEW, `src/services/`)
Table reads (typed): 
- `getDashboardStats()` → parallel reads: buildings count (`buildings` where `archived_at is null`), rooms count (`map_elements` where `element_type` in room types), routes/edges count (`navigation_edges` active), pending reports count (`reports` where `status in (pending, under_review, in_progress)`), published events count, total students (`profiles` where `role = 'student'` and `is_active`), weekly activity (from `activity_logs` grouped by day, last 7 days).
- Handle empty DB gracefully (return zeros — empty state, never crash).
- `getRecentActivity(limit)` → latest `activity_logs` joined with actor names from `profiles`.

### 6b. `settingsService.ts` (REWRITE — real typed service over `system_settings`)
- `getSettings()` → all `system_settings` rows where `is_public = true` OR admin; returns a `Record<string, Json>` keyed by `key`.
- `upsertSettings(entries: { key, value, isPublic }[])` → upsert (insert on conflict update) with `updated_by` = current user; `logActivity("settings.update", …)`.
- `getPublicSettings()` → public-only subset (used by Navbar/Footer/landing).
- Keep a `DEFAULT_SETTINGS` constant (site_name, site_tagline, contact_email, campus_address, default_lat, default_lng, primary_color, logo_url, default_zoom, landing_page) so the app still renders with zero DB rows.

### 6c. Export helper (NEW `src/lib/exporters.ts`)
- `downloadCsv(rows, filename)` — client-side CSV via Blob + `URL.createObjectURL`; `downloadJson(data, filename)`.
- Reused by AdminReportsPage (reports), AdminEventsPage (events), dashboard.

**UI — Pages:**

### 6d. `AdminDashboardPage.tsx` (REWIRE)
- Replace `KEY_METRICS`/`PENDING_ITEMS`/`ACTIVITY` constants with `dashboardService.getDashboardStats()` + `getRecentActivity()`.
- Cards: Buildings Mapped, Total Rooms, Active Routes, Pending Reports, Published Events, Registered Students (whichever approved — keep the 4-card layout, memoized `StatCard`).
- Weekly activity chart: wire `WeeklyChart` (exists, has a test) to the 7-day `activity_logs` aggregation.
- Recent activity list with readable action text + actor name + relative time.
- Quick actions: fix all links (Announcements → registered route in §3; Map Builder, Reports, Events, Users already valid).
- Replace static footer ("v2.1.0 · Last published") with real campus publish metadata when A6 lands; until then show "—" (no fake dates).
- Remove the simulated 400 ms loading delay; use real `loading` state + `DashboardSkeleton`.

### 6e. `AdminSettingsPage.tsx` (REWIRE)
- Form: site name, tagline, contact email, address, default lat/lng, brand color picker (reuse `ColorPicker`), logo upload (Storage — **coordinate bucket name with Dev 1**; fall back to keeping existing logo if unavailable), default zoom, landing page, theme preference.
- Load from `settingsService.getSettings()`; save via `upsertSettings` with loading/saving/toast states; validation (email format, required site name).
- Consume public settings app-wide: `Navbar`/`Footer`/landing read `getPublicSettings()` for site name/tagline/contact (start with site name + tagline in Navbar/Footer; keep hardcoded fallback when DB empty).
- Remove decorative "Test Connection"/"Send Test Email" buttons OR make them call a real, documented check (e.g., `supabase.auth.getSession()` + storage list) and clearly report result — no fake success.
- Session preference: theme already persists via `useTheme`/`localStorage` — keep; add "remember last viewed building" (optional enhancement) if time permits.

### 6f. Activity logs view
- `AdminActivityLogsPage.tsx` (NEW) OR a tab inside Settings/Dashboard (pick the cleaner nav — likely a dedicated `/admin-dashboard/activity-logs` route, registered like the others).
- Filters: entity type, actor, date range, search; readable action labels (map raw `action` strings to friendly text + icons); pagination (server-side `listActivityLogs`); empty state.

**Steps (C8-B):**
1. Write `dashboardService.ts`, rewrite `settingsService.ts`, write `src/lib/exporters.ts`, write `activityLogService` list-side if not done in C8-A.
2. Rewire `AdminDashboardPage`; wire `WeeklyChart`.
3. Rewire `AdminSettingsPage` + consume public settings in layout.
4. Add activity-logs page + route (coordinate routes.tsx).
5. Unit tests: `dashboardService.test.ts` (query builders, empty-DB zeros), `settingsService.test.ts` (upsert payloads, defaults), `exporters.test.ts` (CSV escaping).
6. Manual checks: dashboard reflects real counts after adding buildings/events/reports; settings persist after refresh; exports download correct files; activity logs show admin actions from C8-A.

**Actual implementation (Aug 7, 2026):**
- **Services:** NEW `dashboardService.ts` (exact-count reads for buildings/rooms/active+accessible edges/pending reports/published events/active students + 7-day `activity_logs` aggregation + `getRecentActivity` with actor names from `profiles`; empty DB → honest zeros); `settingsService.ts` **rewritten** over `system_settings` (global rows, `campus_id IS NULL`) with `getSettings` (defaults merged), `getPublicSettings`, `upsertSettings` (per-key select→insert/update — single `.upsert()` can't target the partial unique index, so manual upsert is correct) + one `settings.update` audit entry; NEW `src/lib/exporters.ts` (`toCsv` with proper escaping + `downloadCsv`/`downloadJson` via Blob).
- **Pages:** `AdminDashboardPage` **rewired** — hardcoded numbers (6 buildings / 138 rooms / "All systems OK" / "Last published Jan 15 2025") removed; real counts, real pending reports, real recent activity, 7-day mini bar chart, publish info from `campusService.listCampuses()`, no fabricated trend deltas. `AdminSettingsPage` **rewired** — fake tabs (SMTP, 2FA/security, notifications, integrations) removed; only General (site identity + map config) and Appearance (theme) remain, persisted via `settingsService`; "Test Connection"/"Send Test Email" buttons gone. NEW `AdminActivityLogsPage` at `/admin-dashboard/activity-logs` (entity-type filters, readable action labels, actor names, relative time) + sidebar item + route. `AdminReportsPage` gained CSV/JSON export buttons for the currently filtered list.
- **Out of scope (NOT touched):** `AdminUsersPage` (Dev 1 A3), campus publish/unpublish/archive (C8-C), branding/logo/favicon (C8-C), admin profile/email/password flows, DB migrations/RLS.
- **Tests:** 3 new test files (11 tests) — `dashboardService.test.ts` (empty-DB zeros, live counts + 7-day aggregation, actor resolution), `settingsService.test.ts` (defaults merge, insert vs update paths, audit logging), `exporters.test.ts` (CSV escaping, download triggers). **Full suite: 89/89 pass; `pnpm build` passes.** Code-review fixes applied: removed dead `offset` param + dynamic import in logs page, removed fake `trend: { value: 0 }` from dashboard cards.

**Definition of Done:** ✅ Admin dashboard shows truthful, live numbers; settings persist via `system_settings`; exports download; activity logs are readable and filterable; no hardcoded metrics remain; build + tests pass.

---

## 7. PACKAGE 4 — C8-C: Publish Controls, Branding, Remaining States (POST A6/A7)

**Goal:** Campus publish/unpublish/archive controls on admin pages using the approved A6 service; campus branding (logo/favicon/colors) persistence; last remaining C8 states. **Integration-only** — we call the A6/A7 service methods, never raw queries.

**Prerequisite:** Dev 1 A6 (publish orchestration) + A7 (ops contracts) merged. **Do not start before.** Until then, C8 is functionally complete for demo purposes using C8-A + C8-B.

### 7a. Current state (Aug 2026) — what C8-B already gives us
- `AdminDashboardPage` shows `publishInfo` from `campusService.listCampuses()` ("Published: <name> · <updatedAt>" or "No published campus yet") — **display only, no action buttons**.
- `AdminSettingsPage` has General (site name + map config) + Appearance (theme) persisted via `settingsService` over `system_settings`; **no logo/brand-color fields yet**.
- `index.html` uses static favicons (`/icon-16x16.png` … `/icon-512x512.png`); `Navbar`/`Footer` use hardcoded PLV branding + `site_name` from `getPublicSettings`.
- `campusService` already exposes `listCampuses`, `toEditorCampus` (lifecycle/publish status), `resolveActiveCampusId`. A6 will add the actual `publish`/`unpublish`/`archive` orchestration + version contract.

### 7b. Step 1 — Verify A6/A7 contract signatures (read-only, no code)
1. After Dev 1 merges A6/A7, read the new service exports (e.g. `campusPublishService` or methods on `campusService`) and the `campus_versions` contract fields (version number, publisher, published_at).
2. Confirm the exact method names (`publish(campusId)`, `unpublish(campusId)`, `archive(campusId)` or similar) and return shapes before writing any UI code.
3. Note any new DB columns/bucket policies in `types/database.generated.ts` that C8-C consumes.

### 7c. Step 2 — Publish/unpublish/archive controls (UI)
**Files:** `src/pages/AdminDashboardPage.tsx` (publish card) + optional Map Builder entry (`AdminMapBuilderPage` — **Dev 2 owns it; ask before editing; if denied, keep controls on the dashboard only**).
- Add a **Publish Status card** on the dashboard: current state (Draft / Published / Unpublished / Archived), the active campus name, and version metadata when published.
- Buttons per state (calling the A6 methods + `logActivity`):
  - Draft → **Publish** (primary)
  - Published → **Unpublish** (with confirm dialog)
  - Unpublished → **Publish** or **Archive**
  - Archived → read-only badge (no resurrect button unless A6 supports it)
- Loading states per action; toast on success/failure; refresh `publishInfo` + dashboard stats after each action.
- Every action writes an `activity_logs` entry (entity type `campus_versions` / `campus`).

### 7d. Step 3 — Real publish metadata in dashboard footer
- Replace the static footer ("v2.1.0 · Last published") with the **A6 version contract**: version number, publisher name (from `profiles`), and `published_at` — only when a published version exists; otherwise show "—" (no fake dates).
- If A6 exposes a "publish now" flow with validation handoff, surface any validation errors from the handoff (draft must pass validation before publish).

### 7e. Step 4 — Branding persistence (logo, favicon, colors)
**Files:** `src/pages/AdminSettingsPage.tsx` (form), `src/services/settingsService.ts` (keys), `src/components/layout/Navbar.tsx` + `Footer.tsx` (consume), `index.html` (favicon — static swap only if feasible).
- Add to the General tab: **logo upload** (Storage bucket — confirm bucket name with Dev 1; fall back to keeping existing logo on failure), **brand color** (reuse existing `ColorPicker`), **favicon upload** (optional; static favicon swap documented in verification doc if too invasive).
- Persist as `system_settings` keys (`logo_url`, `primary_color`, `favicon_url`) via `upsertSettings` — reuse the C8-B pattern.
- Consume in `Navbar`/`Footer`: use `logo_url` when set (fallback to current logo), apply `primary_color` via CSS variable override when set.
- Keep hardcoded PLV defaults as fallback when DB is empty (per team rule: no fake integration).

### 7f. Step 5 — Report-image private access (signed URLs)
- Verify `report-images` bucket RLS/policies (Dev 1 A1 storage).
- In `AdminReportsPage` detail modal, load the student photo via **signed URL** from `reportService` (add a `getReportImageUrl(path)` helper that calls the storage signed-URL API) instead of the public URL — only when A7 contract confirms private access.
- Graceful fallback: if signed URL fails, show a placeholder with a note (never broken image icon in a misleading way).

### 7g. Step 6 — Tests + verification
- Unit: `campusPublish`-adapter tests (if the service is ours — otherwise mock it), `settingsService` branding-key upsert tests, `reportService` signed-URL builder tests.
- Manual (as Demo Administrator): publish → public `/map` now loads the published campus (C2/`usePublishedCampus`); unpublish → map shows fallback/empty state; archive → campus disappears from lists; branding changes appear in Navbar/Footer after refresh; report photos load via signed URLs.
- Update `DEVELOPER_3_C8_VERIFICATION.md` + `DEVELOPER_3_PROGRESS.md` (C8 → DONE).

**Out of scope (NOT ours):** `AdminUsersPage` (Dev 1 A3), Map Builder internals (Dev 2 B-series), DB migrations/RLS, `campus_versions` table schema (Dev 1 A6).

**Definition of Done:** Admin actions reflect backend results truthfully; published campus state drives public map loading (C2/`usePublishedCampus`); dashboard shows real publish metadata; branding persisted via `system_settings`; report photos load via signed URLs; build + tests pass.

---

## 8. PACKAGE 5 — C9: Responsive, Accessibility, Theme, Visual Consistency

**Goal:** Final quality pass over every public + admin operational page.

**Prerequisite:** C4 + C8 land first for the full pass; isolated regressions can be fixed earlier.

**Checklist per page (Home, Map, Help, auth, profile, favorites, reports, events, admin dashboard/reports/events/announcements/settings/users):**
1. **Responsive:** 375 px mobile, 768 px tablet, 1440 px desktop — no horizontal scroll, controls reachable, bottom sheet on mobile where appropriate.
2. **Keyboard:** full tab order, visible focus rings (focus-visible), Esc closes modals, Enter/Space activates buttons, skip-to-content link if missing.
3. **Labels/contrast:** every icon button has `aria-label`; form fields have labels; contrast passes AA; error text readable.
4. **Theme:** light + dark consistency on all new components (no hardcoded light-only colors).
5. **Reduced motion:** `prefers-reduced-motion` disables route dash animation, scroll-reveal, sheet physics.
6. **States:** consistent loading (skeleton), empty (EmptyState), error (ErrorBoundary + message), success (toast) across all pages.
7. **Icons:** replace any emoji-as-icon with `lucide-react` icons.

**Definition of Done:** Core journeys usable with keyboard + supported screen sizes; UI consistent; build + tests pass; verification doc lists pages checked.

---

## 9. PACKAGE 6 — C10: PWA, Offline, End-to-End Journeys (POST Gate G5)

**Prerequisite:** Gate G5 (all A + B + C packages merged, no critical failures). 

**Steps:**
1. **Manifest/SW audit** (`public/manifest.json`, `public/sw.js`): correct name, icons, theme color; installability check.
2. **Offline campus cache:** cache the last valid published campus JSON (from `usePublishedCampus`) in Cache Storage on successful load; serve from cache when offline; safe cache invalidation on new publish.
3. **Offline writes:** while offline, disable report submit/favorite toggle/forms OR queue them with a visible banner; never silently fail.
4. **Update flow:** `sw.js` version bump strategy so updates propagate without stale UI.
5. **E2E tests (Playwright):** add `@playwright/test` (coordinate `package.json` change with team). Tests for critical journeys:
   - Guest: load map, search, select building, plan route, view event.
   - Student: login, submit report, track status, save favorite, follow route.
   - Admin: login, dashboard metrics, process report, create event/announcement, campus edit/save/publish (once A6 available).
6. Document unsupported offline actions + test limitations.

**Definition of Done:** PWA installs; offline shows cached map and disables/queues writes with clear messaging; critical journeys pass in the release-candidate environment.

---

## 10. Testing Strategy Summary

| Level | Tool | Command | Where |
|---|---|---|---|
| Build/type | Vite | `pnpm build` | Every package |
| Unit | Vitest | `pnpm vitest run` (add `"test": "vitest run"` script — coordinate `package.json` with team) | New pure logic: `routePlanner`, exporters, services, settings |
| E2E | Playwright (C10) | `pnpm test:e2e` | Critical journeys, post Gate G5 |
| Manual | Browser (Chrome) | DevTools console + desktop/mobile viewport | Every package |

Add `vitest` config is already present (`vite.config.ts` has `test` setup per existing `__tests__` files — confirm). New tests follow the existing `src/**/__tests__/*.test.ts` pattern.

---

## 11. Coordination Notes & Questions for the Team

**Shared-core files Developer 3 will touch (must coordinate in team chat first):**
- `src/app/routes.tsx` (packages 0, 3, 6)
- `src/components/layout/Navbar.tsx`, `Footer.tsx` (settings consumption, announcements link)
- `package.json` (add `test` script; later `@playwright/test`)
- `src/services/index.ts` (service barrel — usually fine, confirm)

**Items depending on Dev 1:**
- A7 ops contracts (event venue mapping, favorites sync, report-image private access) — we build compatible typed services now; align after merge.
- A6 publish orchestration (C8-C) — strictly post-gate.

**Items depending on Dev 2:**
- B8 verified published graph format (C4 Phase 2) — post Gate G3.

**Open questions for Developer 3 (ask before starting each package):**
1. ~~Priority: C8-A or C4 first?~~ → ✅ **Decided: C8-A first, then C4 Phase 1.**
2. OK to coordinate the `routes.tsx` + `package.json` (test script) changes with the team as proposed?
3. For `AdminSettingsPage`, are the decorative "Test Connection" buttons OK to remove (or must they stay)?
4. Should the plan file stay in English, or do you want a full Tagalog version?

**Known team-level note:** The local pnpm version no longer reads the `pnpm.overrides` field in `package.json`, so every `pnpm` command rewrites `pnpm-lock.yaml` (dropping the `vite: 6.3.5` override). This is **not** part of Developer 3's changes — restore the lockfile before the final commit and consider fixing the override at team level.

---

*Update `docs/progress/DEVELOPER_3_PROGRESS.md` (only) as each package ships; link this plan from the handoff note.*
