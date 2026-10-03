# Student Navigation Unified Search & Focused Map UX Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with a test-first loop and review each task before moving on. The repository must remain uncommitted and unpushed because the user explicitly requested that state.

**Goal:** Replace the confusing parallel building/room Route Planner controls with a unified campus destination search and a focused, mutually exclusive map-navigation experience for desktop and mobile students.

**Architecture:** Reuse the existing `useCampusSearch` index and route-planning algorithms. Extract a shared destination-search surface for map browsing and Route Planner, introduce a typed route-endpoint adapter that preserves the existing `Building`/`RoomDest` route contract, and expose one map-surface visibility signal to coordinate sheets, back behavior, and mobile navigation.

**Tech Stack:** React 18, TypeScript, React Router 7, Vitest, Testing Library, Tailwind CSS, lucide-react, Vite.

## Global Constraints

- Do not commit or push any changes.
- Preserve existing `useCampusSearch` indexing and `SearchResult` identity fields unless a focused extension is required.
- Preserve building-level, room-level, manual-pin, accessible, and emergency routing behavior.
- Regular students must not see `My Events`; Student Org users may see it through the existing role-aware navigation.
- Do not add remote geocoding, external map tiles, or a new authorization role.
- Keep map-focused surfaces mutually exclusive and keep touch targets at least 44px.
- Every implementation task must add or update focused tests before claiming completion.

## File Map

- Create `src/lib/destinationSearch.ts` for destination filters, labels, context text, and result normalization helpers.
- Create `src/lib/routeEndpoints.ts` for the typed route endpoint adapter and endpoint display helpers.
- Create `src/components/map/CampusDestinationSearch.tsx` for the reusable input, type filters, result rows, empty state, keyboard behavior, and touch-safe scrolling.
- Modify `src/components/map/StudentMapControls.tsx` to consume the shared search surface without changing map display filters or manual-pin controls.
- Modify `src/components/map/RoutePlannerDialog.tsx` to use one destination search per active endpoint and remove the simultaneous building/optional-room picker presentation.
- Modify `src/pages/CampusMapPage.tsx` to adapt unified results to existing route state, coordinate map surface transitions, and handle Back safely.
- Modify `src/components/map/MobileBuildingSheet.tsx` and any focused map sheet caller to use the shared surface visibility signal.
- Modify `src/components/layout/MobileBottomNav.tsx` to hide for all focused map surfaces while retaining role-aware tabs during normal browsing.
- Add focused tests beside the new helpers/components and update `RoutePlannerStudentUx.test.tsx`, `StudentMapControls.test.tsx`, and `MobileBottomNav.test.tsx`.

---

### Task 1: Add destination-search primitives

**Files:**
- Create: `src/lib/destinationSearch.ts`
- Test: `src/lib/__tests__/destinationSearch.test.ts`

**Interfaces:**

```ts
export type DestinationFilter = "all" | "building" | "room" | "office";

export function filterDestinationResults(
  results: readonly SearchResult[],
  filter: DestinationFilter,
): SearchResult[];

export function destinationKindLabel(result: SearchResult): string;
export function destinationContextLabel(result: SearchResult): string;
export function destinationResultKey(result: SearchResult): string;
```

- [ ] **Step 1: Write failing helper tests.** Cover `All`, `Buildings`, `Rooms`, and `Offices`; map `laboratory` and `facility` into the appropriate visible filter behavior; verify room context includes building and floor; verify result keys distinguish same-named rooms in different buildings.

```ts
it("filters rooms without removing their building context", () => {
  const result = makeSearchResult({
    id: "room-205",
    name: "Room 205",
    kind: "room",
    buildingName: "Science Hall",
    floorLabel: "Floor 2",
  });
  expect(filterDestinationResults([result], "room")).toEqual([result]);
  expect(destinationContextLabel(result)).toBe("Science Hall · Floor 2");
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/lib/__tests__/destinationSearch.test.ts`

Expected: FAIL because the helper module and functions do not exist.

