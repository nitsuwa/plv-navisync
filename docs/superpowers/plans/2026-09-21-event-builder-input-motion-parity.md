# Event Builder Input, Motion, and Published-Map Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a presentation-ready Student Event Builder with isolated editor controls, stable object gestures, smooth viewport motion, explicit pan feedback, and complete locked published-floor visuals.

**Architecture:** Keep event persistence and selection state in `EventFloorEditor`, but move viewport animation into a small reusable hook and move published-floor rendering onto the canonical read-only scene. Use immutable gesture-start snapshots plus animation-frame coalescing for object movement, and preserve pure coordinate/snap math in the existing library modules.

**Tech Stack:** React 18, TypeScript, Tailwind, SVG, requestAnimationFrame, Vitest, Testing Library, Vite.

## Global Constraints

- Published map geometry remains immutable; only event furniture and event labels may change.
- Existing event save/submit, recovered drafts, undo/redo, location switching, grouping, resize, rotate, and read-only behavior must remain compatible.
- Do not import Admin authoring persistence or mount the full Admin Floor Editor.
- Use pointer-transparent feedback and honor `prefers-reduced-motion`.
- Preserve all unrelated dirty-worktree changes; do not stage, commit, reset, or push.

---

### Task 1: Isolate canvas placement from editor chrome

**Files:**
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- Consumes: existing `handleCanvasClick` placement flow and `data-event-item` item marker.
- Produces: semantic placement-surface and editor-chrome markers.

- [ ] **Step 1: Write the failing Snap click-through test**

Arm Furniture mode, record the current furniture count, click the `Snap to grid` button, and assert the count is unchanged while `aria-pressed` toggles.

```tsx
const before = container.querySelectorAll('[data-event-item][data-event-kind="furniture"]').length;
fireEvent.click(screen.getByRole('button', { name: /snap to grid/i }));
expect(container.querySelectorAll('[data-event-item][data-event-kind="furniture"]')).toHaveLength(before);
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
node node_modules\vitest\vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx -t "does not place furniture from editor chrome" --reporter=verbose --maxWorkers=1
```

Expected: the active furniture template count increases before the fix.

- [ ] **Step 3: Implement semantic event ownership**

Mark the transformed map content as `data-event-placement-surface`. Mark all floating UI roots as `data-event-editor-chrome`. In `handleCanvasClick`, return when the target is inside editor chrome or outside the placement surface. Keep event-item selection behavior unchanged.

- [ ] **Step 4: Run placement and control tests**

Run the new test plus existing snap, zoom-control, asset-dock, item-action, and label-action tests. Confirm they pass.

### Task 2: Make move gestures stable and frame-coalesced

**Files:**
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`
- Modify: `src/lib/eventLayoutGeometry.ts`
- Modify: `src/lib/__tests__/eventLayoutGeometry.test.ts`

**Interfaces:**
- Produces: `EventMoveGesture` with `startPointer`, `anchorId`, and immutable furniture/label origin arrays.
- Consumes: existing `snapLayoutPosition` and canvas-boundary helpers.

- [ ] **Step 1: Write failing gesture tests**

Add behavior tests proving that pointer moves resolve from the original snapshot, a move outside the canvas remains constrained, and crossing one snap threshold does not bounce backward on the next nearby frame.

- [ ] **Step 2: Run the focused tests and verify RED**

Run the geometry and editor test names. Expected: the snapshot resolver is missing and the component exhibits incremental movement behavior.

- [ ] **Step 3: Add pure snapshot movement math**

Implement a typed resolver that accepts immutable origins, absolute pointer position, floor bounds, zoom-aware snap threshold, and snap preference, then returns final item positions and guide lines without reading live React arrays.

- [ ] **Step 4: Integrate a requestAnimationFrame move queue**

Store the gesture and latest pointer sample in refs. Schedule one frame at a time, calculate from the immutable snapshot, and update furniture/labels once per frame. Flush the final sample before history is pushed on release; cancel pending frames on blur/unmount.

- [ ] **Step 5: Run move, resize, rotate, history, and snap tests**

Confirm all focused event gesture tests pass and exactly one history entry is created per completed move.

### Task 3: Add smooth, explicit viewport motion

**Files:**
- Create: `src/components/events/useEventViewportMotion.ts`
- Create: `src/components/events/__tests__/useEventViewportMotion.test.tsx`
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`
- Modify: `src/lib/eventViewport.ts`
- Modify: `src/lib/__tests__/eventViewport.test.ts`

