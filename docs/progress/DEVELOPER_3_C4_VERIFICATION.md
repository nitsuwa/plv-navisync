# Developer 3 C4 Verification Evidence

Verified against the Vite development server and the `feature/developer-3-c8-c4-c9-c10` branch on August 7, 2026.

## Package C4 Phase 1 — Student Route Planning & Navigation

### What was delivered

- **routePlanner** (`src/lib/routePlanner.ts`): typed route-computation wrapper that reuses the existing pathfinding engines instead of inventing a new one:
  - `planBuildingRoute(from, to, mode)` — building→building routes through `findBuildingPath` (graph-based) with a fallback to the SVG path when graph data is missing.
  - **Real graph distance/ETA in ALL modes** (Standard, Accessible, Emergency) — no more Euclidean `calcDist` estimate in standard mode.
  - `planIndoorRoute()` — indoor building→room and room→room routing through `findMultiFloorIndoorRoute`, with floor-transition detection ("Take the stairs to Floor 2" / elevator guidance).
  - `generateTurnByTurn()` — structured `RouteStep[]` (start, transit with real per-segment distance, arrive) instead of raw strings.
  - SVG fallback keeps the map working even when a building has no graph node.

- **RoutePlannerDialog** (`src/components/map/RoutePlannerDialog.tsx`): the new Directions panel:
  - Starting point (A) and Destination (B) building pickers (reuses `BuildingPicker`).
  - Swap button, Clear button, live "ROUTE READY" summary (distance · ETA) before navigating.
  - Standard / Accessible / SOS mode chips.
  - Recent destinations shown in the pickers via `studentAccountService`.