- [ ] **Step 3: Implement the pure helpers.** Keep filter behavior deterministic and do not mutate the input array. Use `SearchResult.kind`, `category`, `buildingName`, and `floorLabel`; label rooms, offices, laboratories, facilities, buildings, and campus markers distinctly.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run src/lib/__tests__/destinationSearch.test.ts`

Expected: PASS with all filter, label, context, and identity cases green.

---

### Task 2: Build the reusable campus destination search

**Files:**
- Create: `src/components/map/CampusDestinationSearch.tsx`
- Test: `src/components/map/__tests__/CampusDestinationSearch.test.tsx`

**Interfaces:**

```ts
export interface CampusDestinationSearchProps {
  query: string;
  results: readonly SearchResult[];
  focused: boolean;
  filter: DestinationFilter;
  placeholder: string;
  ariaLabel: string;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onFilterChange: (filter: DestinationFilter) => void;
  onSelect: (result: SearchResult) => void;
  onClear: () => void;
  autoFocus?: boolean;
  compact?: boolean;
  listId?: string;
}
```

- [ ] **Step 1: Write failing component tests.** Verify the searchbox has its supplied accessible name, shows `All`, `Buildings`, `Rooms`, and `Offices` filters when focused, renders type labels and building/floor context, calls `onSelect` with the original result, clears through the clear button, closes with Escape through `onBlur`, and prevents wheel/touch propagation from the result list.

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/components/map/__tests__/CampusDestinationSearch.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component.** Use the existing map visual language: rounded floating card, lucide icons, visible keyboard focus rings, 44px minimum input/result rows, and a scrollable result list. Keep the result list below the active search card and show `No matching places` with a reset action when empty. Use `filterDestinationResults` rather than duplicating type logic.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run src/components/map/__tests__/CampusDestinationSearch.test.tsx`

Expected: PASS with no event-propagation or accessibility assertion failures.

---

### Task 3: Use the shared search in map browsing

**Files:**
- Modify: `src/components/map/StudentMapControls.tsx`
- Modify: `src/pages/CampusMapPage.tsx`
- Modify: `src/components/map/__tests__/StudentMapControls.test.tsx`

**Interfaces:**

- `StudentMapControls` continues to receive the existing `SearchResult[]`, query, focus, and selection callbacks.
- `CampusMapPage` owns the map-search query and filter state and passes the same `useCampusSearch` results into `CampusDestinationSearch`.

- [ ] **Step 1: Add failing integration assertions.** Verify the map search shows a result type label and room building/floor context, selecting a room retains the existing floor highlight behavior, and the map display filters plus `Drop pin` and reset controls remain available outside the search list.

- [ ] **Step 2: Run the focused map-control tests to verify the new assertions fail.**

Run: `npx vitest run src/components/map/__tests__/StudentMapControls.test.tsx`

Expected: FAIL because the existing result rows do not use the shared type-filter/context presentation.

- [ ] **Step 3: Replace the duplicated result-list markup in `StudentMapControls` with `CampusDestinationSearch`.** Keep the existing “Explore campus” shortcuts and recent-search behavior around the shared component, and translate the selected `SearchResult` through the existing `handleSelectSearchResult` callback.

- [ ] **Step 4: Add map-search filter state in `CampusMapPage`.** Keep map display mode (`standard`, `accessible`, `emergency`) separate from destination type filtering. Clear the type filter only when the search session is cleared, not when a result is selected.

- [ ] **Step 5: Run the focused tests and production type/build checks.**

Run: `npx vitest run src/components/map/__tests__/StudentMapControls.test.tsx src/components/map/__tests__/CampusDestinationSearch.test.tsx`

Expected: PASS; the shared component is used without changing building/room highlight behavior.

---

### Task 4: Add a unified route endpoint adapter

**Files:**
- Create: `src/lib/routeEndpoints.ts`
- Test: `src/lib/__tests__/routeEndpoints.test.ts`

**Interfaces:**

```ts
export type RouteEndpoint =
  | { kind: "manual-pin"; point: { x: number; y: number }; label: "You are here" }
  | { kind: "building"; building: Building }
  | { kind: "room"; room: RoomDest; building: Building };

export function routeEndpointFromSearchResult(
  result: SearchResult,
  buildings: readonly Building[],
  rooms: readonly RoomDest[],
): RouteEndpoint | null;

export function routeEndpointLabel(endpoint: RouteEndpoint): string;
export function routeEndpointContext(endpoint: RouteEndpoint): string;
export function routeEndpointKey(endpoint: RouteEndpoint): string;
```

