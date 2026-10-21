# Event Editor Consistent Tools Implementation Plan

> Execute inline using executing-plans. The approved design and the user's direction authorize all steps; do not repeat approval questions. Use the existing checkout on codex/event-editor-consistent-tools and preserve unrelated local files.

**Goal:** Deliver consistent approximate asset sizing, clear placement and usable desktop/mobile editing in both views.

**Architecture:** Shared eventAssetSizing owns presets/resize policy and existing assetVariant presentation tags. EventFloorEditor owns committed refs/history, shared inspector and repeat mode. Event3DEditorControls becomes compact; EventLayout3DPreview owns scoped pointer/mode feedback and camera controls. Both view update paths enforce the same policy and validation.

**Tech Stack:** Existing React/TypeScript, fiber/drei/Three, Radix, Vitest and isolated Playwright. No dependency, schema or live data changes.

## Task 1 — Reference sizing and consistent geometry
- [x] Add failing policy, fixed-chair 3D rejection, reference reset and resize parity tests.
- [x] Add shared presets/context reference sizing; preserve existing dimensions and encode reference presentation in the existing assetVariant.
- [x] Enforce fixed/reference and resizable rules in scene gestures and numeric mutations. Implement aspect lock and undoable reset/preset actions.
- [x] Add 2D resize affordance for eligible single unlocked items, with handles positioned outside the artwork.

## Task 2 — Clear placement on every surface
- [x] Reproduce actual cursor/hit-target behavior through ground, assets and HTML labels, including touch.
- [x] Scope consistent cursors/interaction to the placement surface and add mode strip/pointer badge/ghost validity feedback in both views.
- [x] Share explicit Keep placing; make repeated placement use committed refs/history and retain one-item/one-undo behavior.
- [x] Preserve cancellation, camera navigation, multitouch suppression and keyboard placement.

## Task 3 — Shared responsive inspector and canvas space
- [x] Write shared inspector/desktop/mobile tests for presets, dimensions, details focus, Escape numeric cancellation and locks.
- [x] Reuse the inspector in both views; put numeric coordinates under Advanced and remove the large 3D field row.
- [x] Use existing mobile sheet/focus management and desktop rail; keep a useful map area at narrow sizes.
- [x] Verify compact controls, labels, issue popup anchoring, dark/light themes and reduced motion.

## Task 4 — Save and issue feedback
- [x] Add meaningful save-failure/retry and newer-edits-during-save checks where current behavior is incomplete.
- [x] Add clear local save status without replacing authoritative coordinator status; preserve drafts on failures and avoid stale Saved announcements.
- [x] Frame objects when a layout issue is selected in either view; retain read-only boundaries.

## Task 5 — Verify and deliver
- [x] Run affected editor/sizing/native/coordinator/public/geometry tests and inspect actual WebGL desktop/mobile screenshots.
- [x] Verify save/reopen, repeat/undo, fixed/custom/reset, cursor over real hit targets, touch/keyboard, group/lock and read-only fallback.
- [x] Run build and comparable type diagnostic check; get independent read-only review per requesting-code-review and resolve material findings.
- [x] Update the manual guide/results, integrate fresh main and deliver under the existing authorized Git workflow. Give the user a testing go signal and state any remaining physical-device limits.


Delivery: feature418a1ad fast-forwarded from f3bc9a3 to local main and pushed to origin/main on October13.340 focused tests,11 actual browser checks and production build pass; type diagnostics match1047 baseline. No PR, force push, SQL or live event writes. Manual guide is ready.
