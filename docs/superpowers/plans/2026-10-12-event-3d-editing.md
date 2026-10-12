# Direct Event Editing in 3D Implementation Plan

> **For agentic workers:** Execute inline using executing-plans. The user authorized the described direct editing and GitHub main integration; do not repeat permission questions or create a PR.

**Goal:** Place, select, move, rotate and resize event additions directly in 3D and publish the verified combined feature to GitHub main.

**Architecture:** EventFloorEditor owns committed event state/history. A dedicated scene interaction component previews each pointer transaction locally and submits one validated patch on release. The preview wrapper exposes accessible editing controls while reusing the existing indoor/outdoor scenes.

**Tech Stack:** Existing React, TypeScript, Three.js, react-three-fiber/drei, Vitest and local Playwright fixtures.

## Global constraints

- Work in the current checkout. Preserve unrelated untracked conversation/continuity files.
- Never mutate base-map furniture or live database schema/content for verification.
- No new runtime dependency. Existing event save, autosave, access and publication boundaries remain authoritative.
- Grouped furniture moves together; a locked member blocks the move. Rotation/resize require one ungrouped furniture item.
- Pointer release commits one history step; cancellation and stale gestures commit none. Save/submit/history are blocked during an active scene gesture.
- Fetch again before main integration and use a normal push. No force push or PR.

## Task 1 — Preserve and merge upstream

- [x] Fetch origin and inspect the incoming commit/file list.
- [x] Preserve the preview in commit `247d23b` and backup branch `backup/pre-event-3d-editing-20261012`.
- [x] Merge upstream `377763a`, retaining canteen furniture, route inspection focus and event model additions in the two renderer conflicts.
- [x] Verify 156 combined map/route/preview tests and commit the merge as `f242aa0`.

## Task 2 — Transactional geometry

Files: create `src/lib/event3dEditing.ts` and `src/lib/__tests__/event3dEditing.test.ts`.

Interfaces:

```ts
type Event3DManipulation = 'move' | 'rotate' | 'resize';
interface Event3DLayout { furniture: FloorFurniture[]; labels: FloorLabel[] }
event3DPointToLayout(point: {x:number;z:number}, frame: Event3DFrame): {x:number;y:number} | null;
event3DSelectionIds(layout: Event3DLayout, id: string): string[];
beginEvent3DGesture(layout: Event3DLayout, id: string, tool: Event3DManipulation, point: Event3DPoint, bounds: {width:number;height:number}, grid?: number): Event3DGesture | null;
previewEvent3DGesture(gesture: Event3DGesture, point: Event3DPoint): Event3DLayout;
mergeEvent3DChanges(current: Event3DLayout, start: Event3DLayout, next: Event3DLayout): Event3DLayout | null;
```

- [x] Write literal tests for inverse indoor/outdoor coordinates, invalid geometry, moved/snapped/clamped positions, atomic group locks, label movement, rotated resize, rotation normalization and stale commits.
- [x] Run the new test file and observe the missing feature fail.
- [x] Implement the pure helpers using existing move/resize/constrain functions. Preserve unaffected current items; only geometry fields may be copied from scene transactions.
- [x] Run the geometry tests and existing event layout/floor geometry tests.

## Task 3 — Editing scene and parent integration

Files: create `src/components/events/Event3DSceneLayout.tsx`, `Event3DEditorControls.tsx`, and `__tests__/EventFloorEditor.3dEditing.test.tsx`; modify existing EventAsset3DLayer, EventLayout3DPreview, EventFloorEditor and both map renderers.

- [x] Add integration tests that render the real EventFloorEditor while substituting only the unavailable GPU surface. Assert actual saved/2D geometry, placement assessment, undo/redo, active-gesture save gating and read-only callbacks.
- [x] Observe RED for absent 3D editing controls/transactions.
- [x] Add optional editing props to renderers and use Event3DSceneLayout for event additions. Public/admin consumers omit editing props.
- [x] Make event meshes/label anchors selectable and highlight selected additions. Add a map placement surface and explicit placement confirmation in the editor controls.
- [x] Raycast native pointer samples against the floor, disable orbit controls during a drag, preview locally, commit the final sample once, and cancel on Escape/cancel/blur/second pointer/unmount/context loss.
- [x] Provide move/rotate/resize modes and visible transform handles; add accessible selection, geometry/text controls, duplicate/delete/locks and 3D undo/redo.
- [x] Connect placements through existing placement assessment; merge validated scene changes into the latest event state and push one history step. Reject stale/locked/protected changes with visible feedback.
- [x] Update the previous preview tests/copy to distinguish editable 3D from read-only preview, preserving fallback and pin behavior.
- [ ] Run new and existing event editor/admin/map tests.

## Task 4 — Verification and GitHub delivery

- [x] Extend the isolated local fixture/browser runner to exercise real placement, drag, rotate, resize, labels, locks, cancellation, history and 2D/save synchronization in indoor/outdoor scenes and mobile.
- [x] Inspect screenshots and verify no live database requests/writes.
- [ ] Run broad relevant tests, full suite, production build, diff checks and a baseline type diagnostic comparison. Document existing unrelated failures precisely.
- [x] Dispatch independent code review per requesting-code-review; repair material findings and rerun affected checks.
- [x] Write a combined manual test guide, noting the separately imported optional campus snapshot cache migration.
- [ ] Stage/commit only the feature and related records, fetch origin again, integrate/reverify new changes if any, fast-forward local main, and push main normally.
- [ ] Confirm origin/main matches the intended local commit and deliver the complete test instructions.

## Next step

Implementation, 40 focused tests, 13 real browser editing checks and 10 preview regression checks have passed. Complete broad verification and Git integration; the user will manually test the whole feature using the combined guide after delivery.
