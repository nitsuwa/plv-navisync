# Student Navigation Unified Search & Focused Map UX Design

## Goal

Give students a clear, Google Maps-style campus navigation experience in which one unified search can find buildings, rooms, offices, laboratories, facilities, and landmarks without forcing users to choose between competing building and room fields.

## Context and Problems

The existing map already indexes buildings and indoor destinations through `useCampusSearch`, but Route Planner presents separate building and optional room controls at the same time. On mobile, the expanded building list, Route Planner, building details, and bottom navigation can compete for the same viewport. The map also needs predictable back behavior so authenticated students do not fall back to the public landing page when closing an interaction.

The redesign must preserve the current route capabilities:

- Building-level routes remain supported.
- Room-level routes remain supported, including building and floor context.
- Manual dropped-pin origin remains supported and is labeled “You are here”.
- Accessible and emergency route modes remain available.
- Student Org users retain access to `My Events`; regular students do not see that navigation item.

## UX Principles

1. **One decision at a time.** A student should not have to decide whether a room and its building are separate destinations.
2. **Search results explain themselves.** Every result shows its type and enough location context to identify it before selection.
3. **One active surface.** Map browsing, building details, floor plan, Route Planner, and active navigation must not stack as competing sheets.
4. **Map remains visible when useful.** Selecting a building centers it in the visible map area above any details sheet.
5. **Navigation is contextual.** The bottom navigation is available during normal browsing and temporarily hidden while a focused map surface needs the viewport.
6. **Role visibility is capability-based.** The Student Org workflow is visible only to users whose role has been manually promoted by an admin.
7. **Touch and keyboard parity.** All search, result, close, and route actions must have accessible names, visible focus states, and touch targets of at least 44px.

## Visual Direction

The product is a campus wayfinding tool for students. The single job of the map screen is to help a student recognize a place, choose it confidently, and start walking directions with as little visual negotiation as possible.

- **Palette:** retain PLV Navisync’s deep navy primary (`#0e2a6e`), cool page background (`#f6f8fc`), campus grass (`#d4edda`), route blue (`#3b82f6`), and gold attention accent (`#c8960c`). Use the existing theme tokens instead of hard-coded one-off colors.
- **Type:** retain `Plus Jakarta Sans` for high-signal headings and controls, `Inter` for supporting copy, and `DM Mono` for building codes and compact map identifiers.
- **Layout:** treat the map as the quiet canvas. The search field is a compact floating capsule; focused search and Route Planner become structured panels with clear edges, while endpoint cards use strong A/B or “You are here” identity markers.
- **Signature:** use a consistent compass/destination marker language: the same visual cue should connect the top search, selected map building, dropped pin, and route start state. This creates recognition without adding decorative controls.
- **Motion:** use one purposeful transition when a result is selected—the map frames the destination and the detail surface appears. Respect reduced-motion preferences and avoid independent animations on every chip or list row.
- **Restraint:** do not add another bottom navigation layer, decorative gradients, or a second visual hierarchy inside the planner. The selected destination and next action must remain the strongest elements.

## Proposed User Flow

### Normal map browsing

The student opens the map and sees:

- A top search field: `Search buildings, rooms, offices...`.
- Search results when the field is focused.
- Optional type filters: `All`, `Buildings`, `Rooms`, `Offices`.
- Map display filters for standard, accessible, and emergency views.
- A manual `Drop pin` control and a `Reset map view` control.
- Role-aware mobile navigation only when no focused map surface is open.

The map search and Route Planner use the same destination result vocabulary and visual result pattern. A result includes its icon, name, type label, and context such as building and floor.

### Selecting a building

1. The student taps a building on the map, a search result, or a popular-building shortcut.
2. The map pans so the building is centered in the visible map area, accounting for the details sheet.
3. Only the Building Details surface opens.
4. The details surface offers `Directions`, `Floor Plan`, `Save`, and `Report`.
5. Selecting `Directions` closes Building Details and opens Route Planner with the building already selected as the destination.

### Selecting a room, office, laboratory, or facility

1. The student searches for the destination in the unified search.
2. The result shows its type, building, and floor when applicable.
3. Selecting the result opens the relevant building/floor context and highlights the selected indoor destination.
4. A clear `Directions to this room` action opens Route Planner with the exact room destination prefilled.
5. The Route Planner displays the room, building, and floor in one endpoint card; it does not ask the student to choose the building again.

### Route Planner

Route Planner is destination-first and has one endpoint search component reused for both start and destination changes.

1. `Start` defaults to `You are here` when a manual dropped pin exists.
2. `Change start` opens the same unified destination search for a building or indoor destination.
3. `Destination` is the primary action. The student searches one field and selects either a building-level or room-level result.
4. A selected room is represented as `Room name · Building · Floor`; the parent building is context, not a second required selection.
5. The student chooses `Standard`, `Accessible`, or `SOS` routing.
6. `Find Route` is disabled until the required endpoint is complete and an authored route is available.
7. The route preview shows summary, distance, time, and relevant indoor/outdoor segments.
8. Starting a route enters an active-navigation surface with route steps and an explicit `End route` action.

If no manual pin exists, the planner still starts with a clear start card and lets the student choose a start destination. The UI must not claim current location when only a map point has been manually selected.

## Unified Search Contract

