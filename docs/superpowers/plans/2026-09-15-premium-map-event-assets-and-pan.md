# Premium Map and Event Builder Assets + Shared Pan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace label-like event/map assets with polished top-down visuals and add safe temporary Space-to-pan behavior to both builders without changing persistence boundaries or existing editor behavior.

**Architecture:** Add a catalog-driven SVG layer shared by Map Builder and Student Event Builder. Preserve legacy FloorFurniture type values and the event-overlay-only save boundary. Add a focused shared Space modifier hook; each editor keeps its own viewport bounds, selection state, mutation rules, and save logic. Keep presets and validation in pure modules so they can be tested without rendering the full editors.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, inline SVG, Tailwind CSS, existing FloorFurniture/event overlay models, existing map viewport helpers.

Status: ready for task-by-task execution after verification.

## Global Constraints

- Use hand-authored inline SVG/React artwork; do not add remote image URLs or runtime asset downloads.
- Existing FloorFurniture records and saved overlays must continue to deserialize and render.
- Student Event Builder edits must continue saving only event overlay furniture/labels; the published base map remains read-only.
- Holding Space must temporarily pan and release back to the previous tool without breaking inputs, dialogs, shortcuts, or page scrolling outside the canvas.
- Preserve Select, Furniture, Label, Pan, zoom, undo/redo, save, submit, read-only, and touch behavior.
- New mobile controls must have at least 44px touch targets, accessible names, and visible focus states.
- Do not stage or overwrite unrelated existing work in the dirty repository.

---

## File map and ownership

Create:

- src/components/canvas/canvasAssetCatalog.ts — typed descriptors, stable keys, categories, legacy resolution, and surface filtering.
- src/components/canvas/CanvasAssetVisual.tsx — shared local SVG renderer with no positioning transforms.
- src/components/canvas/CanvasAssetPalette.tsx — visual picker for map and event surfaces.
- src/components/canvas/useSpacePan.ts — focus-safe Space modifier state and lifecycle bindings.
- src/lib/eventLayoutGeometry.ts — pure snapping, nudge, alignment, spacing, and selection bounds.
- src/lib/eventLayoutPresets.ts — deterministic editable event layout presets.
- src/lib/eventLayoutValidation.ts — pure non-blocking layout warnings.

Modify:

- src/components/events/eventAssets.tsx — preserve compatibility exports while delegating to the catalog.
- src/components/events/EventFloorEditor.tsx — shared Space-pan, asset palette/artwork, layout controls, presets, and warnings.
- src/components/map-builder/types.ts — optional asset metadata only.
- src/components/map-builder/FloorEditor.tsx — shared artwork for supported furniture and shared Space-pan, with existing fallback symbols.
- src/components/map-builder/ReadonlyFloorPlanVisuals.tsx — catalog artwork in read-only previews.
- src/components/map-builder/constants.ts — catalog-compatible metadata without deleting current furniture types.
- src/styles/index.css — scoped responsive palette rules only.

## Task 1: Add the backward-compatible asset catalog

Files:

- Create: src/components/canvas/canvasAssetCatalog.ts
- Create: src/components/canvas/__tests__/canvasAssetCatalog.test.ts
- Create: src/components/canvas/CanvasAssetVisual.tsx
- Create: src/components/canvas/__tests__/CanvasAssetVisual.test.tsx
- Modify: src/components/map-builder/types.ts
- Modify: src/components/events/eventAssets.tsx
- Test: src/components/events/__tests__/eventAssets.test.tsx

Interfaces:

~~~ts
export type CanvasAssetSurface = "map" | "event";
export type CanvasAssetCategory = "essentials" | "seating" | "production" | "outdoor" | "safety" | "signage";

export interface CanvasAssetDescriptor {
  key: string;
  name: string;
  category: CanvasAssetCategory;
  surfaces: readonly CanvasAssetSurface[];
  legacyTypes: readonly string[];
  defaultWidth: number;
  defaultHeight: number;
  color: string;
  keywords: readonly string[];
  description: string;
  artKind: string;
}

export function getCanvasAsset(keyOrLegacyType: string): CanvasAssetDescriptor | undefined;
export function listCanvasAssets(surface: CanvasAssetSurface): readonly CanvasAssetDescriptor[];
export function resolveCanvasAssetKey(item: { type: string; assetKey?: string }): string | undefined;
~~~

Add only optional fields to FloorFurniture:

~~~ts
assetKey?: string;
assetVariant?: string;
assetConfig?: Record<string, string | number | boolean>;
~~~

- [ ] Step 1: Write failing tests for stable event asset keys, event surface filtering, legacy type resolution, and missing-key behavior.
- [ ] Step 2: Run the focused tests and confirm they fail because the catalog exports do not exist.

