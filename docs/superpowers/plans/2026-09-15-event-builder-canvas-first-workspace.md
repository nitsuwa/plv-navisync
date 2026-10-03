# Event Builder Canvas-First Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Student Organization event builder into a beginner-friendly canvas-first workspace with a floating asset dock, simple placement flow, and contextual arrange controls.

**Architecture:** Extend `CanvasAssetPalette` with an opt-in floating mode so existing map-builder consumers keep their current layout. Move the event palette and preset controls into an absolute canvas dock, with a compact recent-assets strip and an overlay panel. Move multi-selection actions into a selection-anchored contextual toolbar with a single plain-language Arrange menu. Keep all event overlay data, geometry, history, persistence, and viewport behavior unchanged.

**Tech Stack:** React 18, TypeScript, Tailwind utilities, lucide-react, Vitest, Testing Library, existing canvas asset catalog and event layout helpers.

## Global Constraints

- Keep the event canvas as the largest stable surface; controls must not push it below the fold.
- Optimize copy and interaction order for beginners, older users, and non-technical users.
- Preserve click-to-place, repeated placement, drag-to-move, selection, resize, delete, undo/redo, save, submit, read-only review, pan, zoom, and persistence.
- Keep `CampusEventOverlay`, `FloorFurniture`, and `FloorLabel` persistence shapes unchanged.
- Keep non-floating `CanvasAssetPalette` behavior unchanged for existing map-builder surfaces.
- Use existing design tokens, icons, and SVG asset visuals; do not add dependencies.
- Preserve existing dirty work and do not reset, stash, pull, merge, stage, or commit.

---

### Task 1: Add failing tests for the floating asset dock

