# Event Canvas Viewport UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Student Event Builder canvas predictable and Visio-like by fixing fit framing, Space-pan bounds, wheel behavior, and zoom controls.

**Architecture:** Keep event overlay persistence and existing editor tools intact. Add a pure `eventViewport` module for content bounds, wheel normalization, smooth zoom, and fit-state calculations; wire those helpers into `EventFloorEditor` with one viewport lifecycle keyed to the selected floor. Add regression tests before each production change.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, existing `mapViewport` helpers, Tailwind utilities.

## Global Constraints

- Normal wheel pans; `Ctrl/Cmd + wheel` zooms smoothly at the cursor.
- Space + drag, middle mouse, and Pan tool share clamped viewport movement.
- Fit framing uses visible floor/event content with a safe fallback to the authored canvas.
- Preserve furniture placement, selection, undo/redo, save, submit, read-only, and mobile behavior.
- Do not change auth, persistence, map data, global navigation, or unrelated dirty work.
- Do not stage or commit because the repository index is currently read-only.

---

### Task 1: Add pure viewport math and regression tests

**Files:**
- Create: `src/lib/eventViewport.ts`
- Create: `src/lib/__tests__/eventViewport.test.ts`

**Interfaces:**
- `getFloorPlanContentBounds(floorPlan, overlayFurniture, overlayLabels)` returns an authored-space `{ x, y, width, height }` content box, falling back to the full canvas.
- `normalizeWheelDelta(input)` returns screen-space `{ x, y }` pan deltas for pixel, line, page, and Shift-wheel input.
- `getSmoothZoomTarget(zoom, deltaY, minZoom, maxZoom)` applies an exponential wheel step and clamps the result.
- `fitEventViewport(input)` returns `{ zoom, pan }` centered on content with padding and zoom limits.

- [ ] **Step 1: Write failing tests** for content bounds, fallback bounds, wheel normalization, gradual zoom, and fit centering.
- [ ] **Step 2: Run the tests** with the direct local Vitest runtime and confirm they fail because `eventViewport` does not exist.
- [ ] **Step 3: Implement the pure helpers** using existing `itemBounds`/`labelBounds` geometry and finite-value guards.
- [ ] **Step 4: Re-run the tests** and confirm all viewport helper tests pass.

### Task 2: Rework EventFloorEditor viewport lifecycle and gestures

**Files:**
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- Use `eventViewport` helpers without changing `CampusEventOverlay` or `FloorFurniture` persistence shapes.
- Add a stable `data-testid="event-canvas-content"` to the transformed content layer for behavior tests.

- [ ] **Step 1: Add failing component tests** for normal wheel pan, Ctrl/Cmd wheel zoom, cursor anchoring, fit on location change, and Space drag remaining within pan bounds.
- [ ] **Step 2: Run the component tests** and verify the new assertions fail against the current wheel-zoom-only and one-time initialization behavior.
- [ ] **Step 3: Replace the one-time `{ x: 0, y: 0 }` initialization** with a floor-keyed fit effect that includes visible content and overlay additions; preserve the current frame during ordinary edits.
- [ ] **Step 4: Route Space/middle/Pan movement through bounded deltas** and clear active gestures on mouse leave, blur, visibility change, and tool/location changes.
- [ ] **Step 5: Make wheel input pan by default** and use modifier-only exponential zoom around the pointer; prevent default only for the handled canvas gesture.
- [ ] **Step 6: Re-run the component tests** and confirm the interaction regressions pass.

### Task 3: Add viewport controls and polish the workspace UI

**Files:**
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

- [ ] **Step 1: Add failing tests** for Fit to content, zoom out/in, current percentage, accessible labels, and disabled states at min/max zoom.
- [ ] **Step 2: Implement a compact responsive control cluster** with `Fit`, `−`, percentage, and `+`; keep the canvas as the primary surface and preserve the existing reset-map-view label for compatibility.
- [ ] **Step 3: Add a small live status hint** showing the active gesture (`Space + drag`, `Ctrl/Cmd + wheel`) without covering the map content or blocking pointer events.
- [ ] **Step 4: Re-run the component and canvas interaction tests** at desktop and narrow rendering dimensions.

### Task 4: Final verification

**Files:**
- No new production files.

- [ ] **Step 1: Run focused viewport, canvas, event, and layout tests.**
- [ ] **Step 2: Run `git diff --check` and inspect only task-relevant status entries.**
- [ ] **Step 3: Run the production Vite build.**
- [ ] **Step 4: Report focused passes, build result, and any pre-existing typecheck/live-browser limitations without claiming unverified visual perfection.**