**Interfaces:**
- Produces: `useEventViewportMotion({ clampPan, initialZoom, initialPan })` returning current state, live transform refs, immediate updates, animated targets, and cancellation.
- Consumes: `getSmoothZoomTarget`, `normalizeWheelDelta`, and cursor-anchor pan math.

- [ ] **Step 1: Write failing motion tests**

Use controlled animation frames to assert wheel events accumulate toward one target, cursor-anchored zoom preserves the world point, animated controls finish on the exact target, and reduced-motion applies immediately.

- [ ] **Step 2: Write failing pan-feedback tests**

Assert Space changes the canvas cursor to `grab`, mouse-down while Space is held changes it to `grabbing`, a visible status says `Panning`, and release restores the prior tool without moving an item.

- [ ] **Step 3: Implement the viewport-motion hook**

Maintain current and target refs, blend with cubic ease-out in one animation loop, coalesce wheel targets, clamp every frame, and cancel safely. Use immediate updates for active direct pan and reduced-motion mode.

- [ ] **Step 4: Integrate wheel, buttons, Fit View, touch, and feedback**

Route viewport writes through the hook. Keep normal wheel pan and Ctrl/Cmd wheel zoom. Add active-pan React state only for cursor/status feedback, not per-frame coordinates. Make status overlays pointer-transparent.

- [ ] **Step 5: Run viewport and editor interaction tests**

Confirm wheel, zoom controls, fit, Space/middle/Pan, touch, browser-default prevention, and cancellation tests pass.

### Task 4: Render the complete locked published floor

**Files:**
- Modify: `src/components/map-builder/ReadonlyFloorPlanVisuals.tsx`
- Modify: `src/components/map-builder/__tests__/ReadonlyFloorPlanVisuals.test.tsx`
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- Consumes: `ReadonlyFloorPlanScene({ floor, entrances })`.
- Produces: one canonical presentation-only scene used beneath event overlays, with no authoring handlers.

- [ ] **Step 1: Write failing parity tests**

Create a floor fixture containing appearance, path, room, wall, attached door/window, permanent catalog furniture, stairs, ramp, elevator, label, and exterior zone. Assert each canonical read-only visual appears inside the event editor and no authoring handles appear.

- [ ] **Step 2: Run parity tests and verify RED**

Expected: the event editor currently renders only simplified rooms, walls, rectangular doors/windows, and generic furniture.

- [ ] **Step 3: Complete canonical read-only primitives**

Extend `ReadonlyFloorPlanScene` only for published visual fidelity missing from the fixture, including wall-aware rotation and authored appearance. Keep all nodes non-editable unless a caller explicitly supplies a navigation callback.

- [ ] **Step 4: Replace the event editor's duplicated indoor renderer**

Mount `ReadonlyFloorPlanScene` for indoor floors and retain `ReadonlyOutdoorCampusScene` for campus ground. Keep the event layer above both scenes and remove the duplicate grid/rectangle rendering.

- [ ] **Step 5: Run read-only visual and event regression tests**

Confirm all published elements render, the base map cannot be selected or mutated, and event furniture remains editable.

### Task 5: Presentation QA and regression verification

**Files:**
- Modify only if a verified defect is found: files from Tasks 1–4.
- Update: `progress.md`
- Update: `findings.md`

**Interfaces:**
- Consumes the finished event editor and existing QA routes/data.
- Produces fresh automated and browser evidence.

- [ ] **Step 1: Run the complete focused suite**

```powershell
node node_modules\vitest\vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/useEventViewportMotion.test.tsx src/components/map-builder/__tests__/ReadonlyFloorPlanVisuals.test.tsx src/lib/__tests__/eventViewport.test.ts src/lib/__tests__/eventLayoutGeometry.test.ts --reporter=dot --maxWorkers=1
```

- [ ] **Step 2: Run production and diff verification**

```powershell
node node_modules/vite/bin/vite.js build
git diff --check
git status --short
```

- [ ] **Step 3: Perform browser QA at desktop and narrow widths**

Verify Snap does not spawn an item; click/drag all asset types; drag across snap lines and boundaries; Space-pan from empty canvas and an item; middle-mouse pan; normal-wheel pan; modifier-wheel zoom; buttons/Fit View; resize/rotate; location switching; and visual parity on a detailed indoor floor.

- [ ] **Step 4: Inspect browser console and reduced motion**

Confirm there are no new runtime errors, pointer-capture warnings, passive-wheel warnings, or stuck gestures. Emulate reduced motion and verify zoom/pan targets apply without animation.

- [ ] **Step 5: Record evidence without committing**

Update planning files with test counts, build output, browser observations, and unrelated baseline warnings. Preserve the user's existing working tree and do not stage, commit, or push.