- [ ] **Step 1: Write failing adapter tests.** Cover building results, room results with matching catalog entries, missing room/building identity, manual-pin display, endpoint labels, and stable keys.

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/lib/__tests__/routeEndpoints.test.ts`

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 3: Implement the adapter.** Resolve rooms by the stable `SearchResult.id`, building id, and floor identity; return `null` for stale or incomplete results rather than creating a routable-looking endpoint. Keep manual-pin text explicitly separate from GPS wording.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run src/lib/__tests__/routeEndpoints.test.ts`

Expected: PASS with all endpoint conversion and stale-result cases green.

---

### Task 5: Redesign Route Planner around one active endpoint search

**Files:**
- Modify: `src/components/map/RoutePlannerDialog.tsx`
- Modify: `src/pages/CampusMapPage.tsx`
- Modify: `src/components/map/__tests__/RoutePlannerStudentUx.test.tsx`

**Interfaces:**

Extend the planner with:

```ts
interface RoutePlannerDialogProps {
  // Existing route and mode props remain available.
  destinationResults: readonly SearchResult[];
  onSelectFromDestination: (result: SearchResult) => void;
  onSelectToDestination: (result: SearchResult) => void;
}
```

- [ ] **Step 1: Write failing planner tests.** Assert that the mobile and desktop planner expose `Start` and `Destination` endpoint cards, that only one unified picker opens for the endpoint being changed, that a room result displays room/building/floor context, and that the old simultaneous `Destination room (optional)` plus `Destination…` controls are absent.

- [ ] **Step 2: Run the focused planner tests to verify the new assertions fail.**

Run: `npx vitest run src/components/map/__tests__/RoutePlannerStudentUx.test.tsx`

Expected: FAIL because the existing planner renders separate building and room controls.

- [ ] **Step 3: Implement the endpoint cards and destination-first layout.** Default the start card to “You are here” when selected, show `Change start` only when the user wants another origin, and make `Destination` the primary search action. Reuse `CampusDestinationSearch` for both endpoints with local active-endpoint query state so two result lists cannot be open at once.

- [ ] **Step 4: Preserve route behavior through the adapter.** When a building result is selected, call the existing building state callback. When a room result is selected, resolve the corresponding `RoomDest`, set the containing building for outdoor routing, and keep the room as the true indoor endpoint. Clear stale endpoint state if resolution returns `null`.

- [ ] **Step 5: Keep route feedback actionable.** Retain Standard, Accessible, and SOS modes, disabled `Find Route` when incomplete/unavailable, room-route context, swap behavior, Escape-to-close, and existing unsafe-route messaging.

- [ ] **Step 6: Run focused planner and adapter tests.**

Run: `npx vitest run src/components/map/__tests__/RoutePlannerStudentUx.test.tsx src/lib/__tests__/routeEndpoints.test.ts`

Expected: PASS; building and room routing callbacks remain compatible with `CampusMapPage`.

---

### Task 6: Coordinate map surfaces, mobile navigation, and Back

**Files:**
- Modify: `src/pages/CampusMapPage.tsx`
- Modify: `src/components/map/MobileBuildingSheet.tsx`
- Modify: `src/components/layout/MobileBottomNav.tsx`
- Modify: `src/components/layout/__tests__/MobileBottomNav.test.tsx`
- Create: `src/lib/mapSurface.ts`
- Test: `src/lib/__tests__/mapSurface.test.ts`

**Interfaces:**

```ts
export type MapSurface = "browse" | "building-details" | "floor-plan" | "route-planner" | "route-active";
export const MAP_SURFACE_EVENT = "map-surface-toggle";
export function isFocusedMapSurface(surface: MapSurface): boolean;
```

- [ ] **Step 1: Write failing surface and navigation tests.** Verify details, floor plan, planner, and active navigation are focused surfaces; verify the mobile nav hides for each focused surface and restores for `browse`; verify regular students do not render `My Events` and Student Org users do.

- [ ] **Step 2: Run the focused tests to verify they fail.**

Run: `npx vitest run src/lib/__tests__/mapSurface.test.ts src/components/layout/__tests__/MobileBottomNav.test.tsx`

Expected: FAIL because the nav currently listens only for `building-sheet-toggle` and the planner does not publish a shared surface state.

