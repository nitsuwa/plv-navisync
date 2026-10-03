# Premium Map and Event Builder Assets + Shared Canvas Interaction

Date: 2026-09-15  
Status: Awaiting user review before implementation

## Goal

Make the Map Builder and Student Event Builder feel like one polished design tool:

- Event and map objects should look like recognizable real-world floor-plan assets,
  not colored labels.
- Panning should be effortless: holding Space temporarily activates Pan and
  releasing it restores the previous tool.
- The same interaction language should work on desktop and mobile without
  changing the existing read-only map behavior in the Student Event Builder.
- Existing saved campuses, floor plans, and event overlays must continue to load.

The design favors a clean top-down illustrated/2.5D style. It provides real
visual semantics while staying crisp at every zoom level, fast on mobile, and
consistent with the existing SVG-based map artwork.

## Current context

The current implementation already has useful foundations:

- `src/components/events/eventAssets.tsx` defines event furniture templates and
  simple SVG artwork.
- `src/components/events/EventFloorEditor.tsx` supports Select, Furniture, Label,
  and Pan tools, plus middle-mouse panning, wheel zoom, pinch zoom, undo/redo,
  and event-overlay-only saving.
- `src/components/map-builder/DecorAssetVisual.tsx` and the decor visual helpers
  provide a reusable SVG rendering pattern for permanent map assets.
- Student event editing renders the published base map as read-only and stores
  only event furniture and labels in the overlay.

The new work should extend these patterns instead of introducing a second
rendering model or allowing event edits to mutate the base campus map.

## Product design

### 1. Asset visual language

Assets will use hand-authored React/SVG artwork in a consistent top-down view.
Each asset has a clear silhouette, practical details, a restrained outline, and
a very subtle shadow or surface treatment. The artwork must remain identifiable
when reduced to a small canvas object and remain clean when zoomed in.

Initial catalog:

- Essentials: chair, round table, rectangular table, booth, registration desk
- Stage and AV: stage, podium, speaker, microphone stand, projector, screen,
  monitor
- Outdoor: tent, canopy, bench, trash bin, generator, cable ramp
- Safety: barrier, queue post, first-aid marker, fire extinguisher, emergency
  access marker
- Wayfinding: signage, directional arrow, entrance marker, accessibility marker

The first toolbar view shows the most frequently used assets. The remaining
catalog is discoverable through category tabs and search. Asset labels are shown
in the palette, on hover/focus, and for the selected object; permanent text on
every canvas object is avoided so a dense layout stays readable.

Color is used for category accents and selection state, not as the only way to
identify an object. Each asset also has a distinct shape and accessible name.

### 2. Smart objects and templates

The editor will support two levels of placement:

1. Individual assets for precise editing.
2. Smart layout presets for common event setups:
   - chair row
   - classroom seating
   - booth area
   - registration area
   - stage setup

A smart preset creates normal editable objects. Users can move, resize, rotate,
or delete each generated object afterward. This gives beginners a fast starting
point without taking control away from advanced users.

The Map Builder receives the complete catalog. The Student Event Builder receives
only approved event assets and presets; the published base campus remains locked.

### 3. Shared Space-to-pan interaction

Space is a temporary modifier, not a permanent tool switch:

- While the canvas is hovered or focused, holding Space changes the cursor to
  grab and allows drag-to-pan from any active tool.
- Releasing Space returns to the prior tool without changing selection,
  furniture mode, or label mode.
- Space does not intercept typing in inputs, textareas, editable labels, or
  dialogs.
- The browser should not scroll while Space-pan is active on the canvas.
- Pointer capture is used during the drag so panning remains stable if the
  pointer leaves the canvas.
- Existing Pan tool and middle-mouse behavior remain available.
- Touch keeps one-finger pan in Pan mode and two-finger pinch zoom; object
  editing remains usable without a keyboard.

The interaction should be implemented as a shared canvas interaction layer used
by both builders. The event editor retains its existing pan bounds and read-only
rules.

### 4. Selection and layout controls

The selected object receives a clear but quiet bounding box with resize handles,
rotation affordance, and an accessible name. The first implementation must
support:

- grid snapping with a visible but subtle grid option
- smart alignment guides and equal-spacing feedback
- duplicate by Alt/Option-drag and Ctrl/Cmd+D
- arrow-key nudging and Shift+Arrow accelerated nudging
- `R` rotation in 15-degree increments
- Delete/Backspace removal, Escape deselection, and `0` fit-to-view
- multi-select, group/ungroup, lock/unlock, and layer ordering

