# Event Editor Usability Implementation Plan

> Execute inline using executing-plans. The user explicitly requested these fixes and related frontend improvements; continue within that scope without repeating design approval. Preserve unrelated local files and do not mutate live events or database schema for verification.

**Goal:** Make event placement clear and persistent across views, show the complete published floor, and improve asset proportions and editor usability.

**Architecture:** EventFloorEditor remains the owner of committed layout/history and synchronously updates its capture refs. useEvent3DInteraction distinguishes hover preview from a direct click/tap placement. Shared readonly geometry remains authoritative; event viewport framing includes outside-canvas base details without translating authored event coordinates. A small catalog component and stable model-height helper isolate UI and presentation changes.

**Tech Stack:** Existing React/TypeScript, Three.js/fiber/drei, Radix Dialog, Vitest and local Playwright fixtures. No new dependency or migration.

## Constraints

- Preserve existing authored dimensions/rotations and base maps. Never bulk-resize saved drafts.
- One placement/gesture produces one history entry; rejected placement commits nothing.
- Save, capture, autosave, location switching and reopened drafts share committed event data.
- Admin/public scenes remain readonly; event scene does not offer inactive navigation actions.
- Keep map overlays inside the map viewport and maintain dark/light and mobile access.
- Run appropriate focused tests/build and independent review; existing unrelated whole-repo failures have already been documented separately.

## Task 1 — Placement and persistence

Files: useEvent3DInteraction.ts, EventFloorEditor.tsx, event3dEditing.ts, native-pointer tests and StudentEventEditPage.pendingDraft.test.tsx.

- [x] Write failing native click placement and real page 3D→2D→save/location/reopen tests with only the GPU surface mocked.
- [x] Add an optional direct placement callback, hover preview and mode-dependent cursor. Preserve drag cancellation and camera-final-sample behavior.
- [x] Commit placed furniture/labels to capture refs synchronously, validate against protected areas and publish one shared layout/history update.
- [x] Provide clear added/cancelled/invalid-position feedback. Verify actual page save payloads and multiple-location separation.

## Task 2 — Complete 2D floor

Files: eventViewport.ts/tests, EventFloorEditor.tsx, EventLayout3DPreview.tsx and shared readonly viewport helper if necessary.

- [x] Write literal bounds tests for negative/exterior geometry and rooms beyond the nominal canvas.
- [x] Remove framing clamps that crop readonly content; allow base SVG overflow without changing event coordinate conversion.
- [x] Supply exterior stair presentation metadata and use compatible complete-floor framing in both views.
- [x] Reproduce screenshot-style floor mismatch in a local fixture and verify room labels, stairs, doors and lifts remain visible at the same anchors.

## Task 3 — Catalog, controls and models

Files: new Event3DAssetPicker.tsx, Event3DEditorControls.tsx, EventLayout3DPreview.tsx, EventAsset3DLayer.tsx, event3dLayout.ts/tests and renderer entrance actions.

- [x] Write stable-height tests showing that widening tables/chairs/tents does not make them tower over the map; keep positions/footprints unchanged.
- [x] Add a searchable, grouped asset catalog using existing artwork and a bounded accessible dialog/popover. Keep keyboard selection and focus return.
- [x] Compact the toolbar/selection inspector and make placement instructions/mode visually distinct. Isolate/clamp HTML scene labels below editor chrome.
- [x] Refine model proportions/materials and hide nonfunctional entrance actions only in planning previews.

## Task 4 — Verify and deliver

- [x] Run relevant editor/page/geometry/readonly/route tests. Confirm RED/GREEN for material bug fixes.
- [x] Exercise actual WebGL placement, view switch, save/reopen, labels/history/locks, outside-canvas floor, indoor/outdoor, light/dark/mobile and fallback with isolated fixtures.
- [x] Inspect screenshots, run production build and type diagnostic comparison if changed types warrant it.
- [x] Request independent review per requesting-code-review, fix material issues and rerun affected checks.
- [x] Document results and remaining limits; integrate latest main safely and deliver tested changes within the existing authorization. Feature `6a19c10` pushed to GitHub main after a clean fast-forward; unrelated local files preserved.
