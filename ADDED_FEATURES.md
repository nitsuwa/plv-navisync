# PLV NaviSync — ADDED FEATURES

**Developer 3 (Workstream C — Student Experience & Operations)**
**Last updated:** August 10, 2026

This document lists every feature **added, rewired, or fixed** by Developer 3. It covers the C-series packages (C1–C9), the kiosk-style navigation round, and the out-of-scope enhancements implemented on `main`.

---

## 1. Student & Public Experience

| Feature | Description |
|---|---|
| **Public shell & navigation** | Responsive Navbar (guest / student / admin states), Home landing page with live announcements + events preview, Footer, floating mobile bottom nav, scroll-to-top, skip-to-content link, keyboard focus states. |
| **Interactive campus map** | Full SVG campus map with selectable buildings, pan/zoom, mode filters (Standard / Accessible / SOS), search overlay, campus selector, and smooth transitions. |
| **Real PLV campus seed map** | Rebuilt seed to match the actual PLV Main Campus layout: **SCB, University Canteen, CABA, COED, CEIT, Guard House** + red-brick walkway graph + green Quadrangle. Routes follow only the real walkable paths. |
| **Route planning (3 modes)** | Origin/destination dialog with swap, Standard / Accessible / SOS routing, animated route line with reduced-motion fallback, turn-by-turn steps, distance + estimated walking time, no-route / disconnected states. |
| **Real graph routing** | Routes now use the campus navigation graph (navNodes/navEdges) instead of SVG distance estimates — verified: CABA → COED = 155 m via Quadrangle perimeter. |
| **"You are here" (kiosk-style)** | GPS locate button **and** tap-on-map fallback that snaps to the nearest walkway; pulsing blue marker; auto-opens route planner with "You are here" as the start point. |
| **Walking-dot animation** | Animated avatar walks the route line; the current step highlights live in the steps panel; **Replay** button re-runs the animation. |
| **Search & directory** | Building picker with keyboard selection, unified search, Directory page, Building Details page (about / departments / facilities / accessibility / floor plan). |
| **Favorites & recent destinations** | Save/remove favorite buildings, recent destinations derived from real route usage, student profile dashboard. |
| **Report submission** | Students submit campus issue reports from the map (category, building/location, optional photo) with validation, upload, success/failure states. |
| **Report history** | Student reports page with status filters, search, updates timeline, and status progress indicator. |
| **Events & announcements** | Public events + announcements lists and map markers; events link to their mapped venue. |
| **Help Center** | FAQ, tutorial area, and guest AI chat with a daily question limit (localStorage). |

## 2. Admin & Operations

| Feature | Description |
|---|---|
| **Admin Reports workflow** | Pending → Under Review → In Progress → Resolved / Dismissed workflow, internal notes, archive, search/filter, **CSV & JSON export**. |
| **Admin Events CRUD** | Create / edit / publish / archive campus events with schedule + venue. |
| **Admin Announcements CRUD** | Create / edit / publish / archive announcements. |
| **Live Dashboard** | Dashboard metrics come from real services (buildings, rooms, routes, pending reports, weekly activity) — **no hardcoded fake numbers**. |
| **Activity logs** | Full audit trail page (`/admin-dashboard/activity-logs`) — every admin action is logged with actor, entity, and timestamp. |
| **Settings persistence** | Site identity, contact info, campus address, default coordinates/zoom/theme persisted via `system_settings` (Supabase upsert). |
| **Admin users** | Administrator user management with privileged actions (A3 integration). |
| **Map Builder access** | Admin map builder route + floor editor integration (Dev 2 authored; shell provided). |

## 3. Out-of-Scope Enhancements (August 10, 2026)

These came from a full system audit — frozen-spec gaps and adjacent improvements that no other developer's workstream (A1–A9, B1–B10, C1–C10) owned. All were implemented **without new database tables or migrations** to avoid blocking other developers.

| # | Feature | What it does |
|---|---|---|
| 1 | **QR Location Sharing** | Real scannable QR code per building encoding `/map?buildingId=<id>` — scanning it on another phone opens the map at that building. Includes a "Copy link" button. Replaces the old fake animated pattern. |
| 2 | **Remember Last Viewed Building** | The map remembers the last building you selected (localStorage) and restores it + zoom on your next visit. |
| 3 | **Usage Analytics** | Anonymous in-browser analytics (page views, searches, planned routes, reports). New **Usage Analytics** card on the admin dashboard with a weekly chart (previously-dead `WeeklyChart` is now live) + top searches / top routes. |
| 4 | **In-app Notifications** | **Admin:** the notification bell now shows a real activity-log feed with an unread badge. **Student:** when an admin changes a report's status, the student sees a badge + toast ("Report updated — ... is now resolved"). |
| 5 | **Building Operating Hours** | Live **Open / Busy / Closed** status per building, computed from operating hours (seeded-campus registry + legacy hours parser). Shown on the map side panel and the building details page. |
| 6 | **Emergency Alert Broadcast** | Admins post an emergency alert (message + severity level) from **Settings → Emergency**; a colored banner appears instantly on every public page (polls public settings). Ideal for typhoon/class-suspension notices. |

## 4. Bug Fixes & Improvements

| Fix | Detail |
|---|---|
| **Building Details 404** | `BuildingDetailsPage` now uses the published campus (same source as the map + directory), so seeded building URLs like `/buildings/b_scb` resolve instead of "Building Not Found". |
| **Real graph navigation** | Seeded-campus routes previously fell back to SVG distance estimates; the planner now consumes the campus navigation graph (MAB→GYM = 83 m, CABA→COED = 155 m with real steps). |
| **Announcement routes** | `/announcements` and `/admin-dashboard/announcements` were 404s — both routes registered and wired. |
| **Pin-drop UX** | Dropping a "You are here" pin no longer auto-opens the route planner or duplicates pills — a single clear action chip appears instead. |
| **Guard house placement** | Moved to the main-gate entrance area per the real campus map. |
| **Diagonal path removal** | Removed the non-existent diagonal X paths across the Quadrangle; routes now use only real walkways. |
| **Pathfinding A\*** | Fixed truncated path reconstruction in the outdoor A* engine. |
| **Dark-mode / contrast / typography** | Full responsive, accessibility, and theme audit (C9): keyboard navigation, focus rings, reduced motion, 10px minimum secondary text, semantic colors. |
| **Mobile route planner** | Route Planner becomes a bottom sheet on mobile; larger touch targets; landscape support. |

## 5. Quality & Testing

- **`pnpm build`** — PASSES (only the pre-existing >500 kB Map Builder chunk warning remains).
- **`pnpm test`** — **428/428 tests pass** across 46 files.
  - 20 new tests: `buildingHours` (10), `notificationService` (8), `usageAnalyticsService` (6).
- All enhancements live-verified in the running app (QR, last-viewed restore, hours status, bell feed, analytics chart, emergency banner).

## 6. Team-Safety Notes

- **No DB migrations added** — everything uses existing tables (`system_settings`, `activity_logs`) or `localStorage`.
- **No shared-type changes** — the building-hours registry lives in its own file; `map-builder/types.ts` (Dev 2) was not touched.
- **One new dependency:** `qrcode.react` (tiny, React-only QR renderer) in `package.json`.
