# PLV NaviSync — Developer 2 Progress

This is the live checklist for Workstream B — Map Authoring and Navigation. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [ ] **B1 — Map Builder baseline audit and regression protection**
  - Status: `FOR REVIEW` — automated checks pass (171 tests / 17 files, clean build, clean diff); all manual retest checklist items (§9, §10.6, §11.5 of `DEVELOPER_2_B1_VERIFICATION.md`) confirmed by the reviewer on August 7, 2026 (§12). Becomes `DONE` only after its PR is merged.
  - Branch: `test/map-builder-baseline`
  - Depends on: None
  - Test result: 171 passed (17 files) — `pnpm test`; build passed — see `DEVELOPER_2_B1_VERIFICATION.md`
  - Pull Request: Pending (not yet opened)
- [ ] **B2 — Outdoor campus canvas and object authoring**
  - Status: `BLOCKED`
  - Branch: `feature/outdoor-campus-authoring`
  - Depends on: B1
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B3 — Building configuration and entrances**
  - Status: `BLOCKED`
  - Branch: `feature/building-entrance-authoring`
  - Depends on: B2 and A5 contract availability for final integration
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B4 — Floor-plan authoring**
  - Status: `BLOCKED`
  - Branch: `feature/floor-plan-authoring`
  - Depends on: B3
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B5 — Navigation graph authoring**
  - Status: `BLOCKED`
  - Branch: `feature/navigation-graph-authoring`
  - Depends on: B3 and B4
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B6 — Map Builder persistence integration**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-persistence`
  - Depends on: B2–B5 and Gate G1
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B7 — Complete validation and issues workflow**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-validation`
  - Depends on: B5 and B6
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B8 — Route testing and pathfinding verification**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-route-testing`
  - Depends on: B5, B7, and A5 published graph format
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B9 — Save, publish, tutorial, and editor state UX**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-publish-ux`
  - Depends on: A6, B6, and B7
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B10 — Authoring polish, accessibility, and performance**
  - Status: `BLOCKED`
  - Branch: `fix/map-builder-polish`
  - Depends on: B2–B9
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: B1 (manual verification passed → `FOR REVIEW`, not yet merged)
- Last completed package: None merged yet (B1 is the first package)
- Known blocker: None — B1 manual retest checklists in `DEVELOPER_2_B1_VERIFICATION.md` §9, §10.6 and §11.5 are all confirmed (August 7, 2026); waiting on the B1 Pull Request review/merge, after which B1 becomes `DONE`.
- Important changed files (round 1): `src/lib/campusValidation.ts` (new, extracted validation), `src/lib/pathfinding.ts` (fixed truncated `findPath` reconstruction), `src/lib/__tests__/{pathfinding,indoorPathfinding,mapDataAdapter,campusValidation}.test.ts` + `src/hooks/__tests__/useUndoRedo.test.tsx` (new), `src/lib/__tests__/campusHelpers.test.ts` (added `sanitizeCampus` cases), `package.json` (added `test` script)
- Important changed files (manual-failure repair): `src/lib/editorPlacement.ts` (new: `screenToWorld`, `computeBuildingPlacement`, `shouldDrawNavConnector`, `resetTransientToolState`), `src/components/map-builder/FloorEditor.tsx` (added missing `LandPlot` import — fixed the render crash), `src/components/map-builder/CampusEditor.tsx` (`handleSvgLeave` cancels placement on mouse-leave; `switchTool`/`switchLayer` cleanup; `Escape` clears drag/rubber-band; shared placement geometry), `src/components/map-builder/Canvas.tsx` (`onCanvasLeave` prop; preview uses shared geometry; nav connector gated on real nav data), `src/components/map-builder/useCanvasControls.ts` (`getPoint` delegates to tested `screenToWorld`), `src/lib/__tests__/editorPlacement.test.ts` + `src/components/map-builder/__tests__/FloorEditor.render.test.tsx` (new), `docs/progress/DEVELOPER_2_B1_VERIFICATION.md` (evidence incl. repair round + retest checklist)
- Important changed files (round-2 repair): `src/components/map-builder/useFloorHistory.ts` (rewritten: full floor-state snapshots, reactive `canUndo`/`canRedo`, per-floor reset), `src/components/map-builder/FloorEditor.tsx` (post-change history via `updFloor`; one post-gesture commit on pointer release; `applyEntry` shared by toolbar + Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z with input-focus guard; wall drag translates x1/y1/x2/y2 — was injecting NaN; toolbar disabled states), `src/services/campusStructureService.ts` (finite-number coercion for map_elements x/y/rotation — no NaN→null; walls anchor at x1/y1; descriptive errors naming kind+id; legacy wall normalization on hydrate), `src/components/map-builder/__tests__/useFloorHistory.test.ts` + `src/components/map-builder/__tests__/FloorEditor.undoRedo.test.tsx` (new), `src/services/__tests__/campusStructureService.test.ts` (null-x reproduction + contract compliance), `docs/progress/DEVELOPER_2_B1_VERIFICATION.md` (round-2 evidence §10)
- Important changed files (round-3 repair): `src/components/map-builder/FloorEditor.tsx` (decorative background wrapped in `<g data-bg="true">`; `isBg` now matches descendants via `closest('[data-bg="true"]')` so empty-floor clicks deselect; `data-testid` on wall selection glow + endpoint handles), `src/components/map-builder/__tests__/FloorEditor.selection.test.tsx` (new, 4 tests), `docs/progress/DEVELOPER_2_B1_VERIFICATION.md` (round-3 evidence §11 + B4 follow-up record)
- Next recommended action: Open/review the B1 Pull Request on `test/map-builder-baseline`; after merge (B1 → `DONE`), start B2 — Outdoor Campus Editor and asset visual improvements.