Run: pnpm exec vitest run src/components/canvas/__tests__/canvasAssetCatalog.test.ts

- [ ] Step 3: Implement the typed catalog with recognizable chair, table, booth, stage, speaker, projector, monitor, tent, barrier, and signage descriptors. Keep old event type strings as aliases.
- [ ] Step 4: Implement CanvasAssetVisual with local SVG artwork, stable viewBox, preserveAspectRatio, accessible name, and a neutral fallback for unknown keys.
- [ ] Step 5: Make eventAssets.tsx keep EVENT_FURNITURE_TEMPLATES, getEventFurnitureTemplate, EventAssetVisual, and eventFurnitureFromTemplate exports. Delegate EventAssetVisual to the new renderer and add assetKey without removing type.
- [ ] Step 6: Run catalog, renderer, and event asset tests.

Run: pnpm exec vitest run src/components/canvas/__tests__/canvasAssetCatalog.test.ts src/components/canvas/__tests__/CanvasAssetVisual.test.tsx src/components/events/__tests__/eventAssets.test.tsx

Expected: PASS, including legacy template creation.

- [ ] Step 7: Commit only this task's files when the repository index is writable.

~~~bash
git add src/components/canvas src/components/events/eventAssets.tsx src/components/events/__tests__/eventAssets.test.tsx src/components/map-builder/types.ts
git commit -m "feat: add shared visual canvas asset catalog"
~~~

## Task 2: Add shared, safe Space-to-pan behavior

Files:

- Create: src/components/canvas/useSpacePan.ts
- Create: src/components/canvas/__tests__/useSpacePan.test.ts
- Modify: src/components/events/EventFloorEditor.tsx
- Modify: src/components/map-builder/FloorEditor.tsx
- Modify: src/components/map-builder/constants.ts
- Test: src/components/events/__tests__/EventFloorEditor.test.tsx
- Test: src/components/map-builder/__tests__/FloorEditor.arrowKeys.test.tsx

Interfaces:

