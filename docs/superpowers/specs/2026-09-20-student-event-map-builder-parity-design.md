# Student Event Map Builder Parity Design

Date: 2026-09-20  
Status: Approved for implementation

## Goal

Make the Student Org event-location editor feel like the Admin Map Builder:
the same focused workspace rhythm, predictable canvas gestures, and clearer
location switching, while keeping the published campus map read-only and
writing only event-owned furniture and labels.

The attached screenshot is a visual reference for the Admin Map Builder shell,
not a source of functional instructions. The functional requirements come from
the user's request and the existing event-overlay contract.

## Scope

### In scope

- Reframe `StudentEventEditPage` and `EventLocationSwitcher` as one editor
  workspace with an Admin-style left location rail.
- Keep the event editor's event-only tools: Select, Furniture, Label, and Pan.
- Make the event canvas interaction model predictable and bounded:
  normal wheel pans, Ctrl/Cmd+wheel zooms at the cursor, Space/middle mouse/Pan
  share clamped movement, and Fit View recenters the authored content.
- Make the location rail readable on desktop and mobile, with explicit active
  state, location context, furniture/label counts, and a visible map-switch
  affordance.
- Preserve per-location drafts and make location changes reset only the canvas
  viewport, not another location's event additions.
- Add focused regression tests for the canvas interaction model and the
  location-switching UI, then run the production build.

### Out of scope

- Editing or persisting published rooms, walls, doors, windows, or permanent
  furniture.
- Changing the Admin Map Builder save, publish, or campus data model.
- Adding new event database tables or changing the normalized multi-location
  overlay shape.
- Introducing remote image assets or replacing the existing SVG event asset
  catalog.

## Product design

### Workspace hierarchy

```text
Student Event Editor
├─ Event header: back, event title, active location, draft status, save/submit
├─ Event location rail: requested locations, active card, counts
└─ Editor workspace
   ├─ compact tool strip: Select · Furniture · Label · Pan
   ├─ floating canvas controls: snap, fit, zoom out, zoom %, zoom in
   └─ read-only published map + editable event overlay
```

The location rail is persistent on desktop and horizontally scrollable on
mobile. The active card uses the primary accent and a clear `aria-current`
state. Each card shows the mapped location label, building/floor context when
available, and event-owned item counts. Switching locations keeps the current
location's edits in React/local draft state and remounts the editor with the
selected location's own overlay data.

### Interaction model

- Select mode moves, resizes, rotates, selects, groups, and deletes event-owned
  objects only.
- Furniture mode exposes the existing event asset palette and placement flow.
- Label mode places event labels.
- Pan mode moves the viewport without mutating objects.
- Holding Space temporarily enables pan without changing the selected tool.
- Middle-mouse drag also pans. Pointer movement is clamped to authored content
  and the canvas boundary so blank-map overshoot is avoided.
- Normal wheel input pans. Ctrl/Cmd+wheel zooms around the pointer with a
  gradual step. The canvas prevents page scrolling only while it owns the
  gesture.
- Fit View runs on the first usable canvas layout, on location change, and on
  resize. Ordinary item edits do not unexpectedly reset the viewport.
- The published base map is rendered beneath the event layer and has no event
  mutation path.

### Visual direction

Use the existing Admin Map Builder vocabulary instead of introducing a second
visual system:

- card surfaces, thin borders, compact uppercase utility labels, primary blue
  active states, and floating controls over the canvas;
- the event-specific distinction is a small `Event map`/`Published map locked`
  status cue, not a different canvas style;
- preserve the existing campus/floor artwork and SVG event asset visuals;
- keep controls at touch-safe sizes and retain visible keyboard focus states.

## Architecture and data flow

1. `StudentEventEditPage` loads and normalizes the event overlay into location
   records.
2. `EventLocationSwitcher` emits only a location id. It does not edit layout
   arrays or persist data.
3. `StudentEventEditPage` resolves the selected published floor plan and passes
   a focused overlay to `EventFloorEditor`.
4. `EventFloorEditor` owns transient selection, history, viewport, and draft
   state. It receives the read-only base map and editable event arrays.
5. Save/submit callbacks replace only the selected normalized location through
   `replaceEventOverlayLocation`, then call the existing event overlay service.
6. Pure viewport helpers remain in `src/lib/eventViewport.ts`; they must not
   depend on React or persistence.

No change is made to `CampusEventOverlay`, `EventOverlayLocation`, or the
event-overlay service write boundary.

## Error and edge handling

- If a location has no published floor plan, preserve the existing error state
  and explain which location is unavailable.
- If content bounds are empty or malformed, fit to the authored canvas and
  guard all pan/zoom calculations against non-finite values.
- If a location has no event additions, show a clear placement hint without
  blocking canvas gestures.
- If a user switches while a save/submit is in flight, existing busy-state
  behavior remains authoritative; no second persistence model is introduced.
- Keep local recovered drafts scoped by event id and location reference.

## Testing and verification

- Pure viewport tests cover content bounds, wheel normalization, gradual zoom,
  cursor anchoring, fit framing, and pan bounds.
- `EventFloorEditor` tests cover location-keyed fit, normal wheel pan,
  modifier-wheel zoom, Space/middle/Pan movement, bounded dragging, fit/zoom
  controls, object placement, and read-only protection.
- `EventLocationSwitcher` tests cover active state, location context, counts,
  accessible names, and location change callbacks.
- Run the focused Vitest suite, `git diff --check`, and `pnpm build` (or the
  repository's equivalent production build command) before claiming completion.

## Acceptance criteria

- Student Event Builder visibly follows the Admin Map Builder workspace rhythm.
- Plotting event furniture and labels no longer causes unexpected viewport
  jumps or unbounded panning.
- Location switching is understandable at a glance and preserves each
  location's own event additions.
- The published base map remains read-only and existing event save/submit
  behavior still works.
- Focused tests and the production build provide fresh verification evidence.
