# Event Builder Input, Motion, and Published-Map Parity Design

Date: 2026-09-21  
Status: Approved by delegated product judgment

## Goal

Make the Student Event Builder presentation-ready: editor controls are safe from canvas placement, furniture tracks the pointer without snap jitter, Space/Pan gestures communicate their state, wheel pan and zoom feel smooth, and the locked published floor retains the authored Admin Map Builder visual language.

## Approaches considered

1. **Local event-editor stabilization and shared read-only visuals — selected.** Keep the event overlay model and editor shell, replace fragile gesture internals with stable pointer snapshots and frame-coalesced viewport motion, and render the published floor through shared canonical read-only primitives. This gives the best quality-to-risk ratio.
2. **Small event-handler patch.** Stop propagation on Snap and add CSS transitions. This is quick but leaves incremental drag math, per-event React churn, missing pan feedback, and the simplified base map unresolved.
3. **Embed the full Admin Floor Editor.** This would maximize visual similarity but imports authoring state, tools, validation, and persistence into a student workflow where published geometry must be immutable. The regression and permission risk is too high.

## Product behavior

### Input ownership

- Only the semantic map surface may place furniture or labels.
- Toolbars, palettes, inspector bubbles, viewport controls, warnings, and status chrome are editor controls and must never bubble into placement or deselection.
- Pointer gestures use one owner at a time: pan, move, resize, or rotate. Starting one gesture prevents every other gesture until release or cancellation.
- Window blur, lost pointer capture, visibility change, and component unmount cancel the active gesture safely.

### Furniture movement and snapping

- A move gesture captures immutable start positions for every selected item plus the starting world pointer.
- Each pointer frame calculates the absolute delta from that snapshot. It does not derive a new delta from React's latest rendered item positions.
- Pointer movement is coalesced to at most one visual update per animation frame.
- Alignment snapping remains visible and predictable. Grid snapping is magnetic near a target and commits the final constrained position without oscillating between neighboring grid lines.
- The dragged selection remains inside the authored event canvas.

### Pan and zoom

- Pan can be armed through the Pan tool, Space, or middle mouse. The cursor is `grab` while armed and `grabbing` while actively moving.
- A compact, pointer-transparent status chip announces `Release Space to stop panning` while temporary pan is armed and `Panning` during active movement.
- Normal wheel input pans; Ctrl/Cmd+wheel zooms toward the pointer.
- Wheel deltas accumulate into a target transform and animate through `requestAnimationFrame`; button zoom and Fit View use a short cubic ease-out transition.
- Active direct dragging and panning remain immediate. Reduced-motion preference skips interpolation and applies the target transform directly.
- Browser page zoom and scrolling are prevented only while the pointer gesture belongs to the event canvas.

### Published-floor parity

- The base map remains read-only and receives no event mutation path.
- Indoor floors render the complete published scene: floor appearance, paths, rooms, walls, wall-aware doors/windows, permanent asset symbols, stairs, ramps, elevators, labels, exterior zones, and entrance treatments when present.
- The event layer remains visually distinct and editable above the published scene.
- Campus-ground locations continue using the canonical read-only outdoor scene.
- Authoring-only elements such as selection boxes, resize handles, issue markers, grids, and Admin tools are excluded.

## Architecture

- `EventFloorEditor.tsx` remains the workflow coordinator but delegates viewport interpolation to a focused hook and published-floor drawing to the canonical read-only scene.
- `useEventViewportMotion.ts` owns current/target transform refs, frame scheduling, reduced-motion handling, cursor-anchored zoom, and animated fit/button zoom.
- Move gesture snapshots live in refs to avoid stale closures; React state remains the source of persisted event furniture/labels and selection UI.
- `ReadonlyFloorPlanVisuals.tsx` is extended only where required for faithful published presentation. Event-specific editing stays out of that component.
- Pure math remains in `eventViewport.ts` and `eventLayoutGeometry.ts` for isolated tests.

## Accessibility and responsive behavior

- All icon-only viewport controls retain accessible names and visible focus rings.
- Pan status uses `role="status"` without repeatedly announcing every pointer frame.
- Keyboard Space is ignored in inputs, textareas, selects, and contenteditable fields.
- Touch interaction keeps pinch zoom and one-finger Pan mode behavior; controls retain at least 40–44px targets on narrow screens.
- Motion honors `prefers-reduced-motion`.

## Acceptance criteria

- Clicking Snap, zoom, Fit View, selection actions, or any editor chrome never creates or selects an event item behind it.
- A dragged item follows the pointer continuously, stays in bounds, and does not jitter at snap thresholds.
- Space and Pan tool gestures visibly switch between grab and grabbing states and never move furniture.
- Trackpad/mouse wheel pan and modifier-wheel zoom are cursor-stable and visibly smooth.
- The same published floor shows the same authored architectural and asset details in the Student Event Builder as in the read-only published map vocabulary.
- Existing save, submit, recovered-draft, undo/redo, location switching, resize, rotate, grouping, and read-only behavior remain intact.
- Focused tests, production build, diff check, and desktop/narrow browser QA pass before completion.
