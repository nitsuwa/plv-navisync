# PLV NaviSync — Developer 2 Progress

This is the live checklist for Workstream B — Map Authoring and Navigation. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [x] **B1 — Map Builder baseline audit and regression protection**
  - Status: `DONE` — merged through Pull Request #5 (`test/map-builder-baseline` → `main`, merge commit `b19d974`).
  - Branch: `test/map-builder-baseline`
  - Depends on: None
  - Test result: 171 passed (17 files) — `pnpm test`; build passed — see `DEVELOPER_2_B1_VERIFICATION.md`
  - Pull Request: #5 (merged)
- [ ] **B2 — Outdoor campus canvas and object authoring**
  - Status: `FOR REVIEW` — Phases 1–4 complete on `feature/outdoor-campus-editor`; awaiting commit/review (becomes `DONE` when its PR is merged).
  - Branch: `feature/outdoor-campus-editor` (branch in use; roadmap lists `feature/outdoor-campus-authoring`)
  - Depends on: B1 (merged)
  - Scope delivered: Phase 1 multi-object group movement · Phase 2 layer ordering · Phase 3 decorative asset property controls · Phase 4 decorative asset visual polish
  - Test result: 38 files / 329 tests passed — `pnpm test` (B2 added 9 test files / 82 tests: 54 pure + 28 integration, plus this pass's create-campus regression suite); `pnpm build` passed (pre-existing >500 kB chunk warning only); `git diff --check` clean
  - Pull Request: Pending
  - Create Campus manual retest: **under verification** — the user's manual create failed with "Could not save campus" while Edit Details worked. This pass fixed provable create-path defects (see handoff note: "Create Campus INSERT failure pass"); user manual retest pending before B2 can be marked ready to commit.
- [ ] **B3 — Building configuration and entrances**
  - Status: `FOR REVIEW` / **READY TO COMMIT** — cumulative B3 implementation and final verification pass complete on `feature/building-entrances`; awaiting commit/review (becomes `DONE` only after its PR is merged).
  - Branch: `feature/building-entrances` (roadmap lists `feature/building-entrance-authoring`)
  - Depends on: B2; A5 final normalized entrance integration remains deferred because B3 intentionally avoided a new DB migration.
  - Scope delivered: building-attached entrance model; edge + normalized offset geometry; rotation/resize-safe attachment; entrance placement, selection, drag/reposition, deletion, and PropertiesPanel editing; General / Service / Emergency Exit purpose semantics; Primary rule; Accessible flag; primary deletion auto-promotion; validation; duplicate-building entrance cloning; locked/hidden semantics; shared snapshot/adapter compatibility; campus-card initial building count fix; campus-card lightweight visual preview; metric tooltips.
  - Test result: 42 files / 388 tests passed — `pnpm test`; `pnpm build` passed with only the pre-existing >500 kB `AdminMapBuilderPage` chunk warning; `git diff --check` clean aside from CRLF normalization warnings.
  - Manual verification: PASSED, including final campus-card preview check.
  - Persistence note: entrances currently persist through the editor state, building metadata in the current structure save/load path, sanitized/shared published snapshots, campus cloning, and public adapter compatibility. B3 does **not** add a dedicated entrance table or new DB migration; final normalized DB-backed entrance integration remains gated/deferred to the later A5/B6 persistence contract.
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

- Latest B3 final verification and documentation pass (August 8, 2026): manual B3 testing passed, including the final campus-card preview check. Automated verification is clean on `feature/building-entrances`: 42 files / 388 tests passed in `pnpm test`; `pnpm build` passed with the pre-existing >500 kB `AdminMapBuilderPage` chunk warning only; `git diff --check` is clean aside from CRLF normalization warnings. B3 is **READY TO COMMIT** after developer review.
- B3 delivered building-attached entrances owned by `CampusBuilding.entrances[]` with `id`, `buildingId`, `edge`, normalized `offset`, optional `name`, `type`, `isPrimary`, and `accessible`. User-facing purposes are General Entrance, Service Entrance, and Emergency Exit. Legacy `main`, `secondary`, `service`, and `emergency` values normalize safely without leaking old labels.
- B3 entrance behavior verified: Add Entrance is building-relative; entrances stay on the perimeter through drag, move, group move, resize, and rotation; entrance clicks select the entrance; building clicks away from entrances select the building; side/position controls are administrator-friendly; locked parents block add/edit/drag/delete; hidden parents follow existing editor ghost/public adapter visibility rules.
- B3 Primary rule verified: the first General entrance defaults Primary; additional General entrances are non-primary; switching Primary is one combined state; Service and Emergency Exit cannot be valid Primary; deleting a Primary promotes the first deterministic remaining General entrance only; deleting a building leaves no orphan entrances; duplicate building generates new entrance IDs and remaps `buildingId`.
- B3 validation verified: zero entrances reports "Building has no entrance"; entrances with no valid Primary report "Building has no primary entrance"; exactly one valid General Primary is clean; malformed multiple General Primary entrances are reported; Accessible remains independent from purpose and Primary; Emergency Exit remains data preparation and does not satisfy the normal Primary requirement.
- B3 campus-card fixes verified: initial Map Builder load reads persisted lightweight building footprints through `campusService.list()` and immediately renders a correct count and visual preview without opening a campus; true zero-building campuses still show "No buildings yet"; positive-count/no-geometry states do not falsely show empty; metadata-only updates preserve the preview summary; saved structure updates refresh the count; metric icons expose accessible/hover/focus labels for Buildings, Floors, Rooms, and Markers.
- B3 persistence/deferred boundary: no new entrance DB migration was added. Entrances are preserved in current editor snapshots and building metadata used by the structure save/load path, and included in shared published snapshots for adapter/search compatibility. Future A5/B6 work should decide the final normalized DB-backed entrance contract and later route-graph integration. B3 does not implement B5 navigation, outdoor-to-indoor routing, accessibility routing calculation, emergency routing, roads, walkways, floors, stairs, or elevators.
- Latest B2 final UI consistency update (August 8, 2026): automated verification is clean on `feature/outdoor-campus-editor` with 40 files / 357 tests passing in `pnpm test`, `pnpm build` passing with only the pre-existing >500 kB `AdminMapBuilderPage` chunk warning, and `git diff --check` clean after the final check. B2 now uses one shared outdoor stack for buildings and decorative assets (`zOrder`), one canonical selected-outdoor-object count, shared PropertiesPanel/right-click layer ordering, hidden editor ghosts while public/student adapters hide hidden outdoor objects, mixed building/decor group movement, and mixed alignment/distribution. The final panel polish makes the right-side PropertiesPanel count match the floating toolbar for mixed selections and makes PropertiesPanel delete remove the selected outdoor object set, including decor.
- Latest B2 manual gate: final in-browser retest is still required before commit/review. Required checks: create campus; edit/save campus details; select 2 buildings + 1 decor and confirm toolbar + PropertiesPanel both show 3 objects; verify Bring Forward / Send Backward / Bring to Front / Send to Back across overlapping building/decor from both PropertiesPanel and right-click; undo/redo once.

- Active package: B3 — Building configuration and entrances (branch in use: `feature/building-entrances`), status `FOR REVIEW` / READY TO COMMIT
- Last completed package: B1 — `DONE`, merged through Pull Request #5 (merge commit `b19d974`)
- Known blocker: Create Campus INSERT failure still under manual verification (UPDATE works; CREATE failed with "Could not save campus"). This pass fixed provable create-path defects and improved diagnostics; final confirmation requires the user's manual retest (see "MANUAL TEST FOR USER" in the pass report).
- Important changed files (round 1): `src/lib/campusValidation.ts` (new, extracted validation), `src/lib/pathfinding.ts` (fixed truncated `findPath` reconstruction), `src/lib/__tests__/{pathfinding,indoorPathfinding,mapDataAdapter,campusValidation}.test.ts` + `src/hooks/__tests__/useUndoRedo.test.tsx` (new), `src/lib/__tests__/campusHelpers.test.ts` (added `sanitizeCampus` cases), `package.json` (added `test` script)
- Important changed files (manual-failure repair): `src/lib/editorPlacement.ts` (new: `screenToWorld`, `computeBuildingPlacement`, `shouldDrawNavConnector`, `resetTransientToolState`), `src/components/map-builder/FloorEditor.tsx` (added missing `LandPlot` import — fixed the render crash), `src/components/map-builder/CampusEditor.tsx` (`handleSvgLeave` cancels placement on mouse-leave; `switchTool`/`switchLayer` cleanup; `Escape` clears drag/rubber-band; shared placement geometry), `src/components/map-builder/Canvas.tsx` (`onCanvasLeave` prop; preview uses shared geometry; nav connector gated on real nav data), `src/components/map-builder/useCanvasControls.ts` (`getPoint` delegates to tested `screenToWorld`), `src/lib/__tests__/editorPlacement.test.ts` + `src/components/map-builder/__tests__/FloorEditor.render.test.tsx` (new), `docs/progress/DEVELOPER_2_B1_VERIFICATION.md` (evidence incl. repair round + retest checklist)
- Important changed files (round-2 repair): `src/components/map-builder/useFloorHistory.ts` (rewritten: full floor-state snapshots, reactive `canUndo`/`canRedo`, per-floor reset), `src/components/map-builder/FloorEditor.tsx` (post-change history via `updFloor`; one post-gesture commit on pointer release; `applyEntry` shared by toolbar + Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z with input-focus guard; wall drag translates x1/y1/x2/y2 — was injecting NaN; toolbar disabled states), `src/services/campusStructureService.ts` (finite-number coercion for map_elements x/y/rotation — no NaN→null; walls anchor at x1/y1; descriptive errors naming kind+id; legacy wall normalization on hydrate), `src/components/map-builder/__tests__/useFloorHistory.test.ts` + `src/components/map-builder/__tests__/FloorEditor.undoRedo.test.tsx` (new), `src/services/__tests__/campusStructureService.test.ts` (null-x reproduction + contract compliance), `docs/progress/DEVELOPER_2_B1_VERIFICATION.md` (round-2 evidence §10)
- Important changed files (round-3 repair): `src/components/map-builder/FloorEditor.tsx` (decorative background wrapped in `<g data-bg="true">`; `isBg` now matches descendants via `closest('[data-bg="true"]')` so empty-floor clicks deselect; `data-testid` on wall selection glow + endpoint handles), `src/components/map-builder/__tests__/FloorEditor.selection.test.tsx` (new, 4 tests), `docs/progress/DEVELOPER_2_B1_VERIFICATION.md` (round-3 evidence §11 + B4 follow-up record)
- Important changed files (B2): `src/lib/campusGroupMove.ts` (new, pure group translation/bbox/alignment), `src/lib/campusLayerOrder.ts` (new, pure reorderLayer with no-op detection), `src/lib/decorAsset.ts` (new, normalizeRotation/clampDecorScale/duplicateDecorAsset), `src/lib/decorVisual.ts` + `src/lib/color.ts` (new, shared decor geometry/artwork + shade), `src/components/map-builder/DecorAssetVisual.tsx` (new, shared decor artwork renderer), `CampusEditor.tsx` (drag-group gesture, handleLayerOrder, decor update/delete/duplicate with post-state history, decorRenderScale), `Canvas.tsx` (decor artwork + `data-decor-type`, name-label/scale-badge overlap fix), `PropertiesPanel.tsx` (Layer Order section, full Decorative Asset section with committed inputs, marker-only Layer Order cleanup), `ContextMenu.tsx` (real layer actions + decor branch), `HierarchyPanel.tsx` (shared visual in palette), `constants.ts` (DecorPart[] + redesigned 18 assets), `types.ts` (optional `name` on CampusDecorAsset); 9 new B2 test files (see below)
- B2 tests added (9 files / 82 tests): `campusGroupMove.test.ts` (11) + `CampusEditor.multiMove.test.tsx` (5) [Phase 1]; `campusLayerOrder.test.ts` (17) + `CampusEditor.layerOrder.test.tsx` (7) [Phase 2]; `decorAsset.test.ts` (10) + `CampusEditor.decorProps.test.tsx` (11) [Phase 3 — 21 tests, correcting the earlier verbal miscount of 22]; `color.test.ts` (7) + `decorVisual.test.ts` (9) + `DecorAssetVisual.test.tsx` (5) [Phase 4]
- Important changed files (Create Campus INSERT failure pass): `CampusWizard.tsx` (campus code is now **required** and validated against the DB contract `^[A-Z0-9][A-Z0-9_-]{0,29}$` — the old regex allowed spaces and treated code as optional, so empty/space codes passed the wizard and failed the INSERT `campuses_code_format_check` → "Could not save campus"; also DB-aligned maxLength on name/code/description/address/city/province), `campusService.ts` (`normalizeCampusCode` fails fast pre-INSERT with a clear error; `CampusServiceError` preserves PostgREST `code`/`details`/`hint` with dev-only structured `console.error`; `userFacingCampusMessage` maps known DB codes to concise user-safe messages so constraint names never leak), `AdminMapBuilderPage.tsx` (duplicate-code pre-check before create; all error toasts now pass `{ description }` — sonner 2.x drops a string second arg, which is why users only ever saw the title "Could not save campus" and never the real error), tests: `src/services/__tests__/campusService.test.ts` (new, 11 tests: payload mapping, code validation, error propagation, friendly messages) + 3 new page tests (empty code blocked, space code blocked, duplicate code rejected pre-service)
- B2 known limitations / deferred (not B2 scope): the building/marker/path delete-confirm path still uses the pre-existing pre-state history pattern (can record two snapshots per delete — pre-existing, outside B2; do not migrate broadly); no `tsconfig.json`/`tsc` exists in the repo, so `vite build` is the only compile check (documented repo limitation); markers/nav nodes/edges/events/accessibility objects are intentionally not reorderable (cross-type layer architecture unchanged); `svgPath` on decor descriptors is legacy fallback only; the complete toolbar/tab redesign, campus-card styling, and remaining asset/palette polish stay in B2/B5/B10 follow-ups as recorded in `DEVELOPER_2_B1_VERIFICATION.md` §12.1
- Next recommended action: User manual retest of Create Campus on `feature/outdoor-campus-editor` (per the pass report's MANUAL TEST FOR USER). If create succeeds, place one building and stop; then B2 can be reviewed/committed before B3.
