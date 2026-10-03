# Event Editor UI/UX Polish Implementation Plan — Luna Max

> **For agentic workers:** Use the available `executing-plans` skill to implement this plan task-by-task. Steps use checkbox syntax for tracking. The user selected Luna with Max effort for implementation and later verification; final review belongs to GPT-6.1 Sol. Do not change models, create another chat, or delegate by default.

**Goal:** Polish the event plotting experience with stable asset choices, compact themed controls, accurate previews, useful seating layouts, and responsive desktop/mobile behavior without losing existing functions.

**Architecture:** Keep `StudentEventEditPage` responsible for location coordination and persistence, and `EventFloorEditor` responsible for the existing event canvas, history and gesture handling. Extract only the new placement dock and selection presentation where they have a clear responsibility. Extend existing pure placement/preset helpers; do not replace the canvas engine or change event storage.

**Tech stack:** Existing React/TypeScript, Tailwind/theme tokens, Radix dialog/popover primitives, lucide-react, Vitest and Testing Library. Vite remains the development/build tool. No additional packages.

**Design:** [Approved scope](../specs/2026-10-02-event-editor-uiux-polish-design.md).

## Execution checkpoint — 2026-10-03

- Tasks 1–8 have implementation changes and automated event/canvas regression coverage in the local checkout. The final automated suite passed; see [`docs/2026-10-02-event-editor-uiux-polish-implementation-report.md`](../../2026-10-02-event-editor-uiux-polish-implementation-report.md).
- Tasks 0 and 9 remain partial because the real-browser light/dark viewport matrix and visual screenshots were not run. The browser automation runtime failed to initialize, so do not treat browser acceptance as complete.
- The project-wide TypeScript command still exits with existing errors outside the changed event files. This is recorded in the implementation report and is not a TypeScript pass.

**Observed starting point:** local HEAD `46e4bd6` when this plan was written, with a clean working tree. Recheck at execution time; line numbers and HEAD may change. This is a plan, not a claim that any improvement below is implemented.

## Global constraints

- Work only on the event UI/UX scope below. Do not redo the previous full-pack implementation.
- Preserve existing campus/floor map data, requested locations, draft recovery, undo/redo, locks, groups, layer order, visibility, admin previews and student previews.
- No SQL execution, migrations, account provisioning, auth bypass, environment edits, backend switching, dependency upgrades, resets, force pushes or deletion of existing work.
- Normal local startup remains `npm run dev`; do not make Docker or a separate local Supabase instance a prerequisite.
- Keep all event menus, selects, dialogs and sheets theme-matched. Do not introduce browser alert/confirm/prompt, native select menus, native color chooser or native date/time popups into the event flow.
- New assets use existing fixed template dimensions. Preserve saved legacy dimensions exactly; no data normalization or bulk rescaling during load/save.
- Spacing is measured in map units. Do not claim meters, fire-code compliance or verified room capacity.
- Use theme tokens (`bg-card`, `text-foreground`, `border-border`, `text-primary`, destructive tokens). No hardcoded white selection boxes or global theme changes.
- Main touch controls have at least 44 × 44 CSS-pixel hit targets, explicit accessible names and visible focus states.
- Already implemented functions must be reused. Add tests for new behavior and regressions; do not rewrite passing tests merely to match new CSS classes.
- Keep presentation state out of saved overlays: active asset, open sheet, preview, sidebar collapse and repeat toggle are UI state only.
- Before saving/submitting/switching locations, preserve the existing interaction-finalization and latest-draft snapshot mechanisms.
- Do not automatically push or merge this work. Deliver a reviewable local result and a truthful implementation report.
- For every behavior task: add the named behavioral regression first, run it and observe the relevant failure, implement the smallest scoped change, then run the new and affected existing tests. Existing preserved behavior should remain green; do not deliberately break it to manufacture a failing baseline.

## Existing behavior to reuse, not duplicate

| Capability | Current implementation | Work in this plan |
| --- | --- | --- |
| Published campus and matching buildings | `EventProposalModal.tsx`, `EventLocationPicker.tsx` | Keep; regression/visual checks only |
| Confirm locations before creation | Existing themed confirmation in proposal modal | Keep; improve wrapping only if visibly necessary |
| Fixed sizes | `eventAssets.tsx`; chair is 16 × 16 | Preserve, including legacy dimensions |
| Preset preview and configurable rows | `eventLayoutPresets.ts`, editor `presetPreview` | Extend controls and geometry rather than add a second builder |
| All six selection arrangements | `applyLayoutAction` in `eventLayoutGeometry.ts` | Preserve semantics; guard locks and impossible fit |
| Snapping/drag feedback | `eventPlacementGuides.ts`, `eventLayoutGeometry.ts` | Reuse for preview; preserve gesture contracts |
| Pan, pinch, rotation, pointer ownership | `EventFloorEditor.tsx`, `eventGestureCoordinates.ts`, `useEventViewportMotion.ts` | Preserve; adapt only where new placement states require it |
| Autosave and local recovery | `useEventAutosave.ts`, `eventDraftPersistence.ts` | Preserve unchanged unless a demonstrated regression requires a scoped fix |
| Review before submission | `EventSubmissionReview.tsx` and page coordinator | Retain; update entry-point copy only |
| Tutorial spotlight | `EventEditorTutorial.tsx` with `data-event-tour` targets | Update targets/copy/visibility for the redesigned controls |
| Admin publication and student event preview | Existing full-pack implementation | Regression checks; no backend change |

