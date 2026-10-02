# Event proposal locations, modal, and inspector implementation plan

> **For GPT-6 Luna XHigh/Max:** Execute tasks in order. Use the existing React editor and published campus model. Track each checkbox. Run each task's focused checks before starting the next task. This is a plan only; no application code has been changed by writing it.

**Goal:** Give Student Org users a themed, reliable event proposal flow for any valid published building floor, including multiple floors and buildings, and make asset details usable without covering the map.

**Architecture:** Keep `locations[]` and the existing `EventLocationRef` shape. Read locations from one explicit published campus snapshot, bind the event to that snapshot's campus ID, and resolve every requested floor against that same campus. Build a scoped responsive location selector and modal using existing theme tokens and installed Radix primitives. Move selected asset details into a stable desktop inspector rail or mobile sheet without changing the event canvas gesture model.

**Tech stack:** React, TypeScript, Tailwind theme tokens, Radix Popover/Dialog already in `package.json`, Vitest, Testing Library, Vite.

## Global constraints

- Student Org users retain the existing create/edit permissions and GSO submission workflow. “All buildings” means all visible buildings with usable floors in the selected published campus. Do not add an admin-only restriction.
- One proposal may request Campus Grounds plus multiple floors across multiple buildings. No room-level picker or cross-campus proposal in this scope.
- The administrator-published map stays read-only. Event furniture and labels stay separate for each requested location.
- Preserve existing event overlay metadata and legacy one-location compatibility. Reuse `eventLocationKey` and `normalizeEventOverlayLocations`.
- Do not change pointer ownership, capture, drag, pan, zoom, snapping, validation, recovery, or save/submit gesture logic in `EventFloorEditor`.
- No demo/legacy floor options may appear in the production proposal flow while published campuses are loading, unavailable, or failed. Keep legacy resolver compatibility for existing legacy overlays/tests.
- Respect light/dark theme tokens, keyboard/focus operation, reduced motion, safe areas, and touch targets. Do not introduce a new UI package or database table.
- The current worktree contains unrelated changes in `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.pnpm-store/`, `.superpowers/`, and historical docs. Preserve them; stage only files changed for this plan if committing.

## Confirmed current behavior and file map

- `src/pages/StudentMyEventsPage.tsx` calls `usePublishedCampus()` but passes only `activeCampus` through `eventBuildingOptions()`. It does not gate Create on campus loading/error and calls `createEventOverlay(data, userId)` without an explicit campus ID.
- `src/lib/eventLocationData.ts` uses a demo fallback when `activeCampus` is null. It lists visible buildings with `floors.length > 0`; its live floor resolver preserves authored floor layers.
- `src/components/events/EventLocationPicker.tsx` uses two native `<select>` elements and a flat chip list. `locations[]` and duplicate prevention already support several buildings/floors.
- `src/components/events/EventProposalModal.tsx` uses a centered two-step modal. Backdrop click closes it, including after edits. The Create button disables at zero locations without giving a focused explanation. Poster upload runs before `onCreate`.
- `src/services/eventOverlayService.ts` uses `resolveActiveCampusId()` when creating/listing; that resolver can choose a campus different from the published snapshot shown in the UI. `getEventOverlay()` currently does not return the row's `campus_id`.
- `src/pages/StudentEventEditPage.tsx` and `src/pages/AdminEventLayoutPreviewPage.tsx` resolve floors using their hook's default `activeCampus`, not the event row's campus ID.
- `src/components/events/EventFloorEditor.tsx` renders the asset picker at top-left inside the canvas, selection action bars near items, and item/label inspectors as absolute overlays at the top-right inside the canvas. Those panels can obscure the asset and map.
- `src/components/ui/Combobox.tsx` is theme-aware but lacks the complete keyboard and mobile behavior this picker needs. Do not replace both selects with it unchanged.

## Task 1 — Bind proposal creation to a loaded published campus

**Files:** Modify `src/pages/StudentMyEventsPage.tsx`, `src/lib/eventLocationData.ts`, `src/services/eventOverlayService.ts`, `src/components/map-builder/types.ts`. Add/update `src/pages/__tests__/StudentMyEventsAccess.test.tsx`, `src/lib/__tests__/eventLocationData.test.ts`, `src/services/__tests__/eventOverlayService.test.ts`.

**Interfaces:** Proposal create passes `campusId: string` from the currently displayed published snapshot into `createEventOverlay(input, createdByUserId, campusId)`. `EventOverlayFilters` gains `campusId?: string`, used by `listEventOverlays({ campusId, createdByUserId })`. `CampusEventOverlay` gains optional `campusId?: string` for hydrated rows; the database column remains `map_elements.campus_id`.

