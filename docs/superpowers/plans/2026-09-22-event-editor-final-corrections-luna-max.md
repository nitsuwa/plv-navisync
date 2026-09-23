# Event Editor FINAL CORRECTION PLAN for Luna Max

> Execution handoff: use the available executing-plans skill and follow this document sequentially. This document is planning only; no application changes were made when it was authored. Check off steps only after their stated evidence exists. Do not commit, push, publish, submit an event, or erase user drafts.

**Goal:** Close the eight remaining defects and missing verification gates from the approved event-editor drag-stability plan.

**Architecture:** Retain the existing React/DOM editor, viewport-motion hook, immutable transform snapshots, committed validation, and shared published-map renderers. Finish the already-approved Pointer Events consolidation inside EventFloorEditor; do not replace the renderer, add a gesture library, or redesign the feature.

**Tech stack:** Existing React, TypeScript, Vite, Vitest, Testing Library, and available browser tooling. No runtime dependency additions.

## Source of truth and constraints

- Repository: `C:/Users/Rj/Documents/GitHub/plv-navisync`.
- Original plan: `docs/superpowers/plans/2026-09-21-event-editor-drag-stability-luna.md`.
- Existing evidence: `docs/superpowers/verification/2026-09-21-event-editor-drag-stability.md`.
- Original task numbers below refer to that plan, not this correction plan's execution steps.
- Preserve all unrelated dirty-checkout work. Read applicable AGENTS.md files and inspect scoped diffs before editing. Do not create a clean HEAD checkout that omits existing changes.
- Address only the eight listed defects and the missing acceptance coverage. Existing working behavior is protected by DO NOT TOUCH below.
- No service/schema/authentication/submission-workflow redesign. Save/submit UI actions must remain mocked in tests. Browser QA uses disposable local fixtures and isolated recovery storage, never the user's real event as a scratchpad.
- A new browser tab is not an isolated storage context. Use a supported isolated browser context or a fixture-only overlay ID and a separate fixture origin/profile. Never clear the user's localStorage to prepare tests.
- Preserve raw TypeScript diagnostics and exit codes. A filtered command with no matches is not a passing full typecheck. The prior 84-test result is historical evidence, not proof of these corrections.
- There is no lint script in the inspected package.json. Run an existing configured linter only if one is found; do not install tooling just to create a green lint result.
- If browser input, profiling, viewport emulation, or screenshot export is unavailable, finish independent implementation/tests and mark the exact gate unverified. Do not mark the original plan complete while those gates remain open.

## Exact file map

Production changes permitted:

- `src/components/events/useEventViewportMotion.ts`: issues 1 and 2 only.
- `src/components/events/EventFloorEditor.tsx`: issues 3–7 and minimal pending-preview save/switch boundary integration.
- `src/lib/eventLayoutGeometry.ts`: issue 8 comparator only.
- `src/pages/StudentEventEditPage.tsx`: explicit pre-switch draft flush for the pending-preview acceptance case; retain its floor-resolution memo and existing services.

Existing tests to modify/run:

- `src/components/events/__tests__/useEventViewportMotion.test.tsx`.
- `src/components/events/__tests__/EventFloorEditor.test.tsx`.
- `src/components/events/__tests__/EventLayoutIssues.test.tsx` (run; only add needed warning-count measurement fixture assertions).
- `src/components/events/__tests__/EventLocationSwitcher.test.tsx` (run unchanged unless a regression requires adjustment).
- `src/lib/__tests__/eventLayoutGeometry.test.ts`.
- `src/lib/__tests__/eventDraftPersistence.test.ts` (run; storage schema is unchanged).
- Create `src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx` for actual page/editor switching integration with mocked services.
- Create `src/components/events/__tests__/eventEditorTestInput.ts` for file-scoped PointerEvent/capture/RAF test support, only if existing test setup does not provide faithful equivalents. Do not change unrelated tests globally.

Verification artifacts:

- Create `docs/superpowers/verification/2026-09-22-event-editor-final-corrections.md`.
- If a local browser fixture is required, create `tests/browser-fixtures/event-editor/index.html` and `tests/browser-fixtures/event-editor/main.tsx`. Mount the real EventFloorEditor with local data only. These must not be imported by production routes or included as a production build entry.
- Store exported screenshots and measurement JSON under `docs/superpowers/verification/2026-09-22-event-editor-final-corrections/` when tooling supports export; record actual paths, not invented filenames presented as evidence.

## Shared implementation contract: gesture ownership and completion

This is the integration contract for issues 3–7. Implement it once inside EventFloorEditor; do not create parallel cleanup implementations for each issue.

Keep existing moveGestureRef, resizeGestureRef, rotateGestureRef and gestureFrameRef as immutable geometry snapshots. Extend `EventPointerGesture` to include `pinch`. Keep `activePointerIdRef` for single-pointer ownership; use a local `touchPointersRef: Map<number, ScreenPoint>` for the two admitted touch IDs. Do not use a separate TouchEvent stream.

Add one synchronous completion function with these defined policies:

```ts
type FinishReason =
  | "pointerup" | "cancel" | "lostcapture" | "blur" | "hidden"
  | "escape" | "resize" | "pinch-transfer" | "save" | "switch";

// Implement locally; return the current arrays for save/switch callers.
// PointerSample remains { clientX, clientY, shiftKey }.
// EventEditorDraftSnapshot is exported only for the optional page flush ref.
export interface EventEditorDraftSnapshot {
  eventFurniture: FloorFurniture[];
  eventLabels: FloorLabel[];
}
```

`finishInteraction(reason, finalSample?)` ordering:

1. Check an `endingInteractionRef` reentrancy flag. If already finishing, return latest refs with no history/publication/capture work.
2. Set the flag. Snapshot the owner and captured IDs before clearing them.
3. For pointerup, queue the actual pointerup coordinates, including legitimate `(0,0)`, and synchronously flush the last sample against the original captured frame. Remove `syntheticZeroRelease` production branches; tests must supply real coordinates.
4. For save/switch/pinch-transfer, flush the newest pending item sample. For cancel/lostcapture/blur/hidden/resize, discard an unrendered sample and commit the last accepted/displayed preview. This follows the original cancellation policy and avoids invisible movement at cancellation. Do not convert a resize event using the old frame.
5. For Escape, cancel pending RAF/sample and restore immutable gesture-start geometry. It adds no history. Preserve the existing Alt-duplicate operation's independent history semantics; Escape must not delete an already-created duplicate or add another duplicate entry.
6. For a completed item transform, compare latest geometry with gesture origins and append exactly one history entry only when geometry changed. A click, pan, or pinch adds none. Use existing pushHistory; avoid a second history write in a caller.
7. Clear owner/active ID/snapshots/start point/pending sample/panRef/pinchRef/touch map and set dragging/resizing/rotating/transforming/isPanning false. Leave persistent activeTool unchanged. Clear guides.
8. Mark ownership cleared BEFORE releasing canvas captures. Call release only when canvas.hasPointerCapture(id) is true; safely tolerate a browser NotFoundError when capture already ended. A resulting lostpointercapture event must find no owner and do nothing.
9. Publish the final committed draft once. Reuse the existing deferred onDraftChange mechanism or a single identity-guarded publication helper; never both for the same final array pair. During a transform, do not publish every preview. Sync latest refs before returning the snapshot.
10. Clear the reentrancy flag in finally. Repeated up/cancel/lostcapture/blur must be harmless.