- **RouteStepsPanel** (`src/components/map/RouteStepsPanel.tsx`): turn-by-turn list after tapping Navigate:
  - Per-step icons + distances ("Walk 45 m"), total distance + ETA header, mode badge.
  - Floor-transition badges for indoor routes.
  - End Navigation / Zoom buttons; mobile bottom-sheet variant (sits above the app's bottom nav).

- **RouteMapOverlay** (`src/components/map/RouteMapOverlay.tsx`): extracted, animated SVG route rendering (glow line, arrow markers, A green / B red markers) — previously inline in `CampusMapPage`.

- **RouteErrorState** (`src/components/map/RouteErrorState.tsx`): friendly "no available route" state with a "Try Standard mode" recovery hint — never crashes.

- **CampusMapPage rewiring** (`src/pages/CampusMapPage.tsx`):
  - Route computation now uses `planBuildingRoute` (real stats).
  - Inline directions panel → `RoutePlannerDialog`; inline SVG route → `RouteMapOverlay`; compact nav card → `RouteStepsPanel` (+ mobile bottom sheet).
  - Successful routes save the destination to recent destinations.

- **Pathfinding bug fix** (`src/lib/pathfinding.ts`): fixed a pre-existing A* reconstruction bug in `findPath` — it read parents via `open.get(parentId)`, which returns `null` after the parent node moves to the closed set, yielding broken 1-waypoint routes. Now uses a persistent `parentMap`/`edgeMap` (same pattern as `findNavigationRoute`).

### What was tested

- Unit tests (`src/lib/__tests__/routePlanner.test.ts`, 14 tests): building→building graph routing with real stats, SVG fallback, same-building guard, indoor floor transitions, turn-by-turn structure, recent-destination save. **Full suite: 103/103 pass.**
- Live UI (mobile + desktop viewports): MAB → GYM produces "231 m · 3 min" real stats; Navigate shows animated route line + A/B markers + steps panel; recent destination "GYM" persisted to localStorage.
- Regression: `/map` search, building info panel, floor plans, QR, report button all still work.

### Build evidence

- `pnpm build` completes without errors.
- Zero console errors during the route planner flow in browser DevTools.

### Known limitations

- Building→building stats are graph-based when the published graph covers the pair; otherwise the SVG fallback reports its (approximate) distance — labeled clearly in the UI.
- Indoor room→room planning requires floor plans + indoor graph data; buildings without them fall back gracefully to building-level routing.
- Full navigation graph from Dev 2 (Gate G3) will replace remaining fallback paths — tracked as C4 Phase 2.

---

## C4 Kiosk Features — "You are here" + Walking Dot + Published-Graph Bridge (2026-08-10)

Verified live on the Vite dev server (`/map`) and with Vitest.

### What was added

- **`src/lib/geo.ts` (NEW)** — geographic helpers for the kiosk-style start:
  - `latLngToMapPoint(lat, lng, anchor, w, h)` — browser GPS → SVG canvas coords (anchored on the campus `coordinates`, scale ~0.22 m/unit, clamped to canvas).
  - `snapToNearest(point, candidates)` — snap a raw point to the nearest walkway node.
  - `pointAlongPolyline` / `polylineLength` — constant-speed interpolation used by the walk avatar.

- **`src/lib/routePlanner.ts`** — published-graph bridge + point-start routing:
  - `planBuildingRoute(from, to, mode, positions?, graph?)` now prefers the campus **`navNodes`/`navEdges`** (real node names, distances, accessible/emergency edges), then the static walkway graph, then the SVG estimate.
  - `planRouteFromPoint(fromPt, to, mode, graph?, positions?)` — snaps a "You are here" point to the nearest node and routes to a destination building; falls back to a straight-line estimate when no node exists.

- **`src/lib/pathfinding.ts`** — `BUILDING_ENTRANCE_MAP` extended with the published-campus seed ids (`b_mab` → `ent_mab`, etc.) so the static graph also serves published campuses without a nav graph.

- **`src/components/map/RouteMapOverlay.tsx`** — optional `walkProgress` (0..1) renders the moving blue "you" avatar along the route (disabled under reduced motion).

- **`src/components/map/RouteStepsPanel.tsx`** — optional `walkProgress` highlights the active step; new **Replay** action restarts the walk.

- **`src/components/map/RoutePlannerDialog.tsx`** — when the marker exists, a **"You are here"** toggle sets the start to the current location ("A / You are here" chip, "Change" link back to a building picker, swap hidden in point mode).

- **`src/pages/CampusMapPage.tsx`** — "You are here" feature:
  - New **Locate button** in the map tools (crosshair): tries browser GPS (`getCurrentPosition`); on denial/unavailable switches to **tap-on-map** mode with a hint banner.
  - Tap-on-map places the marker (snapped to the nearest walkway node), auto-opens the Route Planner with "You are here" pre-selected.
  - Pulsing blue **"YOU ARE HERE"** marker with label, plus a floating chip with a clear button.
  - Route memo uses `planRouteFromPoint` (point start) or `planBuildingRoute` (building start) with the active campus graph.
  - Walk animation: `walkProgress` advanced via `requestAnimationFrame` (~40 m/s visual pace, 4–12 s clamp), reset/replayed on route change.

### What was tested

- **Unit tests (406/406 full suite pass):**
  - `src/lib/__tests__/geo.test.ts` (11 new) — GPS→SVG conversion (anchor, direction, clamping), snapping, polyline interpolation.
  - `src/lib/__tests__/routePlanner.test.ts` (+7) — campus-graph building→building route (`b_mab`→`b_gym` uses nav node positions), accessible-mode edge filtering, seed ids on the static graph, `planRouteFromPoint` snapping + "You are here" first step + fallback + no-destination guard.
  - `src/lib/__tests__/pathfinding.test.ts` — updated entrance-map assertion (12 entries incl. seed ids).

- **Live UI (`/map`, desktop + mobile viewport):**
  - Locate button → GPS unavailable in headless preview → **tap-on-map** banner → tap near plaza → marker placed at (404, 285) snapped to the central junction → Route Planner auto-opens with "You are here" active.
  - "You are here" → GYM: **46 m · 1 min** with real steps (You are here → Walk 39m to South Junction → Walk 7m to Gym Entrance → Arrive at GYM).
  - Walking dot sampled over time: avatar moves from plaza (404,285) → South Junction (404,462) → gym entrance (375,476); active step highlights in sync ("Walk 39m…" → "Walk 7m…" → "Arrive at GYM"); **Replay** restarts cleanly.
  - Building→building now uses the seeded campus graph: **MAB → GYM = 83 m · 1 min** via MAB Entrance → Flagpole Plaza → South Junction → Gym Entrance (previously an SVG estimate).
  - "Change" switches back to the building picker; "You are here" chip clear button removes the marker.
  - Reduced-motion preference disables the walk avatar and pulse rings.

### Build evidence

- `pnpm build` completes without errors.
- Clean reload of `/map` shows zero console errors (the only logged items are the expected Supabase init + offline/fallback notices).

### Known limitations (unchanged)

- Full DB-persisted graph swap from Dev 2 (Gate G3) remains C4 Phase 2; the seeded campus already routes on its `navNodes`/`navEdges`.
- GPS accuracy depends on the device; tap-on-map is the reliable demo path.

### Round 2 — Real campus map + UX polish (Aug 10)

**Map now matches the actual PLV campus layout:**
- Seeded campus rebuilt: SCB, University Canteen, CABA, COED, CEIT, Guard House + Tongco Street + green Quadrangle, matching the official PLV Main Campus map (Tongco St., Maysan).
- Walkways render as red brick paths; **quadrangle diagonal X paths removed** (no such walkway — routes go around the perimeter only).
- **Guard House moved to the main gate/entrance area** (was bottom-left corner): building, entrance node, walkway stub, and assembly point all relocated; gate→guard edge shortened 221 m → 60 m.

**Pin-drop UX simplified (no more "kung ano-ano nangyayari"):**
- Dropping a pin **no longer auto-opens** the full Route Planner — it just places the marker.
- The "You are here" chip is now a single actionable pill: **You are here · [Plan route] · [X]**; "Plan route" opens the planner with the location pre-set as start, X clears it.
- Chip is hidden while the planner is open (no duplicate "You are here" pills on screen).

### What was tested (Round 2)

- **Unit tests (408/408 pass):** geo (11), routePlanner (21), pathfinding (24) all green after the guard move + diagonal removal.
- **Live UI (`/map`):**
  - All 6 buildings render with correct labels; guard building now at the gate area (y≈330 vs old y≈555).
  - No diagonal path polylines render; quad perimeter + 8 building walkways only.
  - Locate → tap-on-map → marker placed → **planner does NOT auto-open**; chip shows "Plan route".
  - "Plan route" → planner opens with "You are here" pre-set as start; chip hidden (no duplicate).
  - **CABA → COED = 155 m · 2 min** routed around the quad (SW → NW → NE), not diagonally (old diagonal shortcut was 125 m).
