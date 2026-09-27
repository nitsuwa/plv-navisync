# Event Editor Drag Stability Verification

## Baseline before this implementation

The focused baseline command ran before the new changes:

```powershell
node node_modules\vitest\vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/useEventViewportMotion.test.tsx src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts --reporter=dot --maxWorkers=1
```

Result: 5 files passed, 64 tests passed.

The supplied screenshots and source inspection showed three layout notes wrapping above the canvas while a furniture item was being dragged. The warning strip was conditional, flex-wrapped, and directly in the column flow above the flex canvas. That made a canvas vertical reflow a confirmed source-level risk. The editor also passed `snapToGrid: snapEnabled` while the geometry helper always considered sibling alignment candidates, so Snap off did not disable all attraction.

## Implemented checks

- Layout issues use a permanently mounted `h-9` summary row and an absolutely positioned details panel. Details do not change the canvas flow height.
- Layout validation is committed outside active furniture/resize/rotate previews, so pairwise validation and parent draft publication do not run on every pointer sample.
- Snap off bypasses grid and sibling candidates.
- Gesture coordinate conversion has round-trip tests at 0.7x, 1x, 1.45x, and 3x zoom, with nonzero origin and pan.
- Viewport animation cancellation synchronizes its next target to the visible frame.
- Existing out-of-bounds items keep their starting position on the first drag frame and can be moved inward; oversized legacy items do not produce an inverted clamp.
- Rotated rectangle footprints use polygon separation checks for boundary, blocked-region, and overlap validation.
- Pointer gesture ownership gates compatibility mouse events and keeps a single active pointer path. Existing mouse tests remain supported as a compatibility path.
- Item previews apply the leading pointer sample immediately, coalesce additional samples to one animation frame, and flush the final sample before history/save.
- Recovery persistence marks previews dirty synchronously, and a second touch commits the first item gesture before transferring ownership to pinch navigation.
- Native asset dragging is disabled on placed items, right-click cannot begin a transform, and floating editor chrome is isolated from canvas placement.
- Space temporarily changes the effective toolbar tool to Pan, updates `aria-pressed`, and shows `Space held · Pan active`.

## Automated verification after implementation

Focused regression command:

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/EventLayoutIssues.test.tsx src/components/events/__tests__/useEventViewportMotion.test.tsx src/lib/__tests__/eventGestureCoordinates.test.ts src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts src/lib/__tests__/eventLocationData.test.ts --reporter=dot --maxWorkers=1
```

Result: **8 files passed, 84 tests passed**.

Production build:

```powershell
node node_modules/vite/bin/vite.js build
```

Result: **passed** (`✓ built in 34.48s`). Vite emitted only the existing large-chunk warning for the admin map-builder bundle.

TypeScript: the full repository `tsc --noEmit` still reports unrelated baseline errors in legacy map-builder-v2, map-builder, and service/database modules. A filtered rerun for `src/components/events` and `src/lib/event*` produced no diagnostics after the event-editor test fixture and event-location typing fixes.

`git diff --check`: **passed** for the implementation files.

## Browser verification

The local demo account was used in an isolated in-app browser tab at a 1280×720 viewport. No Save Draft or Submit to GSO action was used. A fresh browser tab was loaded against the final bundle for the last smoke check; it opened the editor without console warnings/errors.

Measured results:

| Scenario | Result |
| --- | --- |
| 0 issues → 1 issue | Canvas `top=205.400px`, `height=535.600px` before and after the drag; warning row remained `height=36px`. |
| Details disclosure open | Canvas remained `top=205.400px`, `height=535.600px`; details rendered below the fixed row without flow re-layout. |
| Show items | Both furniture IDs referenced by the overlap warning were selected; canvas rect stayed unchanged. |
| Snap off at 70% | A 25×20 CSS-pixel pointer drag moved the asset `25.00×20.00px`. |
| Snap off at 101% | A 25×20 CSS-pixel pointer drag moved the asset `25.00×20.00px`. |
| Snap off at 145% | An 18×16 CSS-pixel pointer drag moved the asset `17.99×15.99px`. |
| Snap off at 301% | A 20×20 CSS-pixel pointer drag moved the asset `19.99×20.00px`. |
| Zoom interrupted by drag | Before: `translate(-1197.27px, -1337.87px) scale(3.01179)`; after the drag: `translate(-913.259px, -1070.26px) scale(2.50983)`, unchanged after 320ms. |
| Explicit Pan | Toolbar `aria-pressed=true`, canvas cursor `grab`, and a blank-canvas drag changed pan by the pointer delta. |
| Document overflow | `document.scrollWidth=1270`, `body.scrollWidth=1270`, `innerWidth=1280`. |
| Console | No `warn` or `error` entries after reload and the interaction sequence. |

The current CUA browser adapter did not expose a viewport override, so live 390×844 and 768×1024 browser runs, two-finger pinch, and a 3-warning fixture are **pending**. The implementation has no horizontal-flow warning layout, and existing unit/mobile component coverage remains in place, but those exact live measurements were not fabricated.

Correction follow-up: [2026-09-22-event-editor-final-corrections.md](C:/Users/Rj/Documents/GitHub/plv-navisync/docs/superpowers/verification/2026-09-22-event-editor-final-corrections.md).