## File boundaries

Paths below are repository-relative; run commands from the actual active checkout.

| File | Responsibility and permitted change |
| --- | --- |
| `src/components/canvas/CanvasAssetPalette.tsx` | Stable event quick row and clearer catalog; preserve non-event consumers |
| `src/components/events/EventPlacementDock.tsx` (new) | Compact placement UI; emits intent through props, never saves or owns canvas gestures |
| `src/components/events/EventSelectionOverlay.tsx` (new) | Visual selection outlines and single rotation control; uses existing rotation callback |
| `src/components/events/EventFloorEditor.tsx` | Compose controls, preview, commit, responsive panels and history using the existing engine |
| `src/lib/eventPlacementCandidate.ts` (new) | Pure candidate assessment using existing validation; no React/persistence |
| `src/lib/eventLayoutPresets.ts` | Extend chair layout geometry and retain legacy option behavior |
| `src/lib/eventLayoutGeometry.ts` | Only targeted arrangement fit/lock-related support if necessary; preserve existing action semantics |
| `src/components/events/EventItemInspector.tsx` | Progressive disclosure and themed color controls |
| `src/components/events/EventLocationSwitcher.tsx` | Compact/collapsible locations with full readable names |
| `src/pages/StudentEventEditPage.tsx` | Connect responsive locations to existing change protection; no service/auth redesign |
| `src/components/events/EventLayoutIssues.tsx` | Support a compact host in tool strip while retaining panel behavior |
| `src/components/events/EventEditorTutorial.tsx` | Updated target/copy mapping and visible mobile targets |
| `src/styles/index.css` | Event-scoped layout rules only; no broad button/body/map overrides |
| `src/components/events/EventProposalModal.tsx` | Optional small wrapping/focus fixes only if the visual pass demonstrates a problem |
| `src/components/map-builder/Readonly*`, `src/components/canvas/CanvasAssetVisual.tsx` | Read for context. Avoid edits; keep shared map art and rendering unchanged |

Create focused tests beside the existing tests. Do not split the 3,000-line editor into a new engine during this polish.

## Task 0 — Record the baseline and protect local work

**Files:** existing project instructions, package scripts, affected tests; report below.

- [ ] Read applicable `AGENTS.md` files if present. Inspect `git status --short`, branch and current HEAD. If work exists, preserve it and record it; never stash/reset it blindly.
- [ ] Use a suitable existing attached worktree or the available `using-git-worktrees` workflow if isolation is required. Use branch `codex/event-editor-uiux-polish`. Do not switch the user's running checkout behind their back. Record how the user can run the result in its actual checkout.
- [ ] Read the approved design, current editor/palette/preset implementations and relevant tests. Locate current handler names before editing.
- [ ] Capture the current palette, selected furniture, long location names, inspector, layouts and mobile editor at 390 px and 1440 px in light/dark themes. Use non-sensitive fixtures and keep screenshots local.
- [ ] Run baseline affected tests and build; record actual totals and errors. Commands:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
node node_modules/vitest/vitest.mjs run src/components/events src/components/canvas src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts src/lib/__tests__/eventPlacementGuides.test.ts src/lib/__tests__/eventGestureCoordinates.test.ts --maxWorkers=1 --reporter=dot
npm run build
```

Run these separately, not as one shell string with separators. Add a fresh TypeScript baseline using `node node_modules/typescript/bin/tsc --noEmit` if a project configuration exists. The earlier sync report documented existing persistence failures and TypeScript diagnostics; verify the current baseline instead of assuming those are still present. Record them rather than expanding this task into unrelated repairs.

**Checkpoint:** baseline evidence exists, the serving checkout and environment are known, no project data/configuration has been changed.

## Task 1 — Stable quick assets and a quieter picker

**Files:** `CanvasAssetPalette.tsx`; `__tests__/CanvasAssetPalette.test.tsx`, `CanvasAssetPalette.mobile.test.tsx` in the same canvas directory.

**Existing interface:** preserve `CanvasAssetPaletteProps` and `EVENT_ASSET_DRAG_TYPE`. Existing `surface`, `activeKey`, `onSelect`, `compact`, `disabled`, `floating` consumers continue to work. Optional presentation slots for event use may be added later without changing non-event defaults.

- [ ] Add the failing event-row test before changing the picker. Test the actual buttons in a region named Quick assets and parent-controlled selection:

```tsx
it("keeps quick assets stable when the active asset changes", () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <CanvasAssetPalette surface="event" activeKey="chair" onSelect={onSelect} floating />,
  );
  const quick = () => within(screen.getByRole("group", { name: "Quick assets" }));
  const names = () => quick().getAllByRole("button").map(button => button.textContent?.trim());
  expect(names()).toEqual(["Chair", "Table", "Booth", "Stage"]);
  const table = quick().getByRole("button", { name: /Table/i });
  table.focus();
  fireEvent.click(table);
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "table" }));
  rerender(<CanvasAssetPalette surface="event" activeKey="table" onSelect={onSelect} floating />);
  expect(names()).toEqual(["Chair", "Table", "Booth", "Stage"]);
  expect(quick().getByRole("button", { name: /Table/i })).toHaveAttribute("aria-pressed", "true");
  expect(table).toHaveFocus();
});
```

Use `aria-hidden` on decorative artwork/checks so visible button text stays predictable. Include the usual imports from existing tests.

- [ ] Run the new test and confirm its failure is caused by the current reorder/label behavior.
- [ ] For `surface === "event"`, derive the quick row solely from `['chair', 'table', 'booth', 'stage']` filtered against the event catalog. Remove the prepend-active behavior for that row. Do not persist new recent/favorite history.
- [ ] Show **Ready to place: Table** in the header when the active asset is Table. Header text identifies armed placement, not an existing selected object. With no armed asset, show Choose an item.
- [ ] Rename More assets to **Browse assets**. Preserve search, categories, drag MIME, disabled state, catalog height bounds, close action, Escape handling and focus restoration.
- [ ] Replace stacked rings/gray blocks with one selected border, subtle theme fill and check; preserve a separate focus-visible outline. Use solid `bg-card`, normal border and subtle panel shadow instead of `bg-card/95`, blur and heavy shadows. Catalog options keep visible icons/names.
- [ ] Test switching to Podium: header changes, quick order stays intact; query has no matches; disabled choices cannot invoke selection; closing catalog does not mutate selection. Preserve existing non-event palette tests.
- [ ] Run both palette test files and inspect the light/dark picker visually.

**Checkpoint:** switching Chair/Table repeatedly causes zero position jumps or focus loss.

## Task 2 — Transparent asset artwork and stable stacking

**Files:** `EventFloorEditor.tsx`, new `EventSelectionOverlay.tsx`; existing editor tests plus new `__tests__/EventSelectionOverlay.test.tsx`.

**Interface for the new overlay:**

```ts
import type { FloorFurniture } from "../map-builder/types";