- [ ] **Step 3: Implement the shared surface signal.** Have `CampusMapPage` publish the current focused surface, have `MobileBuildingSheet` publish details/floor-plan transitions, and have Route Planner publish `route-planner`. Remove the need for independent sheet events while keeping a compatibility event only if an existing caller still requires it.

- [ ] **Step 4: Hide the bottom navigation for focused map surfaces.** Keep the existing role-aware tab lists during normal browsing; do not show an access-denied replacement for regular students.

- [ ] **Step 5: Add Back handling at the map surface boundary.** Register a browser `popstate`/history guard only while a focused surface or active search list is open. Back should first close the active interaction and preserve pin/search/endpoints; normal authenticated route history should remain untouched when the map is in `browse`.

- [ ] **Step 6: Run the focused surface/navigation tests.**

Run: `npx vitest run src/lib/__tests__/mapSurface.test.ts src/components/layout/__tests__/MobileBottomNav.test.tsx`

Expected: PASS with the bottom nav hidden only when a focused map surface owns the viewport.

---

### Task 7: Apply responsive polish and browser verification

**Files:**
- Modify: `src/components/map/CampusDestinationSearch.tsx`
- Modify: `src/components/map/RoutePlannerDialog.tsx`
- Modify: `src/components/map/StudentMapControls.tsx`
- Modify: `src/pages/CampusMapPage.tsx`

- [ ] **Step 1: Add failing responsive assertions.** Verify mobile planner padding accounts for the safe-area inset, the sticky CTA is reachable without scrolling through results, the desktop planner stays within a bounded side panel, and no focused surface renders the bottom nav underneath it.

- [ ] **Step 2: Run focused tests to verify the assertions fail or expose missing test ids.**

Run: `npx vitest run src/components/map/__tests__/RoutePlannerStudentUx.test.tsx src/components/map/__tests__/StudentMapControls.test.tsx`

Expected: FAIL for the new layout assertions until the data attributes and layout rules are added.

- [ ] **Step 3: Implement responsive details.** Use one full-width mobile sheet with a drag handle, safe-area-aware padding, sticky action area, and one active list. On desktop, use a bounded floating/side panel with the same endpoint cards and result rows. Keep the map itself visible and prevent scroll/drag event leakage.

- [ ] **Step 4: Run focused tests, build, and diff checks.**

Run: `npx vitest run src/lib/__tests__/destinationSearch.test.ts src/lib/__tests__/routeEndpoints.test.ts src/lib/__tests__/mapSurface.test.ts src/components/map/__tests__/CampusDestinationSearch.test.tsx src/components/map/__tests__/StudentMapControls.test.tsx src/components/map/__tests__/RoutePlannerStudentUx.test.tsx src/components/layout/__tests__/MobileBottomNav.test.tsx`

Expected: all focused tests pass.

Run: `npm run build`

Expected: Vite production build succeeds; only previously known chunk-size/empty-vendor warnings may remain.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 5: Verify the running app in the local browser.** Check both a narrow mobile viewport and desktop viewport:

  1. Search a building and select it; confirm it centers above the details sheet.
  2. Open Directions; confirm only Route Planner is visible and bottom nav is hidden.
  3. Search/select a room; confirm the row shows room, building, and floor and no second building picker appears.
  4. Change the start endpoint; confirm the same unified search is reused.
  5. Close Planner and Details; confirm bottom nav returns.
  6. Press Back with a sheet open; confirm the sheet closes before route navigation.
  7. Check regular-student and Student Org accounts for correct `My Events` visibility.

- [ ] **Step 6: Record verification evidence in `progress.md`.** Record exact focused test counts, build result, browser checks, known warnings, and the fact that no commit or push was performed.

## Completion Checklist

- [ ] Unified search is used by map browsing and Route Planner.
- [ ] Building and room are no longer presented as competing simultaneous destination fields.
- [ ] Room selection carries building and floor context automatically.
- [ ] Focused map surfaces are mutually exclusive.
- [ ] Mobile bottom navigation hides and restores correctly.
- [ ] Authenticated Back behavior closes interaction state before leaving the map.
- [ ] Role-aware `My Events` visibility remains correct.
- [ ] Focused tests, production build, diff check, and browser checks pass.
- [ ] No commit or push was performed.