- [ ] Write failing tests: while `usePublishedCampus().loading` is true, Create cannot open and no demo building is offered; on error/empty, show a retry/contact-admin state; on success, all visible published buildings with at least one valid floor appear; hidden buildings and buildings without floor maps do not. Add a service test where the UI campus differs from `resolveActiveCampusId()` and assert the insert uses the explicit UI campus ID and subsequent listing queries that same ID.
- [ ] Run only those tests and confirm the new cases fail for the expected reasons.
- [ ] In `StudentMyEventsPage`, consume `loading`, `error`, `isCached`, `refetch`, and `activeCampus`. Compute picker options only after a published campus is present. Gate the Create action while loading or unavailable and explain why in the empty state. On cached/offline data, label it as cached; decide in this task whether creation is allowed only after a fresh successful fetch (recommended), because saving requires online access.
- [ ] Keep `eventBuildingOptions(null)` for legacy consumers if needed, but never call it from the production proposal modal with null. Prefer a new explicit helper `publishedEventBuildingOptions(campus: Campus): EventBuildingOption[]` that returns only valid visible floor options; use it in the proposal page. A usable floor has a numeric `number` and a resolvable authored floor plan. Preserve the exact `buildingId`, floor number, and label.
- [ ] Change `createEventOverlay` to require `campusId`, verify it is nonempty, and write that exact ID to `map_elements.campus_id`. Do not call `resolveActiveCampusId()` inside this creation path. Before insert, re-read the published snapshot for this ID using `campusService.listPublishedSnapshots()` and reject a campus or requested floor that has disappeared since the modal opened; do not create an overlay against an unpublished/draft campus. Add optional `campusId` to `EventOverlayFilters`; when present, list from that exact campus, and let other existing callers keep the current default resolution. In `StudentMyEventsPage`, call list with `activeCampus.id`, refetch when it changes, and use the same ID for create. Hydrate `campusId` from the row's `campus_id` in list/get responses; leave compatibility fields intact. Preserve other service consumers by updating their typed call sites/tests, not by silently defaulting to another campus.
- [ ] Run the focused tests, then inspect the service diff for any accidental change to approval, poster, or layout persistence.

**Acceptance:** No proposal can be created from a transient demo list. A created proposal's `campus_id` equals the campus whose buildings/floors the user selected. All valid visible published buildings appear, not just the first building. A building with no published floor cannot be added.

## Task 2 — Resolve event editing and admin preview against the event's campus

**Files:** Modify `src/pages/StudentEventEditPage.tsx`, `src/pages/AdminEventLayoutPreviewPage.tsx`, and only the required `eventOverlayService.ts` query mapping. Update `src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx`, `src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx`.

**Interfaces:** `getEventOverlay(id)` returns `campusId` from `map_elements.campus_id`; both pages select `campuses.find(c => c.id === overlay.campusId)` before calling `resolveFloorPlanForEvent()`.

- [ ] Add a failing two-campus test: campus A is hook default, event belongs to campus B, and building/floor IDs exist only in B. Assert both student editor and admin preview render B's authored floor. Add missing-campus and removed-floor tests asserting explicit unavailable states, never a wrong-campus or first-floor/demo fallback.
- [ ] Run the tests red.
- [ ] Consume the `campuses` array and loading/error from `usePublishedCampus`. Resolve the event's campus ID after the overlay loads. In `resolveFloorPlanForEvent`, when an explicit floor number is supplied and that live floor is absent, return `null` instead of silently choosing the building's first floor; retain the first-floor behavior only when no floor number was supplied for legacy data. For old/mock overlays without `campusId`, retain the current active-campus behavior only when it actually resolves every requested location; otherwise show the existing unavailable state. Do not rewrite stored locations or floor IDs.
- [ ] Preserve pending-preview flush, per-location draft state, and save/submit contracts from the prior event-editor corrections.
- [ ] Run focused tests and verify switching A-floor1 → A-floor2 → B-floor1 → A-floor1 restores each distinct event layout.

**Acceptance:** The modal, editor, and admin preview use one consistent campus source for a given proposal. Missing/unpublished campus or removed floor produces a clear error; no mismatched base map is rendered.

## Task 3 — Replace native building/floor selects with a themed responsive selector

**Files:** Create `src/components/events/EventLocationSelect.tsx`; modify `src/components/events/EventLocationPicker.tsx`; add `src/components/events/__tests__/EventLocationSelect.test.tsx`; update `EventLocationPicker.test.tsx`.

**Interfaces:** `EventLocationSelect` props: `{ label: string; value: string; options: Array<{ value: string; label: string; disabled?: boolean; description?: string }>; onChange(value: string): void; disabled?: boolean; searchable?: boolean }`. The picker remains controlled by `locations` and emits `EventLocationRef[]`.

