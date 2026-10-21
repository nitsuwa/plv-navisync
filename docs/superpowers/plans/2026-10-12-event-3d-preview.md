# Event 3D Preview Implementation Plan

> **For agentic workers:** Execute inline using executing-plans. User approval to implement is already recorded; no extra approval checkpoint is required for the described local changes.

**Goal:** Give event organizers and reviewers an accurate live 3D view of their plotted layout.

**Architecture:** Add a shared event model layer and camera request component to the existing indoor/outdoor renderers. A lazy preview wrapper connects the editor's current arrays and handles controls/fallback. Preserve the 2D editor and existing save/publication boundaries.

**Tech Stack:** React, TypeScript, existing Three.js/react-three-fiber/drei, Vitest and browser verification.

## Global Constraints

- No database change or new dependency.
- Keep existing unrelated local files and work on the current feature checkout.
- Plot in 2D; preview without mutating layout in 3D.
- Do not push or deploy this new feature without a subsequent user request.

## Task 1: Shared geometry and models

- [x] Add failing tests for hand-derived indoor/outdoor positions, preserved large footprints, rotations, rotated focus bounds and ignored invalid/hidden objects.
- [x] Implement `eventAsset3DTransform`, `event3DLayoutBounds`, and `event3DCameraPose` in `src/lib/event3dLayout.ts`.
- [x] Add `EventAsset3DLayer.tsx` with models for the 14 existing event asset types, labels, shared transforms and original visibility.
- [x] Add `EventPreviewCamera.tsx` to apply fit/focus/zoom requests after renderer defaults, using the existing orbit controls.
- [x] Run geometry tests before moving on.

## Task 2: Renderer and editor integration

- [x] Add failing editor tests for the 3D switch, retention of unsaved edits and read-only pin-placement gating.
- [x] Add optional event layout/camera props to the existing renderers; replace the indoor landmark-only event filter with the shared event layer.
- [x] Add lazy `EventLayout3DPreview.tsx` with camera controls, a clear preview notice and device/error fallback.
- [x] Connect live arrays in EventFloorEditor; finish current interactions on switch, preserve mounted 2D workspace, hide editing tools/shortcuts in preview, and return to 2D for feedback placement.
- [x] Pass selected, visible approved outdoor event assets to the existing public renderer.
- [x] Run new tests plus existing event editor, admin preview and public map tests.

## Task 3: Verification and handoff

- [x] Use an isolated local browser fixture to verify indoor/outdoor models, switching, mobile layout and fallback without live database writes. Preserve the fixture and screenshots in the verification directory for reproducibility.
- [x] Run production build and inspect the final diff for scope and publication/data boundaries.
- [x] Record verification, limitations and manual user steps in `docs/verification/event-3d-preview/README.md`.
- [x] Prepare the local completion handoff with SQL requirements and the next optional phase.

## Result

170 focused tests and 10 browser checks pass. Production build passes. Pre-existing public-map test failures and broad repository type errors are documented with a baseline comparison; the feature adds no production type diagnostics. Camera review corrections cover tall event models and distant outdoor events. No live database write, commit, push or deployment was performed for this feature.