export interface EventSelectionOverlayProps {
  items: readonly FloorFurniture[];
  selectedIds: readonly string[];
  zoom: number;
  readOnly: boolean;
  panActive: boolean;
  onRotatePointerDown: (
    event: React.PointerEvent<HTMLButtonElement>, item: FloorFurniture,
  ) => void;
}
```

The editor supplies a callback using its existing `beginPointerGesture`, `handleRotateStart` and pan behavior. Do not implement a second rotation engine in the overlay.

- [ ] Add regressions: selecting an item does not change its effective artwork layer or saved `zOrder`; selected/unselected artwork has no white fill; explicit Front/Back still changes order; saved width/height/rotation remain unchanged.
- [ ] Remove selection-dependent `+100` from the furniture artwork layer. Derive artwork order only from existing stored order/fallback index. Keep item hit testing on the artwork wrappers.
- [ ] Remove hardcoded white backgrounds and heavy hover/selection shadows. Render existing `EventAssetVisual` inside a transparent wrapper; do not change asset templates or use art padding that unexpectedly changes the perceived fixed footprint.
- [ ] Move selection decoration and the existing single-item rotate control to a sibling overlay in the same world-coordinate container. Use `pointer-events: none` on decorations and `pointer-events: auto` only on actionable handles. The outline's transform/footprint must match the item.
- [ ] Preserve constant screen-size rotation hit targets across zoom and route accepted pointer events through the existing gesture ownership path. Keep group bounds visible, locked-item affordances and Pan-mode cursor/ownership.
- [ ] Test two overlapping items selected through Objects: artwork ordering stays constant, outline remains visible above both, rotation remains usable. Hiding/locking/front/back and read-only preview keep working.
- [ ] Run the editor's rotation, pointer, layer, lock and fixed-size cases. Visually verify at 25%, 100%, 200% zoom in both themes.

**Checkpoint:** selecting furniture decorates it without turning it into a white sticker or popping its artwork in front.

## Task 3 — One placement dock and coherent panel behavior

**Files:** new `EventPlacementDock.tsx`, `EventFloorEditor.tsx`, `CanvasAssetPalette.tsx`, event-scoped CSS; new `__tests__/EventPlacementDock.test.tsx`.

**Proposed dock props:**

```ts
import type { CanvasAssetDescriptor } from "../canvas/canvasAssetCatalog";