- [ ] Write tests for keyboard open/ArrowUp/ArrowDown/Enter/Escape, focus return, disabled options, long building names, search with no results, outside dismissal, touch selection, and light/dark themed surface. Include a test that the dropdown is visible above the proposal footer and does not escape the viewport.
- [ ] Run tests red.
- [ ] Build the selector using installed Radix Popover for desktop and Dialog for narrow touch viewports, with one shared option list. Use semantic button/listbox or Radix's built-in focus semantics correctly; avoid nested interactive controls. Use theme tokens (`bg-card`, `text-foreground`, `border-border`, `focus-visible:ring-primary`) and a portal so `ModalShell` scrolling does not clip the menu. Use searchable building options; floor search may be omitted when floor count is small. Mobile uses a bottom-aligned selection sheet with safe-area padding and a scrollable list.
- [ ] In `EventLocationPicker`, replace only the two native selects. Reset floor selection when building changes. If the published options change while the modal is open, reset invalid building/floor IDs and require an intentional valid choice. Disable or mark a floor already present in `locations`; keep the add button idempotent.
- [ ] Run selector/picker tests, then inspect desktop and mobile light/dark rendering. Do not change the shared `Combobox` unless a targeted bug makes reuse necessary.

**Acceptance:** No native Building/Floor option menu appears. Long names remain readable, options stay inside the viewport, duplicate floors cannot be added, and keyboard/touch users can complete selection.

## Task 4 — Make multi-building and multi-floor selection easy to review

**Files:** Modify `src/components/events/EventLocationPicker.tsx`; update `EventLocationPicker.test.tsx` and `EventProposalModal.test.tsx`.

- [ ] Add a failing test with Campus Grounds, two floors in one building, and one floor in another. Assert four distinct location refs in stable insertion order, correct floor IDs, grouped display, independent removal, and no duplicate on repeated add.
- [ ] Run the test red.
- [ ] Show selected locations grouped by building with floors nested under each building; Campus Grounds is its own row. Display an explicit count and per-location Remove button with a full accessible name. After adding a floor, keep the building selected and choose the next available floor if one exists; if none exists, say that all floors for that building are already added. Preserve selected arrays and their original IDs/labels.
- [ ] Use the existing `eventLocationKey` for equality. Keep `onChange` atomic: one user add/remove produces one new array. Never clear another floor's layout when editing proposal details.
- [ ] Run tests and manually select building A floors 1+2 and building B floors 1+3 on desktop and mobile.

**Acceptance:** One proposal supports several buildings and floors without replacing prior selections; the selected list remains understandable as it grows.

## Task 5 — Polish proposal modal state, dismissal, and submission

**Files:** Modify `src/components/events/EventProposalModal.tsx`, `src/pages/StudentMyEventsPage.tsx`; update `EventProposalModal.test.tsx` and `StudentMyEventsAccess.test.tsx`.

- [ ] Add failing tests for: Step 1/2 progress and Back preserving fields; zero locations showing an actionable error; backdrop/Escape on a dirty proposal opening Discard/Keep editing; clean modal closing directly; double Create click producing one create call; upload or create failure keeping title, poster, and locations; loading state disabling dismissal that would imply success; mobile long selected list retaining visible footer.
- [ ] Run tests red.
- [ ] Give the modal `role="dialog"`, `aria-modal="true"`, a labelled title and description, initial focus, focus trap, and focus return on close. Use installed Radix Dialog if practical; otherwise implement these semantics in the existing shell without conflicting with the nested selector portal. Use a compact two-step progress strip, sticky header/footer, scrollable content, and mobile full-height/safe-area sizing. Give disabled Create an inline explanation and `aria-describedby`; retain the exact `Create & design maps` action once valid.
- [ ] Track dirty state from title, description, organizer, poster, and locations. Back moves to Step 1 without discarding. Close/backdrop/Escape with dirty state opens a confirm dialog; Keep editing restores focus, Discard closes. During poster upload/create, prevent duplicate submits with a synchronous submission guard and disable modal dismissal. Keep error text in the modal after a failed async operation.
- [ ] Preserve the existing poster upload, `onCreate`, toast, and navigation behavior. Do not auto-submit or auto-approve.
- [ ] Run modal/page tests and manually inspect at 390×844, 768×1024, and 1440×900, including 10 selected floors and light/dark themes.

**Acceptance:** The modal is readable at mobile/desktop sizes, does not lose entered work accidentally, explains disabled actions, and creates at most one proposal per click sequence.

## Task 6 — Move asset details out of the map's interaction area

