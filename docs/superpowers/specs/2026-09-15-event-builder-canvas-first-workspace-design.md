# Event Builder Canvas-First Workspace Design

## Goal

Make the Student Organization event builder understandable for beginners,
older users, and non-technical users by keeping the canvas large and stable,
reducing stacked controls, and making the next action obvious.

## Problem

The current Furniture mode places three separate control rows in normal page
flow: the asset picker, the layout preset controls, and the multi-selection
alignment actions. Opening the picker can consume most of the viewport and
push the map below the fold. The user must also remember which control row
contains the next action.

## Approved interaction model

- The canvas remains the primary workspace and keeps its height when tools are
  opened.
- The top tool row stays compact: Select, Furniture, Label, and Pan.
- Furniture mode displays a small floating asset dock inside the canvas. The
  dock does not resize or push the canvas.
- The dock starts with a clear "Add event item" trigger and a short Recently
  used row. "More assets" opens the searchable, categorized asset panel.
- Clicking an asset arms it for click-to-place. Dragging an asset from the dock
  to the canvas places it directly. The selected asset remains armed for
  repeated placement until Escape or another tool is chosen.
- Layout presets live in the dock's Arrange menu, so preset controls are not
  shown when the user is simply placing one item.
- When two or more furniture items are selected, a compact contextual toolbar
  appears over the canvas. It shows the selection count, one Arrange menu, and
  the most common actions. The six alignment/distribution actions are inside
  the menu with plain-language labels.
- Escape closes an open dock/menu, clears selection, and returns the editor to
  a neutral state. Existing keyboard shortcuts remain available.
- On narrow screens, the asset panel becomes a bottom sheet with a scrim and
  a close button. It never creates a second page scroll area or covers the
  bottom navigation permanently.

## Beginner-first copy and affordances

- Use action words: "Add event item", "More assets", "Arrange selected
  items", "Place on canvas", and "Close".
- Keep visual asset names and descriptions. Every icon-only action has an
  accessible label and a tooltip/title.
- Keep the selected asset visually obvious with both color and a text label;
  never communicate state by color alone.
- Show a short helper line only when it is useful: "Choose an item, then click
  the canvas. Drag to place it." The helper is inside the floating dock, not a
  full-width row.
- Preserve the existing clear canvas empty state, but mention the new
  "Add event item" entry point.

## Layout sketch

```text
[Select] [Furniture] [Label] [Pan]                         [Undo] [Save]

  ┌──────────────────────────────────────┐
  │ Add event item                    ˅  │  ← floating dock trigger
  │ Recent: Chair  Table  Booth  Stage   │
  │ [More assets] [Arrange]              │
  └──────────────────────────────────────┘

                         event canvas

                   [4 items selected] [Arrange] [Duplicate] [Delete]
```

## Boundaries

- Keep `CampusEventOverlay`, `FloorFurniture`, and `FloorLabel` shapes
  unchanged.
- Keep the base map read-only and keep event additions editable.
- Do not change save, submit, history, validation, viewport math, or route
  behavior in this pass.
- Keep the existing non-floating `CanvasAssetPalette` behavior available for
  other map-builder surfaces.
- Use existing Tailwind tokens, icons, and native SVG asset visuals; do not
  introduce a new design system or dependency.

## Acceptance criteria

1. Furniture mode no longer adds a full-width asset row, layout row, or
   alignment row above the canvas.
2. The asset trigger, recently used choices, and panel are keyboard reachable
   and have descriptive accessible names.
3. Selecting an asset and clicking the canvas still creates the same persisted
   furniture object and keeps the placement tool armed.
4. Dragging an asset from the dock to the canvas creates one furniture object
   at the drop point.
5. Arrange actions are hidden until multiple furniture items are selected and
   then remain compact and usable at narrow widths.
6. The asset dock is a bottom sheet on mobile and can be closed without
   changing the active event data.
7. Existing event editor, layout, viewport, and palette tests remain green.

## Verification

Add focused Testing Library coverage for the floating dock, recent asset
selection, Escape/close behavior, placement, multi-selection Arrange menu,
and mobile bottom-sheet classes. Run the focused event/canvas suites and the
production Vite build. Do not claim visual perfection without a fresh local
browser check; report any existing baseline failures separately.