export interface EventPlacementDockProps {
  activeAssetKey: string | null;
  disabled: boolean;
  repeatPlacement: boolean;
  onSelectAsset: (asset: CanvasAssetDescriptor) => void;
  onRepeatPlacementChange: (repeat: boolean) => void;
  onOpenLayouts: () => void;
  onCancelPlacement: () => void;
}
```

Keep preset configuration in the current editor state initially. Reuse the palette; add a presentation slot or event-only flat variant to avoid placing its panel inside another bordered panel. Do not duplicate the asset catalog in the new dock.

- [ ] Add tests for quick asset intent, Layouts intent, Place multiple toggle, Cancel, and no unintended canvas placement from dock clicks/pointer events.
- [ ] Compose header, stable quick row, Browse assets, Layouts and placement controls in **one** compact surface. Remove the separate heavy Arrange/preset banner. Place the dock in its existing canvas overlay region, outside the transformed map layer.
- [ ] Rename preset creation to **Layouts**. Keep **Arrange selection** for multi-selection alignment/distribution; never use one ambiguous Arrange label for both operations.
- [ ] Do not show selection action bubbles while an uncommitted placement preview is active. Preserve a clear distinction between an armed asset and an existing selected object.
- [ ] Keep one principal editing panel open at a time: asset catalog, layout configuration, Objects, Details or location sheet. Opening one closes competing panels but never changes committed furniture. Tour overlay is a separate transient state. Smaller dropdowns belong to their host panel.
- [ ] Use existing Radix primitives for sheets and dropdowns rather than ad-hoc fixed overlays with no focus management. Escape closes the topmost panel first; a second Escape cancels placement. Return focus to the triggering control. Closing a panel must not release a synthetic click onto the canvas.
- [ ] Clamp desktop menus within the actual editor viewport; mobile catalog/configuration becomes a scrollable sheet with close control and safe-area padding. Do not apply the desktop `catalogHeight` measurement to a mobile sheet.
- [ ] Verify docking at 320 px and short landscape height, with keyboard and touch. Wheel over the catalog scrolls it and does not pan the map.

**Checkpoint:** tools remain visible and functional without multiple stacked heavy cards covering the map.

## Task 4 — Candidate preview, repeat placement and safe commit

**Files:** new `eventPlacementCandidate.ts`; `EventFloorEditor.tsx`, `EventPlacementDock.tsx`; new `src/lib/__tests__/eventPlacementCandidate.test.ts`, focused editor placement tests.

**Candidate contract:**

```ts
import type { FloorFurniture } from "../components/map-builder/types";
import type { LayoutWarning } from "./eventLayoutValidation";