**Files:** Modify `src/components/events/EventFloorEditor.tsx`; optionally create a presentational `src/components/events/EventItemInspector.tsx` if extraction keeps event state/handlers in `EventFloorEditor`. Update `src/components/events/__tests__/EventFloorEditor.test.tsx` and browser fixture `tests/browser-fixtures/event-editor/main.tsx` only if needed for visual QA.

- [ ] Add failing tests for selected furniture/label details being visible without covering the selected item; desktop rail preserving canvas dimensions when opened/closed; mobile sheet open/close, focus return, and canvas touch resuming normally; drag while inspector is open; multiple selection actions; locked/read-only behavior; location switch clearing stale selection. Include a test asserting that selecting Details does not spawn furniture or change coordinates.
- [ ] Run tests red.
- [ ] At desktop `xl` width, reserve a constant-width right inspector rail from initial editor render, including its empty state. Render item/label fields and existing rotate/lock/visibility/layer/group actions there. Opening details changes rail content only; it must not resize/reposition `canvasRef` while a pointer gesture is active. Keep item gesture state, history, draft persistence, and mutation handlers in `EventFloorEditor`.
- [ ] Below `xl`, use a bottom sheet with bounded height, safe-area footer, internal scrolling, and explicit close. Opening it must not mutate event furniture or the viewport. Keep a compact Details affordance in the selected-item toolbar, but prevent that toolbar from covering the item or escaping the viewport; position it above/below based on available space or place it in fixed editor chrome on narrow screens. Avoid a second absolute item inspector inside the canvas.
- [ ] Make the asset palette collapsible/compact on narrower widths so the picker and inspector do not obscure each other. Preserve existing drag-to-place and click-to-place semantics; do not change `CanvasAssetPalette` drag payload or pointer capture.
- [ ] Run editor focused tests and browser checks at zoom 70%, 100%, and 145%, with asset near each canvas edge. Verify the selected item remains visible when Details opens, fields work, and no pointer jump/layout shift occurs during dragging.

**Acceptance:** Asset details are readable without obscuring the selected item; all existing edit actions remain available. Desktop canvas geometry is stable across inspector state changes. Mobile can dismiss details and continue pan/drag.

## Task 7 — Final integration and handoff verification

**Files:** Add/update only the tests touched above; create a dated verification note under `docs/superpowers/verification/` if the implementation is executed. Do not alter unrelated admin/map-builder code.

- [ ] Run focused tests: `EventLocationSelect`, `EventLocationPicker`, `EventProposalModal`, `StudentMyEventsAccess`, `eventLocationData`, `eventOverlayService`, `StudentEventEditPage.pendingDraft`, `AdminEventLayoutPreviewPage`, and `EventFloorEditor`.
- [ ] Run the full test suite, `node node_modules/typescript/bin/tsc --noEmit`, and `node node_modules/vite/bin/vite.js build`. Record existing failures separately from any regression introduced by this work. If a lint script exists when executing, run it; current `package.json` has no lint script.
- [ ] Verify in a real browser: published-campus loading → success; no published campus; published-campus fetch error; one/multiple buildings; 1, 2, and 10 selected floors; edit details without losing other floor layouts; create → editor → save → location switch → admin preview; desktop 1440×900; tablet 768×1024; phone 390×844; light/dark; keyboard-only; real touch if available.
- [ ] Inspect network calls: exactly one proposal insert; `campus_id` matches UI published campus; `locations[]` contains all chosen floor refs; save and submit preserve each location's furniture/labels. Do not use production data for destructive QA.
- [ ] Re-read the final diff for accidental changes to event gesture code and unrelated files. Run `git diff --check`. State remaining browser/device gates honestly.

**Acceptance:** No demo floors leak into creation, multi-location proposals survive save/reload/review, menus and modal fit both themes and viewports, details no longer block map interaction, and no new focused test/build/type errors are introduced.

## Luna execution order

1. Establish baseline and write Task 1 campus-source tests; fix creation source.
2. Write Task 2 two-campus tests; bind editor/admin preview to stored campus ID.
3. Write Task 3 selector tests; build themed desktop/mobile selector.
4. Write Task 4 multi-location tests; group and preserve selected floors.
5. Write Task 5 modal tests; implement stepper, dismissal guard, async states.
6. Write Task 6 inspector tests; move details to stable desktop rail/mobile sheet.
7. Run Task 7 focused, full, typecheck, build, browser, and final diff checks.

## Do not touch

- Event editor drag/pointer capture, `useEventViewportMotion`, snapping, validation, autosave/recovery, or approved published floor renderer except for a demonstrated integration regression.
- Admin approval semantics, unrelated student pages, map-builder authoring UI, auth schema, database tables, and unrelated package/lock files.
- Existing untracked/cache files in this worktree.