~~~ts
export interface UseSpacePanResult {
  spaceHeld: boolean;
  bindCanvasKeyboard: {
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    onKeyUp: (event: React.KeyboardEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
  reset: () => void;
}

export function isCanvasTextEditingTarget(target: EventTarget | null): boolean;
export function useSpacePan(enabled: boolean): UseSpacePanResult;
~~~

- [ ] Step 1: Write tests for Space keydown/keyup, repeated keydown idempotence, blur cleanup, input/textarea/contenteditable guards, and unrelated shortcut preservation.
- [ ] Step 2: Run the hook test and confirm it fails because the hook does not exist.

Run: pnpm exec vitest run src/components/canvas/__tests__/useSpacePan.test.ts

- [ ] Step 3: Implement the hook using event.code === "Space". Prevent default only for a canvas-bound modifier; clear on keyup, blur, reset, and disabled/read-only transitions.
- [ ] Step 4: Integrate spaceHeld into EventFloorEditor pan start/move/end. Keep current Pan tool, middle mouse, wheel, pinch, bounds, and read-only logic.
- [ ] Step 5: Integrate spaceHeld into FloorEditor. Preserve existing V/M/B/P/E/W/R/D/I/S/L/T/F shortcuts; Space only adds temporary panning.
- [ ] Step 6: Add tests proving Space plus drag pans from Select/Furniture/Label, release restores the previous tool, Space does not scroll the page, and read-only event review cannot mutate objects.
- [ ] Step 7: Run focused interaction tests.

Run: pnpm exec vitest run src/components/canvas/__tests__/useSpacePan.test.ts src/components/events/__tests__/EventFloorEditor.test.tsx src/components/map-builder/__tests__/FloorEditor.arrowKeys.test.tsx

Expected: PASS with existing pan, shortcut, selection, and read-only coverage.

- [ ] Step 8: Commit only this task's files when the repository index is writable.

~~~bash
git add src/components/canvas/useSpacePan.ts src/components/canvas/__tests__/useSpacePan.test.ts src/components/events/EventFloorEditor.tsx src/components/events/__tests__/EventFloorEditor.test.tsx src/components/map-builder/FloorEditor.tsx src/components/map-builder/constants.ts
git commit -m "feat: add shared temporary canvas pan shortcut"
~~~

## Task 3: Replace the event palette and canvas artwork

Files:

- Create: src/components/canvas/CanvasAssetPalette.tsx
- Create: src/components/canvas/__tests__/CanvasAssetPalette.test.tsx
- Modify: src/components/events/EventFloorEditor.tsx
- Modify: src/components/events/eventAssets.tsx
- Modify: src/components/map-builder/FloorEditor.tsx
- Modify: src/components/map-builder/ReadonlyFloorPlanVisuals.tsx

Interface:

~~~tsx
export interface CanvasAssetPaletteProps {
  surface: "map" | "event";
  activeKey: string | null;
  onSelect: (asset: CanvasAssetDescriptor) => void;
  compact?: boolean;
  disabled?: boolean;
}
~~~

- [ ] Step 1: Write tests for accessible visual previews, category filtering, keyword search, active selection, and event-surface filtering.
- [ ] Step 2: Run the palette test and confirm it fails because the component does not exist.

Run: pnpm exec vitest run src/components/canvas/__tests__/CanvasAssetPalette.test.tsx

- [ ] Step 3: Build visual preview cards for Essentials, Seating, Production, Outdoor, Safety, and Signage. Keep the primary desktop toolbar compact and provide a mobile collapsible tray.
- [ ] Step 4: Replace EventFloorEditor colored chips with CanvasAssetPalette surface="event", preserving tool order and repeat placement.
- [ ] Step 5: Render CanvasAssetVisual inside the existing transformed event item wrapper. Keep data-event-item and current test IDs. Show names on hover/focus/selection rather than permanently over every item.
- [ ] Step 6: Use shared artwork for supported FloorFurniture types in FloorEditor and ReadonlyFloorPlanVisuals; keep the existing symbol fallback for unsupported legacy types.
- [ ] Step 7: Run focused palette, event editor, and furniture-symbol tests.

Run: pnpm exec vitest run src/components/canvas/__tests__/CanvasAssetPalette.test.tsx src/components/events/__tests__/eventAssets.test.tsx src/components/events/__tests__/EventFloorEditor.test.tsx src/components/map-builder/__tests__/FloorEditor.furnitureSymbols.test.tsx

Expected: PASS, including legacy furniture rendering.

- [ ] Step 8: Commit the palette/artwork task when the repository index is writable.

~~~bash
git add src/components/canvas src/components/events/EventFloorEditor.tsx src/components/events/eventAssets.tsx src/components/map-builder/FloorEditor.tsx src/components/map-builder/ReadonlyFloorPlanVisuals.tsx
git commit -m "feat: add recognizable canvas asset visuals and palette"
~~~

## Task 4: Add professional selection and layout helpers

Files:

- Create: src/lib/eventLayoutGeometry.ts
- Create: src/lib/__tests__/eventLayoutGeometry.test.ts
- Modify: src/components/events/EventFloorEditor.tsx
- Modify: src/components/events/__tests__/EventFloorEditor.test.tsx

Interfaces:

~~~ts
export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export type LayoutAction = "align-left" | "align-center" | "align-top" | "align-middle" | "distribute-horizontal" | "distribute-vertical";

export function snapValue(value: number, grid: number): number;
export function nudgeItems(items: readonly LayoutItem[], ids: readonly string[], dx: number, dy: number, bounds: { width: number; height: number }): LayoutItem[];
export function applyLayoutAction(items: readonly LayoutItem[], ids: readonly string[], action: LayoutAction): LayoutItem[];
export function selectionBounds(items: readonly LayoutItem[], ids: readonly string[]): { x: number; y: number; width: number; height: number } | null;
~~~

- [ ] Step 1: Write tests for snapping, bounded nudging, alignment, equal distribution, empty selection, and preservation of unselected items.
- [ ] Step 2: Run geometry tests and confirm they fail because the helpers do not exist.

Run: pnpm exec vitest run src/lib/__tests__/eventLayoutGeometry.test.ts

- [ ] Step 3: Implement pure helpers. Preserve dimensions and rotation; clamp nudges to canvas bounds.
- [ ] Step 4: Add Shift-click multi-select and a selection bounds overlay to EventFloorEditor. Hide mutation controls in read-only mode.
- [ ] Step 5: Add Arrow/Shift+Arrow nudge, R 15-degree rotation, Alt/Option-drag duplicate, Ctrl/Cmd+D duplicate, Escape deselect, and grid snapping while moving/resizing. Ignore these keys in text-editing targets.
- [ ] Step 6: Push one undo history entry per completed action, not one entry per pointer-move event.
- [ ] Step 7: Run geometry and event-editor tests.

Run: pnpm exec vitest run src/lib/__tests__/eventLayoutGeometry.test.ts src/components/events/__tests__/EventFloorEditor.test.tsx

Expected: PASS with existing drag and undo/redo tests.

## Task 5: Add editable presets and layout warnings

Files:

- Create: src/lib/eventLayoutPresets.ts
- Create: src/lib/__tests__/eventLayoutPresets.test.ts
- Create: src/lib/eventLayoutValidation.ts
- Create: src/lib/__tests__/eventLayoutValidation.test.ts
- Modify: src/components/events/EventFloorEditor.tsx
- Modify: src/components/events/__tests__/EventFloorEditor.test.tsx

Interfaces:

~~~ts
export interface EventLayoutPreset {
  id: "chair-row" | "classroom-seating" | "booth-area" | "registration-area" | "stage-setup";
  name: string;
  description: string;
  create: (origin: { x: number; y: number }, nextId: () => string) => FloorFurniture[];
}

export interface LayoutWarning {
  code: "outside-boundary" | "overlap" | "blocked-access" | "narrow-aisle";
  severity: "info" | "warning" | "critical";
  itemIds: string[];
  message: string;
}

export function validateEventLayout(input: {
  furniture: readonly FloorFurniture[];
  canvasWidth: number;
  canvasHeight: number;
  blockedRegions?: readonly { x: number; y: number; width: number; height: number; label: string }[];
}): LayoutWarning[];
~~~

- [ ] Step 1: Write tests proving each preset creates deterministic ordinary FloorFurniture records with unique IDs, sensible spacing, and no mutation of base campus/floor data.
- [ ] Step 2: Write tests for clean layouts, outside boundaries, obvious overlap, and blocked-region intersection. Verify item IDs and user-readable messages.
- [ ] Step 3: Run preset/validation tests and confirm they fail because the modules do not exist.

Run: pnpm exec vitest run src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts

- [ ] Step 4: Implement presets through the existing template factory; do not add a persisted preset object type.
- [ ] Step 5: Implement stable axis-aligned, non-mutating warnings. Do not automatically move or delete user objects.
- [ ] Step 6: Add Quick layouts and a compact warning summary with Focus item actions. Keep Save Draft available; warnings remain non-blocking for the first release.
- [ ] Step 7: Run preset, validation, and event-editor tests.

Run: pnpm exec vitest run src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/components/events/__tests__/EventFloorEditor.test.tsx

Expected: PASS with ordinary overlay furniture and non-mutating warnings.

## Task 6: Finish responsive/mobile polish and verification

Files:

- Modify: src/components/canvas/CanvasAssetPalette.tsx
- Modify: src/components/events/EventFloorEditor.tsx
- Modify: src/components/map-builder/FloorEditor.tsx
- Modify: src/styles/index.css
- Create: src/components/canvas/__tests__/CanvasAssetPalette.mobile.test.tsx

- [ ] Step 1: Add responsive tests at 375px width for a collapsible picker, selected-state visibility, no horizontal clipping, and 44px minimum controls.
- [ ] Step 2: Implement a collapsible bottom sheet/tray for event assets. Keep the canvas primary, preserve one-finger Pan mode, two-finger pinch zoom, and reachable selected-item actions.
- [ ] Step 3: Add only scoped palette/canvas CSS; do not change unrelated public layout, navigation, or landing-page styles.
- [ ] Step 4: Run focused regression tests and the production build.

~~~bash
pnpm exec vitest run src/components/canvas/__tests__ src/components/events/__tests__ src/components/map-builder/__tests__/FloorEditor.furnitureSymbols.test.tsx src/components/map-builder/__tests__/FloorEditor.arrowKeys.test.tsx
pnpm run build
~~~

Expected: selected tests PASS and the production build completes without TypeScript/Vite errors.

- [ ] Step 5: Perform visual QA at desktop and mobile viewport sizes.
- [ ] Step 6: Review the final diff and ensure .pnpm-store, preview logs, .freebuff, and unrelated existing work are not included.
- [ ] Step 7: Commit the final polish task when the repository index is writable.

~~~bash
git add src/components/canvas src/components/events/EventFloorEditor.tsx src/components/events/__tests__ src/components/map-builder/FloorEditor.tsx src/components/map-builder/ReadonlyFloorPlanVisuals.tsx src/styles/index.css src/lib/eventLayoutGeometry.ts src/lib/eventLayoutPresets.ts src/lib/eventLayoutValidation.ts src/lib/__tests__
git commit -m "feat: polish map and event builder editing UX"
~~~

## Verification summary

Implementation is complete only when:

- Catalog, renderer, Space-pan, geometry, presets, validation, palette, and editor tests pass.
- Existing event placement, drag, undo/redo, read-only, map furniture-symbol, and keyboard tests pass.
- pnpm run build passes.
- Desktop and mobile QA shows recognizable assets, compact controls, usable touch targets, and no clipping.
- Legacy campuses and overlays still render, and Student Event Builder never mutates the base map.