export interface EventPlacementAssessmentInput {
  proposed: readonly FloorFurniture[];
  existing: readonly FloorFurniture[];
  canvasWidth: number;
  canvasHeight: number;
  blockedRegions: readonly { x: number; y: number; width: number; height: number; label: string }[];
  blockOverlaps: boolean;
}
export interface EventPlacementAssessment {
  items: readonly FloorFurniture[];
  issues: LayoutWarning[];
  canPlace: boolean;
  blockingReason: string | null;
}
export function assessEventPlacement(input: EventPlacementAssessmentInput): EventPlacementAssessment;
```

Implement this as a thin pure adapter: validate existing + proposed through `validateEventLayout`, retain only issues involving proposed IDs, return the **same candidate geometry**, and block critical issues plus overlap when `blockOverlaps` is true. `blockingReason` is the first blocking issue's message, or a specific empty/nonfinite-geometry explanation before validation; it is null for a valid candidate. No silent relocation in this assessment. Do not add a new persisted warning code just to represent invalid transient input.

- [ ] Add pure tests for valid candidate, out-of-bounds rotation, blocked entrance, candidate overlap, unrelated existing warning, empty candidate and nonfinite coordinates/dimensions. Empty/nonfinite geometry cannot commit; validate numerical input before invoking geometry math.
- [ ] Add integration tests: choose asset -> move pointer -> ghost visible -> click -> committed item coordinates match ghost; ghost does not count as an object, dirty draft, history entry or saved payload.
- [ ] Calculate one candidate using existing world-coordinate conversion and template size. Center it on the cursor. Reuse current grid/sibling snapping when Snap is on; use a stable preview ID and exclude it from sibling targets. Recompute on relevant pointer, asset, snap, zoom/pan or layout changes.
- [ ] Assess and render the ghost. Valid preview uses a subtle outline; invalid preview uses destructive outline **and explanatory text**, not color alone. Keep the candidate visible so users understand where placement failed.
- [ ] For a single asset, block boundary/protected-access violations; retain existing overlap warnings as reviewable warnings (`blockOverlaps: false`). For presets, preserve stricter rejection of overlaps (`true`). Do not silently convert every warning into a submission blocker.
- [ ] Commit only the assessed candidate, assigning real unique IDs/names at commit. Do not recompute a different snapped/clamped coordinate after showing the preview. Existing edge-constrained behavior may be applied when building the candidate, before both preview and validation.
- [ ] Default Place multiple to ON to retain repeated placement. OFF returns to Select after a successful placement. ON remains armed. Both paths add exactly one history snapshot per commit; presets add one snapshot for the full batch.
- [ ] Escape/Cancel clears candidate and placement error without changing persisted objects/history. Ignore clicks on existing items, editor chrome and clicks suppressed after gestures. Preserve dragging an existing item while Furniture mode is active.
- [ ] Route HTML drag/drop through the same candidate/assessment/commit path at the drop point. Keep the existing MIME type, unknown-key rejection and no-double-placement guards.
- [ ] Touch taps position a ghost; **Place here** explicitly commits it. While armed, a pan/pinch or pointer-cancel does not commit or create extra objects. Hide confirmation when no valid target exists and show its reason when invalid.
- [ ] Undo/Redo, Save Draft, location switch, Escape, blur and unmount tests prove candidate state never leaks into saved/recovered drafts. Do not add per-frame save calls; coalesce preview work using the existing animation-frame approach where suitable.

**Checkpoint:** the visible ghost is a faithful prediction of the committed furniture, including after zoom/pan.

## Task 5 — Seating layouts with explicit spacing and preview

**Files:** `eventLayoutPresets.ts`, dock/configuration UI in editor; `eventLayoutPresets.test.ts`, candidate tests and editor preset tests.

**Backward-compatible options:**

```ts
export interface EventPresetPlacementOptions {
  count: number;
  chairsPerRow?: number;
  spacing: number; // Existing center pitch for legacy callers.
  rotation: number;
  columnGap?: number; // New clear horizontal gap in map units.
  rowGap?: number; // New clear vertical gap in map units.
  centerAisleGap?: number; // Additional gap after floor(chairsPerRow / 2).
}
```

Keep `buildEventPreset(id, center, options, nextId)` and `fitEventPresetToCanvas(items, width, height)` callable by existing tests. For chair-row callers omitting the new gap fields, preserve the old spacing behavior. New UI uses explicit clear gaps; all other presets retain their current spacing logic.

- [ ] Add chair-layout tests before implementation: 12 chairs/5 per row -> row lengths 5, 5, 2; 1 chair; exact multiple; rotation 0/90/45; aisle with odd/even rows; same fixed width/height for every generated chair; invalid values rejected by UI rather than silently changing requested quantity.

Use this concrete geometry assertion in addition to rotated/validation cases:

```ts
it("creates 12 fixed-size chairs in rows of five with clear gaps", () => {
  let sequence = 0;
  const items = buildEventPreset("chair-row", { x: 200, y: 200 }, {
    count: 12, chairsPerRow: 5, spacing: 34, rotation: 0,
    columnGap: 18, rowGap: 24, centerAisleGap: 0,
  }, () => `chair-${++sequence}`);
  const rows = [...new Set(items.map(item => item.y))].sort((a, b) => a - b);
  expect(rows.map(y => items.filter(item => item.y === y).length)).toEqual([5, 5, 2]);
  expect(items.every(item => item.width === 16 && item.height === 16)).toBe(true);
  expect(rows[1] - rows[0]).toBe(40);
  const firstRow = items.filter(item => item.y === rows[0]).sort((a, b) => a.x - b.x);
  expect(firstRow[1].x - (firstRow[0].x + firstRow[0].width)).toBe(18);
  expect(new Set(items.map(item => item.id)).size).toBe(12);
});
```
- [ ] Implement horizontal pitch = chair width + columnGap; vertical pitch = chair height + rowGap. Insert centerAisleGap after `floor(chairsPerRow / 2)` only when that row has chairs on both sides of the split. Apply the existing group-centered rotation afterward.
- [ ] Default new UI to 10 chairs, 5 per row, columnGap 18, rowGap 24, center aisle disabled and rotation 0. These retain the present 34/40 pitch for 16-unit chairs. Enabled center aisle defaults to 24 additional map units. Allow gaps 0–240 map units and rotation normalized to 0–359 degrees; count remains capped at 500 chairs, copies at 30. Existing presets keep their own defaults.
- [ ] Use controlled draft strings for numeric fields so empty/invalid editing is possible. On validation, counts must be finite integers in range, per-row must be 1–30 and no greater than total; gaps must be finite/in range. Do not silently clamp 999 to 500 and place fewer than requested. Show a field-specific message and disable commit until corrected.
- [ ] Show **12 chairs · 3 rows · 5 per row · last row: 2**. Provide miniature layout illustrations built from existing icons/CSS rather than new image files. Existing presets keep recognizable names and accurate descriptions.
- [ ] Preview stays uncommitted while changing controls. New touch flow has Place here/Cancel; desktop pointer ghost uses the same batch candidate. A preview too large for the map remains invalid; `fitEventPresetToCanvas` may shift a fitting batch as one unit, never compress furniture or drop chairs to make it fit.
- [ ] Use the candidate assessment from Task 4 to identify the actual failure: reduce chairs/rows for bounds, move away from an entrance for access, or adjust gaps for overlap. Do not tell every error to reduce total chairs.
- [ ] Audit **all five** existing presets with validation fixtures. Check description/item-count consistency, including Classroom Seating's current chair description. If a preset's own objects overlap unintentionally, adjust only that preset's offsets or its inaccurate copy, record the decision and test it. Do not loosen global overlap validation to make a preset pass.
- [ ] Add 100-chair and 500-chair preview/commit tests for complete count, unique IDs/names and a single Undo restoring the prior layout. Report observed browser responsiveness; do not invent timing thresholds or capacity certification.

**Checkpoint:** users can preview seating by 5 per row with correct gaps and an understandable map-fit error, without resizing chairs.

## Task 6 — Selection actions, all arrangements and progressive Details

**Files:** `EventFloorEditor.tsx`, `EventItemInspector.tsx`, optionally `eventLayoutGeometry.ts` for a demonstrated fit defect; inspector/editor/geometry tests.

**Interfaces:** preserve existing inspector update callbacks and `LayoutAction` union. Keep `applyLayoutAction(items, ids, action, bounds?)` semantics: align left/top match rotated visible edges; align center/middle use selection center; horizontal/vertical distribution forms an even row/column.

- [ ] Keep the single-object action bubble compact: item name, Rotate, Duplicate, Lock/Unlock, Details, Delete. If a small viewport cannot fit these, use a themed More menu, not a second toolbar that duplicates every action. On mobile show one bottom action strip.
- [ ] For multiple furniture show count, Group/Ungroup, Arrange selection, Duplicate, Delete. Mixed furniture/labels retain shared valid actions; Arrange selection is unavailable for mixed selection. No label is discarded to simplify the UI.
- [ ] Hide transient action bubbles during pan/rotate/drag and uncommitted placement; restore after the gesture. Menus must not cover the active rotate handle or overflow the canvas corners.
- [ ] In Details show item name, fixed-size information, rotation and lock first. Add an expandable **Advanced** section for X/Y, visibility, layer Front/Back and group controls. Preserve existing callbacks and lock semantics. Do not reintroduce editable width/height.
- [ ] Replace the existing label `input[type=color]` with themed swatch buttons and an optional validated hex text field. Accept `#RRGGBB` and preserve the original color until valid. Retain label text/font size/rotation controls. No new color-picker package.
- [ ] Test all six arrangements using different dimensions, rotated items, two/many selected items, reversed input order and map edges. Never change dimensions, rotation, IDs, group IDs, zOrder, labels or unselected furniture.
- [ ] Filter locked furniture from editable arrangement actions. If fewer than two unlocked targets remain, disable the action and explain why. For insufficient map space, assess the proposed arrangement before committing and show a fit error instead of saving out-of-bounds results or silently resizing. This is an editor guard; do not change valid existing geometry outputs unnecessarily.
- [ ] Keep the current menu descriptions clear; add small lucide diagrams/icons if useful. Do not rename alignment into a promise of non-overlap—alignment can intentionally stack items and remains reviewable through checks.
- [ ] Test Undo restores the entire arrangement/group transform; Redo reapplies it; explicit Front/Back persists while ordinary selection has no layer effect.