The existing `SearchResult` model is the source for searchable destinations. The redesign keeps its stable identity fields and uses the following presentation contract:

```ts
type DestinationKind =
  | "building"
  | "room"
  | "office"
  | "laboratory"
  | "facility"
  | "destination"
  | "marker";

interface CampusDestinationResult {
  id: string;
  name: string;
  kind: DestinationKind;
  code?: string;
  buildingId?: string;
  buildingName?: string;
  floorId?: string;
  floorNumber?: number;
  floorLabel?: string;
  description?: string;
  accessible: boolean;
}
```

The component must:

- Match name, code, building, floor, category, and keywords.
- Show `All` results by default.
- Allow narrowing with type filters without changing the result identity.
- Preserve keyboard navigation, Escape-to-close, and touch scrolling.
- Show a useful empty state such as `No matching places` and suggest building name, room number, or facility.
- Avoid displaying duplicate parent-building choices after a room has been selected.

The existing `useCampusSearch` indexing behavior should be reused and extended only where needed. No remote geocoding or external map provider is required for this redesign.

## Map Surface State Model

The map view will behave as a small state machine with only one focused surface:

```text
browse
  ├─ building-details
  ├─ floor-plan
  └─ route-planner
          └─ route-active
```

Transitions must be explicit:

- Opening Building Details clears Route Planner state.
- Opening Route Planner clears Building Details state.
- Opening Floor Plan clears Building Details and Route Planner state.
- Closing a surface returns to `browse` unless a route is active.
- Starting a route replaces Route Planner with `route-active`.
- Ending a route returns to `browse` and preserves the last map viewport when possible.

The implementation should use one shared surface-visibility signal for `MobileBottomNav`, rather than separate ad hoc events for each sheet. Desktop may keep a compact side panel, but it must still honor the same mutual-exclusion state model.

## Navigation and Back Behavior

### Mobile navigation

- Regular student: `Home`, `Map`, `Profile`.
- Student Org: `Home`, `Map`, `My Events`, `Profile`.
- Guest: existing `Home`, `Map` behavior.
- `My Events` is not rendered for regular students and is not replaced with an access-denied message in the navigation.
- Bottom navigation is hidden while Building Details, Floor Plan, Route Planner, or active navigation owns the mobile viewport.

### Back behavior

- When a focused map surface is open, the first Back action closes that surface.
- When a search result list is open, the first Back action closes the list or keyboard focus before leaving the map.
- When no focused map surface is open, Back follows authenticated app history and must not send a signed-in student to the public landing page as an accidental side effect.
- Closing the map surface must not lose the dropped pin, recent search, or selected route endpoint unless the user explicitly clears it.

## Responsive UI Layout

### Mobile

- Use a single full-width rounded sheet with a drag handle, close button, and safe-area padding.
- Hide bottom navigation while the sheet is open.
- Keep the primary CTA sticky at the bottom of the sheet.
- Prevent picker scrolling from propagating to the map.
- Keep the search input and result rows at least 44px tall.
- Avoid nested fixed sheets and avoid placing a picker list underneath another active picker.

### Desktop

- Keep the map full-height and place the search/planner surface in a bounded side panel.
- Keep the destination search visible without requiring a bottom sheet interaction.
- Keep map controls reachable without covering search results or route actions.
- Use the same result rows, labels, endpoint cards, and state transitions as mobile.

## Error, Loading, and Empty States

- While the campus index is unavailable, show a compact search loading state and keep the map usable.
- If a search has no results, explain what can be searched and provide a clear action to reset the query.
- If an indoor route is unavailable, explain that the destination is published but no authored route is available; do not silently fall back to an unsafe route.
- Accessible and emergency modes must retain their existing safety messaging.
- If a selected room becomes unavailable in the current campus snapshot, clear only that endpoint and explain why; do not leave a stale room label that looks routable.

## Implementation Boundaries

The implementation should be split into focused units:

- A reusable destination result/search component for map browsing and Route Planner.
- A route endpoint model that can represent building, room, and manual-pin origins without parallel competing fields.
- A single map-surface visibility signal consumed by the page and mobile navigation.
- Existing route-planning functions remain the routing boundary; UI changes should adapt selected search results into the existing `Building` and `RoomDest` structures.
- Existing Student Org authorization remains the enforcement boundary for `My Events`; this design does not create a new role or bypass RLS.

## Acceptance Criteria

1. A student can find a building, room, office, laboratory, facility, or landmark from one search field.
2. Search result rows identify destination type and show building/floor context when applicable.
3. Selecting a room never requires a second building selection.
4. Opening Directions from a selected building preselects that building as the destination.
5. Only one map-focused surface is visible at a time.
6. Mobile bottom navigation is hidden while a focused map surface is open and returns afterward.
7. Regular students do not see `My Events`; Student Org users do.
8. Map building selection remains centered above the details sheet.
9. Back closes map interaction state before leaving the authenticated app and does not fall through to the public landing page.
10. Focused component tests, map/page tests, production build, and desktop/mobile browser checks pass.

## Out of Scope

- Replacing the campus map renderer or routing algorithms.
- Adding external geocoding or third-party map tiles.
- Changing the offline admin verification process for Student Org promotion.
- Changing event-map permissions, event assets, or proposal fields from the already completed event workflow.
- Adding a new public navigation role or exposing Student Org tools to regular students.