Controls are disabled or hidden when the editor is read-only. Destructive
actions remain undoable.

### 5. Palette and responsive layout

Desktop keeps the current compact toolbar rhythm but replaces text-only asset
chips with small visual previews. The palette uses category groups and a
“More assets” panel so the primary toolbar remains calm.

Mobile uses a bottom sheet or expandable asset tray with large touch targets.
The canvas remains the priority: the tray can be collapsed, and selected assets
can be placed repeatedly without reopening the picker.

All interactive targets meet a minimum 44px touch area. Tooltips, focus states,
keyboard support, and screen-reader labels are required. Asset color, icon, and
text are used together so the UI remains understandable in high-contrast modes.

### 6. Layout safety and feedback

The editor should surface non-blocking warnings for:

- overlap with entrances, exits, stairs, ramps, or emergency paths
- blocked or too-narrow accessible aisles
- objects outside the editable floor/campus boundary
- overlapping event objects when the overlap is likely accidental

Warnings include a short explanation and a focus action. The initial rollout
does not silently move objects or prevent creative layouts; submission can later
require critical safety issues to be acknowledged or fixed.

## Technical architecture

### Asset catalog

Introduce one typed catalog descriptor shared by both builders. A descriptor
contains:

- stable asset key and display name
- category and search keywords
- default width, height, and allowed rotations
- SVG artwork renderer
- optional variants and smart-object configuration
- accessibility description

The existing event `type` values remain valid. New descriptors may add optional
`assetKey`, `variant`, and `config` fields to furniture data, with legacy values
falling back to the current renderer. This avoids breaking old overlays or
published campuses.

### Shared rendering

Reuse the existing SVG visual conventions from the decor system. Event assets
should be rendered through the same catalog-driven artwork path in the palette,
canvas, inspector, and preview surfaces. No remote image URLs or runtime asset
downloads are required.

The renderer must preserve the object’s existing transform model: position,
width, height, rotation, layer, selection state, and read-only state remain
owned by the canvas/editor. Artwork itself is responsible only for its local
visual details.

### Shared interaction layer

Extract only the interaction behavior that is genuinely common: temporary
Space-pan, middle-mouse pan, pointer capture, zoom-at-pointer, keyboard guard
rules, and viewport clamping hooks. Builder-specific behavior stays in each
editor so map editing and event-overlay editing cannot accidentally share save
or mutation logic.

### Persistence and compatibility

- Existing `FloorFurniture` and `FloorLabel` records continue to deserialize.
- New asset metadata is optional and serialized only when present.
- Event saves continue to write only event overlay data.
- Base campus/floor objects remain read-only in the Student Event Builder.
- Unknown future asset keys render a safe fallback shape and retain their name.

## Implementation sequence

1. Add characterization tests for current event placement, select/drag, pan,
   zoom, read-only mode, mobile gestures, and legacy overlay hydration.
2. Add the shared Space-pan modifier and keyboard-focus safeguards to both
   builders without changing existing tool shortcuts.
3. Build the catalog-driven SVG asset renderer and replace the current event
   pictograms with the new recognizable artwork.
4. Redesign the palette and selected-object controls for desktop and mobile.
5. Add snapping, guides, duplication, multi-select, grouping, rotation, and
   layer controls incrementally behind focused tests.
6. Add smart presets and safety warnings after the core editing workflow is
   stable.
7. Run focused tests, build checks, and responsive visual QA at desktop and
   mobile viewport sizes. Fix regressions before calling the work complete.

## Acceptance criteria

- Chairs, tables, booths, stages, AV equipment, tents, barriers, and signage are
  visually recognizable without relying on a text label.
- Holding Space while dragging pans in both Map Builder and Student Event
  Builder, then restores the prior tool on release.
- Space does not scroll the page while the canvas is active and does not break
  text inputs or dialogs.
- Existing Select, Furniture, Label, Pan, zoom, undo/redo, save, submit, and
  read-only behaviors continue to work.
- Student event edits never mutate the published base map.
- The primary desktop toolbar remains compact and the mobile canvas remains
  usable with touch targets at least 44px.
- Legacy saved overlays and campuses render successfully.
- Focused tests and the production build pass; visual QA confirms no clipped,
  overlapping, or inaccessible controls at supported viewport sizes.

## Scope guardrails

This effort does not introduce remote image hosting, photorealistic asset
downloads, a new database table for every asset, or a rewrite of the existing
map persistence model. The first release focuses on a reliable shared editing
experience and a cohesive asset library; advanced collaboration and real-time
multi-user editing remain out of scope.