**Checkpoint:** all existing arrangement actions remain geometrically correct, editable objects obey locks, and Details is useful without being bulky.

## Task 7 — Canvas-first responsive shell, locations and status

**Files:** `EventLocationSwitcher.tsx`, `StudentEventEditPage.tsx`, `EventFloorEditor.tsx`, `EventLayoutIssues.tsx`, event-scoped CSS; corresponding tests and `StudentEventEditPage.pendingDraft.test.tsx`.

**Existing interface:** location switching remains `onChange(locationId: string)` owned by the page. The editor's `onSave`, `onSubmit`, draft refs, callbacks and location key remain intact. Optional display props on the switcher must default compatibly for admin read-only preview consumers.

- [ ] Desktop >= 1024 px: keep an expanded location rail approximately 240 px wide with a Collapse locations control. When collapsed, show a compact Locations trigger with current context; opening it restores the list without losing canvas state.
- [ ] Below 1024 px: use a compact current-location trigger and themed Locations sheet; remove the permanent stacked header/cards taking map height. Expanded list shows full building/floor labels with wrapping, counts and active state. Use `locationRef.label`/the authored published floor label; do not infer Ground Floor as Floor 0 from a string suffix.
- [ ] Selection of a new location calls existing `handleLocationChange`; close the sheet without bypassing save/discard protection. Canceling the unsaved dialog stays on the original location; save failure retains the dialog/data. Do not store or mutate floor references to change display copy.
- [ ] Keep the existing immersive route and Back behavior. Use `min-w-0`, `min-h-0`, bounded inner scrollers, `100dvh` through the existing shell where needed, and safe-area padding. No horizontal document overflow or page scrolling outside the canvas workspace.
- [ ] Integrate the compact Layout checks summary into the tools strip; keep its full panel and focus-items callbacks. Avoid moving a fixed 36 px row out and leaving equivalent blank space. Add an optional compact presentation prop to `EventLayoutIssues` rather than duplicating its validation/panel logic.
- [ ] Separate **Draft/Pending/Approved/Disapproved** from **Unsaved changes/Saving/Saved/Save failed**. Keep existing status permissions; this plan does not change which proposal statuses are editable. Never claim Saved while a newer edit is pending.
- [ ] Rename Submit to GSO entry button to **Review & submit**, retaining its `data-event-tour="submit"` and existing review callback. The confirmation dialog still lists all locations and final submission still uses the current service. Keep busy guards, double-submit prevention and latest-gesture flush.
- [ ] Add separately labeled **Fit map** and **Focus selection**. Reuse `fitEventViewport`, `selectionBounds` and current viewport motion; include selected labels' extents. Focus selection is disabled with no visible selection; neither action edits objects or dirty state. Respect occupied dock/action space when framing small selections.
- [ ] Test location collapse/expand, long names, pending changes, failure/retry, save status transition, checks focus and review-before-submit. Preserve the current no-reload-on-tab-focus behavior; do not introduce new fetch effects or key remounts for panel changes.

**Checkpoint:** the viewport gains space while every requested location, check, save and submit action remains accessible.

## Task 8 — Touch alternatives and updated tutorial

**Files:** editor, placement dock, location switcher and `EventEditorTutorial.tsx`; gesture/editor/tutorial tests.