`pinch-transfer` is a special caller: snapshot both touch points first; finish the old item/pan interaction once; then register/capture those two IDs again on the canvas and initialize pinch. Do not let cleanup erase the pair before it is copied. Keep any synthesized click from becoming placement after transfer. Ignore delayed lostpointercapture for an ID the canvas currently holds again (`hasPointerCapture(id)` is true); otherwise finalize only if that ID belongs to the current owner. Test release/recapture before a delayed loss notification.

Use a ref containing the latest move/up/finalize implementations so global capture listeners can be installed once and invoke current logic. Update that ref in a layout effect (or the project's equivalent committed-callback convention) rather than reinstalling document/window listeners on every preview. Avoid referencing const callbacks before their declaration when arranging hooks.

## Correction C1 — Continuous wheel progress

1. **Original task:** Task 7, continuous wheel retargeting and the 8ms input test; Task 8 verification.
2. **Files:** `src/components/events/useEventViewportMotion.ts`; `src/components/events/__tests__/useEventViewportMotion.test.tsx`.
3. **Symbols:** `ActiveViewportAnimation`, `animateTo`, its `tick`, `animationRef`, `currentRef`, `targetRef`.
4. **Root cause:** Existing retarget sets `animation.startedAt = NaN`. The next tick substitutes its own timestamp and computes zero progress. Retargeting before each tick can repeat that forever.
5. **Incorrect behavior:** A high-frequency wheel stream can hold the viewport still until input stops; a test with two calls before the first tick cannot detect this.
6. **Exact change:** Preserve one RAF loop. Add `lastFrameAt: number | null` to the animation record. Initialize it null once. Each tick stores its timestamp after computing progress. On retarget after a rendered frame, set `from` to currentRef, `target` to the new clamped target, `duration` to the supplied duration, and `startedAt` to `lastFrameAt`, not NaN. Before any frame has run, update the target/duration without reinitializing the clock repeatedly. Initial NaN is permitted only for the first tick's clock initialization. Keep RAF timestamps as the sole interpolation time base.

```ts
// Existing-animation branch, after targetRef receives the clamped target:
existing.from = { zoom: currentRef.current.zoom, pan: { ...currentRef.current.pan } };
existing.target = target;
existing.duration = duration;
if (existing.lastFrameAt !== null) existing.startedAt = existing.lastFrameAt;
// Do not cancel/reschedule its RAF and do not reset startedAt to NaN here.
```

At settle, commit the exact clamped target, synchronize targetRef to that returned safe transform, and clear the animation record. Keep the cancellation identity check so a canceled tick cannot later move the viewport.

7. **Preserve:** Cubic easing, current hook API, caller durations (wheel pan 120ms, wheel zoom 160ms, Fit 180ms), pan clamps, zoom limits, normalized wheel deltas, anchoring calculations, immediate interruption.
8. **Edges:** Input before first RAF; reverse direction; a target already reached; clamped target; tab resume with a large RAF interval; cancel and immediately restart; last target after stream ends. No competing loops.
9. **Tests:** Add `wheel-progress-8ms`, `wheel-reversal`, `wheel-cancel-no-late-frame`. Use a cancellable Map-based fake RAF scheduler, not a queue that executes canceled callbacks. Drive input at 0,8,16,...,160ms and render frames at 0,16,32,...; deliberately deliver the event just before each corresponding frame. Assert progress during the stream, then exact last target after settling.

```ts
// With hook result and fake frame scheduler initialized in the test:
act(() => result.current.animateTo({ zoom: 1, pan: { x: 10, y: 0 } }, 120));
act(() => runFrame(0));
for (let t = 8; t <= 160; t += 8) {
  act(() => result.current.animateTo({ zoom: 1, pan: { x: t + 10, y: 0 } }, 120));
  if (t % 16 === 0) act(() => runFrame(t));
  if (t === 64) expect(result.current.pan.x).toBeGreaterThan(0);
}
expect(pendingFrameCount()).toBe(1);
act(() => runFrame(288));
expect(result.current.pan.x).toBe(170);
expect(result.current.targetRef.current).toEqual(result.current.currentRef.current);
```

`runFrame(t)` consumes callbacks pending at entry only; callbacks they request belong to the next frame. `pendingFrameCount()` returns that Map's size.

10. **Acceptance:** After the initial zero-time tick, frames make measurable progress while targets arrive; final target settles within supplied duration plus one refresh interval after last input; at most one pending viewport RAF.
11. **Verification:** Run hook tests with `-t 'wheel-'`, then full hook suite; browser sustained wheel for five seconds, including reversal, recording transform each RAF. Do not infer success from endpoint alone.

## Correction C2 — Reduced-motion target consistency

1. **Original task:** Task 7 reduced-motion preservation; Task 8 reduced-motion matrix.
2. **Files:** Same hook and hook test file as C1.
3. **Symbols:** `animateTo` reduced-motion/zero-duration branch, `setImmediateTransform`, `commit`, `targetRef`.
4. **Root cause:** `cancelMotion()` synchronizes targetRef to the OLD current transform, then `commit(target)` updates only currentRef/state.
5. **Incorrect behavior:** Next wheel/zoom command is based on stale targetRef, causing repeated increments to stop accumulating or jump backward.
6. **Exact change:** Use the existing immediate-transform path for this branch:

```ts
if (reduceMotion || duration <= 0) {
  setImmediateTransform(target);
  return;
}
```

Add setImmediateTransform to animateTo's callback dependencies. Do not change cancelMotion's verified interruption behavior.

7. **Preserve:** Immediate reduced-motion rendering; no RAF; existing clamp behavior and API.
8. **Edges:** Reduced motion true; duration zero with preference false; clamp changes actual pan; pending animation interrupted by immediate command; repeated relative navigation.
9. **Tests:** `reduced-motion-target-sync`, `zero-duration-target-sync`, `reduced-motion-relative-accumulation`. For three calls deriving pan.x + 10 from targetRef, expect 10,20,30; assert currentRef, targetRef and rendered transform agree after each. Spy RAF and expect no new request. Verify clamped values, not requested out-of-range values.
10. **Acceptance:** All three representations match synchronously after any immediate command; repeated input accumulates.
11. **Verification:** Hook tests; editor component with mocked matchMedia reduced motion and repeated zoom/wheel; browser reduced-motion mode when supported. No claims based solely on one zoom assertion.

## Correction C5 — Finish Pointer Events consolidation

1. **Original task:** Task 5 gesture ownership, capture, cleanup and test migration; Task 7 stable listeners.
2. **Files:** `src/components/events/EventFloorEditor.tsx`; `src/components/events/__tests__/EventFloorEditor.test.tsx`; optional test helper `src/components/events/__tests__/eventEditorTestInput.ts`.
3. **Symbols:** `beginPointerGesture`, `handleCanvasPointerDown`, `handleItemMouseDown`, `handleResizeStart`, `handleRotateStart`, `handleMouseMove`, `handleMouseUp`, window listener effect, `activePointerIdRef`, `pointerCaptureTargetRef`, `pointerGestureRef`.
4. **Root cause:** Old mouse listeners and onMouseDown paths remain alongside pointer handlers; independent touch handlers maintain their own navigation state. Capture currently uses e.currentTarget, which may be an item/handle. No lostpointercapture policy exists.
5. **Incorrect behavior:** Ownership is split across event families; removed controls can lose capture without completing interaction; cleanup and final-coordinate behavior differ by path.
6. **Exact change:**

- Convert manipulation start signatures to PointerEvent inputs or a narrowly typed input containing the actual needed fields. Remove `as unknown as React.MouseEvent` bridges from manipulation paths. Internal rename of handleMouseMove/Up to pointer-preview/finish names is permitted, but do not rename unrelated functions.
- On start: reject right/extra mouse buttons, reject unrelated active pointers, reject editor chrome, then determine eligible action. Middle button must pan even when starting over a furniture item; it must never move furniture. Locked/read-only items cannot begin item transforms; preserve allowed viewport navigation.
- Only after an action is accepted call preventDefault and stopPropagation, register ownership synchronously, and capture its pointer ID on `canvasRef.current`. Do not capture on the transient resize/rotate handle. Set pointerCaptureTargetRef to the canvas if retained.
- Implement the shared completion contract above. Add native capture-phase window pointermove/up/cancel handlers and a canvas lostpointercapture handler. Remove window mousemove/up listeners and all manipulation onMouseDown fallbacks after migrating tests. Leave click, wheel, and intentional palette HTML drag/drop handlers intact.
- Use stable listener functions reading a latest-callback ref. Do not rebuild listeners on furniture or labels updates.
- Lost capture of an actively owned pointer calls finishInteraction('lostcapture'); loss caused by intentional release after cleanup is ignored. Pointerup must apply its real final sample before completion. Unrelated pointer IDs do nothing.
- In the same implementation batch, replace all old onTouchStart/Move/End/Cancel handlers with the touch Pointer Events integration from C3. Do not ship an intermediate commit that removes touch navigation without its replacement.
- Capture can retarget clicks to the canvas. Record press origin (`item`, `handle`, `blank`, `chrome`) and whether a drag/pan/pinch occurred. `handleCanvasClick` must never place an asset from an item/handle-origin gesture, including a simple selection click, or from completed navigation. A normal blank-canvas tap still places once in Furniture/Label. Clear this origin guard on the next independent pointerdown; a real gesture's synthesized placement click is consumed once. Do not suppress toolbar button actions.
- Keep the 3 CSS-pixel drag threshold. Capture may start on pointerdown; item geometry and history do not change before the threshold.

7. **Preserve:** Existing immutable origins, group offsets, selection, Shift selection, Alt duplication, locks, label editing, palette tap-to-place, native palette drag/drop, click-through guards and final geometry refs.
8. **Edges:** Release outside canvas/window; duplicate up/cancel/lost events; right click; middle click over item; pen; Shift selection with no capture; subthreshold movement; unmounted handle; touch pointers during an active mouse gesture; browser auto-release after pointerup.
9. **Tests:** Add `pointer-stable-capture`, `pointer-lostcapture-once`, `pointer-final-up-before-raf`, `pointer-unrelated-id`, `pointer-middle-over-item`, `pointer-click-origin-no-spawn`. Migrate existing mouse-based manipulation tests to pointerDown/Move/Up with explicit pointerId, pointerType and release coordinates. Keep a single explicit test that compatibility mouse events cannot start/move a gesture. Test helper capture registry must track IDs per element, implement has/release, and emit lostpointercapture for the owned ID on release. Test canceled callbacks must actually be removed.
10. **Acceptance:** Only Pointer Events own manipulation/navigation; capture always belongs to the canvas; zero production synthetic-zero test accommodations; lost capture finalizes once; all preserved manipulation tests pass through pointer events.
11. **Verification:** Run editor suite; search production editor for residual manipulation mouse/touch handlers and lostpointercapture binding; perform browser drag across chrome and canvas edges, release, and confirm later moves do nothing. Retain unrelated mouse handlers that only stop chrome bubbling if still useful; they must not manipulate geometry.

## Correction C3 — Pinch scale and midpoint translation

1. **Original task:** Task 5 touch policy, Task 3 coordinate frame consistency, Task 8 two-touch acceptance.
2. **Files:** `src/components/events/EventFloorEditor.tsx`; its existing test file and input helper.
3. **Symbols:** Replace `handleTouchStart/Move/End`, extend `pinchRef`, integrate `beginPointerGesture`/pointer window handlers; reuse `clientToEventWorld`, `viewportCurrentRef`, `setImmediateViewport`, `clampEventPan`, `getEventMinZoom`.
4. **Root cause:** Pinch records only distance/zoom. Each move calls handleZoomAt using the latest midpoint; there is no fixed world point corresponding to the initial midpoint.
5. **Incorrect behavior:** Two fingers translated equally at constant separation do not translate the map. Ownership handoff's current test asserts only that an item stays still; it does not assert navigation occurred.
6. **Exact change:** Admit up to two touch IDs from canvas/item pointerdown. A touch on editable item starts its transform; a blank touch starts a potential pan, still allowing a subthreshold placement tap. On the second admitted touch, copy both positions, finish the existing item preview once using pinch-transfer, cancel viewport animation, capture both IDs on the canvas, and initialize:

```ts
type PinchGesture = {
  ids: [number, number];
  frame: GestureFrame;
  startDistance: number;
  startZoom: number;
  worldAnchor: ScreenPoint;
};
// m0 = initial midpoint in client CSS pixels; frame uses current canvas rect
// and displayed transform after animation cancellation.
const worldAnchor = clientToEventWorld(m0, frame);
const nextZoom = Math.min(EVENT_MAX_ZOOM,
  Math.max(getEventMinZoom(), startZoom * distance / startDistance));
const nextPan = {
  x: midpoint.x - frame.left - worldAnchor.x * nextZoom,
  y: midpoint.y - frame.top - worldAnchor.y * nextZoom,
};
setImmediateViewport({ zoom: nextZoom, pan: clampEventPan(nextPan, nextZoom) });
```

Update the matching touch position before computing the pair. Preserve the original pinch anchor through the gesture; do not recompute it on each move. If initial separation is <1 CSS pixel, wait until it reaches 1px and initialize there without moving the map. Ignore a third finger entirely. Two active pointers may be non-primary; do not reject the second using isPrimary.

When either pinch pointer lifts/cancels/loses capture, end pinch and release both captures. For predictable ownership, require a fresh down before the remaining finger starts another action; moves from that still-held finger cannot resume item dragging or place furniture. On blur/hidden/resize clear both IDs. Never route viewport pinch through item-preview history. Use the snapshot formula directly, not handleZoomAt's wheel target-based path.

7. **Preserve:** One-finger item manipulation, blank pan/tap placement, existing zoom limits/pan bounds, immutable item origins, published map immutability, instant direct touch movement.
8. **Edges:** Constant-distance translation; combined translation+scale; nonzero canvas origin; zoom clamps; very small separation; second finger during queued drag; third pointer; lift order; pointercancel; translated/zoomed initial viewport.
9. **Tests:** `pinch-midpoint-translation`, `pinch-anchor-scale-translation`, `pinch-transfer-final-preview-once`, `pinch-end-no-item-resume`, `pinch-third-pointer-ignored`. With no clamp contact and zoom=1, translating both fingers by (40,25) must change pan by exactly (40,25) with unchanged zoom. Doubling separation while translating midpoint (40,25) must leave the original worldAnchor rendered at the new midpoint. Transfer test must move an item first, queue another move, introduce second pointer, assert final item position/history once, then assert map motion without further item changes.
10. **Acceptance:** The original world anchor follows the midpoint within 2 CSS pixels while inside bounds. Equal finger translation pans at 1:1 CSS distance. No duplicated item update on transfer or release.
11. **Verification:** Pointer component tests with real pointer IDs and mocked canvas rect; supported touch browser/device input for translation, pinch, and transfer. Synthetic component tests alone do not close the live-touch gate.

## Correction C6 — Escape and cancellation cleanup

1. **Original task:** Task 5 cancellation semantics; Task 6 temporary tool feedback.
2. **Files:** `src/components/events/EventFloorEditor.tsx`; `src/components/events/__tests__/EventFloorEditor.test.tsx`.
3. **Symbols:** keyboard `onKey` Escape branch, shared `finishInteraction`, `activePointerIdRef`, capture/touch refs, `isPanning`, pending preview RAF.
4. **Root cause:** Escape clears geometry snapshots but omits capture, active pointer ID and isPanning. Separate cancellation paths do not share an idempotent owner teardown.
5. **Incorrect behavior:** Gesture cancellation can leave capture/active state behind or keep the grabbing presentation even though panRef is null.
6. **Exact change:** Replace the branch's interaction teardown with finishInteraction('escape'), then retain existing menu/inspector/selection dismissal behavior. Shared cleanup restores start geometry before discarding snapshots, cancels RAF, clears all IDs and navigation refs, releases captures after ownership is cleared, sets isPanning false, and adds no history. A stale pointerup after Escape has no owner to finish. For canceled pan/pinch, keep the last displayed viewport but stop movement; do not restore item geometry for a navigation-only gesture. Persistent activeTool remains unchanged. If Space is still physically held, Pan remains armed (grab), never stuck grabbing; keyup restores persistent tool.
7. **Preserve:** Shared useSpacePan input exclusions/key release behavior, Escape geometry rollback, keyboard shortcuts when idle, Alt duplication's separate action, existing selection dismissal.
8. **Edges:** Escape before 3px; pending RAF; Escape during resize/rotate/pinch/pan; repeated Escape; ensuing lost capture; keyup after Escape; Escape in text editing stays governed by existing input exclusions.
9. **Tests:** `escape-drag-restores-no-history`, `escape-pan-clears-grabbing`, `escape-release-idempotent`, `escape-pending-raf-no-late-write`. Test pointerdown/move/Escape/late RAF/up; assert original geometry, no extra undo step, canvas capture released, and next independent pointer works. Inspect refs indirectly through capture spies and ability to start another gesture rather than exposing internals in production.
10. **Acceptance:** No late writes, active capture or grabbing state after Escape; no duplicate commit after cancellation; a new gesture works immediately.
11. **Verification:** Editor tests plus browser Escape during drag and Space pan. Follow with a fresh drag to detect stale activePointerId, not just a CSS assertion.

## Correction C4 — Finish a gesture before viewport resize

1. **Original task:** Task 3 explicit resize/orientation policy; Task 5 finalization.
2. **Files:** `src/components/events/EventFloorEditor.tsx`; its test file.
3. **Symbols:** resize effect `onResize`, `fitViewportToContent`, `gestureFrameRef`, `finishInteraction`, viewport animation cancellation.
4. **Root cause:** Current handler only clears panRef and refits. Active item snapshots/owner retain old frame while viewport moves.
5. **Incorrect behavior:** Next move combines old coordinate conversion with a new rendered viewport and the asset jumps.
6. **Exact change:** In onResize, synchronously call finishInteraction('resize') first, which discards unrendered samples and commits the last displayed geometry once. Cancel viewport animation, then call the existing fitViewportToContent using the new canvas rect. Orientation/layout size notifications use the same handler. If using ResizeObserver for actual canvas size changes, compare width/height to the prior size and ignore identical values; install once, disconnect on unmount, and never react to item bounds or warning text. Avoid a resize/refit feedback loop. Window resize covers orientation in most browsers; explicit orientationchange may use the same handler if needed.

```ts
const onViewportResize = () => {
  finishInteractionRef.current("resize");
  cancelViewportMotion();
  fitViewportToContent();
};
```

Here `finishInteractionRef` is the stable latest-callback ref established with C5; do not create a second cleanup policy. A zero-size/detached canvas still releases ownership; preserve fitViewportToContent's false return until size is valid.

7. **Preserve:** Existing fit algorithm, min/max zoom, content bounds, warning row geometry, published background.
8. **Edges:** Resize during drag/rotate/resize/pan/pinch; pending preview; consecutive resize events; mobile orientation; zero-size canvas; trailing pointerup; unchanged ResizeObserver notification.
9. **Tests:** `resize-finishes-before-refit`, `resize-discards-pending-old-frame`, `resize-late-pointer-ignored`. Mock old/new canvas rect and visible transforms; perform accepted preview, queue a second sample, resize, then send old pointermove/up and RAF. Assert last displayed item geometry stays fixed, capture released, one undo step, and next gesture uses new frame. Repeat for rotation/resize and navigation state.
10. **Acceptance:** No gesture continues with a stale frame; finalization precedes viewport mutation; no duplicate history or late preview after resize.
11. **Verification:** Component ordering assertions and browser resize/orientation during a held drag using supported tooling/manual input. Record viewport and item geometry before resize, after refit, after stale input.

## Correction C7 — Pan cursor, floating controls and status

1. **Original task:** Task 6 presentation; Task 5 floating toolbar behavior.
2. **Files:** `src/components/events/EventFloorEditor.tsx`; its existing tests.
3. **Symbols:** `effectiveTool`, canvas cursor, event furniture/label className, resize/rotation handles, three floating selection action sections, floating role=status pill, Bottom Status Bar.
4. **Root cause:** Only toolbar active state follows effectiveTool; item cursor classes override parent, toolbar visibility checks only transforming, and the old floating message remains.
5. **Incorrect behavior:** Pan can show a move/resize cursor over assets, floating actions cover the scene while navigating, and Space shows a redundant floating overlay.
6. **Exact change:** Keep effectiveTool derivation. Set armed pan to grab and active movement to grabbing. Maintain an explicit `panMoved` flag if isPanning currently starts on down: set it only after 3px movement, reset in unified cleanup. Pinch counts as active navigation. Apply an inline cursor override on event item/label wrappers and transform handles when effectiveTool is pan: grabbing during movement, grab otherwise. Otherwise retain normal move/lock/resize cursors. Pan-armed transform handles must route accepted input to pan rather than consume it as resize/rotate.

Add `const [pinchActive, setPinchActive] = useState(false)` for presentation only; set it true when the pointer owner becomes pinch and false in shared cleanup. Pointer refs remain the synchronous source of gesture ownership. Use `!transforming && !isPanning && !pinchActive` for every floating selection action toolbar, including grouped and label toolbars. Keep selection outlines visible. Preserve existing toolbar clamping; do not relayout the canvas.

Remove the floating status pill. Add one stable inline `role="status" aria-live="polite" aria-atomic="true"` span to the existing bottom status area: `Pan · Space held` when Space arms Pan, `Panning` while navigation moves, `Pan` for explicitly armed Pan, empty otherwise. Gate Space copy on effectiveTool, so Space held during an item drag does not falsely announce a pan. Do not put coordinates, item counts or zoom in that live region. Use truncation/min-width rules so changing status doesn't wrap a new row and move the canvas on mobile.

7. **Preserve:** Existing toolbar aria-pressed/classes, persistent tool restoration, useSpacePan implementation/exclusions, selection styles, color theme, floating-toolbar placement after release.
8. **Edges:** Furniture + Space; explicit Pan + Space release; Space during existing drag; locked item; tiny resize handles; stationary pointerdown; mobile narrow status bar; screen reader announcements only on mode transition.
9. **Tests:** `pan-cursor-over-items`, `pan-hides-selection-actions`, `space-status-in-footer`, `space-furniture-restores`, `space-input-does-not-pan`. Verify computed cursor in browser, not only parent inline style. Assert one selected toolbar tool and unchanged item count after Space cycle. Check footer height before/after status change at 390px.
10. **Acceptance:** Displayed mode matches next gesture; pan cursor survives child hit targets; no floating action toolbar during navigation; no floating Space pill; footer does not change canvas dimensions.
11. **Verification:** Editor tests, browser hover over item/label/handle with Pan armed and moving, 390px footer measurements, keyboard Space in label input.

## Correction C8 — Deterministic equal-distance snap selection

1. **Original task:** Task 4 tie-breaking; Task 8 Snap-on acceptance.
2. **Files:** `src/lib/eventLayoutGeometry.ts`; `src/lib/__tests__/eventLayoutGeometry.test.ts`.
3. **Symbols:** `snapLayoutPosition`, its `choose`, candidate guide fields.
4. **Root cause:** reduce retains the first candidate at equal distance; candidate generation follows incoming furniture order.
5. **Incorrect behavior:** Reordering/z-ordering identical geometry can change the selected snap location/guide.
6. **Exact change:** Compare eligible candidates by this explicit total order: smallest absolute distance; explicit sibling edge/center before grid; lexical item ID among explicit candidates; edge before center within that item; numeric candidate position; numeric guide value. Use deterministic code-point comparison (`a < b ? -1 : a > b ? 1 : 0`), not locale-dependent ordering. Do not mutate the incoming items array. Keep candidate generation and threshold logic unchanged. Distance must win first: a closer grid target must beat a farther sibling.

```ts
// Local comparator inside choose; a/b retain current candidate shape.
const distanceDelta = Math.abs(a.position - requested) - Math.abs(b.position - requested);
if (distanceDelta !== 0) return distanceDelta;
const gridDelta = Number(a.guide.kind === "grid") - Number(b.guide.kind === "grid");
if (gridDelta !== 0) return gridDelta;
const aid = a.guide.itemId ?? "";
const bid = b.guide.itemId ?? "";
if (aid !== bid) return aid < bid ? -1 : 1;
const rank = { edge: 0, center: 1, grid: 2 };
return rank[a.guide.kind] - rank[b.guide.kind]
  || a.position - b.position || a.guide.value - b.guide.value;
```

7. **Preserve:** True Snap Off, 6 CSS-pixel converted threshold, unsnapped group movement, existing bounds handling and post-clamp guide filtering. No rotation/bounds redesign.
8. **Edges:** Reversed array order; same-coordinate edges from different IDs; edge/center tie; grid/sibling tie; closer grid; X and Y independent; no eligible candidate; missing itemId on grid.
9. **Tests:** `snap-tie-array-order`, `snap-tie-explicit-before-grid`, `snap-distance-before-priority`. Build anchor width/height 10, requested x=100, two sibling left edges at x=98 and x=102, IDs `a` and `b`, grid disabled, threshold 6. Choose `a`/98 for both input orders. Repeat same-coordinate IDs and Y axis; ensure other candidate edges/centers are farther so the intended tie is actually tested. For grid tie, grid=10, requested x=99, sibling edge 98 and grid 100 both distance 1: explicit wins. Test a closer grid separately.
10. **Acceptance:** Equivalent geometry produces identical coordinates and guide item IDs regardless of array/z-order; nearest candidate still wins; all existing snap/bounds tests pass.
11. **Verification:** Pure geometry suite, reverse fixture item order without changing geometry, compare serialized result. Browser Snap-on endpoint attraction stays within 6 CSS px inside bounds.

## Verification correction V1 — Final-position save and pending-preview location switch

**Original tasks:** Tasks 7 and 8. **Dependencies:** C5 shared completion; C6/C4 cleanup policies.

**Exact files/functions:** EventFloorEditor `handleSave`, `handleSubmit`, pending-preview scheduling/flush, draft persistence effect and cleanup; StudentEventEditPage `handleDraftChange`, location switch callback currently passed as `onChange={setActiveLocationId}`; existing editor test file; new `src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx`; existing eventDraftPersistence tests.

**Root cause/coverage gap:** Existing tests don't prove that a queued sample reaches save or another location before unmount. Passive parent publication and local recovery are distinct: restoring localStorage later does not prove the parent has correct geometry when saving all locations from B.

**Required boundary:** `handleSave` and `handleSubmit` call finishInteraction('save'), then capture its returned arrays BEFORE awaiting existing callbacks. A later pointerup must not commit twice. Do not change service API or submission workflow. Preserve recovery data on callback rejection; verify through mocks.

For page switching, add optional `interactionCommitRef?: MutableRefObject<(() => EventEditorDraftSnapshot) | null>` to EventFloorEditor props, exported snapshot type as defined above. Register a current callback that returns finishInteraction('switch'); clear it on unmount. Existing consumers need not pass it. Do not rely on a stale render closure.

In StudentEventEditPage create the ref and replace direct onChange with a handler that:

1. Captures the OUTGOING activeLocation.id before state changes.
2. Calls the editor ref synchronously to obtain final arrays.
3. Uses functional setDraftLocations(previous => replaceEventOverlayLocation(previous ?? persistedLocations, outgoingId, finalFurniture, finalLabels)).
4. Calls setActiveLocationId(nextId) after scheduling the outgoing update. Same-location request is a no-op.

Do not publish that snapshot into the incoming location. Identity-guard deferred editor publication to avoid a duplicate parent update after an explicit flush. Existing keyed unmount cleanup still flushes recovery to the outgoing event/location key. Cleanup order must flush refs before canceling/discarding pending work; an unmount-only fallback writes final refs without scheduling state on the unmounted component. Preserve blocked/full localStorage behavior.

**Tests and exact assertions:**

- `save-final-pending-position`: Snap Off, down at (36,36), initial item (24,24), accepted move then queued move to (96,86), no RAF yet, invoke Save through the component button. At zoom 1/no clamp, callback must receive (84,74). Advance all old RAFs/up; no later geometry or second history commit. Resolve promise and confirm existing saving UI finishes.
- `switch-pending-preview-keeps-outgoing-location`: Mock only auth/published campus/services/toast as needed; mount the real page with two locations A/B and real EventFloorEditor. Move A with pending RAF, switch to B, assert B unchanged, then switch back and assert A's final coordinates. Switch again and Save B through the mocked service; assert request includes corrected A as well as B. No actual network call.
- `switch-storage-unavailable`: Repeat with storage writes throwing; in-memory page state must still retain A. Catch/restore the storage mock locally.
- `unmount-final-recovery`: Unmount with pending preview; read using existing readEventLayoutDraft and assert outgoing key/final coordinates. Another event/location key stays unchanged.
- `save-rejection-keeps-recovery`: Reject mocked onSave, assert busy resets and recovery geometry is not cleared; handle expected rejection according to the existing UI error contract without changing backend services.

**Acceptance:** Final sample reaches save and correct outgoing location exactly once; recovery and parent state agree; no cross-location writes, lost sample, late RAF mutation, or extra undo entry. A normal non-gesture inspector edit still publishes immediately.

**Procedure:** Run new page integration test, editor persistence tests and existing eventDraftPersistence/EventLocationSwitcher suites. Report mock payload coordinates and location IDs; browser disposable fixture repeats switch-return only, never real Save/Submit.

## Verification correction V2 — Performance and continuous tracking

**Original tasks:** Task 7 profile; Task 8 tracking and real browser gates. **No renderer redesign.**

Use a disposable local fixture mounting the real editor. Reuse a representative published FloorPlan fixture with rooms/walls/doors/stairs and create 100 event assets arranged with gaps, including a 30-degree rotated booth and a label/group tracking scenario. Count only event assets toward 100. Make the canvas large enough for a five-second inside-bounds path. Set Snap Off through UI. Use a fixture-only overlay ID and mocked save/submit handlers; do not add an application debug route. The fixture main.tsx imports the real editor and `../../../src/styles/index.css`, and index.html loads `./main.tsx`. Serve the fixture using the existing Vite development server at `/tests/browser-fixtures/event-editor/index.html` on a dedicated local test origin. If building it for profiling, use a separate test-only Vite config and separate temporary output directory, preserving the production entry/config; record the exact build/serve command in the verification report. Add no public route or runtime test switch.

Collect two separate types of evidence:

1. Component instrumentation: spy validateEventLayout and onDraftChange in the 100-asset test. Record baseline after mount; send many pointer samples/RAFs during one gesture. Expect no validation or publication growth during previews and exactly one final publication/validation update after changed geometry commits. React StrictMode initial work is excluded from counts. Mock expensive spies only for counts, not in the performance run.
2. Real browser profile: warm up renderer, record 5 seconds of continuous input at normal device rate. Record RAF timestamps, actual input samples, item/canvas transform, and long tasks when supported. Use browser profiler or fixture-local instrumentation outside production. Do not inject test hooks into EventFloorEditor. Record OS/browser/device, viewport, build mode, asset count, representative floor size, CPU throttling setting, display refresh rate if known, and foreground/background state. Prefer production bundle for the timing run; identify dev-mode overhead if unavoidable.

Calculate intervals and nearest-rank p95 explicitly:

```ts
const intervals = rafTimes.slice(1).map((t, i) => t - rafTimes[i]);
const sorted = [...intervals].sort((a, b) => a - b);
const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
```

Report sample count, median/p95/max and number/duration of >100ms tasks. Investigate attributable editor stacks for stalls; do not label every browser/OS pause an editor defect. Target p95 <=25ms and zero editor-attributable >100ms main-thread stalls on the recorded device. If not met, profile the active gesture path and make only changes needed within this plan (listener stability, publication/validation deferral, preview frame scheduling); do not undertake a renderer rewrite.

**Continuous pointer tracking procedure:** At zoom 0.7,1,1.45,3 with nonzero canvas origin/pan, record item start world position and original pointer client position. After each rendered preview frame, pair its input with the latest sample consumed for that frame. Expected screen translation is the input delta from the grab point. Compute rendered grab point as canvas origin + pan + zoom * (current item origin + initial grabbed offset). For a rotated item being translated, calculate that initial offset from its rendered rotated geometry; do not use the rotated bounding-box center as the grab point. Rotation stays fixed during this translation test.

Require Euclidean screen error <=2 CSS pixels at EVERY measured preview frame after the 3px drag threshold, excluding explicit bounds/snap contact; also verify release endpoint and a later idle RAF. Report maximum/p95 tracking error and number of frames. Distinguish input-to-render latency from coordinate error; do not compare a newly arrived unrendered input to the previous frame and misreport scheduling as geometry error. Test path includes horizontal, vertical, diagonal, reversal, and crossings over floating chrome/outside canvas within authored bounds. A single endpoint delta is insufficient.

**Tests:** Add `hundred-assets-publish-once` in existing editor suite; browser measurement artifacts `performance-100-assets.json` and `tracking-by-zoom.json` if export supported. Do not invent passing numbers. If frame scheduling produces more than one preview per frame, correct the existing pendingPreviewRef/previewFrameRef scheduling to consume the latest sample once per frame and synchronously flush on release/save/switch; no item easing.

## Verification correction V3 — Warning transitions and acceptance matrix

**Original tasks:** Task 2 browser gate, Task 8 complete matrix. No changes to working warning design/validation algorithms.

In the disposable browser fixture use all items 20x20, floor 1000x800, zero rotation. Use THREE independent pairs more than 100 units apart, with stationary bases at (100,100), (400,100), (700,100). Initial movable partners are at corresponding (100,200), (400,200), (700,200). This starts with zero warnings. Drag first partner onto its base => one overlap. Drag the other two partners onto their bases => three overlaps (an intermediate count of two is expected). Restore each partner to initial coordinates => zero. Establish the actual 0/1/3/0 fixture counts with validateEventLayout in a test before browser measurement so no bounds/aisle extras contaminate the sequence. Never bypass the real validator with fake production warning props. Fixture switching/remounting is allowed only outside a gesture; the measurements themselves must use real item drags.

For EACH continuous drag, sample canvas rect and visible issue-row rect every rendered frame, on release and after settled validation. The committed warning count is intentionally frozen DURING a gesture; expect 0->1->3->0 across the completed gesture sequence, not live per-move warning updates. Opening/closing the issues disclosure at each committed count must keep canvas top/height within 1 CSS pixel. This reconciles the original transition matrix with its already-approved deferred-validation policy. Do not re-enable validation during dragging just to force warning transitions.

Repeat measurement at all specified desktop/mobile dimensions. Record document/body scroll widths, viewport width, canvas rect, warning row 36px, disclosure rect and scroll position. Verify accessible disclosure and palette reachability visually. Take before/after screenshots when supported and record their actual artifact paths.

## LUNA MAX EXECUTION ORDER

### Step 1: Establish scoped baseline and faithful test inputs

- [x] Exact files: original plan, existing verification report, scoped git diffs, inline PointerEvent/capture helpers in `EventFloorEditor.test.tsx`.
- [x] Exact change: deterministic cancellable RAF and PointerEvent/capture test helpers with explicit coordinates and IDs were used; baseline and final diagnostics were recorded.
- [x] Exact test: current focused suite; capture tests show canvas release emits one lostpointercapture and canceled RAF work does not apply.

### Step 2: Synchronize immediate viewport target (C2)

- [x] Exact file: `src/components/events/useEventViewportMotion.ts`.
- [x] Exact change: reduced-motion/zero-duration commands use `setImmediateTransform(target)`.
- [x] Exact test: reduced-motion, zero-duration, and relative-accumulation hook tests pass.

### Step 3: Stop resetting the wheel clock (C1)

- [x] Exact file: same hook.
- [x] Exact change: `lastFrameAt` preserves one RAF clock, retargets from the rendered transform, settles exactly, and keeps the cancellation guard.
- [x] Exact test: continuous 8ms wheel progress, reversal, cancellation, and the full hook suite pass.

### Step 4: One owner and stable canvas capture (C5 foundation)

- [x] Exact file: `src/components/events/EventFloorEditor.tsx`.
- [x] Exact change: shared finalization, stable pointer listeners, canvas capture, lostcapture handling, origin-aware click guard, real pointerup samples, and mixed-input ownership are implemented.
- [x] Exact test: stable capture, lostcapture, final pointerup, unrelated pointer, middle-button, click-origin, cancellation, and migrated manipulation tests pass.

### Step 5: Replace separate touch stream with anchored pinch (C3/C5)

- [x] Exact file: EventFloorEditor.
- [x] Exact change: Pointer Events track two touch IDs, commit before transfer, retain frame/distance/zoom/worldAnchor, apply midpoint translation, recapture both IDs, and prevent stale item resume.
- [x] Exact test: pinch translation, anchored scale/translation, transfer, release, third-pointer, and full editor tests pass. Live touch remains an open browser gate.

### Step 6: Route Escape and resize through owner teardown (C6/C4)

- [x] Exact file: EventFloorEditor.
- [x] Exact change: Escape rolls back and releases owner state; cancel/blur/hidden/lostcapture discard unrendered samples; resize finalizes before refit; late events are ignored.
- [x] Exact test: Escape, cancellation, resize, zero-size, repeated-cleanup, and late-event tests pass.

### Step 7: Close save/switch boundaries (V1)

- [x] Exact files: EventFloorEditor, StudentEventEditPage, existing editor tests, and `src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx`.
- [x] Exact change: save/switch/unmount boundaries finalize pending previews, update outgoing locations, and preserve recovery on storage failure or rejected save.
- [x] Exact test: final-position save, pending switch, storage-unavailable switch, unmount recovery, rejected save, draft persistence, and location-switcher suites pass.

### Step 8: Complete Pan presentation (C7)

- [x] Exact file: EventFloorEditor.
- [x] Exact change: child cursor overrides, movement-only grabbing, navigation toolbar hiding, fixed-height footer status, and floating-hint removal are implemented; narrow action panels are clamped.
- [x] Exact test: pan cursor/status and toolbar tests pass; browser matrix measured cursor/footer and row geometry on the disposable fixture.

### Step 9: Stable snapping ties (C8)

- [x] Exact file: `src/lib/eventLayoutGeometry.ts`.
- [x] Exact change: `choose` applies stable distance, kind, item-ID, edge, position, and guide-value ordering without mutating candidates.
- [x] Exact test: equal-distance order-independent, stable-ID, grid-vs-sibling, Snap Off, bounds, and full geometry tests pass.

### Step 10: Verify performance and actual drag tracking (V2)

- [x] Exact files: editor tests, `tests/browser-fixtures/event-editor/index.html`, `tests/browser-fixtures/event-editor/main.tsx`, and verification artifacts.
- [x] Exact change: fixture/test instrumentation is isolated from production; 100 assets use the real editor and published floor renderer, with no production route.
- [ ] Exact test: the 100-asset publication test passes, but the five-second profile and four real-browser every-frame tracking measurements remain OPEN.

### Step 11: Complete browser acceptance (V3)

- [x] Exact files: browser fixture and verification report/artifacts only.
- [x] Exact change: deterministic warning-count fixtures and desktop/mobile viewport/layout evidence were gathered where the browser capability allowed it.
- [ ] Exact test: the full matrix remains OPEN for real touch, reduced motion, five-second profiling, per-frame tracking, and long-task attribution.

### Step 12: Final verification and truthful handoff

- [x] Run these commands from the repository root (use required environment approvals normally):

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/EventLayoutIssues.test.tsx src/components/events/__tests__/useEventViewportMotion.test.tsx src/components/events/__tests__/EventLocationSwitcher.test.tsx src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx src/lib/__tests__/eventGestureCoordinates.test.ts src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts src/lib/__tests__/eventLocationData.test.ts src/lib/__tests__/eventDraftPersistence.test.ts --reporter=dot --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
git diff --check
```

- [x] Record exit codes, exact counts and retained baseline TypeScript errors separately. Include StudentEventEditPage and new test/helper files in changed-file diagnostic review.
- [x] Re-read the scoped diff and compare C1–C8 and V1–V3; no production debug route or instrumentation was added.
- [x] Update the dated verification report and reference it from the historical report without overwriting old measurements.
- [x] Mark only the steps with available evidence; leave browser performance/touch gates open and distinguish them in the handoff.

## DO NOT TOUCH

- Fixed h-9 Layout checks row, absolute nonmodal details, Show items selection and spacing-hint copy. Measure them; do not redesign them.
- Working clientToEventWorld/eventWorldToClient math and immutable origin geometry for drag/resize/rotate.
- Snap Off bypass, 6 CSS-pixel threshold conversion, group offsets, invalid-origin bounds recovery and truthful post-clamp guide filtering. Only tie selection changes.
- Rotated SAT overlap/boundary/blocked-area validation and duplicate-spacing suppression.
- Canonical ReadonlyFloorPlanScene/ReadonlyOutdoorCampusScene visual parity and their memoized rendering.
- Published floor-resolution memo in StudentEventEditPage; building/map listing, home, navbar and other student pages.
- Shared useSpacePan hook. Preserve input/contenteditable exclusions and normal keyup/blur behavior.
- Furniture catalog, templates, palette drag/drop, labels, grouping, locking, duplication semantics and ordinary keyboard editing.
- Draft storage keys/schema/version and backend service contracts. Add explicit flush ordering at editor/page boundaries only.
- Authentication, database/RLS, event approval semantics, save/submit workflow design, admin editor, routing, dependencies, unrelated repository TypeScript errors.
- User's saved events and existing recovery drafts; no browser mutation testing against them.

## POST-FIX VERIFICATION MATRIX

| Remaining requirement | Exact automated evidence | Exact browser/manual evidence | Pass criterion |
| --- | --- | --- | --- |
| Continuous 8ms wheel input | Hook `wheel-progress-8ms`, reversal and cancel tests | Five-second wheel stream with transform sampled every RAF | Progress during stream; one RAF loop; exact settle within duration + one frame |
| Reduced-motion targetRef | Hook three C2 tests; editor repeated wheel/zoom | Reduced-motion browser repeated navigation | current/target/rendered transform agree; no animation; increments accumulate |
| Stable pointer ownership/capture | C5 six tests; migrated existing tests | Drag across controls/outside canvas and release | Canvas owns capture; no spawn/control action; no move after release |
| Lost capture | `pointer-lostcapture-once` | Supported capture-loss simulation or real element/window transition | One commit of displayed preview; all owner state released; next gesture works |
| Actual final pointerup coordinates | `pointer-final-up-before-raf`, including (0,0) | Fast drag/release followed by idle frame and Undo | Final sample saved; Undo returns start once; no late move |
| Escape | C6 four tests | Escape during drag/rotate/Space pan, then fresh drag | Start item geometry restored; no added history/capture/grabbing residue |
| Resize/orientation during gesture | C4 three tests | Change viewport/orientation while held | Displayed preview committed before refit; old pointer ignored |
| Two-finger translation/scale | C3 five tests | Real/supported touch pair: translate, scale+translate, handoff | Anchor tracks midpoint <=2px inside bounds; item commit once |
| Pan mode/cursor/status | C7 five tests | Hover item/label/handle; Space cycle; footer at 390px | One active tool; grab/grabbing accurate; no floating navigation actions/hint or footer reflow |
| Deterministic snapping | C8 three tests, existing geometry tests | Same geometry after item order change; Snap On then Off | Identical ties; attraction <=6px inside bounds; Off remains free |
| Final-position Save | `save-final-pending-position`, rejection test | Mock-only fixture save, if used | Callback gets newest coordinates; recovery retained on rejection |
| Switching during pending previews | New page test including storage unavailable | Fixture A->B->A | Final A retained and included in mocked all-location save; B unchanged |
| Unmount recovery | `unmount-final-recovery`, existing persistence tests | Reload disposable fixture only | Final preview restored under correct key; no cross-event write |
| 100-asset publication/validation | `hundred-assets-publish-once` | Profile with real floor and 100 assets | No per-preview validation/publication; one final update |
| 100-asset frame pacing | No jsdom FPS claim | Warm five-second profile and exported timing evidence | p95 <=25ms; no editor-attributable >100ms stalls on documented device |
| Continuous <=2px tracking | Coordinate/integration tests plus pointerup tests | Per-frame paths at 70%,100%,145%,300%, nonzero pan; rotated item/label/group | Every measured rendered-preview grab-point error <=2px inside bounds, including final position |
| 0->1->3->0 warnings | Validate six-item independent-pairs fixtures | Continuous drags/commits, open/close disclosure at each count | Canvas top/height change <=1px; warning row 36px; content frozen during gesture |
| Desktop 1440x900 and 1920x1080 | Component regressions | Full matrix at both actual viewport sizes | Controls reachable/not clipped; no horizontal document overflow |
| Mobile 390x844 and tablet 768x1024 | Touch ownership and UI tests | Actual sizes + touch/palette/disclosure checks | No horizontal overflow; controls reachable; pinch/drag work |
| Light/dark and reduced motion | Relevant component/hook tests | Both themes; reduced motion on/off | Readable controls; correct interaction and motion preference |
| Runtime/build/types | Focused command, full tsc, production build, diff check | Fresh-load console + complete input sequence | No new attributable diagnostics/runtime errors; baseline failures explicitly listed |

Completion requires every row's applicable evidence. A skipped live-touch/profile/viewport gate remains OPEN even when all unit tests and the build pass.