**Files:**
- Modify: `src/components/canvas/__tests__/CanvasAssetPalette.test.tsx`
- Modify: `src/components/canvas/__tests__/CanvasAssetPalette.mobile.test.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- The palette gains an opt-in `floating?: boolean` presentation mode.
- The event editor exposes `data-testid="event-asset-dock"` inside the canvas.
- The palette keeps the existing `surface`, `activeKey`, `onSelect`,
  `compact`, and `disabled` props compatible.

- [ ] **Step 1: Write the failing palette test** for a floating presentation.

```tsx
it("keeps the asset panel attached to a floating dock instead of a flow row", () => {
  render(
    <CanvasAssetPalette
      surface="event"
      activeKey="chair"
      onSelect={vi.fn()}
      floating
    />,
  );

  const dock = screen.getByTestId("canvas-asset-floating-palette");
  expect(dock).toHaveAttribute("data-floating", "true");
  expect(screen.getByRole("button", { name: /add event item/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /more assets/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing recent-assets test** to require a compact row
  and a selected-state label.

```tsx
it("offers the active asset and recent choices without opening the full catalog", () => {
  const onSelect = vi.fn();
  render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={onSelect} floating />);

  expect(screen.getByText("Recently used")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Chair.*selected/i })).toBeInTheDocument();
  expect(screen.queryByRole("searchbox", { name: "Search assets" })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Write the failing event-editor placement test** for the dock
  living inside the canvas and keeping the active tool armed.

```tsx
it("keeps the asset dock over the canvas and supports repeated beginner placement", () => {
  render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
  const canvas = screen.getByLabelText("Event layout canvas");
  expect(within(canvas).getByTestId("event-asset-dock")).toBeInTheDocument();

  fireEvent.click(within(canvas).getByRole("button", { name: /Chair.*selected/i }));
  fireEvent.click(canvas, { clientX: 120, clientY: 100 });
  fireEvent.click(canvas, { clientX: 180, clientY: 120 });

  expect(screen.getAllByTestId(/^event-furniture-/)).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Furniture$/ })).toHaveClass("bg-primary");
});
```

- [ ] **Step 4: Run the new tests** and confirm they fail because `floating`, the
  floating dock, and recent-asset controls do not exist yet.

Run: `pnpm exec vitest run src/components/canvas/__tests__/CanvasAssetPalette.test.tsx src/components/events/__tests__/EventFloorEditor.test.tsx`

Expected: FAIL with missing floating-palette/dock queries, while the existing
non-floating tests continue to identify the current behavior.

### Task 2: Implement the floating asset dock and beginner placement affordances

**Files:**
- Modify: `src/components/canvas/CanvasAssetPalette.tsx`
- Modify: `src/components/canvas/__tests__/CanvasAssetPalette.test.tsx`
- Modify: `src/components/canvas/__tests__/CanvasAssetPalette.mobile.test.tsx`

**Interfaces:**
- `CanvasAssetPaletteProps.floating` is optional and defaults to `false`.
- Floating mode renders `data-testid="canvas-asset-floating-palette"` and a
  trigger named "Add event item" for event assets.
- Floating mode renders recent asset buttons, a "More assets" button, and a
  searchable catalog in an absolutely positioned desktop panel.
- Floating mode accepts `Escape` and an explicit close button to close the
  catalog without changing the selected asset.

- [ ] **Step 1: Implement the smallest floating shell** around the existing
  catalog: keep the catalog filtering and `onSelect` behavior, but render the
  trigger and recent strip instead of the full-width compact section.

```tsx
const recentAssets = recentKeys
  .map((key) => getCanvasAsset(key))
  .filter((asset): asset is CanvasAssetDescriptor => Boolean(asset));

<section data-testid="canvas-asset-floating-palette" data-floating="true" className="relative">
  <div className="rounded-2xl border border-border/80 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
    <button type="button" aria-expanded={open} aria-label="Add event item" onClick={() => setOpen((value) => !value)}>
      <CanvasAssetVisual assetKey={activeKey ?? "chair"} label="Selected event item" className="h-7 w-7" />
      <span>{activeAsset?.name ?? "Choose an item"}</span>
      <span>{open ? "Close" : "More assets"}</span>
    </button>
    <div aria-label="Recently used" className="flex gap-1 overflow-x-auto">
      {recentAssets.map((asset) => (
        <button
          key={asset.key}
          type="button"
          aria-label={`${asset.name}${activeKey === asset.key ? ", selected" : ""}`}
          aria-pressed={activeKey === asset.key}
          onClick={() => onSelect(asset)}
        >
          <CanvasAssetVisual assetKey={asset.key} label={asset.name} className="h-6 w-6" />
          <span>{asset.name}</span>
        </button>
      ))}
    </div>
  </div>
  {open && (
    <div role="dialog" aria-label="Choose an event item">
      <button type="button" aria-label="Close asset picker" onClick={() => setOpen(false)}>Close</button>
      <input type="search" aria-label="Search assets" value={query} onChange={(event) => setQuery(event.target.value)} />
      {grouped.map(({ category, assets: categoryAssets }) => (
        <div key={category}>
          <span>{CATEGORY_LABELS[category]}</span>
          {categoryAssets.map((asset) => (
            <button key={asset.key} type="button" onClick={() => onSelect(asset)}>
              <CanvasAssetVisual assetKey={asset.key} label={asset.name} className="h-7 w-7" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )}
</section>
```

- [ ] **Step 2: Track recent asset keys locally** with the active asset first,
  deduplicate them, and cap the list at four event assets. Keep the default
  order as Chair, Table, Booth, and Stage when no user choice exists so a new
  user sees recognizable choices immediately.

- [ ] **Step 3: Add explicit beginner copy and accessible names** for the
  trigger, recent buttons, More assets, close button, search field, category
  buttons, and asset descriptions. Use `aria-pressed` or `aria-selected` for
  active state in addition to color.

- [ ] **Step 4: Add Escape handling** scoped to the floating catalog. Escape
  closes the catalog first; a second Escape is still handled by the editor's
  existing selection clearing behavior.

- [ ] **Step 5: Add mobile presentation classes** so the open catalog is fixed
  to the lower viewport as a bottom sheet with a scrim, safe bottom padding,
  and a visible close button. Keep the trigger inline and leave the canvas
  mounted underneath.

- [ ] **Step 6: Run palette tests** and confirm both legacy and floating modes
  pass.

Run: `pnpm exec vitest run src/components/canvas/__tests__/CanvasAssetPalette.test.tsx src/components/canvas/__tests__/CanvasAssetPalette.mobile.test.tsx`

### Task 3: Move event controls into the canvas and add contextual Arrange

**Files:**
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- Furniture mode renders `data-testid="event-asset-dock"` as an absolute
  overlay inside the event canvas.
- The existing preset callback remains the only path that inserts layout
  furniture; its data and history behavior do not change.
- Multi-selection renders `data-testid="event-layout-actions"` as an absolute
  contextual toolbar and exposes `button[aria-label="Arrange selected items"]`.
- The six existing `LayoutAction` values remain the callback inputs, but their
  buttons are grouped under plain-language menu labels.

- [ ] **Step 1: Add failing Arrange-menu tests** before changing the editor.

```tsx
it("shows Arrange only for multiple selected furniture items", () => {
  const seededChairs = [20, 80, 140].map((x, index) => ({
    ...overlayWithChair.eventFurniture![0],
    id: `chair-${index + 1}`,
    x,
  }));
  render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlay, eventFurniture: seededChairs }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

  expect(screen.queryByRole("button", { name: "Arrange selected items" })).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-1"), { button: 0, clientX: 20, clientY: 20 });
  fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-2"), { button: 0, shiftKey: true, clientX: 80, clientY: 20 });

  const arrange = screen.getByRole("button", { name: "Arrange selected items" });
  expect(arrange).toBeInTheDocument();
  expect(screen.getByTestId("event-layout-actions")).toHaveClass("absolute");
  expect(screen.queryByRole("button", { name: "Align left" })).not.toBeInTheDocument();

  fireEvent.click(arrange);
  expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Remove the normal-flow Furniture control block** from above
  the canvas. Add an absolute `event-asset-dock` wrapper as the first canvas
  overlay and pass `floating` to `CanvasAssetPalette`. Keep the canvas click
  handler unchanged so click-to-place uses the selected template.

- [ ] **Step 3: Add a compact Arrange menu state** to the editor. Close it on
  Escape, canvas click, tool change, or when fewer than two furniture items
  remain selected. Keep `applyFurnitureLayout` unchanged and map its actions to
  these labels: Align left, Align center, Align top, Align middle, Distribute
  horizontally, and Distribute vertically.

- [ ] **Step 4: Position the contextual toolbar from the selection bounds** in
  screen space using the existing `pan` and `zoom`. Clamp its left/top values
  to a 12px canvas margin so it stays readable near edges. Add
  `pointer-events-auto` only to the toolbar and leave the canvas surface
  interactive everywhere else.

- [ ] **Step 5: Keep the existing top-bar Delete action** and add only the
  contextual `Duplicate` and `Delete` affordances when useful. All actions
  must call the existing callbacks so history and persisted arrays remain
  consistent.

- [ ] **Step 6: Update the empty-state helper copy** to tell a new user to
  choose "Furniture" and then "Add event item" without covering the floating
  dock.

- [ ] **Step 7: Run event editor tests** and confirm the new floating placement
  and Arrange menu behavior pass with existing selection, layout, viewport,
  and save/submit coverage.

Run: `pnpm exec vitest run src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/eventAssets.test.tsx src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts`

### Task 4: Responsive and accessibility polish

**Files:**
- Modify: `src/components/canvas/CanvasAssetPalette.tsx`
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/styles/index.css`
- Modify: `src/components/canvas/__tests__/CanvasAssetPalette.mobile.test.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

- [ ] **Step 1: Add failing narrow-layout assertions** for the bottom-sheet
  marker, close control, and the contextual toolbar not creating a horizontal
  page overflow.

- [ ] **Step 2: Add scoped responsive CSS** only for the floating palette and
  event layout actions. Use `@media (max-width: 767px)` to make the catalog a
  fixed bottom sheet with `max-height: min(70vh, 34rem)`, safe-area padding,
  and an opaque scrim. Do not change global footer, navigation, or map-builder
  styles.

- [ ] **Step 3: Ensure the floating palette and Arrange menu are keyboard
  reachable** in a predictable order: trigger, recent assets, More assets,
  search, categories, asset buttons, close. Add visible focus rings and keep
  touch targets at least 44px high.

- [ ] **Step 4: Run focused component tests** at the default jsdom viewport and
  the existing 375px mobile test setup.

### Task 5: Final verification

**Files:**
- No new production files.

- [ ] **Step 1: Run the focused event/canvas regression suites.**

Run: `pnpm exec vitest run src/components/canvas/__tests__ src/components/events/__tests__ src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventViewport.test.ts`

- [ ] **Step 2: Run `git diff --check`** and inspect `git status --short` to
  verify only task-relevant files were changed in this pass; leave the working
  tree uncommitted.

- [ ] **Step 3: Run the production build.**

Run: `pnpm run build`

- [ ] **Step 4: If the local dev server is available, manually verify** the
  desktop floating dock, repeated click placement, drag placement, Arrange
  menu, Escape behavior, and mobile bottom sheet. Report any environment or
  pre-existing baseline limitations separately.