- [ ] Add mobile **Move here** for a selected unlocked item. First tap the action, then tap a destination to preview translation, then confirm Move here or Cancel. For a group, translate all unlocked members using existing constrained movement; if any group member is locked, disable whole-group move rather than distort the group. Keep dimensions/relative offsets. Cancel creates no history; confirmed move creates one history entry.
- [ ] Use existing world-coordinate/selection bounds helpers; do not add another touch coordinate system. Taps on controls do not place/move; pan/pinch never commits a move preview. This mode and asset/preset placement are mutually exclusive.
- [ ] Keep drag as an available alternative. Preserve pointer capture, final pointer-up geometry, blur/Escape cancellation, resize handling and Save Draft's interaction finalization.
- [ ] Update tour copy: Quick assets/Browse assets, Layouts, Arrange selection, Details/Advanced, save state, Review & submit. Preserve existing tour completion keys unless a tested version change is explicitly needed; do not force existing users through a new tour unintentionally.
- [ ] Ensure each step highlights **the visible referenced controls**. Locations step targets the compact trigger on mobile and the expanded list on desktop. Asset/layout step reveals the dock as needed without adding objects. Details step can point to Objects when no item exists; explain that a selected item unlocks Details rather than creating sample assets.
- [ ] Restore the prior editing tool/panel state on Skip/Done where practical; do not restore stale previews or commit tutorial-generated geometry. Tour card stays inside viewport and does not cover the spotlight target/next buttons.
- [ ] Test Next/Back/Skip/Done/Help, spotlight measurement after resize, mobile hidden-target fallback, focus restoration and unchanged furniture after a full tour.
- [ ] Exercise portrait/landscape, touch pan/pinch, asset placement, preset placement, rotation, selection Move here and entering numbers with the software keyboard. Closing each sheet returns canvas gestures to normal.

**Checkpoint:** mobile users can plot and reposition without precise dragging, and the tutorial points to the actual controls.

## Task 9 — Full verification, existing-flow regression and report

**Files:** only scoped fixes discovered during verification; create `docs/2026-10-02-event-editor-uiux-polish-implementation-report.md`.

- [ ] Run the final affected tests using the Task 0 command. New event/canvas component test files are covered by those directories; run the new pure candidate helper test explicitly as well. Capture actual exit codes and totals:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/__tests__/eventPlacementCandidate.test.ts --maxWorkers=1 --reporter=dot
```
- [ ] Run event coordinator/service/preview regression tests as a separate group:

```powershell
node node_modules/vitest/vitest.mjs run src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx src/pages/__tests__/StudentMyEventsAccess.test.tsx src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx src/pages/__tests__/AdminEventLayoutsPage.publication.test.tsx src/hooks/__tests__/useEventAutosave.test.tsx src/hooks/__tests__/useEventMapPreviews.test.tsx src/components/map/__tests__/EventMapPanel.test.tsx src/components/map/__tests__/EventPreviewLayer.test.tsx --maxWorkers=1 --reporter=dot
npm run build
git diff --check
git status --short
```

Again, run each command separately. If shared palette/CSS changes affect other canvas consumers, run their relevant tests too. Compare TypeScript diagnostics to the fresh baseline. A Vite build is not a TypeScript pass.

- [ ] Start/check the result with `npm run dev` in the correct checkout using the existing environment. Reuse a running server only if it serves the changed checkout. Do not spawn duplicate servers, silently change ports, or alter login settings to gain access.
- [ ] Use real browser interaction for the matrix below. If auth/backend blocks testing, record the exact blocker; component tests remain useful but do not prove real login/approval/publication. Do not run account-provisioning or database-verifier scripts as a workaround.
- [ ] Verify actual document overflow via `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at each size. Check computed sheet/menu bounds, not just Tailwind class names in jsdom.
- [ ] Keep screenshots/traces in local ignored artifacts. Do not commit account screenshots, credentials, environment files, personal clipboard images or unrelated binaries.

### Browser matrix

| Viewport | Theme | Minimum coverage |
| --- | --- | --- |
| 320 × 740 | Light and dark | Narrow layout, sheet width, scroll, menu edges and action reachability |
| 390 × 844 and 440 × 956 | Light and dark | Full touch event plotting, software keyboard, safe areas and tutorial |
| 844 × 390 | Light and dark | Landscape sheet bounds and meaningful visible canvas area |
| 768 × 1024 | Light and dark | Tablet locations, asset/preset panels and selection actions |
| 1024 × 768 | Light and dark | Rail boundary, collapsed/expanded state and menu collision |
| 1440 × 900 | Light and dark | Full desktop keyboard/mouse flow and visual consistency |

Use existing theme switching; do not alter the system theme implementation. Device emulation is not proof of every physical-device behavior; label the tested environment in the report.

### Functional acceptance checklist

- [ ] Quick order remains Chair/Table/Booth/Stage through at least ten alternating selections. No repositioned button, double selected ring or mouse/keyboard focus loss.
- [ ] Asset catalog search, categories, drag/drop, disabled state, empty results, Escape and focus return work. Choosing Podium does not replace the quick row.
- [ ] Picker/configuration/Objects/Details do not stack into competing sheets. Menus stay reachable at map corners; scrolling them does not move the map.
- [ ] Existing and new furniture looks clean on the map. Clicking changes only selection decoration, not artwork order or saved attributes. Explicit layer actions still work.
- [ ] Ghost and final placement coincide with Snap on/off after pan/zoom. Invalid boundary/access candidate cannot commit; existing warning severity is preserved.
- [ ] Place multiple ON creates multiple objects; OFF creates one then returns to Select. Cancel creates none. Drop/click/pointer compatibility does not double-place.
- [ ] 12 chairs by 5 makes 5/5/2 rows; gaps and optional center aisle are correct; rotation is correct; preview count equals committed count; invalid count/oversized batch explains failure without resizing.
- [ ] All five presets have accurate descriptions, usable valid placement fixtures and atomic Undo. No global validation exemption masks preset defects.
- [ ] All six arrangement actions work for rotated and mixed-size furniture without changing unrelated data; locked objects do not move; impossible distribution cannot persist invalid geometry.
- [ ] Details expands Advanced and preserves lock/visibility/group/layer actions. Label colors use the themed UI. Furniture size remains fixed.
- [ ] Fit map/Focus selection only affect viewport. Rotation handles stay usable at different zoom levels.
- [ ] Mobile tap-preview-confirm placement and Move here work. Pan/pinch and closing sheets do not accidentally add/move objects or strand pointer capture.
- [ ] Long location/building/floor names are readable; selecting a location preserves correct per-location objects and unsaved-change behavior.
- [ ] Save status and proposal status are distinct. Delayed/failed saves retain newer edits; recovery/reload works; alt-tab does not trigger a full Loading event map screen.
- [ ] Review & submit shows all requested locations and current in-flight geometry; cancel returns intact; busy clicks cannot double-submit. Published base map never changes.
- [ ] Creation modal still filters buildings by published campus, confirms clearing incompatible floors, retains inputs on error, requires location summary and has no student schedule/publication fields.
- [ ] Admin read-only review can inspect all locations with correct asset order and cannot edit the map. Student event previews remain opt-in, timing-filtered and compatible with navigation.
- [ ] Tutorial highlights the actual visible controls on desktop/mobile; a complete tour creates no objects and can be replayed from Help.
- [ ] There is no horizontal document overflow, clipped primary action, native picker introduction, unrelated auth/environment change or lost existing function.

### Report format and completion rules

The implementation report must contain:

1. Baseline HEAD/branch, serving checkout, changed files and scope.
2. A task table: done / partial / blocked with evidence and a concrete remaining item.
3. What changed and where the user sees it; list retained features separately from new functionality.
4. Exact commands, exit codes, test totals and build/TypeScript outcomes. Distinguish baseline failures from new failures.
5. Browser matrix results with screenshot paths and actual mouse/touch/keyboard coverage.
6. Explicit confirmation that no database/environment/auth changes, deployment or push occurred; any exception must have separately documented authorization.
7. Known limitations: map-unit sizing, actual browser/device coverage, and any backend/auth blocker. Do not say fully functional while relevant checks are blocked/unrun.
8. A short reproducible user test flow and a final-review handoff for GPT-6.1 Sol, including the diff and unresolved issues.

Do not mark the plan complete until new relevant tests pass and the claimed browser checks actually ran. Fix regressions within this scope; record unrelated baseline problems without changing unrelated system behavior.

## User's manual test flow after implementation

1. Run `npm run dev` from the checkout named in the implementation report; open the printed local URL.
2. Sign in with the existing Student Organization account, open My Events, create a **new draft** with a campus and two published locations, review the summary and open the editor.
3. In Furniture choose Chair/Table alternately; verify stable quick order, Browse assets and the cleaner selected styling.
4. Place a few objects with Place multiple ON, then OFF. Test ghost position, invalid entrance placement, Escape, Undo/Redo, and selecting an existing item without bringing it to the front.
5. Open Layouts, choose chair seating, enter 12 chairs/5 per row, change row/column gap, enable center aisle and rotate. Place the batch, undo it once, redo it, then try a quantity that cannot fit.
6. Select several objects and try all alignment/distribution options; lock one and repeat. Open Details/Advanced, rename/find objects and verify fixed sizes and layer controls.
7. Collapse locations, switch between the two maps, save and refresh; confirm both layouts survive and alt-tab does not reload the full editor.
8. Repeat on mobile width: Locations sheet, Browse assets, layout configuration, tap-preview-Place here, Move here, pan/pinch, Details and Help tour. Confirm there is no page overflow.
9. Open Review & submit; check both requested locations and cancel once to verify the draft stays intact. Submit only the dedicated test event when ready.
10. If the existing backend/accounts allow it, review as admin and inspect the existing student preview flow. These steps verify compatibility; this UI polish does not apply publication migrations or repair backend setup.

## Copyable implementation handoff

> Implement `docs/superpowers/plans/2026-10-02-event-editor-uiux-polish-luna-max.md` using Luna with Max effort. Follow the approved design and task order. Scope is the event editor UI/UX and plotting polish only. Reuse the existing preset, gesture, save, recovery, review and publication behavior. Preserve all local work; do not modify auth, demo autofill, environment, Supabase or database schema, and do not push/deploy. Run the specified tests and browser matrix, fix relevant regressions, and create the named implementation report with evidence, limitations and manual test instructions. Do not claim all checks passed if any were blocked or unrun. Leave the local result ready for GPT-6.1 Sol final review.
